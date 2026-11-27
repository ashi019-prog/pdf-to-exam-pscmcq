import { OptionKey, QuestionTableData } from './exam';

export type { OptionKey };

export interface QuestionAttemptStats {
  timesAttempted: number;
  timesCorrect: number;
  lastResult?: 'correct' | 'wrong' | 'skipped';
  lastAttemptedAt?: string;
}

export interface PooledQuestion {
  id: string;
  poolNumber: number; // Sequential 1..N across the entire Exam Head
  paperId: string;
  paperLabel: string;
  text: string;
  normalizedText: string;
  options: Record<OptionKey, string>;
  correctOption: OptionKey;
  explanation?: string;
  imageDataUrl?: string;
  table?: QuestionTableData;
  addedAt: string;
  stats: QuestionAttemptStats;
}

export interface ImportedPaperMeta {
  paperId: string;
  paperLabel: string;
  examYear?: string;
  importedAt: string;
  parsedCount: number;
  duplicatesRemoved: number;
  addedCount: number;
}

export interface ExamHead {
  id: string; // Slugified unique ID, e.g., "village-assistant"
  name: string; // Display Exam Name, e.g., "Village Assistant"
  createdAt: string;
  updatedAt: string;
  importedPapers: ImportedPaperMeta[];
  questions: PooledQuestion[];
}

export interface DuplicateMatch {
  incomingTempId: string;
  matchType: 'exact' | 'near-duplicate' | 'intra-batch';
  similarityScore: number; // 0.0 to 1.0
  matchedExistingQuestion: {
    id: string;
    poolNumber: number;
    paperLabel: string;
    text: string;
    correctOption: OptionKey;
  };
}

export interface IncomingVerifiedQuestion {
  tempId: string;
  text: string;
  options: Record<OptionKey, string>;
  correctOption: OptionKey | null;
  explanation?: string;
  imageDataUrl?: string;
  table?: QuestionTableData;
}

export type PoolFilterMode = 'all' | 'unattempted' | 'previously-wrong' | 'by-paper';

export interface MockLaunchConfig {
  questionCount: number;
  filterMode: PoolFilterMode;
  selectedPaperId?: string;
  randomizeOrder?: boolean;
  shuffleOptions: boolean;
  examDurationMinutes: number;
  perQuestionSeconds: number;
}

export interface SessionQuestion {
  id: string;
  sourcePoolNumber: number;
  number: number; // Sequential 1..K within the active exam session
  paperId: string;
  paperLabel: string;
  text: string;
  options: Record<OptionKey, string>;
  correctOption: OptionKey;
  explanation?: string;
  imageDataUrl?: string;
  table?: QuestionTableData;
}

export interface ActiveExamSession {
  sessionId: string;
  examHeadId: string;
  examName: string;
  createdAt: string;
  durationMinutes: number;
  perQuestionSeconds: number;
  questions: SessionQuestion[];
}
