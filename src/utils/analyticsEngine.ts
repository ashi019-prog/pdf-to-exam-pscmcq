import { ExamResult } from '../types/exam';
import { ExamHead } from '../types/examHead';
import { CORRECT_MARK, roundScore, WRONG_MARK } from './scoring';

export interface GlobalAnalyticsSummary {
  totalAttempts: number;
  attemptsThisWeek: number;
  averageScorePercent: number;
  overallAccuracy: number;
  totalQuestionPool: number;
  totalExamHeads: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  totalMarksGained: number;
  totalMarksLost: number;
  netMarksAcrossAttempts: number;
}

export interface ScoreTrendPoint {
  attemptId: string;
  label: string;
  examTitle: string;
  completedAt: string;
  dateLabel: string;
  scorePercent: number;
  accuracyPercent: number;
  finalScore: number;
  totalMarks: number;
  totalTimeUsedSeconds: number;
}

export interface ExamHeadReadinessRow {
  examHeadId: string;
  examHeadName: string;
  totalQuestions: number;
  attemptedQuestions: number;
  coveragePercent: number;
  paperCount: number;
  attemptsCount: number;
  bestScorePercent: number | null;
  averageScorePercent: number | null;
  lastAttemptAt: string | null;
  lastScorePercent: number | null;
}

export interface TimeDisciplineMetrics {
  averageSecondsPerQuestion: number;
  benchmarkSeconds: number;
  deltaFromBenchmarkSeconds: number;
  totalQuestionsEvaluated: number;
  totalOvertimeQuestions: number;
  overtimePercent: number;
  isWithinBenchmark: boolean;
}

const DEFAULT_BENCHMARK_SECONDS = 90;

function matchesExamHead(attempt: ExamResult, examHead: ExamHead): boolean {
  if (attempt.examHeadId && attempt.examHeadId === examHead.id) {
    return true;
  }
  return attempt.examTitle.trim().toLowerCase() === examHead.name.trim().toLowerCase();
}

export function filterAttemptsByExamHead(
  attempts: ExamResult[],
  examHeads: ExamHead[],
  filterExamHeadId?: string
): ExamResult[] {
  if (!filterExamHeadId || filterExamHeadId === 'all') {
    return attempts;
  }
  const targetHead = examHeads.find((h) => h.id === filterExamHeadId);
  return attempts.filter((attempt) => {
    if (attempt.examHeadId === filterExamHeadId) return true;
    if (
      targetHead &&
      attempt.examTitle.trim().toLowerCase() === targetHead.name.trim().toLowerCase()
    ) {
      return true;
    }
    return false;
  });
}

export function computeGlobalAnalytics(
  attempts: ExamResult[],
  examHeads: ExamHead[],
  filterExamHeadId?: string,
  nowMs: number = Date.now()
): GlobalAnalyticsSummary {
  const scopedAttempts = filterAttemptsByExamHead(attempts, examHeads, filterExamHeadId);
  const scopedHeads =
    filterExamHeadId && filterExamHeadId !== 'all'
      ? examHeads.filter((h) => h.id === filterExamHeadId)
      : examHeads;

  const totalQuestionPool = scopedHeads.reduce((sum, h) => sum + h.questions.length, 0);
  const totalExamHeads = scopedHeads.length;
  const totalAttempts = scopedAttempts.length;

  const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  let attemptsThisWeek = 0;
  let sumScorePercent = 0;
  let totalCorrect = 0;
  let totalWrong = 0;
  let totalSkipped = 0;

  for (const attempt of scopedAttempts) {
    const ts = Date.parse(attempt.completedAt);
    if (!Number.isNaN(ts) && ts >= sevenDaysAgoMs) {
      attemptsThisWeek += 1;
    }
    sumScorePercent += Number.isFinite(attempt.percentage) ? attempt.percentage : 0;
    totalCorrect += Math.max(0, attempt.correctCount || 0);
    totalWrong += Math.max(0, attempt.wrongCount || 0);
    totalSkipped += Math.max(0, attempt.skippedCount || 0);
  }

  const totalAttemptedResponses = totalCorrect + totalWrong;
  const averageScorePercent =
    totalAttempts > 0 ? roundScore(sumScorePercent / totalAttempts) : 0;
  const overallAccuracy =
    totalAttemptedResponses > 0
      ? roundScore((totalCorrect / totalAttemptedResponses) * 100)
      : 0;

  const totalMarksGained = roundScore(totalCorrect * CORRECT_MARK);
  const totalMarksLost = roundScore(totalWrong * Math.abs(WRONG_MARK));
  const netMarksAcrossAttempts = roundScore(totalMarksGained - totalMarksLost);

  return {
    totalAttempts,
    attemptsThisWeek,
    averageScorePercent,
    overallAccuracy,
    totalQuestionPool,
    totalExamHeads,
    totalCorrect,
    totalWrong,
    totalSkipped,
    totalMarksGained,
    totalMarksLost,
    netMarksAcrossAttempts,
  };
}

