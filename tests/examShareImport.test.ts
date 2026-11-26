import { describe, expect, it } from 'vitest';
import {
  buildChannelShareUrl,
  buildSharePackage,
  generateShareFilename,
  shareViaChannel,
} from '../src/services/examShareService';
import {
  analyzeImportAgainstExisting,
  commitImportedPackage,
  parseAndValidateImportFile,
} from '../src/services/examImportService';
import { ExamHeadStorageAdapter } from '../src/services/examHeadManager';
import { ExamHead, PooledQuestion } from '../src/types/examHead';

function createMemoryAdapter(initial: ExamHead[] = []): ExamHeadStorageAdapter {
  const map = new Map<string, ExamHead>();
  for (const h of initial) {
    map.set(h.id, JSON.parse(JSON.stringify(h)) as ExamHead);
  }
  return {
    readRaw: async (id) => map.get(id) ?? null,
    writeRaw: async (id, data) => {
      map.set(id, JSON.parse(JSON.stringify(data)) as ExamHead);
    },
    listRaw: async () => Array.from(map.values()),
  };
}

function makeSampleExamHead(): ExamHead {
  const q1: PooledQuestion = {
    id: 'q-1',
    poolNumber: 1,
    paperId: 'p1',
    paperLabel: '2023 Prelims Paper 1',
    text: 'What is the capital of Kerala?',
    normalizedText: 'what is the capital of kerala',
    options: { A: 'Kochi', B: 'Thiruvananthapuram', C: 'Kannur', D: 'Kollam' },
    correctOption: 'B',
    addedAt: '2026-01-01T00:00:00.000Z',
    stats: {
      timesAttempted: 5,
      timesCorrect: 4,
      lastResult: 'correct',
      lastAttemptedAt: '2026-11-20T00:00:00.000Z',
    },
  };
  const q2: PooledQuestion = {
    id: 'q-2',
    poolNumber: 2,
    paperId: 'p2',
    paperLabel: '2024 Prelims Paper 2',
    text: 'Which river is the longest in Kerala?',
    normalizedText: 'which river is the longest in kerala',
    options: { A: 'Periyar', B: 'Pamba', C: 'Bharathapuzha', D: 'Chaliyar' },
    correctOption: 'A',
    addedAt: '2026-02-01T00:00:00.000Z',
    stats: {
      timesAttempted: 2,
      timesCorrect: 1,
      lastResult: 'wrong',
      lastAttemptedAt: '2026-11-22T00:00:00.000Z',
    },
  };

  return {
    id: 'village-assistant',
    name: 'Village Assistant',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    importedPapers: [
      {
        paperId: 'p1',
        paperLabel: '2023 Prelims Paper 1',
        importedAt: '2026-01-01T00:00:00.000Z',
        parsedCount: 1,
        duplicatesRemoved: 0,
        addedCount: 1,
      },
      {
        paperId: 'p2',
        paperLabel: '2024 Prelims Paper 2',
        importedAt: '2026-02-01T00:00:00.000Z',
        parsedCount: 1,
        duplicatesRemoved: 0,
        addedCount: 1,
      },
    ],
    questions: [q1, q2],
  };
}

