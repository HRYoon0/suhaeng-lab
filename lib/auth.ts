/**
 * 인증 미들웨어 — API Route에서 세션을 검증하고 유효한 accessToken을 보장.
 *
 * 사용 예:
 *   export async function GET() {
 *     const { session, accessToken } = await requireTeacher();
 *     // accessToken으로 Drive/Sheets API 호출
 *   }
 */

import { getSession, setSession, TeacherSession } from './session';
import { refreshAccessToken } from './googleAuth';
import { getTeacherById } from './teacherRegistry';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * 세션을 검증하고 만료 임박 시 토큰을 갱신해 새 accessToken을 반환.
 * 세션 없으면 UnauthorizedError throw.
 */
export async function requireTeacher(): Promise<{
  session: TeacherSession;
  accessToken: string;
}> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();

  // 만료 1분 전까지는 기존 토큰 사용
  if (Date.now() < session.expiresAt - 60 * 1000) {
    return { session, accessToken: session.accessToken };
  }

  // KV에서 refresh_token 가져와서 새 access_token 발급
  const entry = await getTeacherById(session.teacherId);
  if (!entry) throw new UnauthorizedError('teacher_not_registered');

  const refreshed = await refreshAccessToken(entry.refreshToken);
  const updated: TeacherSession = {
    ...session,
    accessToken: refreshed.accessToken,
    expiresAt: Date.now() + refreshed.expiresIn * 1000,
  };
  await setSession(updated);
  return { session: updated, accessToken: refreshed.accessToken };
}

/**
 * teacherId로 직접 accessToken 획득 (학생 응시 시 — 세션 없음).
 * KV에서 refreshToken을 꺼내 새 accessToken 발급.
 */
export async function getTeacherAccessTokenById(teacherId: string): Promise<{
  accessToken: string;
  email: string;
  name: string;
}> {
  const entry = await getTeacherById(teacherId);
  if (!entry) throw new UnauthorizedError('teacher_not_found');

  const refreshed = await refreshAccessToken(entry.refreshToken);
  return {
    accessToken: refreshed.accessToken,
    email: entry.email,
    name: entry.name,
  };
}
