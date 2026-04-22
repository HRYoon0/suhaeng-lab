/**
 * GET /api/public/tests/[teacherId]/[testId]
 * 학생이 시험 응시 시 호출 — 세션 불필요.
 *
 * 서버 측: teacherId로 교사의 refreshToken을 KV에서 조회 → accessToken 발급 →
 *          교사 Drive에서 시험지정보.json 읽기.
 *
 * 보안: 학생에게 돌려주는 데이터에서 정답 정보 제거 고려 가능 (MVP에선 전체 반환).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTeacherAccessTokenById, UnauthorizedError } from '@/lib/auth';
import {
  findOrCreateMainFolder,
  listTestFolders,
  findTestJsonFile,
  downloadFileContent,
} from '@/lib/drive';
import type { TestData } from '@/lib/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teacherId: string; testId: string }> }
) {
  try {
    const { teacherId, testId } = await params;
    const { accessToken } = await getTeacherAccessTokenById(teacherId);

    const mainFolder = await findOrCreateMainFolder(accessToken);
    const folders = await listTestFolders(accessToken, mainFolder.id);

    for (const folder of folders) {
      const jsonFile = await findTestJsonFile(accessToken, folder.id);
      if (!jsonFile) continue;
      try {
        const content = await downloadFileContent(accessToken, jsonFile.id);
        const testData = JSON.parse(content) as TestData;
        if (testData.testId === testId) {
          return NextResponse.json({ success: true, testData });
        }
      } catch {
        continue;
      }
    }
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ success: false, error: 'server_error' }, { status: 500 });
  }
}
