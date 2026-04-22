/**
 * 학생 답안을 사람이 읽을 수 있는 문자열로 변환 (스프레드시트 저장용).
 * Apps Script 버전의 renderAnswerText 로직을 TypeScript로 이식.
 */

import type { Question, StudentAnswer } from './types';

export function renderAnswerText(answer: StudentAnswer, question: Question): string {
  try {
    if (answer.type === 'multiple') {
      const arr = answer.answer;
      if (!Array.isArray(arr) || arr.length === 0) return '미응답';
      if (!question.options) return '미응답';
      const selected = arr
        .filter((idx) => idx >= 0 && idx < question.options!.length)
        .map((idx) => `${idx + 1}. ${question.options![idx]}`);
      return selected.length > 0 ? selected.join(', ') : '미응답';
    }

    if (answer.type === 'ox') {
      const v = answer.answer;
      if (v === null || v === undefined) return '미응답';
      if (typeof v !== 'number') return '미응답';
      if (!question.options || v < 0 || v >= question.options.length) return '미응답';
      return `${v + 1}. ${question.options[v]}`;
    }

    if (answer.type === 'short') {
      const v = answer.answer;
      if (typeof v !== 'string' || v.trim() === '') return '미응답';
      return v.trim();
    }

    if (answer.type === 'matching') {
      const map = answer.answer;
      if (!map || typeof map !== 'object' || Array.isArray(map)) return '미응답';
      if (!question.pairs) return '미응답';

      const pairCount = question.pairs.length;
      const parts = Object.keys(map)
        .map((leftKey) => {
          const leftIdx = parseInt(leftKey, 10);
          const rightIdx = (map as Record<string, number>)[leftKey];
          if (isNaN(leftIdx) || leftIdx < 0 || leftIdx >= pairCount) return null;
          if (typeof rightIdx !== 'number' || rightIdx < 0 || rightIdx >= pairCount) return null;
          return { leftIdx, rightIdx };
        })
        .filter((p): p is { leftIdx: number; rightIdx: number } => p !== null)
        .sort((a, b) => a.leftIdx - b.leftIdx)
        .map((p) => {
          const l = question.pairs![p.leftIdx].left || '(이미지)';
          const r = question.pairs![p.rightIdx].right || '(이미지)';
          return `${l} - ${r}`;
        });

      return parts.length > 0 ? parts.join(', ') : '미응답';
    }

    return '미응답';
  } catch (e) {
    console.error('답변 렌더링 오류:', e);
    return '미응답';
  }
}
