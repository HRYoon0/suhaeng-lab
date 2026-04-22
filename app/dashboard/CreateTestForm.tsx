'use client';

/**
 * 시험지 생성 폼 — 4가지 문제 유형 + 이미지 업로드.
 *  - 본문 이미지      : 문제당 여러 장 (세로로 쌓임)
 *  - 객관식 선택지     : 옵션당 1장
 *  - 연결하기 left/right : 쌍당 각 1장 (텍스트 또는 이미지만 있어도 OK)
 *
 * 이미지는 FileReader로 data URL 변환해 state에 보관 → 저장 시 서버가
 * migrateImages 단계에서 Drive 이미지 서브폴더로 업로드하고 URL로 치환한다.
 */

import { useRef, useState } from 'react';
import type { Question, QuestionType, TestData } from '@/lib/types';

interface PairDraft {
  left: string;
  right: string;
  leftImage: string | null;
  rightImage: string | null;
}

interface QuestionDraft {
  type: QuestionType;
  text: string;
  images: string[]; // 본문 이미지 (복수)
  // 객관식
  options: string[];
  optionImages: (string | null)[]; // options와 동일 길이
  correctAnswers: number[];
  // OX (0 = O, 1 = X)
  oxAnswer: number | null;
  // 단답형
  shortAnswer: string;
  // 연결하기
  pairs: PairDraft[];
}

function newDraft(type: QuestionType): QuestionDraft {
  const base: QuestionDraft = {
    type,
    text: '',
    images: [],
    options: type === 'multiple' ? ['', ''] : [],
    optionImages: type === 'multiple' ? [null, null] : [],
    correctAnswers: [],
    oxAnswer: null,
    shortAnswer: '',
    pairs:
      type === 'matching'
        ? [
            { left: '', right: '', leftImage: null, rightImage: null },
            { left: '', right: '', leftImage: null, rightImage: null },
          ]
        : [],
  };
  return base;
}

const TYPE_LABEL: Record<QuestionType, string> = {
  multiple: '객관식',
  ox: 'OX',
  short: '단답형',
  matching: '연결하기',
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error || new Error('read_failed'));
    r.readAsDataURL(file);
  });
}

/** 서버 Question → 폼 내부 Draft 역변환 (편집용 초기값 구성) */
function questionToDraft(q: Question): QuestionDraft {
  const d = newDraft(q.type);
  d.text = q.text ?? '';
  d.images = Array.isArray(q.images) ? q.images.slice() : [];
  if (q.type === 'multiple') {
    d.options = Array.isArray(q.options) ? q.options.slice() : [];
    d.optionImages = Array.isArray(q.optionImages)
      ? q.optionImages.slice()
      : d.options.map(() => null);
    while (d.optionImages.length < d.options.length) d.optionImages.push(null);
    d.correctAnswers = Array.isArray(q.correctAnswer)
      ? q.correctAnswer.slice()
      : typeof q.correctAnswer === 'number'
        ? [q.correctAnswer]
        : [];
  } else if (q.type === 'ox') {
    d.oxAnswer = typeof q.correctAnswer === 'number' ? q.correctAnswer : null;
  } else if (q.type === 'short') {
    d.shortAnswer = typeof q.correctAnswer === 'string' ? q.correctAnswer : '';
  } else if (q.type === 'matching') {
    d.pairs = Array.isArray(q.pairs)
      ? q.pairs.map((p) => ({
          left: p.left ?? '',
          right: p.right ?? '',
          leftImage: p.leftImage ?? null,
          rightImage: p.rightImage ?? null,
        }))
      : [];
    if (d.pairs.length < 2) {
      while (d.pairs.length < 2) {
        d.pairs.push({ left: '', right: '', leftImage: null, rightImage: null });
      }
    }
  }
  return d;
}

