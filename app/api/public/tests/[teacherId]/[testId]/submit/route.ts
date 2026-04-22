/**
 * POST /api/public/tests/[teacherId]/[testId]/submit
 * 학생 답안 제출 — 세션 불필요.
 *
 * 서버가 교사 토큰으로 교사의 스프레드시트에 행 추가 →
 * 모든 Drive/Sheets 할당량은 교사 계정이 부담.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTeacherAccessTokenById, UnauthorizedError } from '@/lib/auth';
import {
  findOrCreateMainFolder,
  listTestFolders,
  findTestJsonFile,
  downloadFileContent,
} from '@/lib/drive';
import { appendAnswerRow, readRange } from '@/lib/sheets';
import { renderAnswerText } from '@/lib/renderAnswer';
import type { TestData, SubmitPayload } from '@/lib/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teacherId: string; testId: string }> }
) {
  try {
    const { teacherId, testId } = await params;
    const payload = (await req.json()) as SubmitPayload;

    // 입력 검증
    if (!payload.name?.trim() || !payload.grade || !payload.classNum) {
      return NextResponse.json(
        { success: false, error: '학생 정보가 올바르지 않습니다.' },
        { status: 400 }
      );
    }
    if (!Array.isArray(payload.answers)) {
      return NextResponse.json(
        { success: false, error: '답안 형식이 올바르지 않습니다.' },
        { status: 400 }
      );
    }

    // 교사 토큰 획득
    const { accessToken } = await getTeacherAccessTokenById(teacherId);

    // 시험지 찾기
    const mainFolder = await findOrCreateMainFolder(accessToken);
    const folders = await listTestFolders(accessToken, mainFolder.id);
    let testData: TestData | null = null;
    for (const folder of folders) {
      const jsonFile = await findTestJsonFile(accessToken, folder.id);
      if (!jsonFile) continue;
      try {
        const content = await downloadFileContent(accessToken, jsonFile.id);
        const data = JSON.parse(content) as TestData;
        if (data.testId === testId) {
          testData = data;
          break;
        }
      } catch {
        continue;
      }
    }
    if (!testData || !testData.spreadsheetId) {
      return NextResponse.json(
        { success: false, error: '시험지 답안지를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 중복 제출 확인 (최근 30행의 제출ID 컬럼 E)
    const recentIds = await readRange(accessToken, testData.spreadsheetId, '학생답안!E2:E31')
      .catch(() => [] as string[][]);
    const alreadySubmitted = recentIds.some((row) => row[0] === payload.submissionId);
    if (alreadySubmitted) {
      return NextResponse.json({
        success: true,
        isDuplicate: true,
        message: '이미 제출된 답안입니다.',
      });
    }

    // 행 구성: [제출시간, 학년, 반, 이름, 제출ID, 문제1답, 문제2답, ...]
    const row: (string | number)[] = [
      new Date(payload.submittedAt || Date.now()).toLocaleString('ko-KR'),
      `${payload.grade}학년`,
      `${payload.classNum}반`,
      payload.name.trim(),
      payload.submissionId || 'NO_ID',
    ];
    testData.questions.forEach((q, idx) => {
      const a = payload.answers[idx];
      if (!a) {
        row.push('미응답');
      } else {
        row.push(renderAnswerText(a, q));
      }
    });

    await appendAnswerRow(accessToken, testData.spreadsheetId, row);

    return NextResponse.json({
      success: true,
      message: '답안이 성공적으로 제출되었습니다.',
      studentName: payload.name,
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 404 });
    }
    console.error('submit 오류:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'server_error' },
      { status: 500 }
    );
  }
}
