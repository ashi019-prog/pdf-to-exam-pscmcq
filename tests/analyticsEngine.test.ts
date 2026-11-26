import { describe, expect, it } from 'vitest';
import { ExamResult } from '../src/types/exam';
import { ExamHead } from '../src/types/examHead';
import {
  computeExamHeadReadiness,
  computeGlobalAnalytics,
  computeScoreTrendSeries,
  computeTimeDisciplineMetrics,
} from '../src/utils/analyticsEngine';

function makeHead(id: string, name: string, totalQs: number, attemptedQs: number): ExamHead {
  const questions = Array.from({ length: totalQs }, (_, idx) => ({
    id: `${id}-q-${idx + 1}`,
    poolNumber: idx + 1,
    paperId: 'p1',
    paperLabel: '2024 Paper',
    text: `Sample question ${idx + 1}`,
    normalizedText: `sample question ${idx + 1}`,
    options: { A: '1', B: '2', C: '3', D: '4' },
    correctOption: 'A' as const,
    addedAt: '2026-01-01T00:00:00.000Z',
    stats: {
      timesAttempted: idx < attemptedQs ? 1 : 0,
      timesCorrect: idx < attemptedQs ? 1 : 0,
      lastResult: idx < attemptedQs ? ('correct' as const) : undefined,
    },
  }));

  return {
    id,
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    importedPapers: [
      {
        paperId: 'p1',
        paperLabel: '2024 Paper',
        importedAt: '2026-01-01T00:00:00.000Z',
        parsedCount: totalQs,
        duplicatesRemoved: 0,
        addedCount: totalQs,
      },
    ],
    questions,
  };
}