export function computeScoreTrendSeries(
  attempts: ExamResult[],
  limit = 15
): ScoreTrendPoint[] {
  if (attempts.length === 0 || limit <= 0) return [];

  const sortedDesc = [...attempts].sort((a, b) => {
    const ta = Date.parse(a.completedAt) || 0;
    const tb = Date.parse(b.completedAt) || 0;
    return tb - ta;
  });

  const recentChronological = sortedDesc.slice(0, limit).reverse();

  return recentChronological.map((attempt, idx) => {
    const dt = new Date(attempt.completedAt);
    const dateLabel = Number.isNaN(dt.getTime())
      ? `#${idx + 1}`
      : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return {
      attemptId: attempt.id,
      label: `#${idx + 1}`,
      examTitle: attempt.examTitle,
      completedAt: attempt.completedAt,
      dateLabel,
      scorePercent: Number.isFinite(attempt.percentage) ? roundScore(attempt.percentage) : 0,
      accuracyPercent: Number.isFinite(attempt.accuracy) ? roundScore(attempt.accuracy) : 0,
      finalScore: Number.isFinite(attempt.finalScore) ? roundScore(attempt.finalScore) : 0,
      totalMarks: Number.isFinite(attempt.totalMarks) ? attempt.totalMarks : 0,
      totalTimeUsedSeconds: Math.max(0, attempt.totalTimeUsedSeconds || 0),
    };
  });
}

export function computeExamHeadReadiness(
  examHeads: ExamHead[],
  attempts: ExamResult[]
): ExamHeadReadinessRow[] {
  return examHeads.map((head) => {
    const totalQuestions = head.questions.length;
    const attemptedQuestions = head.questions.filter(
      (q) => q.stats && q.stats.timesAttempted > 0
    ).length;
    const coveragePercent =
      totalQuestions > 0 ? roundScore((attemptedQuestions / totalQuestions) * 100) : 0;

    const matching = attempts
      .filter((a) => matchesExamHead(a, head))
      .sort((a, b) => (Date.parse(b.completedAt) || 0) - (Date.parse(a.completedAt) || 0));

    const attemptsCount = matching.length;
    let bestScorePercent: number | null = null;
    let averageScorePercent: number | null = null;
    let lastAttemptAt: string | null = null;
    let lastScorePercent: number | null = null;

    if (attemptsCount > 0) {
      let best = -Infinity;
      let sum = 0;
      for (const item of matching) {
        const pct = Number.isFinite(item.percentage) ? item.percentage : 0;
        if (pct > best) best = pct;
        sum += pct;
      }
      bestScorePercent = roundScore(best);
      averageScorePercent = roundScore(sum / attemptsCount);
      lastAttemptAt = matching[0].completedAt;
      lastScorePercent = roundScore(matching[0].percentage);
    }

    return {
      examHeadId: head.id,
      examHeadName: head.name,
      totalQuestions,
      attemptedQuestions,
      coveragePercent,
      paperCount: head.importedPapers.length,
      attemptsCount,
      bestScorePercent,
      averageScorePercent,
      lastAttemptAt,
      lastScorePercent,
    };
  });
}

export function computeTimeDisciplineMetrics(
  attempts: ExamResult[],
  benchmarkSeconds = DEFAULT_BENCHMARK_SECONDS
): TimeDisciplineMetrics {
  const safeBenchmark = Math.max(1, Math.floor(benchmarkSeconds));
  if (attempts.length === 0) {
    return {
      averageSecondsPerQuestion: 0,
      benchmarkSeconds: safeBenchmark,
      deltaFromBenchmarkSeconds: 0,
      totalQuestionsEvaluated: 0,
      totalOvertimeQuestions: 0,
      overtimePercent: 0,
      isWithinBenchmark: true,
    };
  }

  let totalTimeSeconds = 0;
  let totalQuestionsEvaluated = 0;
  let totalOvertimeQuestions = 0;

  for (const attempt of attempts) {
    const qCount =
      typeof attempt.totalQuestions === 'number' && attempt.totalQuestions > 0
        ? attempt.totalQuestions
        : Math.max(
            0,
            (attempt.correctCount || 0) + (attempt.wrongCount || 0) + (attempt.skippedCount || 0)
          );
    totalQuestionsEvaluated += qCount;
    totalTimeSeconds += Math.max(0, attempt.totalTimeUsedSeconds || 0);
    totalOvertimeQuestions += Math.max(0, attempt.overtimeCount || 0);
  }

  const averageSecondsPerQuestion =
    totalQuestionsEvaluated > 0 ? Math.round(totalTimeSeconds / totalQuestionsEvaluated) : 0;
  const deltaFromBenchmarkSeconds = averageSecondsPerQuestion - safeBenchmark;
  const overtimePercent =
    totalQuestionsEvaluated > 0
      ? roundScore((totalOvertimeQuestions / totalQuestionsEvaluated) * 100)
      : 0;

  return {
    averageSecondsPerQuestion,
    benchmarkSeconds: safeBenchmark,
    deltaFromBenchmarkSeconds,
    totalQuestionsEvaluated,
    totalOvertimeQuestions,
    overtimePercent,
    isWithinBenchmark: averageSecondsPerQuestion <= safeBenchmark,
  };
}
