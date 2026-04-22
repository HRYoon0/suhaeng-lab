/**
 * 교사 대시보드 — 세션이 있어야 접근 가능.
 * 시험지 목록 + "새 시험지 만들기" 링크를 제공하는 서버 컴포넌트.
 * 실제 목록 렌더·생성 폼은 클라이언트 컴포넌트에 위임.
 */

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/');

  return <DashboardClient user={{ name: session.name, email: session.email, picture: session.picture }} />;
}
