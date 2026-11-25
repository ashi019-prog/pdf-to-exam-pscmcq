import { describe, it, expect } from 'vitest';
import {
  mergeQuestionsWithAnswerKey,
  normalizeOptionKey,
  parseAnswerKeyFromText,
  parseQuestionsFromText,
  reconstructPageText,
} from '../src/utils/pdfParser';

describe('pdfParser utilities', () => {
  it('normalizes alphabetic and numeric option keys', () => {
    expect(normalizeOptionKey('a')).toBe('A');
    expect(normalizeOptionKey('(B)')).toBe('B');
    expect(normalizeOptionKey('3')).toBe('C');
    expect(normalizeOptionKey('4)')).toBe('D');
    expect(normalizeOptionKey('E')).toBeNull();
  });

  it('preserves math symbols and line breaks in multi-line question stems', () => {
    const mathPaper = `
      1. Solve for x:
      2x² − 7x + 3 = 0
      Given √(Δ) ≥ 0 and θ = 30°
      (A) x = 1/2, 3
      (B) x = −1/2, 3
      (C) x = π ± 1
      (D) x = 2 × 3 ÷ 2
    `;

    const questions = parseQuestionsFromText(mathPaper);
    expect(questions).toHaveLength(1);
    expect(questions[0].text).toContain('2x² − 7x + 3 = 0');
    expect(questions[0].text).toContain('√(Δ) ≥ 0');
    expect(questions[0].text).toContain('\n');
    expect(questions[0].options.C).toBe('x = π ± 1');
    expect(questions[0].options.D).toBe('x = 2 × 3 ÷ 2');
  });

  it('parses questions with numeric 1-4 options and normalizes them to A-D', () => {
    const samplePaper = `
      Q1. What is 5 × 6?
      (1) 25
      (2) 30
      (3) 35
      (4) 40
    `;

    const questions = parseQuestionsFromText(samplePaper);
    expect(questions).toHaveLength(1);
    expect(questions[0].options).toEqual({
      A: '25',
      B: '30',
      C: '35',
      D: '40',
    });
  });

  it('sorts two-column PDF pages left column first then right column', () => {
    const pageWidth = 600;
    const leftCol = Array.from({ length: 8 }, (_, idx) => ({
      str: `L${idx + 1}`,
      transform: [1, 0, 0, 1, 50, 700 - idx * 20],
      width: 40,
    }));
    const rightCol = Array.from({ length: 8 }, (_, idx) => ({
      str: `R${idx + 1}`,
      transform: [1, 0, 0, 1, 350, 700 - idx * 20],
      width: 40,
    }));

    const text = reconstructPageText([...rightCol, ...leftCol], pageWidth);
    const lines = text.split('\n');
    expect(lines[0]).toBe('L1');
    expect(lines[7]).toBe('L8');
    expect(lines[8]).toBe('R1');
    expect(lines[15]).toBe('R8');
  });

  it('flags missing options and low OCR confidence warnings', () => {
    const incompletePaper = `
      1. Incomplete question stem?
      (A) First choice
      (B) Second choice
    `;

    const questions = parseQuestionsFromText(incompletePaper, 60);
    expect(questions).toHaveLength(1);
    const warningTypes = questions[0].warnings.map((w) => w.type);
    expect(warningTypes).toContain('missing_option');
    expect(warningTypes).toContain('unmatched_answer_key');
    expect(warningTypes).toContain('low_ocr_confidence');
  });

  it('parses answer keys from list, multi-column, and grid table formats', () => {
    const listKey = `
      1. B
      2) C
      Q3 - A
      4: (D)
      5. 2
    `;
    expect(parseAnswerKeyFromText(listKey)).toEqual({
      1: 'B',
      2: 'C',
      3: 'A',
      4: 'D',
      5: 'B',
    });

    const gridKey = `
      1 A   2 B   3 C   4 D
      5 D   6 C   7 B   8 A
    `;
    expect(parseAnswerKeyFromText(gridKey)).toEqual({
      1: 'A',
      2: 'B',
      3: 'C',
      4: 'D',
      5: 'D',
      6: 'C',
      7: 'B',
      8: 'A',
    });
  });

  it('merges parsed questions with answer keys and clears unmatched warnings', () => {
    const paper = `
      1. Sample Q1?
      (A) Opt 1
      (B) Opt 2
      (C) Opt 3
      (D) Opt 4
    `;
    const questions = parseQuestionsFromText(paper);
    expect(questions[0].warnings.some((w) => w.type === 'unmatched_answer_key')).toBe(true);

    const merged = mergeQuestionsWithAnswerKey(questions, { 1: 'C' });
    expect(merged[0].correctOption).toBe('C');
    expect(merged[0].warnings).toHaveLength(0);
  });
});
