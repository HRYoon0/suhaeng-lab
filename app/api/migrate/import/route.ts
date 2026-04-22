/**
 * POST /api/migrate/import
 * body: { tests: TestData[] }
 *
 * Apps Script 버전에서 exportAllTestsAsJson()으로 뽑은 JSON 배열을 받아
 * 신 체계(수행Lab)에 하나씩 저장한다.
 *
 *  - testId가 이미 존재하면 해당 시험지는 skip (중복 방지)
 *  - spreadsheet/미리보기 Docs는 **새로** 생성 (기존 것은 이전 앱에 남아있음)
 *  - 이미지는 URL이면 그대로 참조, data URL이면 Drive에 재업로드
 *
 * 결과: { success, imported: string[], skipped: {testId, reason}[], failed: {testName, error}[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTeacher, UnauthorizedError } from '@/lib/auth';
import {
  findOrCreateMainFolder,
  listTestFolders,
  findTestJsonFile,
  downloadFileContent,
  findOrCreateSystemSubfolder,
  findOrCreateImageSubfolder,
  createFolder,
  uploadJson,
  uploadImageDataUrl,
} from '@/lib/drive';
import { createAnswerSpreadsheet } from '@/lib/sheets';
import { createPreviewDoc } from '@/lib/docs';
import type { TestData } from '@/lib/types';

/** data URL → Drive 이미지 업로드 (url이면 그대로) */
async function migrateImagesInPlace(
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
    if (!src.startsWith('data:')) return src; // 이미 외부 URL이면 그대로 사용
    try {
      return await uploadImageDataUrl(accessToken, imageFolder.id, `${baseName}.png`, src);
    } catch {
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
        q.optionImages[oi] = await convert(q.optionImages[oi], `문제${qNum}_선택지${oi + 1}`);
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

/** 단일 시험지를 신 체계에 저장 */
async function importOneTest(
  accessToken: string,
  mainFolderId: string,
  existingTestIds: Set<string>,
  incoming: TestData
): Promise<
  | { status: 'imported'; testId: string }
  | { status: 'skipped'; testId: string; reason: string }
  | { status: 'failed'; testName: string; error: string }
> {
  const testName = incoming.testName?.trim() || '(이름 없음)';
  try {
    if (!incoming.testId) {
      return { status: 'failed', testName, error: 'testId 없음' };
    }
    if (!Array.isArray(incoming.questions) || incoming.questions.length === 0) {
      return { status: 'failed', testName, error: '문제가 없습니다' };
    }
    if (existingTestIds.has(incoming.testId)) {
      return { status: 'skipped', testId: incoming.testId, reason: '이미 존재' };
    }

    // 기존 testId/createdAt 보존, 서버 관련 ID는 새로 생성
    const newData: TestData = {
      testId: incoming.testId,
      testName,
      grade: incoming.grade,
      questions: incoming.questions,
      createdAt: incoming.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const testFolder = await createFolder(accessToken, mainFolderId, testName);
    newData.folderId = testFolder.id;

    await migrateImagesInPlace(accessToken, testFolder.id, newData);

    const { spreadsheetId, spreadsheetUrl } = await createAnswerSpreadsheet(
      accessToken,
      testFolder.id,
      testName,
      newData.questions.length
    );
    newData.spreadsheetId = spreadsheetId;
    newData.spreadsheetUrl = spreadsheetUrl;

    try {
      const { docId, docUrl } = await createPreviewDoc(accessToken, testFolder.id, newData);
      newData.previewDocId = docId;
      newData.previewDocUrl = docUrl;
    } catch {
      // Docs 실패는 무시
    }

    const systemSub = await findOrCreateSystemSubfolder(accessToken, testFolder.id);
    await uploadJson(accessToken, systemSub.id, '시험지정보.json', newData);

    existingTestIds.add(incoming.testId);
    return { status: 'imported', testId: incoming.testId };
  } catch (e) {
    return {
      status: 'failed',
      testName,
      error: e instanceof Error ? e.message : 'unknown',
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { accessToken } = await requireTeacher();
    const body = (await req.json()) as { tests?: unknown };
    if (!Array.isArray(body.tests)) {
      return NextResponse.json(
        { success: false, error: 'tests 배열이 필요합니다.' },
        { status: 400 }
      );
    }
    const incoming = body.tests as TestData[];
    if (incoming.length === 0) {
      return NextResponse.json({ success: true, imported: [], skipped: [], failed: [] });
    }

    // 기존 testId 목록 수집 (중복 방지용)
    const mainFolder = await findOrCreateMainFolder(accessToken);
    const existingFolders = await listTestFolders(accessToken, mainFolder.id);
    const existingTestIds = new Set<string>();
    for (const f of existingFolders) {
      const jsonFile = await findTestJsonFile(accessToken, f.id);
      if (!jsonFile) continue;
      try {
        const content = await downloadFileContent(accessToken, jsonFile.id);
        const td = JSON.parse(content) as TestData;
        if (td.testId) existingTestIds.add(td.testId);
      } catch {
        // skip
      }
    }

    const imported: string[] = [];
    const skipped: { testId: string; reason: string }[] = [];
    const failed: { testName: string; error: string }[] = [];

    // 순차 처리 (Drive API 할당량 부담 고려)
    for (const t of incoming) {
      const r = await importOneTest(accessToken, mainFolder.id, existingTestIds, t);
      if (r.status === 'imported') imported.push(r.testId);
      else if (r.status === 'skipped') skipped.push({ testId: r.testId, reason: r.reason });
      else failed.push({ testName: r.testName, error: r.error });
    }

    return NextResponse.json({ success: true, imported, skipped, failed });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
    console.error('import 오류:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'server_error' },
      { status: 500 }
    );
  }
}
