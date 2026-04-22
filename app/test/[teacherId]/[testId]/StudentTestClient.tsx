'use client';

/**
 * 학생 응시 UI — 4가지 문제 유형 지원.
 *  - multiple : 체크박스(복수) / 라디오(단일)
 *  - ox       : O/X 버튼
 *  - short    : 텍스트 입력
 *  - matching : 왼쪽 선택 → 오른쪽 클릭으로 연결 (숫자 배지로 표시)
 */

import { useEffect, useState } from 'react';
import type { TestData, StudentAnswer, Question } from '@/lib/types';

export default function StudentTestClient({
  teacherId,
  testId,
  urlGrade,
}: {
  teacherId: string;
  testId: string;
  urlGrade: string;
}) {
  const [test, setTest] = useState<TestData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState<'info' | 'test' | 'done'>('info');

  // 학생 정보
  const [grade, setGrade] = useState(urlGrade || '');
  const [classNum, setClassNum] = useState('');
  const [name, setName] = useState('');

  // 답안: 문제 인덱스 → 유형별 값
  //   multiple : number[]
  //   ox       : number (0 | 1)
  //   short    : string
  //   matching : Record<number, number>  (leftIdx -> rightIdx)
  const [answers, setAnswers] = useState<Record<number, unknown>>({});

  // 연결하기 문제별 현재 선택 중인 왼쪽 인덱스
  const [matchingSelected, setMatchingSelected] = useState<Record<number, number | null>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submissionId] = useState(
    () => 'SUB_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11)
  );

  useEffect(() => {
    fetch(`/api/public/tests/${teacherId}/${testId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setTest(data.testData);
        else setLoadError(data.error || 'load_failed');
      })
      .catch((e) => setLoadError(String(e)));
  }, [teacherId, testId]);

  // ───────── 답안 조작 헬퍼 ─────────

  function setAnswer(qi: number, value: unknown) {
    setAnswers((prev) => ({ ...prev, [qi]: value }));
  }

  function toggleMultiple(qi: number, optIdx: number, isMulti: boolean) {
    setAnswers((prev) => {
      const current = (prev[qi] as number[] | undefined) || [];
      if (isMulti) {
        return {
          ...prev,
          [qi]: current.includes(optIdx)
            ? current.filter((i) => i !== optIdx)
            : [...current, optIdx].sort((a, b) => a - b),
        };
      }
      return { ...prev, [qi]: current.includes(optIdx) ? [] : [optIdx] };
    });
  }

  // 연결하기: 왼쪽 클릭
  function clickLeft(qi: number, li: number) {
    const conn = (answers[qi] as Record<number, number> | undefined) || {};
    // 이미 연결된 왼쪽을 다시 클릭하면 해제
    if (li in conn) {
      const next = { ...conn };
      delete next[li];
      setAnswer(qi, next);
      setMatchingSelected((s) => ({ ...s, [qi]: null }));
      return;
    }
    // 이미 선택 중이면 토글로 취소
    const selected = matchingSelected[qi];
    setMatchingSelected((s) => ({ ...s, [qi]: selected === li ? null : li }));
  }

  // 연결하기: 오른쪽 클릭
  function clickRight(qi: number, ri: number) {
    const conn = (answers[qi] as Record<number, number> | undefined) || {};
    // 이미 이 오른쪽에 연결된 왼쪽이 있으면 해제
    const existingLeft = Object.keys(conn).find((k) => conn[Number(k)] === ri);
    if (existingLeft !== undefined) {
      const next = { ...conn };
      delete next[Number(existingLeft)];
      setAnswer(qi, next);
      setMatchingSelected((s) => ({ ...s, [qi]: null }));
      return;
    }
    // 선택된 왼쪽이 있으면 연결 생성
    const selected = matchingSelected[qi];
    if (selected === null || selected === undefined) return; // 왼쪽을 먼저 고르라는 의미로 무시
    const next = { ...conn, [selected]: ri };
    setAnswer(qi, next);
    setMatchingSelected((s) => ({ ...s, [qi]: null }));
  }

  // ───────── 검증 ─────────

  function isAnswered(q: Question, qi: number): boolean {
    const v = answers[qi];
    if (q.type === 'multiple') return Array.isArray(v) && (v as number[]).length > 0;
    if (q.type === 'ox') return typeof v === 'number';
    if (q.type === 'short') return typeof v === 'string' && v.trim().length > 0;
    if (q.type === 'matching') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
      const totalPairs = q.pairs?.length ?? 0;
      return Object.keys(v as Record<string, number>).length >= totalPairs;
    }
    return false;
  }

  function startTest() {
    if (!grade || !classNum.trim() || !name.trim()) {
      alert('모든 정보를 입력해주세요.');
      return;
    }
    setPage('test');
  }

  async function handleSubmit() {
    if (!test) return;
    const unanswered: number[] = [];
    test.questions.forEach((q, i) => {
      if (!isAnswered(q, i)) unanswered.push(i + 1);
    });
    if (unanswered.length > 0) {
      alert(`아직 풀지 않은 문제: ${unanswered.join(', ')}번`);
      return;
    }
    if (!confirm('답안을 제출하시겠습니까? 제출 후에는 수정할 수 없습니다.')) return;

    setSubmitting(true);
    try {
      const studentAnswers: StudentAnswer[] = test.questions.map((q, i) => {
        const v = answers[i];
        if (q.type === 'multiple') {
          return { type: 'multiple', answer: Array.isArray(v) ? (v as number[]) : [] };
        }
        if (q.type === 'ox') {
          return { type: 'ox', answer: typeof v === 'number' ? v : null };
        }
        if (q.type === 'short') {
          return { type: 'short', answer: typeof v === 'string' ? v.trim() : '' };
        }
        if (q.type === 'matching') {
          const map =
            v && typeof v === 'object' && !Array.isArray(v)
              ? (v as Record<string, number>)
              : {};
          return { type: 'matching', answer: map };
        }
        return { type: q.type, answer: null };
      });

      const res = await fetch(`/api/public/tests/${teacherId}/${testId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testId,
          grade,
          classNum: classNum.replace(/[^0-9]/g, ''),
          name: name.trim(),
          answers: studentAnswers,
          submissionId,
          submittedAt: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPage('done');
      } else {
        alert('제출 실패: ' + data.error);
      }
    } catch (e) {
      alert('네트워크 오류: ' + String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // ───────── 렌더링 ─────────

  if (loadError) {
    return (
      <main className="container" style={{ textAlign: 'center', padding: 80 }}>
        <h1 style={{ color: '#ef4444' }}>시험지를 불러올 수 없습니다</h1>
        <p style={{ color: '#6b7280', marginTop: 16 }}>링크를 다시 확인해주세요.</p>
        <p style={{ color: '#9ca3af', fontSize: '0.85em', marginTop: 8 }}>({loadError})</p>
      </main>
    );
  }

  if (!test) {
    return (
      <main className="container" style={{ textAlign: 'center', padding: 80 }}>
        <p style={{ color: '#6b7280' }}>불러오는 중...</p>
      </main>
    );
  }

  if (page === 'done') {
    return (
      <main className="container" style={{ textAlign: 'center', padding: 80 }}>
        <div style={{
          width: 120, height: 120,
          background: 'linear-gradient(135deg, #fda4af, #fb7185)',
          color: 'white', fontSize: '4em',
          borderRadius: '50%',
          margin: '0 auto 30px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✓</div>
        <h2 style={{ color: '#fda4af', fontSize: '2.2em' }}>제출이 완료되었습니다!</h2>
        <p style={{ color: '#6b7280', marginTop: 16, fontSize: '1.1em' }}>수고하셨습니다 😊</p>
      </main>
    );
  }

  if (page === 'info') {
    return (
      <main className="container" style={{ maxWidth: 500 }}>
        <header style={{ textAlign: 'center', marginBottom: 40, paddingBottom: 24, borderBottom: '1px solid #e5e7eb' }}>
          <h1 style={{ color: '#1f2937', fontSize: '2em' }}>📚 {test.testName}</h1>
          <p style={{ color: '#6b7280', marginTop: 8 }}>시험을 시작하기 전에 정보를 입력해주세요</p>
        </header>
        <Field label="학년">
          <select value={grade} onChange={(e) => setGrade(e.target.value)} style={inputStyle} disabled={!!urlGrade}>
            <option value="">선택하세요</option>
            {['1','2','3','4','5','6'].map((g) => <option key={g} value={g}>{g}학년</option>)}
          </select>
        </Field>
        <Field label="반">
          <input value={classNum} onChange={(e) => setClassNum(e.target.value)} placeholder="예: 1" style={inputStyle} />
        </Field>
        <Field label="이름">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름을 입력하세요" style={inputStyle} />
        </Field>
        <button onClick={startTest} className="btn btn-primary" style={{ width: '100%', marginTop: 20, padding: '18px 40px', fontSize: '1.15em' }}>
          시험 시작하기
        </button>
      </main>
    );
  }

  // page === 'test'
  return (
    <main className="container">
      <header style={{ textAlign: 'center', marginBottom: 30, paddingBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
        <h1 style={{ color: '#1f2937', fontSize: '1.8em' }}>{test.testName}</h1>
        <p style={{ marginTop: 10, color: '#fda4af' }}>
          {grade}학년 {classNum}반 {name}
        </p>
      </header>

      {test.questions.map((q, qi) => (
        <div key={qi} style={{
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 28,
          marginBottom: 18,
        }}>
          <span style={{ background: '#1f2937', color: 'white', padding: '6px 16px', borderRadius: 999, fontSize: '0.95em' }}>
            문제 {qi + 1}
          </span>
          <p style={{ marginTop: 16, fontSize: '1.15em', color: '#111827', whiteSpace: 'pre-wrap' }}>{q.text}</p>
          {q.images?.map((img, ii) => (
            <div key={ii} style={{ marginTop: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt="문제 이미지" style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 10 }} />
            </div>
          ))}

          {q.type === 'multiple' && (
            <MultipleView
              q={q}
              picked={(answers[qi] as number[] | undefined) || []}
              onToggle={(oi, isMulti) => toggleMultiple(qi, oi, isMulti)}
            />
          )}

          {q.type === 'ox' && (
            <OxView
              q={q}
              picked={typeof answers[qi] === 'number' ? (answers[qi] as number) : null}
              onSelect={(v) => setAnswer(qi, v)}
            />
          )}

          {q.type === 'short' && (
            <ShortView
              value={typeof answers[qi] === 'string' ? (answers[qi] as string) : ''}
              onChange={(v) => setAnswer(qi, v)}
            />
          )}

          {q.type === 'matching' && (
            <MatchingView
              q={q}
              connections={(answers[qi] as Record<number, number> | undefined) || {}}
              selectedLeft={matchingSelected[qi] ?? null}
              onClickLeft={(li) => clickLeft(qi, li)}
              onClickRight={(ri) => clickRight(qi, ri)}
            />
          )}
        </div>
      ))}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="btn btn-primary"
        style={{ width: '100%', marginTop: 20, padding: '18px 40px', fontSize: '1.15em' }}
      >
        {submitting ? '제출 중...' : '답안 제출하기'}
      </button>
    </main>
  );
}

// ──────────────── 유형별 뷰 ────────────────

function MultipleView({
  q,
  picked,
  onToggle,
}: {
  q: Question;
  picked: number[];
  onToggle: (oi: number, isMulti: boolean) => void;
}) {
  const isMulti = Array.isArray(q.correctAnswer) && q.correctAnswer.length > 1;
  return (
    <>
      {isMulti && (
        <p style={{ marginTop: 12, fontSize: '0.9em', color: '#6b7280' }}>※ 복수 선택 가능</p>
      )}
      <div style={{ marginTop: 20 }}>
        {q.options?.map((opt, oi) => {
          const checked = picked.includes(oi);
          const optImage = q.optionImages?.[oi] ?? null;
          return (
            <label key={oi} style={optionLabelStyle(checked)}>
              <input
                type={isMulti ? 'checkbox' : 'radio'}
                name={`q-${q.text}-${oi}`}
                checked={checked}
                onChange={() => onToggle(oi, isMulti)}
                style={{ marginRight: 12 }}
              />
              {optImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={optImage}
                  alt=""
                  style={{
                    maxHeight: 80,
                    maxWidth: 140,
                    borderRadius: 6,
                    marginRight: 12,
                  }}
                />
              )}
              <span>
                {oi + 1}.{opt ? ` ${opt}` : ''}
              </span>
            </label>
          );
        })}
      </div>
    </>
  );
}

function OxView({
  q,
  picked,
  onSelect,
}: {
  q: Question;
  picked: number | null;
  onSelect: (v: number) => void;
}) {
  const opts = q.options && q.options.length === 2 ? q.options : ['O', 'X'];
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
      {opts.map((opt, oi) => {
        const selected = picked === oi;
        return (
          <button
            key={oi}
            type="button"
            onClick={() => onSelect(oi)}
            style={{
              flex: 1,
              padding: '24px',
              fontSize: '2em',
              fontWeight: 700,
              background: selected ? '#fff1f2' : '#f9fafb',
              border: '2px solid ' + (selected ? '#fda4af' : '#e5e7eb'),
              color: selected ? '#e11d48' : '#6b7280',
              borderRadius: 12,
              cursor: 'pointer',
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function ShortView({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="답을 입력하세요"
      style={{ ...inputStyle, marginTop: 20 }}
    />
  );
}

function MatchingView({
  q,
  connections,
  selectedLeft,
  onClickLeft,
  onClickRight,
}: {
  q: Question;
  connections: Record<number, number>;
  selectedLeft: number | null;
  onClickLeft: (li: number) => void;
  onClickRight: (ri: number) => void;
}) {
  const pairs = q.pairs ?? [];

  // rightIdx → leftIdx (역매핑) — 오른쪽 배지에 어떤 번호를 표시할지
  const rightToLeft: Record<number, number> = {};
  for (const [lk, rv] of Object.entries(connections)) {
    rightToLeft[rv] = Number(lk);
  }

  return (
    <div style={{ marginTop: 20 }}>
      <p style={{ fontSize: '0.9em', color: '#6b7280', marginBottom: 12 }}>
        왼쪽을 선택한 뒤 짝이 되는 오른쪽을 클릭하세요. 이미 연결된 항목을 다시 클릭하면 연결이 해제됩니다.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}
      >
        {/* 왼쪽 열 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pairs.map((p, li) => {
            const connected = li in connections;
            const active = selectedLeft === li;
            return (
              <MatchingCell
                key={`L-${li}`}
                label={p.left || '(이미지)'}
                image={p.leftImage}
                active={active}
                badge={connected ? li + 1 : null}
                onClick={() => onClickLeft(li)}
              />
            );
          })}
        </div>
        {/* 오른쪽 열 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pairs.map((p, ri) => {
            const fromLeft = rightToLeft[ri];
            const connected = fromLeft !== undefined;
            return (
              <MatchingCell
                key={`R-${ri}`}
                label={p.right || '(이미지)'}
                image={p.rightImage}
                active={false}
                badge={connected ? fromLeft + 1 : null}
                onClick={() => onClickRight(ri)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MatchingCell({
  label,
  image,
  active,
  badge,
  onClick,
}: {
  label: string;
  image?: string | null;
  active: boolean;
  badge: number | null;
  onClick: () => void;
}) {
  const border = active ? '#fb7185' : badge !== null ? '#fda4af' : '#e5e7eb';
  const bg = active ? '#ffe4e6' : badge !== null ? '#fff1f2' : '#f9fafb';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'relative',
        padding: '14px 18px',
        paddingRight: 44,
        background: bg,
        border: '2px solid ' + border,
        borderRadius: 10,
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: '1em',
        color: '#111827',
        minHeight: 52,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          style={{ maxHeight: 60, maxWidth: 80, borderRadius: 6 }}
        />
      )}
      <span style={{ whiteSpace: 'pre-wrap' }}>{label}</span>
      {badge !== null && (
        <span
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            background: '#fb7185',
            color: 'white',
            borderRadius: '50%',
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.85em',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#374151' }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 15px',
  border: '2px solid #e5e7eb',
  borderRadius: 10,
  fontSize: '1em',
};

function optionLabelStyle(checked: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 18px',
    marginBottom: 10,
    background: checked ? '#fff1f2' : '#f9fafb',
    border: '2px solid ' + (checked ? '#fda4af' : '#e5e7eb'),
    borderRadius: 10,
    cursor: 'pointer',
  };
}
