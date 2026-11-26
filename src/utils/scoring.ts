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

export function roundScore(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatTimerMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

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

export function getGlobalTimerTone(remainingSeconds: number): TimerTone {
  if (remainingSeconds <= 600) return 'red';
  if (remainingSeconds <= 1800) return 'amber';
  return 'green';
}

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

export function shuffleQuestions(questions: ExamQuestion[]): ExamQuestion[] {
  const copy = questions.map((q) => ({
    ...q,
    options: { ...q.options },
    warnings: [...q.warnings],
  }));
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.map((q, idx) => ({
    ...q,
    number: idx + 1,
  }));
}

export function buildAnswerDetails(item: QuestionReviewItem): {
  statusSummary: string;
  methodOrGuidance: string;
  isMathQuestion: boolean;
} {
  const correctLabel = item.correctOption
    ? `Option ${item.correctOption} (${item.options[item.correctOption] || '—'})`
    : 'Not set in answer key';
  const userLabel = item.confirmedOption
    ? `Option ${item.confirmedOption} (${item.options[item.confirmedOption] || '—'})`
    : item.selectedOption
    ? `Option ${item.selectedOption} (selected but not confirmed)`
    : 'No option selected';

  const isMathQuestion =
    /[0-9].*[+\-×÷=²³√πθ≤≥%/:]|speed|train|ratio|percent|profit|interest|area|radius|triangle|solve|evaluate|sum/i.test(
      item.questionText
    );

  let statusSummary = '';
  if (item.outcome === 'correct') {
    statusSummary = `You confirmed ${userLabel}, which matches the official answer key (+1 mark).`;
  } else if (item.outcome === 'wrong') {
    statusSummary = `You confirmed ${userLabel}, which does not match the official answer key (${correctLabel}). Under negative marking, -0.33 marks were deducted.`;
  } else {
    statusSummary = item.selectedOption
      ? `You selected Option ${item.selectedOption} without pressing Confirm Answer, so it was scored as 0 marks. The official answer is ${correctLabel}.`
      : `You skipped this question (0 marks — no negative penalty). The official answer is ${correctLabel}.`;
  }

  if (item.explanation && item.explanation.trim()) {
    return {
      statusSummary,
      methodOrGuidance: item.explanation.trim(),
      isMathQuestion,
    };
  }

  const methodOrGuidance = isMathQuestion
    ? `Mathematical approach: Re-read the given values in Q${item.questionNumber}, write down the governing formula (percentage, ratio, speed = distance/time, or algebraic identity), substitute step-by-step, and verify that the result equals ${correctLabel}. You can also save your own step-by-step solution note below.`
    : `Key takeaway: The correct answer is ${correctLabel}. Review why ${correctLabel} directly answers the question stem while the other options do not, and save a short study note below for your next shuffled redo.`;

  return {
    statusSummary,
    methodOrGuidance,
    isMathQuestion,
  };
}

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
      explanation: question.explanation,
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
