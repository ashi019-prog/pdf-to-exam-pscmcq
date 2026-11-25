import { describe, it, expect } from 'vitest';
import {
  buildResultsCsv,
  formatDurationReadable,
  formatTimerMMSS,
  getGlobalTimerTone,
  getQuestionTimerState,
  gradeExam,
  roundScore,
} from '../src/utils/scoring';
import { ExamQuestion, QuestionResponse } from '../src/types/exam';

const sampleQuestions: ExamQuestion[] = [
  {
    number: 1,
    text: 'Solve 2x² − 7x + 3 = 0',
    options: { A: '1/2, 3', B: '−1/2, 3', C: '1/2, −3', D: '2, 3/2' },
    correctOption: 'A',
    warnings: [],
  },
  {
    number: 2,
    text: 'Evaluate √144 + √225 − 3²',
    options: { A: '16', B: '18', C: '20', D: '24' },
    correctOption: 'B',
    warnings: [],
  },
  {
    number: 3,
    text: 'Area of circle with r = 7 cm (π = 22/7)',
    options: { A: '144', B: '154', C: '164', D: '176' },
    correctOption: 'B',
    warnings: [],
  },
  {
    number: 4,
    text: 'Prime number?',
    options: { A: '4', B: '6', C: '9', D: '7' },
    correctOption: 'D',
    warnings: [],
  },
  {
    number: 5,
    text: 'Water formula?',
    options: { A: 'H2O', B: 'CO2', C: 'O2', D: 'NaCl' },
    correctOption: 'A',
    warnings: [],
  },
];

describe('scoring utilities', () => {
  it('rounds floating-point edge cases cleanly to 2 decimal places', () => {
    expect(roundScore(1 - 0.33 - 0.33 - 0.33)).toBe(0.01);
    expect(roundScore(-0.33 * 2)).toBe(-0.66);
    expect(roundScore(-0.33 * 3)).toBe(-0.99);
    expect(roundScore(-0)).toBe(0);
    expect(roundScore(2.345)).toBe(2.35);
  });

  it('grades only confirmed answers (+1 / -0.33) and scores skipped/unconfirmed as 0', () => {
    const responses: Record<number, QuestionResponse> = {
      // Confirmed correct (+1)
      1: { questionNumber: 1, selectedOption: 'A', status: 'confirmed', timeSpentSeconds: 40 },
      // Confirmed correct (+1) + overtime (110s > 90s)
      2: { questionNumber: 2, selectedOption: 'B', status: 'confirmed', timeSpentSeconds: 110 },
      // Confirmed wrong (-0.33)
      3: { questionNumber: 3, selectedOption: 'A', status: 'confirmed', timeSpentSeconds: 30 },
      // Selected but NOT confirmed (marked_for_review -> 0 marks)
      4: {
        questionNumber: 4,
        selectedOption: 'D',
        status: 'marked_for_review',
        timeSpentSeconds: 95,
      },
      // Skipped (0 marks)
      5: { questionNumber: 5, selectedOption: null, status: 'skipped', timeSpentSeconds: 10 },
    };

    const scorecard = gradeExam(sampleQuestions, responses, 285, 90);

    expect(scorecard.correctCount).toBe(2);
    expect(scorecard.wrongCount).toBe(1);
    expect(scorecard.skippedCount).toBe(2);
    expect(scorecard.attemptedCount).toBe(3);
    expect(scorecard.negativeMarksDeducted).toBe(0.33);
    expect(scorecard.finalScore).toBe(1.67);
    expect(scorecard.totalMarks).toBe(5);
    expect(scorecard.percentage).toBe(33.4);
    expect(scorecard.accuracy).toBe(66.67);
    expect(scorecard.overtimeCount).toBe(2);
    expect(scorecard.averageTimePerQuestionSeconds).toBe(57);
  });

  it('handles all-skipped exam without NaN or negative zero', () => {
    const scorecard = gradeExam(sampleQuestions, {}, 0, 90);
    expect(scorecard.finalScore).toBe(0);
    expect(scorecard.percentage).toBe(0);
    expect(scorecard.accuracy).toBe(0);
    expect(scorecard.skippedCount).toBe(5);
    expect(scorecard.overtimeCount).toBe(0);
    expect(scorecard.negativeMarksDeducted).toBe(0);
  });

  it('computes global timer color-coded thresholds accurately', () => {
    expect(getGlobalTimerTone(5400)).toBe('green'); // 90:00
    expect(getGlobalTimerTone(1801)).toBe('green'); // 30:01
    expect(getGlobalTimerTone(1800)).toBe('amber'); // 30:00
    expect(getGlobalTimerTone(601)).toBe('amber'); // 10:01
    expect(getGlobalTimerTone(600)).toBe('red'); // 10:00
    expect(getGlobalTimerTone(0)).toBe('red'); // 00:00
  });

  it('computes per-question countdown tones and upward overtime state', () => {
    // 0s spent -> 90s remaining (green)
    expect(getQuestionTimerState(0, 90)).toEqual({
      remainingSeconds: 90,
      overtimeSeconds: 0,
      isOvertime: false,
      tone: 'green',
    });

    // 44s spent -> 46s remaining (green)
    expect(getQuestionTimerState(44, 90).tone).toBe('green');

    // 45s spent -> 45s remaining (amber)
    expect(getQuestionTimerState(45, 90).tone).toBe('amber');

    // 74s spent -> 16s remaining (amber)
    expect(getQuestionTimerState(74, 90).tone).toBe('amber');

    // 75s spent -> 15s remaining (red)
    expect(getQuestionTimerState(75, 90).tone).toBe('red');

    // 90s spent -> 0s remaining, not yet overtime
    expect(getQuestionTimerState(90, 90)).toEqual({
      remainingSeconds: 0,
      overtimeSeconds: 0,
      isOvertime: false,
      tone: 'red',
    });

    // 91s spent -> OVERTIME +00:01
    expect(getQuestionTimerState(91, 90)).toEqual({
      remainingSeconds: 0,
      overtimeSeconds: 1,
      isOvertime: true,
      tone: 'red',
    });
  });

  it('formats timers in MM:SS and readable duration', () => {
    expect(formatTimerMMSS(5400)).toBe('90:00');
    expect(formatTimerMMSS(90)).toBe('01:30');
    expect(formatTimerMMSS(5)).toBe('00:05');
    expect(formatTimerMMSS(-10)).toBe('00:00');

    expect(formatDurationReadable(125)).toBe('2m 05s');
    expect(formatDurationReadable(3665)).toBe('1h 01m 05s');
  });

  it('exports RFC-4180 escaped CSV rows including overtime seconds', () => {
    const qWithComma: ExamQuestion[] = [
      {
        number: 1,
        text: 'Select "A", B, or C',
        options: { A: 'One', B: 'Two', C: 'Three', D: 'Four' },
        correctOption: 'A',
        warnings: [],
      },
    ];
    const scorecard = gradeExam(
      qWithComma,
      {
        1: { questionNumber: 1, selectedOption: 'A', status: 'confirmed', timeSpentSeconds: 105 },
      },
      105,
      90
    );
    const csv = buildResultsCsv(scorecard, 'Mock, Test');
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Mock, Test"');
    expect(lines[1]).toContain('"Select ""A"", B, or C"');
    expect(lines[1]).toContain('CORRECT,1,105,15');
  });
});
