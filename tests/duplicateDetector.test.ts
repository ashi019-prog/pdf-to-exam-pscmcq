import { describe, expect, it } from 'vitest';
import { detectDuplicates, normalizeQuestionText } from '../src/utils/duplicateDetector';
import { IncomingVerifiedQuestion, PooledQuestion } from '../src/types/examHead';

function makePooled(overrides: Partial<PooledQuestion>): PooledQuestion {
  const text = overrides.text ?? 'What is the capital of Kerala?';
  return {
    id: overrides.id ?? 'existing-1',
    poolNumber: overrides.poolNumber ?? 1,
    paperId: overrides.paperId ?? 'paper-1',
    paperLabel: overrides.paperLabel ?? '2023 Prelims Paper 1',
    text,
    normalizedText: normalizeQuestionText(text),
    options: overrides.options ?? { A: 'Kochi', B: 'Thiruvananthapuram', C: 'Kozhikode', D: 'Kollam' },
    correctOption: overrides.correctOption ?? 'B',
    addedAt: '2026-01-01T00:00:00.000Z',
    stats: { timesAttempted: 0, timesCorrect: 0 },
  };
}

function makeIncoming(tempId: string, text: string): IncomingVerifiedQuestion {
  return {
    tempId,
    text,
    options: { A: 'Opt A', B: 'Opt B', C: 'Opt C', D: 'Opt D' },
    correctOption: 'A',
  };
}

describe('duplicateDetector', () => {
  it('flags exact duplicates while ignoring leading question numbers and extra whitespace', () => {
    const existing = [
      makePooled({
        id: 'ex-1',
        poolNumber: 12,
        text: '12. Who wrote the Indian National Anthem?',
      }),
    ];
    const incoming = [makeIncoming('inc-1', 'Q45)   who wrote the indian national anthem?  ')];

    const matches = detectDuplicates(incoming, existing);
    expect(matches['inc-1']).toBeDefined();
    expect(matches['inc-1'].matchType).toBe('exact');
    expect(matches['inc-1'].similarityScore).toBe(1.0);
    expect(matches['inc-1'].matchedExistingQuestion.poolNumber).toBe(12);
  });

  it('flags near-duplicates caused by minor OCR typos (>= 0.85 similarity)', () => {
    const existing = [
      makePooled({
        id: 'ex-2',
        poolNumber: 4,
        text: 'Which constitutional amendment removed the Right to Property from Fundamental Rights?',
      }),
    ];
    const incoming = [
      makeIncoming(
        'inc-2',
        'Which constitutional amendment removed the Right to Propery from Fundamental Rights?'
      ),
    ];

    const matches = detectDuplicates(incoming, existing);
    expect(matches['inc-2']).toBeDefined();
    expect(matches['inc-2'].matchType).toBe('near-duplicate');
    expect(matches['inc-2'].similarityScore).toBeGreaterThanOrEqual(0.85);
  });

  it('preserves numeric digits and math symbols so different math problems are NOT flagged', () => {
    const existing = [
      makePooled({
        id: 'ex-math',
        poolNumber: 74,
        text: 'Find 15% of 200.',
      }),
    ];
    const incoming = [makeIncoming('inc-math', 'Find 25% of 200.')];

    const matches = detectDuplicates(incoming, existing);
    expect(matches['inc-math']).toBeUndefined();
  });

  it('detects intra-batch duplicates when the same PDF repeats a question internally', () => {
    const incoming = [
      makeIncoming('inc-a', '1. Which gas causes global warming?'),
      makeIncoming('inc-b', '25. Which gas causes global warming?'),
    ];

    const matches = detectDuplicates(incoming, []);
    expect(matches['inc-a']).toBeUndefined();
    expect(matches['inc-b']).toBeDefined();
    expect(matches['inc-b'].matchType).toBe('intra-batch');
    expect(matches['inc-b'].similarityScore).toBe(1.0);
  });
});
