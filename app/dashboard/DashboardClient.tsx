'use client';

/**
 * 교사 대시보드 클라이언트 UI.
 * - 탭: "저장된 시험지 목록" / "새 시험지 만들기"
 * - 목록에서 "수정" 버튼 → 시험지 로드 후 편집 모드로 폼 진입
 */

import { useEffect, useState } from 'react';
import type { TestListItem, TestData } from '@/lib/types';
import CreateTestForm from './CreateTestForm';

interface User {
  name: string;
  email: string;
  picture: string;
}

export default function DashboardClient({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [tests, setTests] = useState<TestListItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  // 편집 중인 시험지 (null이면 새로 만드는 모드)
  const [editingTest, setEditingTest] = useState<TestData | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  async function loadTests() {
    setLoading(true);
    try {
      const res = await fetch('/api/tests', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setTests(data.tests);
      else alert('목록 로드 실패: ' + data.error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'list' && tests === null) {
      loadTests();
    }
  }, [activeTab, tests]);

  async function handleDelete(testId: string, testName: string) {
    if (!confirm(`"${testName}" 시험지를 삭제할까요?\n드라이브 휴지통에서 복원 가능합니다.`)) return;
    const res = await fetch(`/api/tests/${testId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setTests((prev) => prev?.filter((t) => t.testId !== testId) ?? null);
    } else {
      alert('삭제 실패: ' + data.error);
    }
  }

  async function handleEdit(testId: string) {
    setEditLoading(true);
    try {
      const res = await fetch(`/api/tests/${testId}`, { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'load_failed');
      setEditingTest(data.testData as TestData);
      setActiveTab('create');
    } catch (e) {
      alert('불러오기 실패: ' + (e instanceof Error ? e.message : 'unknown'));
    } finally {
      setEditLoading(false);
    }
  }

  function handleCreateNew() {
    setEditingTest(null);
    setActiveTab('create');
  }

  async function handleCreated() {
    setEditingTest(null);
    setActiveTab('list');
    await loadTests();
  }

  function handleCancelEdit() {
    setEditingTest(null);
    setActiveTab('list');
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  return (
    <main className="container">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '2em', color: '#1f2937' }}>💡 수행Lab</h1>
          <p style={{ color: '#6b7280', marginTop: 4, fontSize: '0.95em' }}>{user.name} ({user.email})</p>
        </div>
        <button onClick={handleLogout} className="btn" style={{ background: '#f3f4f6', color: '#374151' }}>로그아웃</button>
      </header>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, borderBottom: '1px solid #e5e7eb' }}>
        <TabButton active={activeTab === 'create'} onClick={handleCreateNew}>
          {editingTest ? `✏️ 수정 중: ${editingTest.testName}` : '새 시험지 만들기'}
        </TabButton>
        <TabButton active={activeTab === 'list'} onClick={() => setActiveTab('list')}>
          저장된 시험지 목록
        </TabButton>
      </div>

      {activeTab === 'create' && (
        <CreateTestForm
          key={editingTest?.testId ?? 'new'}
          initialTest={editingTest ?? undefined}
          onCreated={handleCreated}
          onCancel={editingTest ? handleCancelEdit : undefined}
        />
      )}

      {activeTab === 'list' && (
        <section>
          <DriveInfoBanner />
          <MigrationPanel onImported={loadTests} />
          {editLoading && <p style={{ color: '#6b7280' }}>시험지 불러오는 중...</p>}
          {loading && <p style={{ color: '#6b7280' }}>불러오는 중...</p>}
          {!loading && tests?.length === 0 && (
            <p style={{ color: '#6b7280', padding: 40, textAlign: 'center' }}>
              아직 저장된 시험지가 없습니다.
            </p>
          )}
          {tests && tests.map((t) => (
            <TestCard
              key={t.testId}
              test={t}
              onEdit={() => handleEdit(t.testId)}
              onDelete={() => handleDelete(t.testId, t.testName)}
            />
          ))}
        </section>
      )}
    </main>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '14px 20px',
        background: active ? '#f9fafb' : 'transparent',
        border: 'none',
        borderBottom: active ? '3px solid #fda4af' : '3px solid transparent',
        color: active ? '#fda4af' : '#6b7280',
        fontSize: '1.05em',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function DriveInfoBanner() {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(253,164,175,0.10), rgba(56,189,248,0.06))',
      border: '1px solid rgba(253,164,175,0.25)',
      borderRadius: 12,
      padding: '18px 22px',
      marginBottom: 20,
      display: 'flex',
      gap: 14,
    }}>
      <div style={{ fontSize: '1.8em' }}>📁</div>
      <div>
        <div style={{ fontSize: '1.05em', color: '#1f2937', marginBottom: 6 }}>시험지 저장 위치 안내</div>
        <div style={{ color: '#4b5563', fontSize: '0.95em', lineHeight: 1.6 }}>
          시험지는 본인 <strong style={{ color: '#1f2937', background: 'rgba(253,164,175,0.18)', padding: '2px 8px', borderRadius: 5 }}>Google Drive → &quot;수행Lab&quot;</strong> 폴더에 자동 저장됩니다.<br />
          각 시험지 폴더 안에 답안지 스프레드시트가 있고, <strong style={{ color: '#1f2937', background: 'rgba(245,158,11,0.18)', padding: '2px 8px', borderRadius: 5 }}>⚠️_시스템파일(수정금지)</strong> 폴더는 앱이 사용하는 파일이므로 <strong>직접 이름·위치를 바꾸거나 삭제하지 마세요.</strong>
        </div>
      </div>
    </div>
  );
}

function MigrationPanel({ onImported }: { onImported: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<null | {
    imported: string[];
    skipped: { testId: string; reason: string }[];
    failed: { testName: string; error: string }[];
  }>(null);

  async function runImport() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      alert('올바른 JSON 형식이 아닙니다. Apps Script의 exportAllTestsAsJson() 결과를 복사해 붙여넣어주세요.');
      return;
    }
    if (!Array.isArray(parsed)) {
      alert('JSON이 배열([ ... ])이 아닙니다.');
      return;
    }
    if (parsed.length === 0) {
      alert('가져올 시험지가 없습니다.');
      return;
    }
    if (!confirm(`${parsed.length}개 시험지를 가져옵니다. 진행할까요?\n(중복된 testId는 건너뜁니다)`)) return;

    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/migrate/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tests: parsed }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setResult({
        imported: data.imported || [],
        skipped: data.skipped || [],
        failed: data.failed || [],
      });
      await onImported();
    } catch (e) {
      alert('가져오기 실패: ' + (e instanceof Error ? e.message : 'unknown'));
    } finally {
      setRunning(false);
    }
  }

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      style={{
        background: '#fefce8',
        border: '1px solid #fde68a',
        borderRadius: 12,
        padding: '14px 18px',
        marginBottom: 20,
      }}
    >
      <summary style={{ cursor: 'pointer', color: '#92400e', fontSize: '1em' }}>
        📥 Apps Script 기존 시험지 가져오기
      </summary>
      <div style={{ marginTop: 12, color: '#4b5563', fontSize: '0.92em', lineHeight: 1.6 }}>
        <p>
          1) 기존 Apps Script 편집기에서 <code>exportAllTestsAsJson()</code> 함수를 실행<br />
          2) 실행 로그(보기 &gt; 로그)에 찍힌 JSON 전체를 복사<br />
          3) 아래에 붙여넣고 <strong>가져오기</strong> 클릭
        </p>
        <p style={{ color: '#6b7280', fontSize: '0.88em' }}>
          * 문제만 이전됩니다 (답안 스프레드시트는 기존 앱에 남고, 새 답안지는 새로 생성).
          * 이미지 URL은 그대로 재사용되므로 원본과 동일하게 보입니다.
        </p>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='[ { "testId": "TEST_...", "testName": "...", "questions": [...] } ]'
          rows={6}
          style={{
            width: '100%',
            padding: 10,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            fontFamily: 'monospace',
            fontSize: '0.85em',
            marginTop: 8,
            resize: 'vertical',
          }}
        />
        <button
          onClick={runImport}
          disabled={running || !json.trim()}
          className="btn btn-primary"
          style={{ marginTop: 10 }}
        >
          {running ? '가져오는 중... (최대 수 분 소요)' : '가져오기'}
        </button>

        {result && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize: '0.9em',
            }}
          >
            <div>✓ 가져옴: <strong>{result.imported.length}</strong>개</div>
            {result.skipped.length > 0 && (
              <div>↷ 건너뜀: <strong>{result.skipped.length}</strong>개 (이미 존재)</div>
            )}
            {result.failed.length > 0 && (
              <div style={{ color: '#dc2626', marginTop: 4 }}>
                ✗ 실패: <strong>{result.failed.length}</strong>개
                <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                  {result.failed.map((f, i) => (
                    <li key={i}>{f.testName}: {f.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

function TestCard({
  test,
  onEdit,
  onDelete,
}: {
  test: TestListItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copyLink() {
    await navigator.clipboard.writeText(test.studentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{
      background: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: 15,
      padding: 25,
      marginBottom: 20,
    }}>
      <h4 style={{ color: '#fda4af', fontSize: '1.25em', marginBottom: 10 }}>{test.testName}</h4>
      <p style={{ color: '#6b7280', fontSize: '0.9em', marginBottom: 15 }}>
        생성일: {new Date(test.createdAt).toLocaleString('ko-KR')}
        {test.updatedAt && test.updatedAt !== test.createdAt && (
          <>  ·  수정: {new Date(test.updatedAt).toLocaleString('ko-KR')}</>
        )}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        <button className="btn" onClick={copyLink} style={{ background: 'white', color: '#fda4af', border: '2px solid #fda4af' }}>
          {copied ? '✓ 복사됨' : '학생용 링크 복사'}
        </button>
        <a className="btn" href={test.studentUrl} target="_blank" rel="noreferrer" style={{ background: 'white', color: '#fda4af', border: '2px solid #fda4af', textDecoration: 'none' }}>
          학생 화면으로 보기
        </a>
        {test.previewDocUrl && (
          <a className="btn" href={test.previewDocUrl} target="_blank" rel="noreferrer" style={{ background: 'white', color: '#fda4af', border: '2px solid #fda4af', textDecoration: 'none' }}>
            📄 미리보기
          </a>
        )}
        {test.spreadsheetUrl && (
          <a className="btn btn-primary" href={test.spreadsheetUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            📊 결과 시트 열기
          </a>
        )}
        <button onClick={onEdit} className="btn btn-primary">✏️ 수정</button>
        <button onClick={onDelete} className="btn" style={{ background: '#ef4444', color: 'white' }}>🗑️ 삭제</button>
      </div>
    </div>
  );
}
