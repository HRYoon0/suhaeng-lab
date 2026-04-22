/**
 * POST /api/auth/logout
 * 세션 쿠키 삭제. KV의 refreshToken은 유지 (다른 세션이나 학생 응시용으로 여전히 필요).
 */

import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/session';

export async function POST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
