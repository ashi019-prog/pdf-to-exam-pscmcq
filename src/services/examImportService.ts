import { OPTION_KEYS, OptionKey } from '../types/exam';
import {
  DuplicateMatch,
  ExamHead,
  ImportedPaperMeta,
  IncomingVerifiedQuestion,
} from '../types/examHead';
import {
  ExamSharePackage,
  FullBackupPackage,
  ImportAnalysisPreview,
  ParsedImportFile,
  ShareableQuestion,
} from '../types/sharePackage';
import { detectDuplicates, normalizeQuestionText } from '../utils/duplicateDetector';
import {
  appendPaperToExamHead,
  createExamHead,
  ExamHeadStorageAdapter,
} from './examHeadManager';
import { slugifyExamHead } from './localFolderStorage';

function validateQuestionItem(item: unknown, index: number): ShareableQuestion {
  if (!item || typeof item !== 'object') {
    throw new Error(`Question #${index + 1} is malformed.`);
  }
  const rec = item as Record<string, unknown>;
  const text = typeof rec.text === 'string' ? rec.text.trim() : '';
  if (!text) {
    throw new Error(`Question #${index + 1} is missing question text.`);
  }

  const opts = rec.options as Record<string, unknown> | undefined;
  if (!opts || typeof opts !== 'object') {
    throw new Error(`Question #${index + 1} is missing options A–D.`);
  }

  const cleanOptions: Record<OptionKey, string> = { A: '', B: '', C: '', D: '' };
  for (const key of OPTION_KEYS) {
    const val = opts[key];
    if (typeof val !== 'string' || !val.trim()) {
      throw new Error(`Question #${index + 1} is missing Option ${key}.`);
    }
    cleanOptions[key] = val.trim();
  }

  const correct = rec.correctOption;
  if (typeof correct !== 'string' || !OPTION_KEYS.includes(correct as OptionKey)) {
    throw new Error(`Question #${index + 1} is missing a valid correctOption (A, B, C, or D).`);
  }

  return {
    id:
      typeof rec.id === 'string' && rec.id.trim()
        ? rec.id
        : `imported-${Date.now()}-${index + 1}`,
    paperId: typeof rec.paperId === 'string' && rec.paperId ? rec.paperId : 'imported-paper',
    paperLabel:
      typeof rec.paperLabel === 'string' && rec.paperLabel.trim()
        ? rec.paperLabel.trim()
        : 'Shared Paper',
    text,
    normalizedText:
      typeof rec.normalizedText === 'string' && rec.normalizedText.trim()
        ? rec.normalizedText
        : normalizeQuestionText(text),
    options: cleanOptions,
    correctOption: correct as OptionKey,
    explanation: typeof rec.explanation === 'string' ? rec.explanation : undefined,
    imageDataUrl: typeof rec.imageDataUrl === 'string' ? rec.imageDataUrl : undefined,
    table: rec.table as ShareableQuestion['table'],
    addedAt: typeof rec.addedAt === 'string' ? rec.addedAt : new Date().toISOString(),
  };
}

