/**
 * Google Sheets API v4 + Drive API wrapper — 학생답안 시트 생성·관리.
 *
 * Drive API로 파일 생성(이동), Sheets API로 셀 조작.
 */

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

// 학생답안 시트 헤더 — Apps Script 버전과 호환
const ANSWER_HEADERS_BASE = ['제출시간', '학년', '반', '이름', '제출ID'];

/** 새 스프레드시트 생성 → 시험지 폴더로 이동 → '학생답안' 시트 설정 */
export async function createAnswerSpreadsheet(
  accessToken: string,
  parentFolderId: string,
  testName: string,
  questionCount: number
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  // 1. 빈 스프레드시트 생성 (기본 위치는 내 드라이브 루트)
  const createRes = await fetch(SHEETS_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: `${testName}_답안지` },
      sheets: [{ properties: { title: '학생답안' } }],
    }),
  });
  if (!createRes.ok) {
    throw new Error(`시트 생성 실패 (${createRes.status}): ${await createRes.text()}`);
  }
  const { spreadsheetId, spreadsheetUrl } = await createRes.json() as {
    spreadsheetId: string;
    spreadsheetUrl: string;
  };

  // 2. 루트에서 시험지 폴더로 이동 — Drive API의 parents 변경
  //    addParents + removeParents를 한 번에
  const moveRes = await fetch(
    `${DRIVE_API}/files/${spreadsheetId}?addParents=${parentFolderId}&removeParents=root&fields=id,parents`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!moveRes.ok) {
    // 이동 실패해도 시트는 만들어진 상태라 계속 진행 (권한 이슈면 수동 이동 가능)
    console.warn(`시트 폴더 이동 실패 (${moveRes.status})`);
  }

  // 3. 헤더 행 작성
  await writeAnswerSheetHeaders(accessToken, spreadsheetId, questionCount);

  return { spreadsheetId, spreadsheetUrl };
}

/** '학생답안' 시트의 1행을 헤더로 작성 (초기 또는 문제수 변경 시) */
export async function writeAnswerSheetHeaders(
  accessToken: string,
  spreadsheetId: string,
  questionCount: number
): Promise<void> {
  const headers = [...ANSWER_HEADERS_BASE];
  for (let i = 1; i <= questionCount; i++) headers.push(`문제 ${i}`);

  await sheetsUpdate(
    accessToken,
    spreadsheetId,
    `학생답안!A1:${columnLetter(headers.length)}1`,
    [headers]
  );

  // 헤더 스타일링: 차콜 배경 + 흰 글씨 + 굵게
  await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: 0,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: headers.length,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.12, green: 0.16, blue: 0.22 }, // #1f2937
                textFormat: {
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                  bold: true,
                },
                horizontalAlignment: 'CENTER',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
          },
        },
        // 제출ID 컬럼(E) 숨기기
        {
          updateDimensionProperties: {
            range: {
              sheetId: 0,
              dimension: 'COLUMNS',
              startIndex: 4,
              endIndex: 5,
            },
            properties: { hiddenByUser: true },
            fields: 'hiddenByUser',
          },
        },
      ],
    }),
  }).catch((e) => console.warn('헤더 서식 적용 실패 (무시):', e));
}

/** 학생답안 시트에 한 행 추가 */
export async function appendAnswerRow(
  accessToken: string,
  spreadsheetId: string,
  row: (string | number)[]
): Promise<void> {
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/학생답안!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [row] }),
    }
  );
  if (!res.ok) {
    throw new Error(`행 추가 실패 (${res.status}): ${await res.text()}`);
  }
}

/** 특정 범위 읽기 */
export async function readRange(
  accessToken: string,
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`범위 읽기 실패 (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

// ─────────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────────

async function sheetsUpdate(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: (string | number)[][]
): Promise<void> {
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  );
  if (!res.ok) {
    throw new Error(`시트 업데이트 실패 (${res.status}): ${await res.text()}`);
  }
}

/** 1-based 컬럼 번호를 A, B, ..., Z, AA, AB로 변환 */
function columnLetter(col: number): string {
  let s = '';
  while (col > 0) {
    const mod = (col - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}
