import { describe, expect, it } from 'vitest';
import {
  appendPaperToExamHead,
  createExamHead,
  deleteQuestionFromExamHead,
  ExamHeadStorageAdapter,
  getExamHead,
  updateQuestionStatsAfterExam,
} from '../src/services/examHeadManager';
import { ExamHead, IncomingVerifiedQuestion } from '../src/types/examHead';

function createMemoryAdapter(): ExamHeadStorageAdapter {
  const store = new Map<string, ExamHead>();
  return {
    readRaw: async (id) => store.get(id) ?? null,
    writeRaw: async (id, data) => {
      store.set(id, JSON.parse(JSON.stringify(data)) as ExamHead);
    },
    listRaw: async () => Array.from(store.values()),
  };
}

function makeBatch(prefix: string, count: number): IncomingVerifiedQuestion[] {
  return Array.from({ length: count }, (_, idx) => ({
    tempId: `${prefix}-${idx + 1}`,
    text: `${prefix} Question ${idx + 1}`,
    options: { A: 'A1', B: 'B1', C: 'C1', D: 'D1' },
    correctOption: 'B',
  }));
}

describe('examHeadManager', () => {
  it('creates an Exam Head and blocks accidental overwrites with the same name', async () => {
    const adapter = createMemoryAdapter();
    const created = await createExamHead('Village Assistant', adapter);
    expect(created.id).toBe('village-assistant');
    expect(created.questions).toHaveLength(0);

    await expect(createExamHead('Village Assistant', adapter)).rejects.toThrow(/already exists/i);
  });

  it('appends non-destructively with sequential poolNumber, embedded correctOption, and importedPapers tracking', async () => {
    const adapter = createMemoryAdapter();
    await createExamHead('Village Assistant', adapter);

    const afterFirst = await appendPaperToExamHead(
      'village-assistant',
      makeBatch('Paper1', 3),
      { paperLabel: '2023 Prelims', parsedCount: 3, duplicatesRemoved: 0 },
      adapter
    );
    expect(afterFirst.questions).toHaveLength(3);
    expect(afterFirst.questions.map((q) => q.poolNumber)).toEqual([1, 2, 3]);

    const afterSecond = await appendPaperToExamHead(
      'village-assistant',
      makeBatch('Paper2', 2),
      { paperLabel: '2024 Prelims', parsedCount: 4, duplicatesRemoved: 2 },
      adapter
    );

    expect(afterSecond.questions).toHaveLength(5);
    expect(afterSecond.questions.map((q) => q.poolNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(afterSecond.questions[0].text).toBe('Paper1 Question 1');
    expect(afterSecond.questions[4].text).toBe('Paper2 Question 2');
    expect(afterSecond.questions[4].correctOption).toBe('B');
    expect(afterSecond.importedPapers).toHaveLength(2);
    expect(afterSecond.importedPapers[1].duplicatesRemoved).toBe(2);
  });

  it('re-indexes poolNumber on delete and updates per-question stats silently', async () => {
    const adapter = createMemoryAdapter();
    await createExamHead('LDC Bank', adapter);
    const populated = await appendPaperToExamHead(
      'ldc-bank',
      makeBatch('SetA', 3),
      { paperLabel: 'Set A', parsedCount: 3, duplicatesRemoved: 0 },
      adapter
    );

    const targetId = populated.questions[0].id;
    await updateQuestionStatsAfterExam(
      'ldc-bank',
      [{ questionId: targetId, result: 'wrong' }],
      adapter
    );
    const afterStats = await getExamHead('ldc-bank', adapter);
    expect(afterStats?.questions[0].stats.timesAttempted).toBe(1);
    expect(afterStats?.questions[0].stats.lastResult).toBe('wrong');

    const afterDelete = await deleteQuestionFromExamHead(
      'ldc-bank',
      populated.questions[1].id,
      adapter
    );
    expect(afterDelete.questions).toHaveLength(2);
    expect(afterDelete.questions.map((q) => q.poolNumber)).toEqual([1, 2]);
  });
});
