/**
 * GET /api/auth/callback?code=...&state=...
 * Google에서 리디렉션된 뒤 처리:
 *   1. state 검증 (CSRF)
 *   2. code → tokens 교환 (access + refresh)
 *   3. 사용자 정보 조회
 *   4. teacherId 할당 (email 기준 재사용 or 새로 생성)
 *   5. KV에 refreshToken 저장
 *   6. 세션 쿠키 설정
 *   7. /dashboard로 리디렉션
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { exchangeCodeForTokens, fetchUserInfo } from '@/lib/googleAuth';
import { setSession, TeacherSession } from '@/lib/session';
import { upsertTeacher, findTeacherIdByEmail } from '@/lib/teacherRegistry';

const TEMP_COOKIE_NAME = 'suhaeng_auth_temp';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

function redirectWithError(reason: string): NextResponse {
  return NextResponse.redirect(`${APP_URL}/?login=error&reason=${encodeURIComponent(reason)}`);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code) return redirectWithError('no_code');

  // 임시 쿠키에서 verifier + state 꺼내기
  const tempValue = req.cookies.get(TEMP_COOKIE_NAME)?.value;
  if (!tempValue) return redirectWithError('no_temp_cookie');

  let codeVerifier: string;
  let savedState: string;
  try {
    const parsed = JSON.parse(Buffer.from(tempValue, 'base64url').toString('utf8'));
    codeVerifier = parsed.codeVerifier;
    savedState = parsed.state;
  } catch {
    return redirectWithError('bad_temp_cookie');
  }

  if (state !== savedState) return redirectWithError('state_mismatch');

  // 1. code → tokens 교환
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, codeVerifier);
  } catch (e) {
    return redirectWithError('token_exchange_failed');
  }

  if (!tokens.refreshToken) {
    // prompt=consent를 걸었으므로 거의 항상 올 것. 없으면 로직 재검토 필요.
    return redirectWithError('no_refresh_token');
  }

  // 2. 사용자 정보 조회
  let userInfo;
  try {
    userInfo = await fetchUserInfo(tokens.accessToken);
  } catch {
    return redirectWithError('userinfo_failed');
  }

  // 3. teacherId 결정 — 재로그인이면 기존 ID 재사용, 처음이면 새 UUID
  let teacherId = await findTeacherIdByEmail(userInfo.email);
  if (!teacherId) {
    teacherId = crypto.randomUUID();
  }

  // 4. KV에 refreshToken 저장
  const now = Date.now();
  await upsertTeacher({
    teacherId,
    email: userInfo.email,
    name: userInfo.name,
    refreshToken: tokens.refreshToken,
    createdAt: now,
    updatedAt: now,
  });

  // 5. 세션 쿠키 설정
  const session: TeacherSession = {
    teacherId,
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture,
    accessToken: tokens.accessToken,
    expiresAt: now + tokens.expiresIn * 1000,
  };
  await setSession(session);

  // 6. 임시 쿠키 삭제하며 dashboard로 이동
  const response = NextResponse.redirect(`${APP_URL}/dashboard`);
  response.cookies.delete(TEMP_COOKIE_NAME);
  return response;
}
