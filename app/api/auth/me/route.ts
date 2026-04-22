/**
 * GET /api/auth/me
 * 현재 로그인 상태 + 교사 정보 반환. 프론트엔드의 로그인 상태 확인용.
 *
 * 응답: { loggedIn: boolean, user?: { name, email, picture, teacherId } }
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ loggedIn: false });
  }
  return NextResponse.json({
    loggedIn: true,
    user: {
      teacherId: session.teacherId,
      email: session.email,
      name: session.name,
      picture: session.picture,
    },
  });
}
