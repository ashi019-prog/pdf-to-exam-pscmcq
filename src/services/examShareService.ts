import { ExamHead } from '../types/examHead';
import {
  ExamSharePackage,
  FullBackupPackage,
  ShareableQuestion,
} from '../types/sharePackage';

export type ShareChannel = 'whatsapp' | 'telegram' | 'email';

export interface BuildSharePackageOptions {
  mode: 'full' | 'update';
  selectedPaperIds?: string[];
}

/**
 * Builds a clean, self-contained shareable ExamSharePackage with personal practice stats stripped.
 */
export function buildSharePackage(
  examHead: ExamHead,
  options: BuildSharePackageOptions
): ExamSharePackage {
  const isUpdate = options.mode === 'update';
  const paperIdSet =
    isUpdate && options.selectedPaperIds && options.selectedPaperIds.length > 0
      ? new Set(options.selectedPaperIds)
      : null;

  const filteredQuestions = paperIdSet
    ? examHead.questions.filter((q) => paperIdSet.has(q.paperId))
    : examHead.questions;

  if (filteredQuestions.length === 0) {
    throw new Error('No questions match the selected export scope.');
  }

  const includedPapers = paperIdSet
    ? examHead.importedPapers.filter((p) => paperIdSet.has(p.paperId))
    : [...examHead.importedPapers];

  const questions: ShareableQuestion[] = filteredQuestions.map((q) => ({
    id: q.id,
    paperId: q.paperId,
    paperLabel: q.paperLabel,
    text: q.text,
    normalizedText: q.normalizedText,
    options: {
      A: q.options.A,
      B: q.options.B,
      C: q.options.C,
      D: q.options.D,
    },
    correctOption: q.correctOption,
    explanation: q.explanation,
    imageDataUrl: q.imageDataUrl,
    table: q.table,
    addedAt: q.addedAt,
  }));

  return {
    schema: 'mcq-exam-bank-v1',
    exportType: isUpdate ? 'update' : 'full',
    exportedAt: new Date().toISOString(),
    examHeadId: examHead.id,
    examHeadName: examHead.name,
    includedPapers,
    questionCount: questions.length,
    questions,
  };
}

/**
 * Builds a single JSON backup package containing ALL non-empty Exam Heads and their questions/answers.
 */
export function buildFullBackupPackage(examHeads: ExamHead[]): FullBackupPackage {
  const nonEmptyHeads = examHeads.filter((h) => h.questions.length > 0);
  if (nonEmptyHeads.length === 0) {
    throw new Error('There are no Exam Heads with questions to export.');
  }

  const packages: ExamSharePackage[] = nonEmptyHeads.map((head) =>
    buildSharePackage(head, { mode: 'full' })
  );
  const totalQuestions = packages.reduce((sum, p) => sum + p.questionCount, 0);

  return {
    schema: 'mcq-full-backup-v1',
    exportedAt: new Date().toISOString(),
    examHeadCount: packages.length,
    totalQuestions,
    examHeads: packages,
  };
}

/**
 * Generates a clean, readable filename for the exported JSON package.
 */
