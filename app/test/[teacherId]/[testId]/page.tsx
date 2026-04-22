/**
 * 학생 응시 페이지 — 인증 불필요.
 * 서버 컴포넌트에서 메타데이터만 처리하고, 실제 UI는 클라이언트 컴포넌트로 위임.
 */

import StudentTestClient from './StudentTestClient';

interface Params {
  teacherId: string;
  testId: string;
}

export default async function StudentTestPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ grade?: string }>;
}) {
  const { teacherId, testId } = await params;
  const { grade } = await searchParams;

  return <StudentTestClient teacherId={teacherId} testId={testId} urlGrade={grade ?? ''} />;
}
