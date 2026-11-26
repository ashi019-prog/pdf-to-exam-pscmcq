import { describe, expect, it } from 'vitest';
import { generateRandomMockExam } from '../src/utils/examGenerator';
import { ExamHead, PooledQuestion } from '../src/types/examHead';

function buildExamHead(total: number): ExamHead {
  const questions: PooledQuestion[] = Array.from({ length: total }, (_, idx) => ({
    id: `q-${idx + 1}`,
    poolNumber: idx + 1,
    paperId: idx < 5 ? 'paper-1' : 'paper-2',
    paperLabel: idx < 5 ? '2023 Paper 1' : '2024 Paper 2',
    text: `Sample Question ${idx + 1}`,
    normalizedText: `sample question ${idx + 1}`,
    options: {
      A: `Alpha-${idx + 1}`,
      B: `Beta-${idx + 1}`,
      C: `Gamma-${idx + 1}`,
      D: `Delta-${idx + 1}`,
    },
    correctOption: 'C',
    addedAt: '2026-01-01T00:00:00.000Z',
    stats: {
      timesAttempted: idx % 2 === 0 ? 0 : 1,
      timesCorrect: 0,
      lastResult: idx % 2 === 0 ? undefined : 'wrong',
    },
  }));

  return {
    id: 'village-assistant',
    name: 'Village Assistant',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    importedPapers: [
      {
        paperId: 'paper-1',
        paperLabel: '2023 Paper 1',
        importedAt: '2026-01-01T00:00:00.000Z',
        parsedCount: 5,
        duplicatesRemoved: 0,
        addedCount: 5,
      },
      {
        paperId: 'paper-2',
        paperLabel: '2024 Paper 2',
        importedAt: '2026-01-02T00:00:00.000Z',
        parsedCount: Math.max(0, total - 5),
        duplicatesRemoved: 0,
        addedCount: Math.max(0, total - 5),
      },
    ],
    questions,
  };
}

describe('examGenerator', () => {
  it('returns exact N unique questions with sequential session numbers and safely caps at pool size', () => {
    const head = buildExamHead(12);
    const session = generateRandomMockExam(head, {
      questionCount: 8,
      filterMode: 'all',
      shuffleOptions: false,
      examDurationMinutes: 90,
      perQuestionSeconds: 90,
    });

    expect(session.questions).toHaveLength(8);
    expect(session.questions.map((q) => q.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(session.questions.map((q) => q.id)).size).toBe(8);

    const capped = generateRandomMockExam(head, {
      questionCount: 100,
      filterMode: 'all',
      shuffleOptions: false,
      examDurationMinutes: 90,
      perQuestionSeconds: 90,
    });
    expect(capped.questions).toHaveLength(12);
  });

  it('shuffles options without mutating the stored ExamHead and remaps correctOption accurately', () => {
    const head = buildExamHead(10);
    const originalSnapshot = JSON.stringify(head);

    const session = generateRandomMockExam(head, {
      questionCount: 10,
      filterMode: 'all',
      shuffleOptions: true,
      examDurationMinutes: 60,
      perQuestionSeconds: 60,
    });

    expect(JSON.stringify(head)).toBe(originalSnapshot);

    for (const q of session.questions) {
      expect(q.options[q.correctOption]).toBe(`Gamma-${q.sourcePoolNumber}`);
    }
  });

  it('filters by unattempted, previously-wrong, and specific paper accurately', () => {
    const head = buildExamHead(10);

    const unattempted = generateRandomMockExam(head, {
      questionCount: 50,
      filterMode: 'unattempted',
      shuffleOptions: false,
      examDurationMinutes: 90,
      perQuestionSeconds: 90,
    });
    expect(unattempted.questions).toHaveLength(5);

    const wrongOnly = generateRandomMockExam(head, {
      questionCount: 50,
      filterMode: 'previously-wrong',
      shuffleOptions: false,
      examDurationMinutes: 90,
      perQuestionSeconds: 90,
    });
    expect(wrongOnly.questions).toHaveLength(5);

    const paper1Only = generateRandomMockExam(head, {
      questionCount: 50,
      filterMode: 'by-paper',
      selectedPaperId: 'paper-1',
      shuffleOptions: false,
      examDurationMinutes: 90,
      perQuestionSeconds: 90,
    });
    expect(paper1Only.questions).toHaveLength(5);
    expect(paper1Only.questions.every((q) => q.paperId === 'paper-1')).toBe(true);
  });
});
