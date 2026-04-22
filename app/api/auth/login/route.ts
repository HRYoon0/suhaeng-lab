/**
 * GET /api/auth/login
 * Google OAuth 로그인 시작 — PKCE verifier + state를 임시 쿠키에 저장하고 Google로 리디렉션.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { buildAuthUrl } from '@/lib/googleAuth';

const TEMP_COOKIE_NAME = 'suhaeng_auth_temp';
const TEMP_COOKIE_MAX_AGE = 5 * 60; // 5분 — OAuth 왕복 시간 넉넉히

export async function GET() {
  // PKCE code_verifier 생성 (43~128자)
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  // S256 challenge = base64url(sha256(verifier))
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // CSRF 방지용 state
  const state = crypto.randomBytes(16).toString('hex');

  // 콜백에서 검증하기 위해 임시 쿠키에 저장
  const tempPayload = JSON.stringify({ codeVerifier, state });
  const tempValue = Buffer.from(tempPayload).toString('base64url');

  const authUrl = buildAuthUrl(codeChallenge, state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(TEMP_COOKIE_NAME, tempValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TEMP_COOKIE_MAX_AGE,
  });
  return response;
}

export { TEMP_COOKIE_NAME };
