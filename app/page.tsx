/**
 * 랜딩 페이지 — 비로그인 시 "구글로 시작하기" 버튼.
 * 이미 로그인된 상태면 /dashboard로 자동 이동은 클라이언트 컴포넌트에서 처리 예정.
 */

export default function LandingPage() {
  return (
    <main className="container" style={{ textAlign: 'center', padding: '80px 40px' }}>
      <h1 style={{ fontSize: '3em', color: '#1f2937', marginBottom: '16px' }}>
        💡 수행Lab
      </h1>
      <p style={{ color: '#6b7280', fontSize: '1.1em', marginBottom: '40px' }}>
        선생님이 만드는 나만의 수행평가 실험실
      </p>
      <a href="/api/auth/login" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>
        Google 계정으로 시작하기
      </a>
      <p style={{ color: '#9ca3af', fontSize: '0.9em', marginTop: '24px' }}>
        로그인 시 본인의 Google Drive에 시험지가 저장됩니다.
      </p>
    </main>
  );
}