describe('examShareService & examImportService', () => {
  it('strips personal stats from exported questions and filters by selectedPaperIds in update mode', () => {
    const head = makeSampleExamHead();
    const updatePkg = buildSharePackage(head, { mode: 'update', selectedPaperIds: ['p2'] });

    expect(updatePkg.schema).toBe('mcq-exam-bank-v1');
    expect(updatePkg.exportType).toBe('update');
    expect(updatePkg.questionCount).toBe(1);
    expect(updatePkg.questions[0].id).toBe('q-2');
    expect('stats' in updatePkg.questions[0]).toBe(false);
    expect('poolNumber' in updatePkg.questions[0]).toBe(false);

    const filename = generateShareFilename(updatePkg);
    expect(filename).toMatch(/^Village_Assistant_Update_1Q_\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('validates both mcq-exam-bank-v1 share packages and raw ExamHead files, and rejects invalid JSON', async () => {
    const head = makeSampleExamHead();
    const pkg = buildSharePackage(head, { mode: 'full' });

    const validShareFile = { text: async () => JSON.stringify(pkg) } as unknown as File;
    const parsedShare = await parseAndValidateImportFile(validShareFile);
    expect(parsedShare.examHeadName).toBe('Village Assistant');
    expect(parsedShare.questions).toHaveLength(2);

    const rawHeadFile = { text: async () => JSON.stringify(head) } as unknown as File;
    const parsedRaw = await parseAndValidateImportFile(rawHeadFile);
    expect(parsedRaw.examHeadName).toBe('Village Assistant');
    expect(parsedRaw.questions).toHaveLength(2);

    const missingAnswerFile = {
      text: async () =>
        JSON.stringify({
          schema: 'mcq-exam-bank-v1',
          examHeadName: 'Broken',
          questions: [{ text: 'Q1', options: { A: '1', B: '2', C: '3', D: '4' } }],
        }),
    } as unknown as File;
    await expect(parseAndValidateImportFile(missingAnswerFile)).rejects.toThrow(/correctOption/i);
  });

  it('creates a new Exam Head on a fresh device and non-destructively merges updates while preserving friend stats', async () => {
    const fullHead = makeSampleExamHead();
    const fullPkg = buildSharePackage(fullHead, { mode: 'full' });

    const freshAdapter = createMemoryAdapter([]);
    const freshPreview = analyzeImportAgainstExisting(fullPkg, []);
    expect(freshPreview.existingExamHead).toBeNull();
    const freshCommit = await commitImportedPackage(
      freshPreview,
      { targetMode: 'create-new' },
      freshAdapter
    );
    expect(freshCommit.addedCount).toBe(2);
    expect(freshCommit.examHead.questions).toHaveLength(2);

    const friendExisting: ExamHead = {
      ...fullHead,
      importedPapers: [fullHead.importedPapers[0]],
      questions: [fullHead.questions[0]],
    };
    const friendAdapter = createMemoryAdapter([friendExisting]);
    const mergePreview = analyzeImportAgainstExisting(fullPkg, [friendExisting]);

    expect(mergePreview.exactDuplicateCount).toBe(1);
    expect(mergePreview.netNewQuestions).toHaveLength(1);
    expect(mergePreview.netNewQuestions[0].id).toBe('q-2');

    const mergedCommit = await commitImportedPackage(
      mergePreview,
      { targetMode: 'merge-existing' },
      friendAdapter
    );

    expect(mergedCommit.addedCount).toBe(1);
    expect(mergedCommit.skippedDuplicates).toBe(1);
    expect(mergedCommit.examHead.questions).toHaveLength(2);
    expect(mergedCommit.examHead.questions[0].stats.timesAttempted).toBe(5);
    expect(mergedCommit.examHead.questions[0].stats.timesCorrect).toBe(4);
    expect(mergedCommit.examHead.questions[1].poolNumber).toBe(2);
  });

  it('generates properly encoded WhatsApp, Telegram, and Email share URLs containing Exam Name and app URL', () => {
    const head = makeSampleExamHead();
    const pkg = buildSharePackage(head, { mode: 'full' });
    const appUrl = 'https://ashi019-prog.github.io/pdf-to-exam-pscmcq/';

    const wa = buildChannelShareUrl(pkg, 'whatsapp', 'Village_Assistant_Full_2Q.json', appUrl);
    expect(wa.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(wa)).toContain('Village Assistant');
    expect(decodeURIComponent(wa)).toContain(appUrl);

    const tg = buildChannelShareUrl(pkg, 'telegram', 'Village_Assistant_Full_2Q.json', appUrl);
    expect(tg.startsWith('https://t.me/share/url?url=')).toBe(true);
    expect(decodeURIComponent(tg)).toContain(appUrl);

    const mail = shareViaChannel(pkg, 'email', appUrl);
    expect(mail.openedUrl.startsWith('mailto:?subject=')).toBe(true);
    expect(decodeURIComponent(mail.openedUrl)).toContain('Village Assistant');
    expect(mail.downloadedFilename).toContain('Village_Assistant_Full_2Q');
  });
});