function validateSinglePackageObject(obj: Record<string, unknown>): ExamSharePackage {
  // Case 1: Official ExamSharePackage ('mcq-exam-bank-v1')
  if (obj.schema === 'mcq-exam-bank-v1') {
    const examHeadName =
      typeof obj.examHeadName === 'string' ? obj.examHeadName.trim() : '';
    if (!examHeadName) {
      throw new Error('Share package is missing examHeadName.');
    }
    if (!Array.isArray(obj.questions) || obj.questions.length === 0) {
      throw new Error('Share package contains no questions.');
    }

    const validatedQuestions = obj.questions.map((q, idx) => validateQuestionItem(q, idx));
    const includedPapers: ImportedPaperMeta[] = Array.isArray(obj.includedPapers)
      ? (obj.includedPapers as ImportedPaperMeta[])
      : [
          {
            paperId: 'shared-paper',
            paperLabel: examHeadName,
            importedAt: new Date().toISOString(),
            parsedCount: validatedQuestions.length,
            duplicatesRemoved: 0,
            addedCount: validatedQuestions.length,
          },
        ];

    return {
      schema: 'mcq-exam-bank-v1',
      exportType: obj.exportType === 'update' ? 'update' : 'full',
      exportedAt:
        typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      examHeadId:
        typeof obj.examHeadId === 'string' && obj.examHeadId.trim()
          ? obj.examHeadId.trim()
          : slugifyExamHead(examHeadName),
      examHeadName,
      includedPapers,
      questionCount: validatedQuestions.length,
      questions: validatedQuestions,
    };
  }

  // Case 2: Raw local-folder ExamHead JSON file (backward compatibility)
  const rawName =
    typeof obj.name === 'string' && obj.name.trim()
      ? obj.name.trim()
      : typeof obj.title === 'string' && obj.title.trim()
      ? obj.title.trim()
      : '';

  if (rawName && Array.isArray(obj.questions) && obj.questions.length > 0) {
    const validatedQuestions = obj.questions.map((q, idx) => validateQuestionItem(q, idx));
    const rawPapers = Array.isArray(obj.importedPapers) ? obj.importedPapers : [];
    const includedPapers: ImportedPaperMeta[] =
      rawPapers.length > 0
        ? rawPapers.map((p) => {
            const rec = p as Record<string, unknown>;
            const cnt =
              typeof rec.addedCount === 'number'
                ? rec.addedCount
                : typeof rec.questionCount === 'number'
                ? rec.questionCount
                : validatedQuestions.length;
            return {
              paperId: typeof rec.paperId === 'string' ? rec.paperId : 'shared-paper',
              paperLabel: typeof rec.paperLabel === 'string' ? rec.paperLabel : rawName,
              examYear:
                typeof rec.examYear === 'string' && rec.examYear.trim()
                  ? rec.examYear.trim()
                  : undefined,
              importedAt:
                typeof rec.importedAt === 'string' ? rec.importedAt : new Date().toISOString(),
              parsedCount: typeof rec.parsedCount === 'number' ? rec.parsedCount : cnt,
              duplicatesRemoved:
                typeof rec.duplicatesRemoved === 'number' ? rec.duplicatesRemoved : 0,
              addedCount: cnt,
            };
          })
        : [
            {
              paperId: 'shared-paper',
              paperLabel: rawName,
              importedAt: new Date().toISOString(),
              parsedCount: validatedQuestions.length,
              duplicatesRemoved: 0,
              addedCount: validatedQuestions.length,
            },
          ];

    return {
      schema: 'mcq-exam-bank-v1',
      exportType: 'full',
      exportedAt:
        typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
      examHeadId:
        typeof obj.id === 'string' && obj.id.trim()
          ? obj.id.trim()
          : slugifyExamHead(rawName),
      examHeadName: rawName,
      includedPapers,
      questionCount: validatedQuestions.length,
      questions: validatedQuestions,
    };
  }

  throw new Error(
    'Unrecognized file format. Please import a .json file exported from this Exam Studio.'
  );
}

/**
 * Parses and validates any imported JSON file:
 * - Single Exam Head / Paper Batch ('mcq-exam-bank-v1' or raw ExamHead JSON)
 * - Full Backup of all Exam Heads ('mcq-full-backup-v1')
 */
export async function parseImportJsonFile(file: File): Promise<ParsedImportFile> {
  let rawText = '';
  try {
    rawText = await file.text();
  } catch {
    throw new Error('Could not read the selected file.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Invalid JSON file. Please select a valid .json exam bank file.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Unsupported file format: expected a JSON object.');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.schema === 'mcq-full-backup-v1') {
    if (!Array.isArray(obj.examHeads) || obj.examHeads.length === 0) {
      throw new Error('Full backup file contains no Exam Heads.');
    }
    const validatedHeads: ExamSharePackage[] = obj.examHeads.map((entry, idx) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error(`Exam Head entry #${idx + 1} in backup is malformed.`);
      }
      return validateSinglePackageObject(entry as Record<string, unknown>);
    });
    const totalQuestions = validatedHeads.reduce((sum, h) => sum + h.questionCount, 0);
    const backupData: FullBackupPackage = {
      schema: 'mcq-full-backup-v1',
      exportedAt:
        typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      examHeadCount: validatedHeads.length,
      totalQuestions,
      examHeads: validatedHeads,
    };
    return { kind: 'full-backup', backupData };
  }

  const packageData = validateSinglePackageObject(obj);
  return { kind: 'single', packageData };
}