describe('analyticsEngine', () => {
  it('returns safe zero defaults with no NaN values for empty attempts', () => {
    const global = computeGlobalAnalytics([], []);
    expect(global.totalAttempts).toBe(0);
    expect(global.averageScorePercent).toBe(0);
    expect(global.overallAccuracy).toBe(0);
    expect(global.totalMarksGained).toBe(0);
    expect(global.totalMarksLost).toBe(0);
    expect(global.netMarksAcrossAttempts).toBe(0);
    expect(Number.isNaN(global.averageScorePercent)).toBe(false);
    expect(Number.isNaN(global.overallAccuracy)).toBe(false);

    const trend = computeScoreTrendSeries([]);
    expect(trend).toEqual([]);

    const time = computeTimeDisciplineMetrics([]);
    expect(time.averageSecondsPerQuestion).toBe(0);
    expect(time.overtimePercent).toBe(0);
    expect(time.isWithinBenchmark).toBe(true);
    expect(Number.isNaN(time.overtimePercent)).toBe(false);
  });

  it('aggregates +1, -0.33, and 0 marks across multiple attempts without floating-point drift', () => {
    const now = Date.parse('2026-11-26T10:00:00.000Z');
    const attempts: ExamResult[] = [
      {
        id: 'a1',
        completedAt: '2026-11-25T10:00:00.000Z',
        examHeadId: 'village-assistant',
        examTitle: 'Village Assistant',
        finalScore: 9.01,
        totalMarks: 20,
        totalQuestions: 20,
        percentage: 45.05,
        accuracy: 76.92,
        correctCount: 10,
        wrongCount: 3,
        skippedCount: 7,
        overtimeCount: 2,
        totalTimeUsedSeconds: 1500,
      },
      {
        id: 'a2',
        completedAt: '2026-11-10T10:00:00.000Z',
        examHeadId: 'village-assistant',
        examTitle: 'Village Assistant',
        finalScore: 13.68,
        totalMarks: 20,
        totalQuestions: 20,
        percentage: 68.4,
        accuracy: 78.95,
        correctCount: 15,
        wrongCount: 4,
        skippedCount: 1,
        overtimeCount: 4,
        totalTimeUsedSeconds: 1700,
      },
    ];

    const summary = computeGlobalAnalytics(attempts, [], undefined, now);
    expect(summary.totalAttempts).toBe(2);
    expect(summary.attemptsThisWeek).toBe(1);
    expect(summary.totalCorrect).toBe(25);
    expect(summary.totalWrong).toBe(7);
    expect(summary.totalSkipped).toBe(8);
    expect(summary.totalMarksGained).toBe(25);
    expect(summary.totalMarksLost).toBe(2.31);
    expect(summary.netMarksAcrossAttempts).toBe(22.69);
    expect(summary.overallAccuracy).toBe(78.13);
  });

  it('filters global analytics accurately by a specific examHeadId', () => {
    const headA = makeHead('village-assistant', 'Village Assistant', 50, 25);
    const headB = makeHead('ld-clerk', 'LD Clerk', 40, 10);

    const attempts: ExamResult[] = [
      {
        id: 'a1',
        completedAt: '2026-11-24T10:00:00.000Z',
        examHeadId: 'village-assistant',
        examTitle: 'Village Assistant',
        finalScore: 18,
        totalMarks: 20,
        percentage: 90,
        accuracy: 100,
        correctCount: 18,
        wrongCount: 0,
        skippedCount: 2,
        overtimeCount: 1,
        totalTimeUsedSeconds: 1200,
      },
      {
        id: 'a2',
        completedAt: '2026-11-25T10:00:00.000Z',
        examHeadId: 'ld-clerk',
        examTitle: 'LD Clerk',
        finalScore: 8.68,
        totalMarks: 20,
        percentage: 43.4,
        accuracy: 71.43,
        correctCount: 10,
        wrongCount: 4,
        skippedCount: 6,
        overtimeCount: 5,
        totalTimeUsedSeconds: 2000,
      },
    ];

    const filtered = computeGlobalAnalytics(attempts, [headA, headB], 'ld-clerk');
    expect(filtered.totalAttempts).toBe(1);
    expect(filtered.totalExamHeads).toBe(1);
    expect(filtered.totalQuestionPool).toBe(40);
    expect(filtered.totalCorrect).toBe(10);
    expect(filtered.totalWrong).toBe(4);
    expect(filtered.totalMarksLost).toBe(1.32);
    expect(filtered.averageScorePercent).toBe(43.4);
  });

  it('computes Exam Head coverage percentages, accuracy, and overtime metrics accurately', () => {
    const head = makeHead('village-assistant', 'Village Assistant', 200, 140);
    const attempts: ExamResult[] = [
      {
        id: 'a1',
        completedAt: '2026-11-20T10:00:00.000Z',
        examHeadId: 'village-assistant',
        examTitle: 'Village Assistant',
        finalScore: 60,
        totalMarks: 100,
        totalQuestions: 100,
        percentage: 60,
        accuracy: 80,
        correctCount: 66,
        wrongCount: 18,
        skippedCount: 16,
        overtimeCount: 15,
        totalTimeUsedSeconds: 8000,
      },
      {
        id: 'a2',
        completedAt: '2026-11-25T10:00:00.000Z',
        examHeadId: 'village-assistant',
        examTitle: 'Village Assistant',
        finalScore: 76,
        totalMarks: 100,
        totalQuestions: 100,
        percentage: 76,
        accuracy: 88,
        correctCount: 80,
        wrongCount: 12,
        skippedCount: 8,
        overtimeCount: 5,
        totalTimeUsedSeconds: 7000,
      },
    ];

    const readiness = computeExamHeadReadiness([head], attempts);
    expect(readiness).toHaveLength(1);
    expect(readiness[0].attemptedQuestions).toBe(140);
    expect(readiness[0].totalQuestions).toBe(200);
    expect(readiness[0].coveragePercent).toBe(70);
    expect(readiness[0].attemptsCount).toBe(2);
    expect(readiness[0].bestScorePercent).toBe(76);
    expect(readiness[0].averageScorePercent).toBe(68);

    const time = computeTimeDisciplineMetrics(attempts, 90);
    expect(time.totalQuestionsEvaluated).toBe(200);
    expect(time.totalOvertimeQuestions).toBe(20);
    expect(time.overtimePercent).toBe(10);
    expect(time.averageSecondsPerQuestion).toBe(75);
    expect(time.isWithinBenchmark).toBe(true);
  });
});
