import { OPTION_KEYS, OptionKey } from '../types/exam';
import {
  ExamHead,
  ImportedPaperMeta,
  IncomingVerifiedQuestion,
  PooledQuestion,
} from '../types/examHead';
import { normalizeQuestionText } from '../utils/duplicateDetector';
import { localFolderStorage, slugifyExamHead } from './localFolderStorage';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Normalizes any stored ExamHead JSON (including earlier ExamHeadFile format) into the unified ExamHead schema.
 */
function normalizeStoredExamHead(raw: unknown): ExamHead | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id : '';
  const name =
    typeof obj.name === 'string'
      ? obj.name
      : typeof obj.title === 'string'
      ? obj.title
      : id;
  if (!id || !Array.isArray(obj.questions)) return null;

  const createdAt = typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString();
  const updatedAt = typeof obj.updatedAt === 'string' ? obj.updatedAt : createdAt;

  const rawPapers = Array.isArray(obj.importedPapers) ? obj.importedPapers : [];
  const importedPapers: ImportedPaperMeta[] = rawPapers.map((p) => {
    const rec = p as Record<string, unknown>;
    const count =
      typeof rec.addedCount === 'number'
        ? rec.addedCount
        : typeof rec.questionCount === 'number'
        ? rec.questionCount
        : 0;
    return {
      paperId: typeof rec.paperId === 'string' ? rec.paperId : generateId(),
      paperLabel: typeof rec.paperLabel === 'string' ? rec.paperLabel : 'Imported Paper',
      examYear: typeof rec.examYear === 'string' && rec.examYear.trim() ? rec.examYear.trim() : undefined,
      importedAt: typeof rec.importedAt === 'string' ? rec.importedAt : createdAt,
      parsedCount: typeof rec.parsedCount === 'number' ? rec.parsedCount : count,
      duplicatesRemoved: typeof rec.duplicatesRemoved === 'number' ? rec.duplicatesRemoved : 0,
      addedCount: count,
    };
  });

  const questions: PooledQuestion[] = obj.questions.map((q, idx) => {
    const rec = q as Record<string, unknown>;
    const text = typeof rec.text === 'string' ? rec.text : '';
    const opts = (rec.options as Record<OptionKey, string> | undefined) ?? {
      A: '',
      B: '',
      C: '',
      D: '',
    };
    const statsObj = (rec.stats as PooledQuestion['stats'] | undefined) ?? {
      timesAttempted: 0,
      timesCorrect: 0,
    };
    return {
      id: typeof rec.id === 'string' ? rec.id : generateId(),
      poolNumber:
        typeof rec.poolNumber === 'number'
          ? rec.poolNumber
          : typeof rec.number === 'number'
          ? rec.number
          : idx + 1,
      paperId: typeof rec.paperId === 'string' ? rec.paperId : 'legacy',
      paperLabel: typeof rec.paperLabel === 'string' ? rec.paperLabel : 'Imported Paper',
      text,
      normalizedText:
        typeof rec.normalizedText === 'string' && rec.normalizedText
          ? rec.normalizedText
          : normalizeQuestionText(text),
      options: {
        A: opts.A ?? '',
        B: opts.B ?? '',
        C: opts.C ?? '',
        D: opts.D ?? '',
      },
      correctOption: (rec.correctOption as OptionKey) ?? 'A',
      explanation: typeof rec.explanation === 'string' ? rec.explanation : undefined,
      imageDataUrl: typeof rec.imageDataUrl === 'string' ? rec.imageDataUrl : undefined,
      table: rec.table as PooledQuestion['table'],
      addedAt: typeof rec.addedAt === 'string' ? rec.addedAt : createdAt,
      stats: {
        timesAttempted: statsObj.timesAttempted ?? 0,
        timesCorrect: statsObj.timesCorrect ?? 0,
        lastResult: statsObj.lastResult,
        lastAttemptedAt: statsObj.lastAttemptedAt,
      },
    };
  });

  return {
    id,
    name,
    createdAt,
    updatedAt,
    importedPapers,
    questions,
  };
}

export interface ExamHeadStorageAdapter {
  readRaw: (id: string) => Promise<unknown | null>;
  writeRaw: (id: string, data: ExamHead) => Promise<void>;
  listRaw: () => Promise<unknown[]>;
  deleteRaw?: (id: string) => Promise<void>;
}

const defaultAdapter: ExamHeadStorageAdapter = {
  readRaw: (id) => localFolderStorage.readExamHeadRaw(id),
  writeRaw: (id, data) => localFolderStorage.writeExamHeadRaw(id, data),
  listRaw: () => localFolderStorage.listExamHeadsRaw(),
  deleteRaw: (id) => localFolderStorage.deleteExamHead(id),
};