/**
 * Parses and strictly validates a single-Exam-Head imported JSON file.
 * Kept for backward compatibility with single-package callers.
 */
export async function parseAndValidateImportFile(file: File): Promise<ExamSharePackage> {
  const result = await parseImportJsonFile(file);
  if (result.kind === 'full-backup') {
    throw new Error(
      'This is a Full Backup (.json) with multiple Exam Heads. Please import it from the Upload / Create -> Import / Export .json tab.'
    );
  }
  return result.packageData;
}

/**
 * Matches an imported package against an existing local Exam Head (either user-selected targetExamHeadId
 * or auto-matched by ID/name) and runs duplicate detection.
 */
export function analyzeImportAgainstExisting(
  pkg: ExamSharePackage,
  existingExamHeads: ExamHead[],
  targetExamHeadId?: string | null
): ImportAnalysisPreview {
  const normalizedTargetName = pkg.examHeadName.trim().toLowerCase();
  const existingExamHead =
    targetExamHeadId !== undefined
      ? existingExamHeads.find((h) => h.id === targetExamHeadId) ?? null
      : existingExamHeads.find(
          (h) => h.id === pkg.examHeadId || h.name.trim().toLowerCase() === normalizedTargetName
        ) ?? null;

  if (!existingExamHead) {
    return {
      packageData: pkg,
      existingExamHead: null,
      totalIncoming: pkg.questions.length,
      exactDuplicateCount: 0,
      nearDuplicateMatches: {},
      netNewQuestions: [...pkg.questions],
    };
  }

  const incomingForDetector: IncomingVerifiedQuestion[] = pkg.questions.map((q) => ({
    tempId: q.id,
    text: q.text,
    options: q.options,
    correctOption: q.correctOption,
    explanation: q.explanation,
    imageDataUrl: q.imageDataUrl,
    table: q.table,
  }));

  const matches = detectDuplicates(incomingForDetector, existingExamHead.questions);
  let exactDuplicateCount = 0;
  const nearDuplicateMatches: Record<string, DuplicateMatch> = {};
  const netNewQuestions: ShareableQuestion[] = [];

  for (const q of pkg.questions) {
    const match = matches[q.id];
    if (match && (match.matchType === 'exact' || match.matchType === 'intra-batch')) {
      exactDuplicateCount += 1;
      continue;
    }
    if (match && match.matchType === 'near-duplicate') {
      nearDuplicateMatches[q.id] = match;
    }
    netNewQuestions.push(q);
  }

  return {
    packageData: pkg,
    existingExamHead,
    totalIncoming: pkg.questions.length,
    exactDuplicateCount,
    nearDuplicateMatches,
    netNewQuestions,
  };
}

export interface CommitImportOptions {
  targetMode: 'merge-existing' | 'create-new';
  targetExamHeadId?: string;
  customExamName?: string;
  paperLabelOverride?: string;
  examYearOverride?: string;
  excludedQuestionIds?: string[];
}

/**
 * Non-destructively commits an analyzed import package to storage (Local Folder or IndexedDB).
 * Preserves 100% of existing questions and personal attempt stats on the device.
 */
