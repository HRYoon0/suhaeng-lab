/**
 * Google Docs API 래퍼 — 시험지 미리보기 문서 생성.
 *
 * 동작:
 *  1) Drive API로 빈 Google Docs 파일을 시험지 폴더에 생성
 *  2) Docs API batchUpdate로 텍스트 내용 삽입
 *  3) 수정 시에는 기존 Docs를 휴지통으로 보내고 새로 만듦 (단순 전략)
 *
 * 이미지 삽입은 MVP 범위에서 제외 — 본문 텍스트 미리보기 용도로 충분.
 */

import type { TestData } from './types';

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DOCS_API = 'https://docs.googleapis.com/v1/documents';

function buildDocContent(testData: TestData): string {
  const lines: string[] = [];
  lines.push(`${testData.testName}\n`);
  if (testData.grade) lines.push(`${testData.grade}학년\n`);
  lines.push('\n');

  testData.questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.text || '(내용 없음)'}\n`);

    if (q.images && q.images.length > 0) {
      lines.push(`   [본문 이미지 ${q.images.length}장]\n`);
    }

    if (q.type === 'multiple') {
      q.options?.forEach((opt, oi) => {
        const hasImg = q.optionImages?.[oi];
        const label = opt || (hasImg ? '(이미지)' : '');
        lines.push(`   (${oi + 1}) ${label}\n`);
      });
    } else if (q.type === 'ox') {
      lines.push('   O  /  X\n');
    } else if (q.type === 'short') {
      lines.push('   정답: ______________________\n');
    } else if (q.type === 'matching') {
      lines.push('   [왼쪽]\n');
      q.pairs?.forEach((p, pi) => {
        const label = p.left || (p.leftImage ? '(이미지)' : '');
        lines.push(`     ${pi + 1}) ${label}\n`);
      });
      lines.push('   [오른쪽]\n');
      q.pairs?.forEach((p, pi) => {
        const label = p.right || (p.rightImage ? '(이미지)' : '');
        lines.push(`     ${pi + 1}) ${label}\n`);
      });
    }
    lines.push('\n');
  });

  return lines.join('');
}

async function createDocsFile(
  accessToken: string,
  name: string,
  parentFolderId: string
): Promise<string> {
  const res = await fetch(DRIVE_FILES, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.document',
      parents: [parentFolderId],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Docs 파일 생성 실패 (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.id as string;
}

async function writeDocsContent(
  accessToken: string,
  docId: string,
  content: string
): Promise<void> {
  const res = await fetch(`${DOCS_API}/${docId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: content,
          },
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Docs 내용 입력 실패 (${res.status}): ${text}`);
  }
}

/**
 * 새 미리보기 Docs를 생성해 링크를 반환.
 * 호출 측에서 try/catch 해 실패해도 시험지 저장 자체는 성공 처리할 수 있음.
 */
export async function createPreviewDoc(
  accessToken: string,
  parentFolderId: string,
  testData: TestData
): Promise<{ docId: string; docUrl: string }> {
  const docName = `${testData.testName}_미리보기`;
  const docId = await createDocsFile(accessToken, docName, parentFolderId);
  await writeDocsContent(accessToken, docId, buildDocContent(testData));
  return {
    docId,
    docUrl: `https://docs.google.com/document/d/${docId}/edit`,
  };
}

/**
 * 기존 미리보기 Docs가 있으면 휴지통으로 보내고 새로 생성.
 * 기존 문서 trash 실패는 무시 (사용자가 수동 삭제했을 가능성).
 */
export async function replacePreviewDoc(
  accessToken: string,
  oldDocId: string | null | undefined,
  parentFolderId: string,
  testData: TestData
): Promise<{ docId: string; docUrl: string }> {
  if (oldDocId) {
    try {
      await fetch(`${DRIVE_FILES}/${oldDocId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trashed: true }),
      });
    } catch {
      // 이전 Docs가 이미 사라졌거나 접근 불가 — 무시
    }
  }
  return createPreviewDoc(accessToken, parentFolderId, testData);
}