export default function CreateTestForm({
  onCreated,
  onCancel,
  initialTest,
}: {
  onCreated: () => void;
  onCancel?: () => void;
  initialTest?: TestData;
}) {
  const isEdit = !!initialTest;
  const [testName, setTestName] = useState(initialTest?.testName ?? '');
  const [grade, setGrade] = useState(initialTest?.grade ?? '3');
  const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
    initialTest && initialTest.questions.length > 0
      ? initialTest.questions.map(questionToDraft)
      : [newDraft('multiple')]
  );
  const [submitting, setSubmitting] = useState(false);

  function addQuestion(type: QuestionType) {
    setQuestions((q) => [...q, newDraft(type)]);
  }
  function removeQuestion(i: number) {
    setQuestions((q) => q.filter((_, idx) => idx !== i));
  }
  function updateQ(i: number, mut: (d: QuestionDraft) => QuestionDraft) {
    setQuestions((q) => q.map((d, idx) => (idx === i ? mut(d) : d)));
  }

  // 본문 이미지
  function addBodyImage(i: number, dataUrl: string) {
    updateQ(i, (d) => ({ ...d, images: [...d.images, dataUrl] }));
  }
  function removeBodyImage(i: number, ii: number) {
    updateQ(i, (d) => ({ ...d, images: d.images.filter((_, idx) => idx !== ii) }));
  }

  // 객관식
  function addOption(i: number) {
    updateQ(i, (d) => ({
      ...d,
      options: [...d.options, ''],
      optionImages: [...d.optionImages, null],
    }));
  }
  function removeOption(i: number, optIdx: number) {
    updateQ(i, (d) => ({
      ...d,
      options: d.options.filter((_, idx) => idx !== optIdx),
      optionImages: d.optionImages.filter((_, idx) => idx !== optIdx),
      correctAnswers: d.correctAnswers
        .filter((c) => c !== optIdx)
        .map((c) => (c > optIdx ? c - 1 : c)),
    }));
  }
  function toggleCorrect(i: number, optIdx: number) {
    updateQ(i, (d) => {
      const has = d.correctAnswers.includes(optIdx);
      return {
        ...d,
        correctAnswers: has
          ? d.correctAnswers.filter((c) => c !== optIdx)
          : [...d.correctAnswers, optIdx].sort((a, b) => a - b),
      };
    });
  }
  function setOptionImage(i: number, oi: number, src: string | null) {
    updateQ(i, (d) => ({
      ...d,
      optionImages: d.optionImages.map((v, idx) => (idx === oi ? src : v)),
    }));
  }

  // 연결하기
  function addPair(i: number) {
    updateQ(i, (d) => ({
      ...d,
      pairs: [...d.pairs, { left: '', right: '', leftImage: null, rightImage: null }],
    }));
  }
  function removePair(i: number, pi: number) {
    updateQ(i, (d) => ({ ...d, pairs: d.pairs.filter((_, idx) => idx !== pi) }));
  }
  function updatePair(
    i: number,
    pi: number,
    patch: Partial<PairDraft>
  ) {
    updateQ(i, (d) => ({
      ...d,
      pairs: d.pairs.map((p, idx) => (idx === pi ? { ...p, ...patch } : p)),
    }));
  }

  function buildQuestion(d: QuestionDraft): Question {
    const text = d.text.trim();
    const images = d.images.slice();
    if (d.type === 'multiple') {
      // 옵션 중 텍스트/이미지 모두 비어있는 것은 제외, 대응하는 optionImages도 같이 정리
      const kept: { text: string; image: string | null; originalIdx: number }[] = [];
      d.options.forEach((opt, idx) => {
        const t = opt.trim();
        const img = d.optionImages[idx] ?? null;
        if (t || img) kept.push({ text: t, image: img, originalIdx: idx });
      });
      const idxMap = new Map<number, number>();
      kept.forEach((k, newIdx) => idxMap.set(k.originalIdx, newIdx));
      const correctAnswer = d.correctAnswers
        .map((c) => idxMap.get(c))
        .filter((v): v is number => v !== undefined);
      return {
        type: 'multiple',
        text,
        images,
        options: kept.map((k) => k.text),
        optionImages: kept.map((k) => k.image),
        correctAnswer,
      };
    }
    if (d.type === 'ox') {
      return {
        type: 'ox',
        text,
        images,
        options: ['O', 'X'],
        correctAnswer: d.oxAnswer ?? 0,
      };
    }
    if (d.type === 'short') {
      return { type: 'short', text, images, correctAnswer: d.shortAnswer.trim() };
    }
    return {
      type: 'matching',
      text,
      images,
      pairs: d.pairs.map((p) => ({
        left: p.left.trim(),
        right: p.right.trim(),
        leftImage: p.leftImage,
        rightImage: p.rightImage,
      })),
    };
  }

  function validate(): string | null {
    if (!testName.trim()) return '시험지 제목을 입력하세요.';
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const label = `문제 ${i + 1}`;
      if (!q.text.trim()) return `${label}의 내용을 입력하세요.`;
      if (q.type === 'multiple') {
        const kept = q.options.filter((o, idx) => o.trim() || q.optionImages[idx]);
        if (kept.length < 2) return `${label}의 선택지를 2개 이상 입력하세요.`;
        if (q.correctAnswers.length === 0) return `${label}의 정답을 1개 이상 선택하세요.`;
      } else if (q.type === 'ox') {
        if (q.oxAnswer === null) return `${label}의 정답(O/X)을 선택하세요.`;
      } else if (q.type === 'short') {
        if (!q.shortAnswer.trim()) return `${label}의 모범답안을 입력하세요.`;
      } else if (q.type === 'matching') {
        const nonEmpty = q.pairs.filter(
          (p) => p.left.trim() || p.right.trim() || p.leftImage || p.rightImage
        );
        if (nonEmpty.length < 2) return `${label}의 연결쌍을 2개 이상 입력하세요.`;
        for (let pi = 0; pi < nonEmpty.length; pi++) {
          const p = nonEmpty[pi];
          if (!p.left.trim() && !p.leftImage)
            return `${label} 연결쌍 ${pi + 1}의 왼쪽(텍스트 또는 이미지)이 비어있습니다.`;
          if (!p.right.trim() && !p.rightImage)
            return `${label} 연결쌍 ${pi + 1}의 오른쪽(텍스트 또는 이미지)이 비어있습니다.`;
        }
      }
    }
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) {
      alert(err);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        testName: testName.trim(),
        grade,
        questions: questions.map(buildQuestion),
      };
      const endpoint = isEdit ? `/api/tests/${initialTest!.testId}` : '/api/tests';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      if (isEdit) {
        alert('시험지가 수정되었습니다.');
      } else {
        alert('시험지가 생성되었습니다!\n학생 링크:\n' + data.studentUrl);
        setTestName('');
        setQuestions([newDraft('multiple')]);
      }
      onCreated();
    } catch (e) {
      alert((isEdit ? '수정' : '생성') + ' 실패: ' + (e instanceof Error ? e.message : 'unknown'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>시험지 제목</label>
        <input
          value={testName}
          onChange={(e) => setTestName(e.target.value)}
          placeholder="예: 3학년 1학기 수학 평가"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>학년</label>
        <select value={grade} onChange={(e) => setGrade(e.target.value)} style={inputStyle}>
          {['1', '2', '3', '4', '5', '6'].map((g) => (
            <option key={g} value={g}>{g}학년</option>
          ))}
        </select>
      </div>

      <h3 style={{ color: '#1f2937', margin: '30px 0 15px' }}>문제 목록</h3>

      {questions.map((q, i) => (
        <div key={i} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <strong style={{ background: '#1f2937', color: 'white', padding: '6px 16px', borderRadius: 999 }}>
              문제 {i + 1} · {TYPE_LABEL[q.type]}
            </strong>
            {questions.length > 1 && (
              <button onClick={() => removeQuestion(i)} style={ghostRemoveStyle}>✕ 삭제</button>
            )}
          </div>

          <textarea
            value={q.text}
            onChange={(e) => updateQ(i, (d) => ({ ...d, text: e.target.value }))}
            placeholder="문제 내용을 입력하세요"
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />

          <BodyImagesEditor
            images={q.images}
            onAdd={(url) => addBodyImage(i, url)}
            onRemove={(ii) => removeBodyImage(i, ii)}
          />

          {q.type === 'multiple' && (
            <MultipleEditor
              draft={q}
              onToggleCorrect={(oi) => toggleCorrect(i, oi)}
              onUpdateOption={(oi, v) =>
                updateQ(i, (d) => ({
                  ...d,
                  options: d.options.map((o, idx) => (idx === oi ? v : o)),
                }))
              }
              onAddOption={() => addOption(i)}
              onRemoveOption={(oi) => removeOption(i, oi)}
              onSetOptionImage={(oi, src) => setOptionImage(i, oi, src)}
            />
          )}

          {q.type === 'ox' && (
            <OxEditor draft={q} onSelect={(v) => updateQ(i, (d) => ({ ...d, oxAnswer: v }))} />
          )}

          {q.type === 'short' && (
            <ShortEditor
              draft={q}
              onChange={(v) => updateQ(i, (d) => ({ ...d, shortAnswer: v }))}
            />
          )}

          {q.type === 'matching' && (
            <MatchingEditor
              draft={q}
              onUpdatePair={(pi, patch) => updatePair(i, pi, patch)}
              onAddPair={() => addPair(i)}
              onRemovePair={(pi) => removePair(i, pi)}
            />
          )}
        </div>
      ))}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
        {(['multiple', 'ox', 'short', 'matching'] as QuestionType[]).map((t) => (
          <button
            key={t}
            onClick={() => addQuestion(t)}
            className="btn"
            style={{
              background: 'white',
              color: '#fda4af',
              border: '2px solid #fda4af',
              padding: '10px 18px',
            }}
          >
            + {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 30 }}>
        {isEdit && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn"
            style={{
              flex: '0 0 auto',
              padding: '18px 28px',
              fontSize: '1.05em',
              background: '#f3f4f6',
              color: '#374151',
            }}
          >
            취소
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="btn btn-primary"
          style={{ flex: 1, padding: '18px 40px', fontSize: '1.15em' }}
        >
          {submitting
            ? '저장 중...'
            : isEdit
              ? '수정 저장하기'
              : '시험지 저장 및 배포 링크 생성'}
        </button>
      </div>
    </section>
  );
}

// ──────────────── 공용 이미지 슬롯 ────────────────

/** 단일 이미지 슬롯 (없을 때: 업로드 박스 / 있을 때: 썸네일 + 제거) */
function ImageSlot({
  value,
  onChange,
  width = 120,
  height = 80,
  label = '이미지',
}: {
  value: string | null;
  onChange: (src: string | null) => void;
  width?: number;
  height?: number;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File | undefined) {
    if (!f) return;
    try {
      const url = await fileToDataUrl(f);
      onChange(url);
    } catch {
      alert('이미지 로드 실패');
    }
  }

  if (value) {
    return (
      <div style={{ position: 'relative', width, height, flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
          }}
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            background: 'rgba(31,41,55,0.85)',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: 22,
            height: 22,
            cursor: 'pointer',
            fontSize: '0.75em',
          }}
          title="이미지 제거"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        style={{
          width,
          height,
          flexShrink: 0,
          background: 'white',
          border: '2px dashed #fda4af',
          borderRadius: 8,
          color: '#fda4af',
          fontSize: '0.85em',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        + {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </>
  );
}

/** 문제 본문용 — 여러 장을 세로로 쌓기 + "+ 이미지 추가" 버튼 */
function BodyImagesEditor({
  images,
  onAdd,
  onRemove,
}: {
  images: string[];
  onAdd: (url: string) => void;
  onRemove: (idx: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File | undefined) {
    if (!f) return;
    try {
      const url = await fileToDataUrl(f);
      onAdd(url);
    } catch {
      alert('이미지 로드 실패');
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      {images.map((src, ii) => (
        <div
          key={ii}
          style={{
            position: 'relative',
            marginBottom: 8,
            display: 'inline-block',
            maxWidth: '100%',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            style={{
              maxWidth: '100%',
              maxHeight: 240,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              display: 'block',
            }}
          />
          <button
            type="button"
            onClick={() => onRemove(ii)}
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              background: 'rgba(31,41,55,0.85)',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: 26,
              height: 26,
              cursor: 'pointer',
            }}
            title="이미지 제거"
          >
            ✕
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn"
          style={{
            background: 'white',
            color: '#fda4af',
            border: '2px solid #fda4af',
            padding: '8px 14px',
            fontSize: '0.9em',
          }}
        >
          + 본문 이미지 추가
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

// ──────────────── 유형별 에디터 ────────────────

function MultipleEditor({
  draft,
  onToggleCorrect,
  onUpdateOption,
  onAddOption,
  onRemoveOption,
  onSetOptionImage,
}: {
  draft: QuestionDraft;
  onToggleCorrect: (oi: number) => void;
  onUpdateOption: (oi: number, v: string) => void;
  onAddOption: () => void;
  onRemoveOption: (oi: number) => void;
  onSetOptionImage: (oi: number, src: string | null) => void;
}) {
  return (
    <>
      <p style={hintStyle}>선택지 (정답 체크 · 복수 허용 · 텍스트 또는 이미지만 있어도 OK)</p>
      {draft.options.map((opt, oi) => (
        <div
          key={oi}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <input
            type="checkbox"
            checked={draft.correctAnswers.includes(oi)}
            onChange={() => onToggleCorrect(oi)}
            title="정답"
          />
          <input
            value={opt}
            onChange={(e) => onUpdateOption(oi, e.target.value)}
            placeholder={`${oi + 1}번 선택지`}
            style={{ ...inputStyle, flex: 1 }}
          />
          <ImageSlot
            value={draft.optionImages[oi] ?? null}
            onChange={(src) => onSetOptionImage(oi, src)}
            width={70}
            height={50}
            label="사진"
          />
          {draft.options.length > 2 && (
            <button onClick={() => onRemoveOption(oi)} style={ghostRemoveStyle}>
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        onClick={onAddOption}
        className="btn"
        style={{
          background: 'white',
          color: '#fda4af',
          border: '2px solid #fda4af',
          padding: '8px 15px',
        }}
      >
        + 선택지 추가
      </button>
    </>
  );
}

function OxEditor({
  draft,
  onSelect,
}: {
  draft: QuestionDraft;
  onSelect: (v: number) => void;
}) {
  return (
    <>
      <p style={hintStyle}>정답을 선택하세요</p>
      <div style={{ display: 'flex', gap: 12 }}>
        {[
          { value: 0, label: 'O' },
          { value: 1, label: 'X' },
        ].map((opt) => {
          const selected = draft.oxAnswer === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              style={{
                flex: 1,
                padding: '18px',
                fontSize: '1.6em',
                fontWeight: 700,
                background: selected ? '#fff1f2' : '#f9fafb',
                border: '2px solid ' + (selected ? '#fda4af' : '#e5e7eb'),
                color: selected ? '#e11d48' : '#6b7280',
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

function ShortEditor({
  draft,
  onChange,
}: {
  draft: QuestionDraft;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <p style={hintStyle}>모범답안 (채점 참고용, 학생에게 보이지 않음)</p>
      <input
        value={draft.shortAnswer}
        onChange={(e) => onChange(e.target.value)}
        placeholder="예: 42"
        style={inputStyle}
      />
    </>
  );
}

function MatchingEditor({
  draft,
  onUpdatePair,
  onAddPair,
  onRemovePair,
}: {
  draft: QuestionDraft;
  onUpdatePair: (pi: number, patch: Partial<PairDraft>) => void;
  onAddPair: () => void;
  onRemovePair: (pi: number) => void;
}) {
  return (
    <>
      <p style={hintStyle}>
        연결 쌍 — 같은 행의 왼쪽·오른쪽이 정답 짝입니다 (텍스트 또는 이미지만 있어도 OK)
      </p>
      {draft.pairs.map((p, pi) => (
        <div
          key={pi}
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto auto 1fr auto auto',
            gap: 6,
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <ImageSlot
            value={p.leftImage}
            onChange={(src) => onUpdatePair(pi, { leftImage: src })}
            width={60}
            height={44}
            label="사진"
          />
          <input
            value={p.left}
            onChange={(e) => onUpdatePair(pi, { left: e.target.value })}
            placeholder={`왼쪽 ${pi + 1}`}
            style={inputStyle}
          />
          <span style={{ color: '#fda4af', fontWeight: 700, padding: '0 4px' }}>↔</span>
          <ImageSlot
            value={p.rightImage}
            onChange={(src) => onUpdatePair(pi, { rightImage: src })}
            width={60}
            height={44}
            label="사진"
          />
          <input
            value={p.right}
            onChange={(e) => onUpdatePair(pi, { right: e.target.value })}
            placeholder={`오른쪽 ${pi + 1}`}
            style={inputStyle}
          />
          <span />
          {draft.pairs.length > 2 ? (
            <button onClick={() => onRemovePair(pi)} style={ghostRemoveStyle}>
              ✕
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
      <button
        onClick={onAddPair}
        className="btn"
        style={{
          background: 'white',
          color: '#fda4af',
          border: '2px solid #fda4af',
          padding: '8px 15px',
        }}
      >
        + 연결쌍 추가
      </button>
    </>
  );
}

// ──────────────── styles ────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 15px',
  border: '2px solid #e5e7eb',
  borderRadius: 10,
  fontSize: '1em',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontWeight: 600,
  color: '#374151',
};

const hintStyle: React.CSSProperties = {
  fontSize: '0.9em',
  color: '#6b7280',
  margin: '12px 0 8px',
};

const cardStyle: React.CSSProperties = {
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 20,
  marginBottom: 15,
};

const ghostRemoveStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#e11d48',
  border: '1.5px solid #fda4af',
  padding: '6px 14px',
  borderRadius: 8,
  fontSize: '0.9em',
  cursor: 'pointer',
};