export async function listExamHeads(
  adapter: ExamHeadStorageAdapter = defaultAdapter
): Promise<ExamHead[]> {
  const rawList = await adapter.listRaw();
  const parsed: ExamHead[] = [];
  for (const item of rawList) {
    const head = normalizeStoredExamHead(item);
    if (head) parsed.push(head);
  }
  return parsed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getExamHead(
  examHeadId: string,
  adapter: ExamHeadStorageAdapter = defaultAdapter
): Promise<ExamHead | null> {
  const raw = await adapter.readRaw(examHeadId);
  return normalizeStoredExamHead(raw);
}

/**
 * Creates a new Exam Head JSON file in exam-heads/. Blocks accidental overwrites of an existing Exam Head.
 */
export async function createExamHead(
  name: string,
  adapter: ExamHeadStorageAdapter = defaultAdapter
): Promise<ExamHead> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Exam Head name cannot be empty.');
  }

  const slug = slugifyExamHead(trimmedName);
  const existing = await getExamHead(slug, adapter);
  if (existing) {
    throw new Error(`An Exam Head named "${existing.name}" already exists.`);
  }

  const now = new Date().toISOString();
  const created: ExamHead = {
    id: slug,
    name: trimmedName,
    createdAt: now,
    updatedAt: now,
    importedPapers: [],
    questions: [],
  };

  await adapter.writeRaw(slug, created);
  return created;
}

export interface AppendPaperMetaInput {
  paperLabel: string;
  examYear?: string;
  parsedCount: number;
  duplicatesRemoved: number;
}

/**
 * Strictly non-destructive append: loads existing ExamHead, preserves every existing question,
 * validates all incoming options A–D and embedded correctOption, assigns sequential poolNumber,
 * verifies merged count, and writes atomically.
 */
export async function appendPaperToExamHead(
  examHeadId: string,
  verifiedQuestions: IncomingVerifiedQuestion[],
  paperMetaInput: AppendPaperMetaInput,
  adapter: ExamHeadStorageAdapter = defaultAdapter
): Promise<ExamHead> {
  const existing = await getExamHead(examHeadId, adapter);
  if (!existing) {
    throw new Error(`Exam Head "${examHeadId}" was not found.`);
  }

  // Validate every incoming question has complete options A–D and an embedded correctOption
  for (let i = 0; i < verifiedQuestions.length; i += 1) {
    const q = verifiedQuestions[i];
    if (!q.text.trim()) {
      throw new Error(`Incoming question #${i + 1} has empty text.`);
    }
    if (!q.correctOption || !OPTION_KEYS.includes(q.correctOption)) {
      throw new Error(`Incoming question #${i + 1} is missing a verified correctOption (A–D).`);
    }
    for (const key of OPTION_KEYS) {
      if (!q.options || typeof q.options[key] !== 'string' || !q.options[key].trim()) {
        throw new Error(`Incoming question #${i + 1} is missing Option ${key}.`);
      }
    }
  }

  const now = new Date().toISOString();
  const paperId = generateId();
  const paperLabel = paperMetaInput.paperLabel.trim() || 'Imported Paper';

  // Shallow-clone existing questions without modifying or dropping any stored item
  const preservedExisting: PooledQuestion[] = existing.questions.map((q) => ({ ...q }));
  const startPoolNum = preservedExisting.length + 1;

  const newPooledQuestions: PooledQuestion[] = verifiedQuestions.map((q, idx) => ({
    id: generateId(),
    poolNumber: startPoolNum + idx,
    paperId,
    paperLabel,
    text: q.text.trim(),
    normalizedText: normalizeQuestionText(q.text),
    options: {
      A: q.options.A.trim(),
      B: q.options.B.trim(),
      C: q.options.C.trim(),
      D: q.options.D.trim(),
    },
    correctOption: q.correctOption as OptionKey,
    explanation: q.explanation,
    imageDataUrl: q.imageDataUrl,
    table: q.table,
    addedAt: now,
    stats: {
      timesAttempted: 0,
      timesCorrect: 0,
    },
  }));

  const mergedQuestions = [...preservedExisting, ...newPooledQuestions];

  // Strict non-destructive safety invariant
  if (mergedQuestions.length !== existing.questions.length + newPooledQuestions.length) {
    throw new Error('Non-destructive merge assertion failed: question count mismatch.');
  }

  const detectedYearMatch = paperLabel.match(/\b(19\d{2}|20\d{2})\b/);
  const resolvedExamYear =
    paperMetaInput.examYear && paperMetaInput.examYear.trim()
      ? paperMetaInput.examYear.trim()
      : detectedYearMatch
      ? detectedYearMatch[1]
      : undefined;

  const paperRecord: ImportedPaperMeta = {
    paperId,
    paperLabel,
    examYear: resolvedExamYear,
    importedAt: now,
    parsedCount: paperMetaInput.parsedCount,
    duplicatesRemoved: paperMetaInput.duplicatesRemoved,
    addedCount: newPooledQuestions.length,
  };

  const updatedHead: ExamHead = {
    ...existing,
    updatedAt: now,
    importedPapers: [...existing.importedPapers, paperRecord],
    questions: mergedQuestions,
  };

  await adapter.writeRaw(existing.id, updatedHead);
  return updatedHead;
}

