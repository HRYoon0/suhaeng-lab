/**
 * Google Drive API v3 wrapper — 교사의 accessToken으로 개인 Drive에 파일 CRUD.
 *
 * Scope: `drive.file` — 이 앱이 만든 파일에만 접근 가능 (최소 권한).
 *
 * 폴더 구조 (Apps Script 버전과 호환):
 *   수행Lab/
 *     [시험명]/
 *       시험지_미리보기 (Google Docs, 추후 구현)
 *       [시험명]_답안지 (Google Sheets)
 *       ⚠️_시스템파일(수정금지)/
 *         시험지정보.json
 *         이미지/
 *           문제1.png
 *           ...
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

const MAIN_FOLDER_NAME = '수행Lab';
const SYSTEM_SUBFOLDER_NAME = '⚠️_시스템파일(수정금지)';
const IMAGE_SUBFOLDER_NAME = '이미지';
const TEST_JSON_NAME = '시험지정보.json';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// ─────────────────────────────────────────────────
// 저수준 공통 헬퍼
// ─────────────────────────────────────────────────

interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  webViewLink?: string;
  webContentLink?: string;
}

async function driveFetch<T = unknown>(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Drive API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────
// 폴더 탐색 · 생성
// ─────────────────────────────────────────────────

/** 이름으로 자식 폴더 찾기. 없으면 null. */
export async function findChildFolder(
  accessToken: string,
  parentId: string | 'root',
  name: string
): Promise<DriveFile | null> {
  // q 파라미터: 이름 정확 일치 + 부모 + 폴더 타입 + 휴지통 제외
  // 작은따옴표는 백슬래시로 이스케이프해야 함
  const safeName = name.replace(/'/g, "\\'");
  const q = [
    `name = '${safeName}'`,
    `'${parentId}' in parents`,
    `mimeType = '${FOLDER_MIME}'`,
    `trashed = false`,
  ].join(' and ');
  const url = `/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
  const data = await driveFetch<{ files: DriveFile[] }>(accessToken, url);
  return data.files?.[0] ?? null;
}

/** 폴더 생성 (이미 존재해도 새로 만듦 — 호출자가 중복 체크해야 함) */
export async function createFolder(
  accessToken: string,
  parentId: string | 'root',
  name: string
): Promise<DriveFile> {
  const metadata = { name, mimeType: FOLDER_MIME, parents: [parentId] };
  const res = await fetch(`${DRIVE_API}/files?fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) {
    throw new Error(`폴더 생성 실패 (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/** 있으면 반환, 없으면 생성 */
export async function findOrCreateFolder(
  accessToken: string,
  parentId: string | 'root',
  name: string
): Promise<DriveFile> {
  const existing = await findChildFolder(accessToken, parentId, name);
  if (existing) return existing;
  return createFolder(accessToken, parentId, name);
}

/** '수행Lab' 메인 폴더 (Drive 최상위) */
export async function findOrCreateMainFolder(accessToken: string): Promise<DriveFile> {
  return findOrCreateFolder(accessToken, 'root', MAIN_FOLDER_NAME);
}

/** 시험지 폴더 안의 '⚠️_시스템파일(수정금지)' 서브폴더 */
export async function findOrCreateSystemSubfolder(
  accessToken: string,
  testFolderId: string
): Promise<DriveFile> {
  return findOrCreateFolder(accessToken, testFolderId, SYSTEM_SUBFOLDER_NAME);
}

/** 시스템 서브폴더 안의 '이미지' 폴더 */
export async function findOrCreateImageSubfolder(
  accessToken: string,
  systemSubfolderId: string
): Promise<DriveFile> {
  return findOrCreateFolder(accessToken, systemSubfolderId, IMAGE_SUBFOLDER_NAME);
}

// ─────────────────────────────────────────────────
// 파일 업로드 · 다운로드
// ─────────────────────────────────────────────────

/** JSON을 multipart로 업로드해 파일 생성 */
export async function uploadJson(
  accessToken: string,
  parentId: string,
  name: string,
  data: unknown
): Promise<DriveFile> {
  const body = JSON.stringify(data, null, 2);
  const metadata = { name, mimeType: 'application/json', parents: [parentId] };

  const boundary = '-------suhaeng_lab_boundary';
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${body}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );
  if (!res.ok) {
    throw new Error(`JSON 업로드 실패 (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/** 기존 JSON 파일을 새 데이터로 덮어쓰기 (PATCH) */
export async function updateJsonFile(
  accessToken: string,
  fileId: string,
  data: unknown
): Promise<void> {
  const body = JSON.stringify(data, null, 2);
  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    }
  );
  if (!res.ok) {
    throw new Error(`JSON 업데이트 실패 (${res.status}): ${await res.text()}`);
  }
}

/** 파일 내용 다운로드 (alt=media) */
export async function downloadFileContent(
  accessToken: string,
  fileId: string
): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`파일 다운로드 실패 (${res.status}): ${await res.text()}`);
  }
  return res.text();
}

