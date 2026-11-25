import {
  ExamQuestion,
  ExamScorecard,
  QuestionResponse,
  QuestionReviewItem,
  QuestionTimerState,
  ReviewOutcome,
  TimerTone,
} from '../types/exam';

export const CORRECT_MARK = 1;
export const WRONG_MARK = -0.33;
export const SKIPPED_MARK = 0;

/**
 * Rounds a number safely to 2 decimal places and avoids -0.
 */
export function roundScore(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Formats seconds as MM:SS (supports > 59 minutes, e.g., 90:00).
 */
export function formatTimerMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Formats elapsed time in a human-readable string (e.g., 12m 34s or 1h 05m 10s).
 */
export function formatDurationReadable(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/**
 * Global Exam Timer color-coded visual state:
 * - Green: > 30:00 (> 1800s)
 * - Amber: 30:00 to 10:01 (601s to 1800s)
 * - Red: 10:00 to 00:00 (<= 600s)
 */
export function getGlobalTimerTone(remainingSeconds: number): TimerTone {
  if (remainingSeconds <= 600) return 'red';
  if (remainingSeconds <= 1800) return 'amber';
  return 'green';
}

/**
 * Per-Question Timer countdown & overtime state:
 * - Green: 01:30 to 00:46 (>= 46s remaining)
 * - Amber: 00:45 to 00:16 (16s to 45s remaining)
 * - Red: 00:15 to 00:00 (0s to 15s remaining) or Overtime (> limit)
 */
export function getQuestionTimerState(
  timeSpentSeconds: number,
  perQuestionLimitSeconds = 90
): QuestionTimerState {
  const spent = Math.max(0, Math.floor(timeSpentSeconds));
  const limit = Math.max(1, Math.floor(perQuestionLimitSeconds));

  if (spent > limit) {
    return {
      remainingSeconds: 0,
      overtimeSeconds: spent - limit,
      isOvertime: true,
      tone: 'red',
    };
  }

  const remainingSeconds = limit - spent;
  let tone: TimerTone = 'green';
  if (remainingSeconds <= 15) {
    tone = 'red';
  } else if (remainingSeconds <= 45) {
    tone = 'amber';
  }

  return {
    remainingSeconds,
    overtimeSeconds: 0,
    isOvertime: false,
    tone,
  };
}

/**
 * Grades an exam using exact solo-practice negative marking rules:
 * - Correct Confirmed Answer: +1
 * - Wrong Confirmed Answer: -0.33
 * - Skipped / Unanswered / Unconfirmed: 0
 */
export function gradeExam(
  questions: ExamQuestion[],
  responses: Record<number, QuestionResponse>,
  totalTimeUsedSeconds: number,
  perQuestionLimitSeconds = 90
): ExamScorecard {
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;
  let overtimeCount = 0;
  let rawScore = 0;
  let rawNegativeDeducted = 0;

  const items: QuestionReviewItem[] = questions.map((question) => {
    const response = responses[question.number];
    const selectedOption = response?.selectedOption ?? null;
    const status = response?.status ?? 'not_visited';
    const timeSpentSeconds = response?.timeSpentSeconds ?? 0;
    const confirmedOption = status === 'confirmed' ? selectedOption : null;

    const overtimeSeconds = Math.max(0, timeSpentSeconds - perQuestionLimitSeconds);
    const isOvertime = overtimeSeconds > 0;
    if (isOvertime) {
      overtimeCount += 1;
    }

    let outcome: ReviewOutcome;
    let marksAwarded: number;

    if (confirmedOption === null) {
      outcome = 'skipped';
      marksAwarded = SKIPPED_MARK;
      skippedCount += 1;
    } else if (question.correctOption !== null && confirmedOption === question.correctOption) {
      outcome = 'correct';
      marksAwarded = CORRECT_MARK;
      correctCount += 1;
      rawScore += CORRECT_MARK;
    } else {
      outcome = 'wrong';
      marksAwarded = WRONG_MARK;
      wrongCount += 1;
      rawScore += WRONG_MARK;
      rawNegativeDeducted += Math.abs(WRONG_MARK);
    }

    return {
      questionNumber: question.number,
      questionText: question.text,
      options: question.options,
      selectedOption,
      confirmedOption,
      correctOption: question.correctOption,
      outcome,
      marksAwarded,
      timeSpentSeconds,
      overtimeSeconds,
      isOvertime,
      status,
    };
  });

  const totalQuestions = questions.length;
  const totalMarks = totalQuestions * CORRECT_MARK;
  const attemptedCount = correctCount + wrongCount;
  const finalScore = roundScore(rawScore);
  const negativeMarksDeducted = roundScore(rawNegativeDeducted);
  const percentage = totalMarks > 0 ? roundScore((finalScore / totalMarks) * 100) : 0;
  const accuracy = attemptedCount > 0 ? roundScore((correctCount / attemptedCount) * 100) : 0;
  const clampedTotalTime = Math.max(0, Math.floor(totalTimeUsedSeconds));
  const averageTimePerQuestionSeconds =
    totalQuestions > 0 ? Math.round(clampedTotalTime / totalQuestions) : 0;

  return {
    finalScore,
    totalMarks,
    percentage,
    accuracy,
    totalQuestions,
    attemptedCount,
    correctCount,
    wrongCount,
    skippedCount,
    negativeMarksDeducted,
    overtimeCount,
    totalTimeUsedSeconds: clampedTotalTime,
    averageTimePerQuestionSeconds,
    items,
  };
}

function escapeCsvField(value: string | number | null): string {
  const str = value === null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports the scorecard review table as an RFC 4180 CSV string.
 */
export function buildResultsCsv(scorecard: ExamScorecard, examTitle: string): string {
  const header = [
    'Exam Title',
    'Question #',
    'Question',
    'Your Confirmed Answer',
    'Official Answer Key',
    'Outcome',
    'Marks',
    'Time Spent (s)',
    'Overtime (s)',
  ];

  const rows = scorecard.items.map((item) => [
    escapeCsvField(examTitle),
    escapeCsvField(item.questionNumber),
    escapeCsvField(item.questionText),
    escapeCsvField(item.confirmedOption ?? 'Skipped'),
    escapeCsvField(item.correctOption ?? 'N/A'),
    escapeCsvField(item.outcome.toUpperCase()),
    escapeCsvField(item.marksAwarded),
    escapeCsvField(item.timeSpentSeconds),
    escapeCsvField(item.overtimeSeconds),
  ]);

  return [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