export async function deleteQuestionFromExamHead(
  examHeadId: string,
  questionId: string,
  adapter: ExamHeadStorageAdapter = defaultAdapter
): Promise<ExamHead> {
  const existing = await getExamHead(examHeadId, adapter);
  if (!existing) {
    throw new Error(`Exam Head "${examHeadId}" was not found.`);
  }

  const remaining = existing.questions
    .filter((q) => q.id !== questionId)
    .map((q, idx) => ({
      ...q,
      poolNumber: idx + 1,
    }));

  const updated: ExamHead = {
    ...existing,
    updatedAt: new Date().toISOString(),
    questions: remaining,
  };

  await adapter.writeRaw(existing.id, updated);
  return updated;
}

export async function updateQuestionInExamHead(
  examHeadId: string,
  questionId: string,
  patch: Partial<Pick<PooledQuestion, 'text' | 'options' | 'correctOption' | 'explanation'>>,
  adapter: ExamHeadStorageAdapter = defaultAdapter
): Promise<ExamHead> {
  const existing = await getExamHead(examHeadId, adapter);
  if (!existing) {
    throw new Error(`Exam Head "${examHeadId}" was not found.`);
  }

  const updatedQuestions = existing.questions.map((q) => {
    if (q.id !== questionId) return q;
    const nextText = patch.text !== undefined ? patch.text : q.text;
    return {
      ...q,
      ...patch,
      text: nextText,
      normalizedText: normalizeQuestionText(nextText),
      options: patch.options ? { ...q.options, ...patch.options } : q.options,
    };
  });

  const updated: ExamHead = {
    ...existing,
    updatedAt: new Date().toISOString(),
    questions: updatedQuestions,
  };

  await adapter.writeRaw(existing.id, updated);
  return updated;
}

export interface QuestionOutcomeUpdate {
  questionId: string;
  result: 'correct' | 'wrong' | 'skipped';
}

export async function updateQuestionStatsAfterExam(
  examHeadId: string,
  questionResults: QuestionOutcomeUpdate[],
  adapter: ExamHeadStorageAdapter = defaultAdapter
): Promise<void> {
  const existing = await getExamHead(examHeadId, adapter);
  if (!existing) return;

  const resultMap = new Map<string, 'correct' | 'wrong' | 'skipped'>();
  for (const item of questionResults) {
    resultMap.set(item.questionId, item.result);
  }

  const now = new Date().toISOString();
  const updatedQuestions = existing.questions.map((q) => {
    const res = resultMap.get(q.id);
    if (!res) return q;
    return {
      ...q,
      stats: {
        timesAttempted: (q.stats ? q.stats.timesAttempted : 0) + (res === 'skipped' ? 0 : 1),
        timesCorrect: (q.stats ? q.stats.timesCorrect : 0) + (res === 'correct' ? 1 : 0),
        lastResult: res,
        lastAttemptedAt: now,
      },
    };
  });

  const updated: ExamHead = {
    ...existing,
    updatedAt: now,
    questions: updatedQuestions,
  };

  await adapter.writeRaw(existing.id, updated);
}

export async function deleteExamHead(
  examHeadId: string,
  adapter: ExamHeadStorageAdapter = defaultAdapter
): Promise<void> {
  if (adapter.deleteRaw) {
    await adapter.deleteRaw(examHeadId);
  }
}

export async function renameExamHead(
  examHeadId: string,
  newName: string,
  adapter: ExamHeadStorageAdapter = defaultAdapter
): Promise<ExamHead> {
  const trimmed = newName.trim();
  if (!trimmed) {
    throw new Error('Exam Head name cannot be empty.');
  }
  const existing = await getExamHead(examHeadId, adapter);
  if (!existing) {
    throw new Error(`Exam Head "${examHeadId}" was not found.`);
  }
  const updated: ExamHead = {
    ...existing,
    name: trimmed,
    updatedAt: new Date().toISOString(),
  };
  await adapter.writeRaw(existing.id, updated);
  return updated;
}

export async function deletePaperBatchFromExamHead(
  examHeadId: string,
  paperId: string,
  adapter: ExamHeadStorageAdapter = defaultAdapter
): Promise<ExamHead> {
  const existing = await getExamHead(examHeadId, adapter);
  if (!existing) {
    throw new Error(`Exam Head "${examHeadId}" was not found.`);
  }

  const remainingPapers = existing.importedPapers.filter((p) => p.paperId !== paperId);
  const remainingQuestions = existing.questions
    .filter((q) => q.paperId !== paperId)
    .map((q, idx) => ({
      ...q,
      poolNumber: idx + 1,
    }));

  const updated: ExamHead = {
    ...existing,
    updatedAt: new Date().toISOString(),
    importedPapers: remainingPapers,
    questions: remainingQuestions,
  };

  await adapter.writeRaw(existing.id, updated);
  return updated;
}
