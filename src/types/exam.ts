export type OptionKey = 'A' | 'B' | 'C' | 'D';

export const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];

export type QuestionStatus =
  | 'not_visited'
  | 'visited'
  | 'confirmed'
  | 'marked_for_review'
  | 'skipped';

export type ParseWarningType =
  | 'missing_option'
  | 'unmatched_answer_key'
  | 'low_ocr_confidence'
  | 'empty_question_text';

export interface ParseWarning {
  type: ParseWarningType;
  message: string;
}

export interface ExamQuestion {
  number: number;
  text: string;
  options: Record<OptionKey, string>;
  correctOption: OptionKey | null;
  explanation?: string;
  imageDataUrl?: string;
  warnings: ParseWarning[];
  ocrConfidence?: number;
}

export interface SavedExamPackage {
  version: 1;
  savedAt: string;
  settings: ExamSettings;
  questions: ExamQuestion[];
}

export interface QuestionResponse {
  questionNumber: number;
  selectedOption: OptionKey | null;
  status: QuestionStatus;
  timeSpentSeconds: number;
}

export type AppPhase = 'upload' | 'verify' | 'exam' | 'results';

export interface ExamSettings {
  title: string;
  globalDurationMinutes: number;
  perQuestionDurationSeconds: number;
}

export type SlateMode = 'per_question' | 'shared';

export type SlateTool = 'pen' | 'eraser';

export type PenColor = '#111827' | '#2563eb' | '#dc2626';

export type StrokeWidth = 2 | 4 | 8;

export interface StrokePoint {
  x: number;
  y: number;
}

export interface SlateStroke {
  tool: SlateTool;
  color: PenColor;
  width: StrokeWidth;
  points: StrokePoint[];
}

export type ReviewOutcome = 'correct' | 'wrong' | 'skipped';

export type TimerTone = 'green' | 'amber' | 'red';

export interface QuestionTimerState {
  remainingSeconds: number;
  overtimeSeconds: number;
  isOvertime: boolean;
  tone: TimerTone;
}

export interface QuestionReviewItem {
  questionNumber: number;
  questionText: string;
  options: Record<OptionKey, string>;
  selectedOption: OptionKey | null;
  confirmedOption: OptionKey | null;
  correctOption: OptionKey | null;
  explanation?: string;
  imageDataUrl?: string;
  outcome: ReviewOutcome;
  marksAwarded: number;
  timeSpentSeconds: number;
  overtimeSeconds: number;
  isOvertime: boolean;
  status: QuestionStatus;
}

export interface ExamScorecard {
  finalScore: number;
  totalMarks: number;
  percentage: number;
  accuracy: number;
  totalQuestions: number;
  attemptedCount: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  negativeMarksDeducted: number;
  overtimeCount: number;
  totalTimeUsedSeconds: number;
  averageTimePerQuestionSeconds: number;
  items: QuestionReviewItem[];
}

export interface PracticeAttemptRecord {
  id: string;
  completedAt: string;
  examTitle: string;
  finalScore: number;
  totalMarks: number;
  percentage: number;
  accuracy: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  overtimeCount: number;
  totalTimeUsedSeconds: number;
}
