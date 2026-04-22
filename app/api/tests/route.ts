/**
 * GET  /api/tests   — 내 시험지 목록 (세션 필요)
 * POST /api/tests   — 새 시험지 생성 (세션 필요)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTeacher, UnauthorizedError } from '@/lib/auth';
import {
  findOrCreateMainFolder,
  findOrCreateSystemSubfolder,
  findOrCreateImageSubfolder,
  findChildFolder,
  createFolder,
  uploadJson,
  uploadImageDataUrl,
  findTestJsonFile,
  downloadFileContent,
  listTestFolders,
} from '@/lib/drive';
import { createAnswerSpreadsheet } from '@/lib/sheets';
import { createPreviewDoc } from '@/lib/docs';
import type { TestData, TestListItem, Question } from '@/lib/types';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

/** 시험지 내 data:image/...을 실제 Drive 파일로 업로드하고 URL로 치환 */
async function migrateImages(
  accessToken: string,
  testFolderId: string,
  testData: TestData
): Promise<void> {
  const systemSub = await findOrCreateSystemSubfolder(accessToken, testFolderId);
  const imageFolder = await findOrCreateImageSubfolder(accessToken, systemSub.id);

  const convert = async (
    src: string | null | undefined,
    baseName: string
  ): Promise<string | null> => {
    if (!src) return null;
    if (!src.startsWith('data:')) return src;
    try {
      return await uploadImageDataUrl(accessToken, imageFolder.id, `${baseName}.png`, src);
    } catch (e) {
      console.warn(`이미지 업로드 실패 (${baseName}):`, e);
      return src;
    }
  };

  for (let qi = 0; qi < testData.questions.length; qi++) {
    const q = testData.questions[qi];
    const qNum = qi + 1;

    if (Array.isArray(q.images)) {
      const newImages: string[] = [];
      for (let ii = 0; ii < q.images.length; ii++) {
        const url = await convert(q.images[ii], `문제${qNum}_이미지${ii + 1}`);
        if (url) newImages.push(url);
      }
      q.images = newImages;
    }

    if (Array.isArray(q.optionImages)) {
      for (let oi = 0; oi < q.optionImages.length; oi++) {
        q.optionImages[oi] = await convert(
          q.optionImages[oi],
          `문제${qNum}_선택지${oi + 1}`
        );
      }
    }

    if (Array.isArray(q.pairs)) {
      for (let pi = 0; pi < q.pairs.length; pi++) {
        const p = q.pairs[pi];
        p.leftImage = await convert(p.leftImage, `문제${qNum}_쌍${pi + 1}_왼쪽`);
        p.rightImage = await convert(p.rightImage, `문제${qNum}_쌍${pi + 1}_오른쪽`);
      }
    }
  }
}

// ─────────────────────────────────────────────────
// GET /api/tests — 내 시험지 목록
// ─────────────────────────────────────────────────

export async function GET() {
  try {
    const { session, accessToken } = await requireTeacher();

    const mainFolder = await findOrCreateMainFolder(accessToken);
    const folders = await listTestFolders(accessToken, mainFolder.id);

    const tests: TestListItem[] = [];
    for (const folder of folders) {
      const jsonFile = await findTestJsonFile(accessToken, folder.id);
      if (!jsonFile) continue;
      try {
        const content = await downloadFileContent(accessToken, jsonFile.id);
        const testData = JSON.parse(content) as TestData;

        const studentUrl =
          `${APP_URL}/test/${session.teacherId}/${testData.testId}` +
          (testData.grade ? `?grade=${encodeURIComponent(testData.grade)}` : '');

        tests.push({
          testId: testData.testId,
          testName: testData.testName,
          grade: testData.grade,
          createdAt: testData.createdAt,
          updatedAt: testData.updatedAt,
          folderId: folder.id,
          spreadsheetUrl: testData.spreadsheetUrl,
          previewDocUrl: testData.previewDocUrl,
          studentUrl,
        });
      } catch (e) {
        console.warn('시험지 파싱 실패 (건너뜀):', folder.name, e);
      }
    }

    // 최신순 정렬
    tests.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ success: true, tests });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
    console.error('GET /api/tests 오류:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────
// POST /api/tests — 새 시험지 생성
// ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { session, accessToken } = await requireTeacher();
    const input = (await req.json()) as {
      testName: string;
      grade?: string;
      questions: Question[];
    };

    if (!input.testName?.trim()) {
      return NextResponse.json(
        { success: false, error: '시험지 제목이 필요합니다.' },
        { status: 400 }
      );
    }
    if (!Array.isArray(input.questions) || input.questions.length === 0) {
      return NextResponse.json(
        { success: false, error: '문제를 최소 1개 이상 추가해주세요.' },
        { status: 400 }
      );
    }

    // testId 생성
    const testId = 'TEST_' + Date.now();
    const testData: TestData = {
      testId,
      testName: input.testName.trim(),
      grade: input.grade,
      questions: input.questions,
      createdAt: new Date().toISOString(),
    };

    // 1. 메인 폴더 확인 → 시험지 폴더 생성
    const mainFolder = await findOrCreateMainFolder(accessToken);
    const testFolder = await createFolder(accessToken, mainFolder.id, testData.testName);
    testData.folderId = testFolder.id;

    // 2. 이미지 마이그레이션 (base64 → Drive 파일)
    await migrateImages(accessToken, testFolder.id, testData);

    // 3. 답안지 스프레드시트 생성
    const { spreadsheetId, spreadsheetUrl } = await createAnswerSpreadsheet(
      accessToken,
      testFolder.id,
      testData.testName,
      testData.questions.length
    );
    testData.spreadsheetId = spreadsheetId;
    testData.spreadsheetUrl = spreadsheetUrl;

    // 4. 미리보기 Docs 생성 (실패해도 시험지 저장은 계속)
    try {
      const { docId, docUrl } = await createPreviewDoc(accessToken, testFolder.id, testData);
      testData.previewDocId = docId;
      testData.previewDocUrl = docUrl;
    } catch (e) {
      console.warn('미리보기 Docs 생성 실패 (건너뜀):', e);
    }

    // 5. 시험지정보.json을 시스템 서브폴더에 저장
    const systemSub = await findOrCreateSystemSubfolder(accessToken, testFolder.id);
    await uploadJson(accessToken, systemSub.id, '시험지정보.json', testData);

    const studentUrl =
      `${APP_URL}/test/${session.teacherId}/${testId}` +
      (testData.grade ? `?grade=${encodeURIComponent(testData.grade)}` : '');

    return NextResponse.json({
      success: true,
      testId,
      folderId: testFolder.id,
      spreadsheetUrl,
      previewDocUrl: testData.previewDocUrl,
      studentUrl,
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
    console.error('POST /api/tests 오류:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 }
    );
  }
}