export function generateShareFilename(pkg: ExamSharePackage): string {
  const safeName =
    pkg.examHeadName
      .trim()
      .replace(/[^a-zA-Z0-9\u0D00-\u0D7F]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Exam_Bank';
  const tag = pkg.exportType === 'update' ? 'Update' : 'Full';
  const datePart = (pkg.exportedAt || new Date().toISOString()).slice(0, 10);
  return `${safeName}_${tag}_${pkg.questionCount}Q_${datePart}.json`;
}

export function generateFullBackupFilename(backup: FullBackupPackage): string {
  const datePart = (backup.exportedAt || new Date().toISOString()).slice(0, 10);
  return `All_Exam_Heads_Backup_${backup.examHeadCount}Heads_${backup.totalQuestions}Q_${datePart}.json`;
}

export function createJsonFile(pkg: ExamSharePackage): File {
  const filename = generateShareFilename(pkg);
  const content = JSON.stringify(pkg, null, 2);
  return new File([content], filename, { type: 'application/json' });
}

export function estimatePackageSizeKb(pkg: ExamSharePackage): number {
  const bytes = new TextEncoder().encode(JSON.stringify(pkg)).length;
  return Math.max(1, Math.round(bytes / 1024));
}

export function downloadShareFile(pkg: ExamSharePackage): string {
  const filename = generateShareFilename(pkg);
  const blob = new Blob([JSON.stringify(pkg, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return filename;
}

export function downloadFullBackupFile(examHeads: ExamHead[]): {
  filename: string;
  examHeadCount: number;
  totalQuestions: number;
} {
  const backup = buildFullBackupPackage(examHeads);
  const filename = generateFullBackupFilename(backup);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return {
    filename,
    examHeadCount: backup.examHeadCount,
    totalQuestions: backup.totalQuestions,
  };
}

export function canUseNativeFileShare(file: File): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return false;
  }
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function getLiveAppUrl(): string {
  if (typeof window === 'undefined' || !window.location) {
    return 'https://github.io/';
  }
  return `${window.location.origin}${window.location.pathname}`;
}

export function buildShareMessage(
  pkg: ExamSharePackage,
  filename: string,
  appUrl: string = getLiveAppUrl()
): string {
  const modeLabel = pkg.exportType === 'update' ? 'New Update Pack' : 'Full Question Bank';
  const paperNames =
    pkg.includedPapers.length > 0
      ? pkg.includedPapers.map((p) => p.paperLabel).join(', ')
      : pkg.examHeadName;

  return [
    `📚 ${pkg.examHeadName} — ${modeLabel} (${pkg.questionCount} Questions)`,
    `Papers included: ${paperNames}`,
    `Attached file: ${filename}`,
    '',
    `How to practice:`,
    `1. Download the attached .json file.`,
    `2. Open the exam app: ${appUrl}`,
    `3. Click "Import Exam File" to start taking randomized mock tests!`,
  ].join('\n');
}

export async function shareViaNativeSheet(pkg: ExamSharePackage): Promise<boolean> {
  const file = createJsonFile(pkg);
  if (!canUseNativeFileShare(file)) return false;

  const text = buildShareMessage(pkg, file.name);
  try {
    await navigator.share({
      title: `${pkg.examHeadName} (${pkg.questionCount} Questions)`,
      text,
      files: [file],
    });
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return false;
    }
    throw err;
  }
}

export function buildChannelShareUrl(
  pkg: ExamSharePackage,
  channel: ShareChannel,
  filename: string,
  appUrl: string = getLiveAppUrl()
): string {
  const message = buildShareMessage(pkg, filename, appUrl);
  const encodedMsg = encodeURIComponent(message);
  const encodedUrl = encodeURIComponent(appUrl);

  switch (channel) {
    case 'whatsapp':
      return `https://wa.me/?text=${encodedMsg}`;
    case 'telegram':
      return `https://t.me/share/url?url=${encodedUrl}&text=${encodedMsg}`;
    case 'email': {
      const subject = encodeURIComponent(
        `${pkg.examHeadName} — ${pkg.exportType === 'update' ? 'Update Pack' : 'Exam Bank'} (${pkg.questionCount} Questions)`
      );
      return `mailto:?subject=${subject}&body=${encodedMsg}`;
    }
  }
}

export function shareViaChannel(
  pkg: ExamSharePackage,
  channel: ShareChannel,
  appUrl: string = getLiveAppUrl()
): { downloadedFilename: string; openedUrl: string } {
  const downloadedFilename =
    typeof document !== 'undefined' ? downloadShareFile(pkg) : generateShareFilename(pkg);
  const openedUrl = buildChannelShareUrl(pkg, channel, downloadedFilename, appUrl);

  if (typeof window !== 'undefined') {
    if (channel === 'email') {
      window.location.href = openedUrl;
    } else if (typeof window.open === 'function') {
      window.open(openedUrl, '_blank', 'noopener,noreferrer');
    }
  }

  return { downloadedFilename, openedUrl };
}
