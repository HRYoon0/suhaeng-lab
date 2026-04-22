/**
 * 세션 관리 — httpOnly 쿠키에 교사의 OAuth 토큰을 저장.
 * HMAC-SHA256 서명으로 변조 방지.
 *
 * 쿠키 포맷: base64(JSON payload).hex(hmac signature)
 *
 * 주의: 암호화는 하지 않고 서명만 함. 토큰 자체는 base64 디코딩 가능하지만
 * httpOnly + Secure 쿠키라 브라우저 JS에서 접근 불가. 강력 보안 원하면 AES 추가.
 */

import crypto from 'crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'suhaeng_session';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30일

export interface TeacherSession {
  teacherId: string;           // Vercel KV의 refreshToken 조회 키 (UUID)
  email: string;
  name: string;
  picture: string;
  accessToken: string;         // 단기 (~1시간), 만료되면 refresh 필요
  expiresAt: number;           // ms 타임스탬프
}

function getSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET 환경변수가 설정되지 않았습니다.');
  }
  return Buffer.from(secret, 'utf8');
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

/** 세션 객체를 쿠키 문자열로 직렬화 */
export function encodeSession(session: TeacherSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

/** 쿠키 문자열을 검증하고 세션 객체로 역직렬화. 서명 불일치/만료 시 null */
export function decodeSession(cookieValue: string | undefined): TeacherSession | null {
  if (!cookieValue) return null;
  const [payload, signature] = cookieValue.split('.');
  if (!payload || !signature) return null;

  // 서명 검증 (timingSafeEqual로 타이밍 공격 방지)
  const expected = sign(payload);
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(json) as TeacherSession;
  } catch {
    return null;
  }
}

/** Next.js 서버 컴포넌트·API Route에서 현재 세션 읽기 */
export async function getSession(): Promise<TeacherSession | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  return decodeSession(value);
}

/** 세션 쿠키 설정 (로그인 시 호출) */
export async function setSession(session: TeacherSession): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, encodeSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

/** 세션 쿠키 삭제 (로그아웃 시 호출) */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export { COOKIE_NAME };