export async function commitImportedPackage(
  preview: ImportAnalysisPreview,
  options: CommitImportOptions,
  adapter?: ExamHeadStorageAdapter
): Promise<{ examHead: ExamHead; addedCount: number; skippedDuplicates: number }> {
  const excludedSet = new Set(options.excludedQuestionIds ?? []);
  const resolvedTargetHeadId =
    options.targetMode === 'merge-existing'
      ? options.targetExamHeadId || (preview.existingExamHead ? preview.existingExamHead.id : '')
      : '';
  const shouldMerge =
    options.targetMode === 'merge-existing' && Boolean(resolvedTargetHeadId);

  const sourceQuestions = shouldMerge
    ? preview.netNewQuestions.filter((q) => !excludedSet.has(q.id))
    : preview.packageData.questions.filter((q) => !excludedSet.has(q.id));

  const skippedDuplicates = shouldMerge
    ? preview.exactDuplicateCount +
      preview.netNewQuestions.filter((q) => excludedSet.has(q.id)).length
    : preview.packageData.questions.filter((q) => excludedSet.has(q.id)).length;

  let targetHeadId: string;

  if (shouldMerge && resolvedTargetHeadId) {
    targetHeadId = resolvedTargetHeadId;
  } else {
    const baseName = (options.customExamName ?? preview.packageData.examHeadName).trim();
    const finalName = baseName || preview.packageData.examHeadName;
    let candidateName = finalName;
    let suffix = 2;
    let createdHead: ExamHead | null = null;
    while (!createdHead) {
      try {
        createdHead = await createExamHead(candidateName, adapter);
      } catch {
        candidateName = `${finalName} (${suffix})`;
        suffix += 1;
      }
    }
    targetHeadId = createdHead.id;
  }

  if (sourceQuestions.length === 0 && shouldMerge && preview.existingExamHead) {
    return {
      examHead: preview.existingExamHead,
      addedCount: 0,
      skippedDuplicates,
    };
  }

  const defaultPaperLabel =
    preview.packageData.includedPapers.length > 0
      ? preview.packageData.includedPapers.map((p) => p.paperLabel).join(' + ')
      : preview.packageData.examHeadName;
  const paperLabel =
    options.paperLabelOverride && options.paperLabelOverride.trim()
      ? options.paperLabelOverride.trim()
      : defaultPaperLabel;

  const firstPaperYear =
    preview.packageData.includedPapers.length > 0
      ? preview.packageData.includedPapers[0].examYear
      : undefined;
  const examYear =
    options.examYearOverride && options.examYearOverride.trim()
      ? options.examYearOverride.trim()
      : firstPaperYear;

  const verifiedBatch: IncomingVerifiedQuestion[] = sourceQuestions.map((q) => ({
    tempId: q.id,
    text: q.text,
    options: q.options,
    correctOption: q.correctOption,
    explanation: q.explanation,
    imageDataUrl: q.imageDataUrl,
    table: q.table,
  }));

  const updatedHead = await appendPaperToExamHead(
    targetHeadId,
    verifiedBatch,
    {
      paperLabel,
      examYear,
      parsedCount: preview.totalIncoming,
      duplicatesRemoved: skippedDuplicates,
    },
    adapter
  );

  return {
    examHead: updatedHead,
    addedCount: sourceQuestions.length,
    skippedDuplicates,
  };
}

/**
 * Non-destructively imports every Exam Head from a Full Backup (.json) file.
 * Matches existing Exam Heads by ID/name and merges net-new questions, or creates new Exam Heads.
 */
export async function commitFullBackupImport(
  backup: FullBackupPackage,
  existingExamHeads: ExamHead[],
  adapter?: ExamHeadStorageAdapter
): Promise<{
  importedHeadsCount: number;
  totalAddedQuestions: number;
  totalSkippedDuplicates: number;
  updatedHeads: ExamHead[];
}> {
  const workingHeads = [...existingExamHeads];
  const updatedHeads: ExamHead[] = [];
  let totalAddedQuestions = 0;
  let totalSkippedDuplicates = 0;

  for (const pkg of backup.examHeads) {
    const preview = analyzeImportAgainstExisting(pkg, workingHeads);
    const result = await commitImportedPackage(
      preview,
      {
        targetMode: preview.existingExamHead ? 'merge-existing' : 'create-new',
        targetExamHeadId: preview.existingExamHead ? preview.existingExamHead.id : undefined,
        customExamName: pkg.examHeadName,
      },
      adapter
    );

    totalAddedQuestions += result.addedCount;
    totalSkippedDuplicates += result.skippedDuplicates;
    updatedHeads.push(result.examHead);

    const existingIdx = workingHeads.findIndex((h) => h.id === result.examHead.id);
    if (existingIdx >= 0) {
      workingHeads[existingIdx] = result.examHead;
    } else {
      workingHeads.push(result.examHead);
    }
  }

  return {
    importedHeadsCount: updatedHeads.length,
    totalAddedQuestions,
    totalSkippedDuplicates,
    updatedHeads,
  };
}
