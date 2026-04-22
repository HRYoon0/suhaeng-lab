/**
 * Google OAuth 2.0 플로우 헬퍼 — PKCE + refresh_token.
 *
 * 사용 시나리오:
 *   1. 로그인 URL 생성 (PKCE challenge 포함)
 *   2. 콜백에서 code → tokens 교환
 *   3. 토큰 만료 시 refresh_token으로 갱신
 *
 * 필요 scope:
 *   - https://www.googleapis.com/auth/drive.file  (앱이 만든 파일만 접근 — 최소 권한)
 *   - https://www.googleapis.com/auth/spreadsheets (답안지 시트 CRUD)
 *   - https://www.googleapis.com/auth/documents    (미리보기 Docs)
 *   - openid profile email                         (사용자 정보)
 *
 * 주의: drive.file은 "앱이 만든 파일만" 접근. 기존 Drive 전체 스캔 불가 (보안↑).
 */

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents',
  'openid',
  'profile',
  'email',
].join(' ');

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string; // 최초 로그인 시에만 제공. 재로그인 시 생략될 수 있음.
  expiresIn: number;     // 초 단위 (일반적으로 3600)
  idToken?: string;
}

export interface GoogleUserInfo {
  sub: string;           // Google 고유 ID
  email: string;
  name: string;
  picture: string;
}

function getClientConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;
  if (!clientId || !clientSecret || !appUrl) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / APP_URL 환경변수가 필요합니다.');
  }
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl}/api/auth/callback`,
  };
}

/**
 * 로그인 URL 생성. PKCE code_verifier와 state는 임시 쿠키에 저장해야 함 (호출자 책임).
 */
export function buildAuthUrl(codeChallenge: string, state: string): string {
  const { clientId, redirectUri } = getClientConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',       // refresh_token 발급받기 위함
    prompt: 'consent',             // 매번 동의 화면 → refresh_token 보장
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * 콜백에서 받은 code를 토큰으로 교환.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<GoogleTokens> {
  const { clientId, clientSecret, redirectUri } = getClientConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`토큰 교환 실패 (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
    idToken: data.id_token,
  };
}

/**
 * refresh_token으로 새 access_token 받기.
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = getClientConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`토큰 갱신 실패 (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken, // 동일 유지
    expiresIn: data.expires_in ?? 3600,
  };
}

/**
 * access_token으로 사용자 정보 조회.
 */
export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`사용자 정보 조회 실패 (${res.status})`);
  }
  return (await res.json()) as GoogleUserInfo;
}