/** 폴더 내에서 이름으로 파일 찾기 (JSON 파일 조회용) */
export async function findFileInFolder(
  accessToken: string,
  folderId: string,
  name: string
): Promise<DriveFile | null> {
  const safeName = name.replace(/'/g, "\\'");
  const q = [
    `name = '${safeName}'`,
    `'${folderId}' in parents`,
    `trashed = false`,
  ].join(' and ');
  const url = `/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&spaces=drive`;
  const data = await driveFetch<{ files: DriveFile[] }>(accessToken, url);
  return data.files?.[0] ?? null;
}

/** 시험지정보.json을 시스템 서브폴더/루트 어디서든 찾기 (하위호환) */
export async function findTestJsonFile(
  accessToken: string,
  testFolderId: string
): Promise<DriveFile | null> {
  // 1. 시스템 서브폴더 먼저
  const sysSub = await findChildFolder(accessToken, testFolderId, SYSTEM_SUBFOLDER_NAME);
  if (sysSub) {
    const inSys = await findFileInFolder(accessToken, sysSub.id, TEST_JSON_NAME);
    if (inSys) return inSys;
  }
  // 2. 루트 fallback
  return findFileInFolder(accessToken, testFolderId, TEST_JSON_NAME);
}

// ─────────────────────────────────────────────────
// 이미지 업로드 (base64 data URL → Drive 파일 + 공개 URL)
// ─────────────────────────────────────────────────

/** base64 data URL 문자열을 Drive에 업로드하고 공개 URL 반환 */
export async function uploadImageDataUrl(
  accessToken: string,
  parentId: string,
  name: string,
  dataUrl: string
): Promise<string> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('올바르지 않은 data URL');
  const [, mime, base64] = match;
  const bytes = Buffer.from(base64, 'base64');

  // 1. 메타데이터로 빈 파일 생성
  const metadata = { name, mimeType: mime, parents: [parentId] };
  const boundary = '-------suhaeng_lab_img';
  const preamble =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mime}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n`;
  const epilogue = `\r\n--${boundary}--`;

  const body = Buffer.concat([
    Buffer.from(preamble, 'utf8'),
    Buffer.from(base64, 'utf8'),
    Buffer.from(epilogue, 'utf8'),
  ]);

  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: body as unknown as BodyInit,
    }
  );
  if (!res.ok) {
    throw new Error(`이미지 업로드 실패 (${res.status}): ${await res.text()}`);
  }
  const { id: fileId } = (await res.json()) as { id: string };

  // 2. "링크가 있는 누구나" 권한 부여 (학생이 볼 수 있도록)
  await fetch(`${DRIVE_API}/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'anyone', role: 'reader' }),
  });

  // 3. 공개 뷰 URL 반환 (lh3 CDN 포맷 — 더 안정적)
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

// ─────────────────────────────────────────────────
// 하위 자원 나열 · 휴지통
// ─────────────────────────────────────────────────

/** 메인 폴더 내 모든 시험지 폴더 나열 */
export async function listTestFolders(
  accessToken: string,
  mainFolderId: string
): Promise<DriveFile[]> {
  const q = [
    `'${mainFolderId}' in parents`,
    `mimeType = '${FOLDER_MIME}'`,
    `trashed = false`,
  ].join(' and ');
  const url = `/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&spaces=drive&pageSize=200`;
  const data = await driveFetch<{ files: DriveFile[] }>(accessToken, url);
  return data.files ?? [];
}

/** 폴더를 휴지통으로 (삭제) */
export async function trashFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trashed: true }),
  });
  if (!res.ok) {
    throw new Error(`휴지통 이동 실패 (${res.status}): ${await res.text()}`);
  }
}

/** 파일 이름 변경 */
export async function renameFile(
  accessToken: string,
  fileId: string,
  newName: string
): Promise<void> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) {
    throw new Error(`이름 변경 실패 (${res.status}): ${await res.text()}`);
  }
}

export { MAIN_FOLDER_NAME, SYSTEM_SUBFOLDER_NAME, IMAGE_SUBFOLDER_NAME, TEST_JSON_NAME };
