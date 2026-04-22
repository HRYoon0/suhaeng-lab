/**
 * 교사 레지스트리 — Vercel KV에 { teacherId: refreshToken } 매핑 저장.
 *
 * 왜 필요한가?
 * - 학생이 교사의 Drive에 답안을 쓰려면 교사의 OAuth refresh_token이 필요.
 * - 세션 쿠키는 브라우저별이라 서버가 독립적으로 refresh_token을 얻을 방법이 없음.
 * - 그래서 서버측 KV에 teacherId(공개 UUID) → refreshToken(비밀) 매핑을 저장.
 *
 * 학생 응시 흐름:
 *   1. 학생 URL: /test/<teacherId>/<testId>
 *   2. 서버: KV에서 teacherId로 refreshToken 조회
 *   3. 서버: refreshToken으로 새 accessToken 받음
 *   4. 서버: accessToken으로 Drive/Sheets API 호출 → 교사 할당량 사용
 *
 * 보안: teacherId는 UUID라 열거 불가. KV의 값(refreshToken)은 서버에서만 접근.
 */

import { kv } from '@vercel/kv';

const KEY_PREFIX = 'teacher:';

export interface TeacherRegistryEntry {
  teacherId: string;      // 공개 ID (URL에 노출)
  email: string;
  name: string;
  refreshToken: string;   // 비밀 — KV에서만 사용
  createdAt: number;
  updatedAt: number;
}

/** 교사 등록 또는 refresh_token 갱신 */
export async function upsertTeacher(entry: TeacherRegistryEntry): Promise<void> {
  await kv.set(KEY_PREFIX + entry.teacherId, entry);
  // email → teacherId 역방향 인덱스 (같은 계정 재로그인 시 동일 teacherId 재사용)
  await kv.set('email:' + entry.email, entry.teacherId);
}

/** teacherId로 교사 정보 조회 (refresh_token 포함) */
export async function getTeacherById(teacherId: string): Promise<TeacherRegistryEntry | null> {
  const entry = await kv.get<TeacherRegistryEntry>(KEY_PREFIX + teacherId);
  return entry ?? null;
}

/** email로 기존 teacherId 찾기 (재로그인 시 동일 ID 유지용) */
export async function findTeacherIdByEmail(email: string): Promise<string | null> {
  const teacherId = await kv.get<string>('email:' + email);
  return teacherId ?? null;
}

/** 교사 삭제 (계정 탈퇴 등) */
export async function deleteTeacher(teacherId: string, email: string): Promise<void> {
  await kv.del(KEY_PREFIX + teacherId);
  await kv.del('email:' + email);
}
