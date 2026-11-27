import { OptionKey, QuestionTableData } from './exam';
import { DuplicateMatch, ExamHead, ImportedPaperMeta } from './examHead';

export interface ShareableQuestion {
  id: string;
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
}

export interface ExamSharePackage {
  schema: 'mcq-exam-bank-v1';
  exportType: 'full' | 'update';
  exportedAt: string;
  examHeadId: string;
  examHeadName: string;
  includedPapers: ImportedPaperMeta[];
  questionCount: number;
  questions: ShareableQuestion[];
}

export interface FullBackupPackage {
  schema: 'mcq-full-backup-v1';
  exportedAt: string;
  examHeadCount: number;
  totalQuestions: number;
  examHeads: ExamSharePackage[];
}

export type ParsedImportFile =
  | { kind: 'single'; packageData: ExamSharePackage }
  | { kind: 'full-backup'; backupData: FullBackupPackage };

export interface ImportAnalysisPreview {
  packageData: ExamSharePackage;
  existingExamHead: ExamHead | null;
  totalIncoming: number;
  exactDuplicateCount: number;
  nearDuplicateMatches: Record<string, DuplicateMatch>;
  netNewQuestions: ShareableQuestion[];
}
