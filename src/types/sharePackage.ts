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

export interface ImportAnalysisPreview {
  packageData: ExamSharePackage;
  existingExamHead: ExamHead | null;
  totalIncoming: number;
  exactDuplicateCount: number;
  nearDuplicateMatches: Record<string, DuplicateMatch>;
  netNewQuestions: ShareableQuestion[];
}
