/**
 * GET    /api/tests/[testId]  — 시험지 하나 조회 (편집용)
 * PATCH  /api/tests/[testId]  — 시험지 수정
 * DELETE /api/tests/[testId]  — 시험지 삭제 (휴지통)
 *
 * 모두 세션 필요.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTeacher, UnauthorizedError } from '@/lib/auth';
import {
  findOrCreateMainFolder,
  listTestFolders,
  findTestJsonFile,
  downloadFileContent,
  updateJsonFile,
  findOrCreateSystemSubfolder,
  findOrCreateImageSubfolder,
  uploadImageDataUrl,
  trashFile,
  renameFile,
} from '@/lib/drive';
import { writeAnswerSheetHeaders } from '@/lib/sheets';
import { replacePreviewDoc } from '@/lib/docs';
import type { TestData, Question } from '@/lib/types';

/** testId로 폴더 + JSON 파일 찾기 (공통) */
async function findTest(
  accessToken: string,
  testId: string
): Promise<{ testFolderId: string; jsonFileId: string; testData: TestData } | null> {
  const mainFolder = await findOrCreateMainFolder(accessToken);
  const folders = await listTestFolders(accessToken, mainFolder.id);
  for (const folder of folders) {
    const jsonFile = await findTestJsonFile(accessToken, folder.id);
    if (!jsonFile) continue;
    try {
      const content = await downloadFileContent(accessToken, jsonFile.id);
      const testData = JSON.parse(content) as TestData;
      if (testData.testId === testId) {
        return { testFolderId: folder.id, jsonFileId: jsonFile.id, testData };
      }
    } catch {
      // 다음 폴더
    }
  }
  return null;
}

// ─────────────────────────────────────────────────
// GET — 시험지 하나 조회
// ─────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ testId: string }> }
) {
  try {
    const { accessToken } = await requireTeacher();
    const { testId } = await params;
    const found = await findTest(accessToken, testId);
    if (!found) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, testData: found.testData });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ success: false, error: 'server_error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────
// PATCH — 시험지 수정
// ─────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ testId: string }> }
) {
  try {
    const { accessToken } = await requireTeacher();
    const { testId } = await params;
    const input = (await req.json()) as {
      testName: string;
      grade?: string;
      questions: Question[];
    };

    const found = await findTest(accessToken, testId);
    if (!found) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }

    const oldData = found.testData;
    const newData: TestData = {
      ...oldData,
      testName: input.testName.trim(),
      grade: input.grade,
      questions: input.questions,
      updatedAt: new Date().toISOString(),
    };

    // 이미지 마이그레이션 (새로 업로드된 base64만)
    const systemSub = await findOrCreateSystemSubfolder(accessToken, found.testFolderId);
    const imageFolder = await findOrCreateImageSubfolder(accessToken, systemSub.id);
    const convert = async (
      src: string | null | undefined,
      name: string
    ): Promise<string | null> => {
      if (!src) return null;
      if (!src.startsWith('data:')) return src;
      try {
        return await uploadImageDataUrl(accessToken, imageFolder.id, `${name}.png`, src);
      } catch {
        return src;
      }
    };
    for (let qi = 0; qi < newData.questions.length; qi++) {
      const q = newData.questions[qi];
      const qNum = qi + 1;
      if (Array.isArray(q.images)) {
        const newImgs: string[] = [];
        for (let ii = 0; ii < q.images.length; ii++) {
          const url = await convert(q.images[ii], `문제${qNum}_이미지${ii + 1}`);
          if (url) newImgs.push(url);
        }
        q.images = newImgs;
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

    // 이름 변경 시 폴더·스프레드시트 이름 동기화
    if (newData.testName !== oldData.testName) {
      try { await renameFile(accessToken, found.testFolderId, newData.testName); } catch {}
      if (oldData.spreadsheetId) {
        try { await renameFile(accessToken, oldData.spreadsheetId, newData.testName + '_답안지'); } catch {}
      }
    }

    // 문제 수 변경 시 시트 헤더 갱신
    if (newData.questions.length !== oldData.questions.length && oldData.spreadsheetId) {
      try {
        await writeAnswerSheetHeaders(accessToken, oldData.spreadsheetId, newData.questions.length);
      } catch (e) {
        console.warn('헤더 갱신 실패:', e);
      }
    }

    // 미리보기 Docs 재생성 (실패해도 계속)
    try {
      const { docId, docUrl } = await replacePreviewDoc(
        accessToken,
        oldData.previewDocId,
        found.testFolderId,
        newData
      );
      newData.previewDocId = docId;
      newData.previewDocUrl = docUrl;
    } catch (e) {
      console.warn('미리보기 Docs 재생성 실패 (건너뜀):', e);
    }

    // JSON 덮어쓰기
    await updateJsonFile(accessToken, found.jsonFileId, newData);

    return NextResponse.json({ success: true, testId, previewDocUrl: newData.previewDocUrl });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ success: false, error: 'server_error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────
// DELETE — 시험지 삭제 (폴더 전체를 휴지통으로)
// ─────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ testId: string }> }
) {
  try {
    const { accessToken } = await requireTeacher();
    const { testId } = await params;
    const found = await findTest(accessToken, testId);
    if (!found) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }
    await trashFile(accessToken, found.testFolderId);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ success: false, error: 'server_error' }, { status: 500 });
  }
}
