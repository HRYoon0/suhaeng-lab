/**
 * 앱 전체에서 공유하는 타입 정의.
 */

export type QuestionType = 'multiple' | 'ox' | 'short' | 'matching';

export interface Pair {
  left: string;
  right: string;
  leftImage?: string | null;
  rightImage?: string | null;
}

export interface Question {
  type: QuestionType;
  text: string;
  images?: string[];         // 문제 본문 이미지 (URL 배열)
  options?: string[];         // multiple / ox
  optionImages?: (string | null)[];
  correctAnswer?: number | number[] | string; // multiple(배열), ox/short, string
  pairs?: Pair[];             // matching 전용
}

export interface TestData {
  testId: string;
  testName: string;
  grade?: string;
  questions: Question[];
  createdAt: string;
  updatedAt?: string;
  folderId?: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  previewDocId?: string;
  previewDocUrl?: string;
}

export interface TestListItem {
  testId: string;
  testName: string;
  grade?: string;
  createdAt: string;
  updatedAt?: string;
  folderId: string;
  spreadsheetUrl?: string;
  previewDocUrl?: string;
  studentUrl: string;
}

/** 학생 답안 제출 형식 */
export interface StudentAnswer {
  type: QuestionType;
  /** multiple: number[], ox: number, short: string, matching: {[leftIdx]: rightIdx} */
  answer: number | number[] | string | Record<string, number> | null;
}

export interface SubmitPayload {
  testId: string;
  grade: string;
  classNum: string;
  name: string;
  answers: StudentAnswer[];
  submissionId: string;
  submittedAt: string;
}
