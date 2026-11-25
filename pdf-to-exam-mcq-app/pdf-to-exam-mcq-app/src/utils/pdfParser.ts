import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createWorker } from 'tesseract.js';
import { ExamQuestion, OPTION_KEYS, OptionKey, ParseWarning } from '../types/exam';

// Bundle PDF.js worker locally via Vite's ?url asset import (GitHub Pages safe, zero CDN)
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface PdfExtractionProgress {
  stage: 'reading' | 'ocr' | 'parsing';
  currentPage: number;
  totalPages: number;
  message: string;
}

export interface PdfTextExtractionResult {
  text: string;
  pageCount: number;
  usedOcr: boolean;
  averageOcrConfidence?: number;
}

export interface PositionedTextItem {
  str: string;
  x: number;
  y: number;
  width?: number;
}

const MIN_DIGITAL_CHARS_PER_PAGE = 40;
const LOW_OCR_CONFIDENCE_THRESHOLD = 72;

/**
 * Normalizes option labels: A/B/C/D or 1/2/3/4 -> OptionKey ('A' | 'B' | 'C' | 'D').
 */
export function normalizeOptionKey(raw: string): OptionKey | null {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-D1-4]/g, '');
  switch (cleaned) {
    case 'A':
    case '1':
      return 'A';
    case 'B':
    case '2':
      return 'B';
    case 'C':
    case '3':
      return 'C';
    case 'D':
    case '4':
      return 'D';
    default:
      return null;
  }
}

function sortColumnLines(items: PositionedTextItem[]): string {
  const lines: Array<{ y: number; parts: Array<{ x: number; text: string }> }> = [];

  for (const item of items) {
    if (!item.str.trim()) continue;
    let line = lines.find((l) => Math.abs(l.y - item.y) < 4);
    if (!line) {
      line = { y: item.y, parts: [] };
      lines.push(line);
    }
    line.parts.push({ x: item.x, text: item.str });
  }

  // Sort top-to-bottom (higher y first in PDF coordinate space)
  lines.sort((a, b) => b.y - a.y);

  return lines
    .map((line) =>
      line.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.text)
        .join(' ')
        .replace(/[ \t]+/g, ' ')
        .trim()
    )
    .join('\n');
}

/**
 * Reconstructs reading-order text from positioned PDF.js items, handling both
 * single-column and two-column exam layouts while preserving line breaks & math symbols.
 */
export function reconstructPageText(
  items: Array<{ str?: string; transform?: number[]; width?: number }>,
  pageWidth = 612
): string {
  const positioned: PositionedTextItem[] = [];
  for (const item of items) {
    const str = item.str ?? '';
    if (!str.trim()) continue;
    const x = item.transform ? item.transform[4] : 0;
    const y = item.transform ? item.transform[5] : 0;
    positioned.push({ str, x, y, width: item.width ?? 0 });
  }

  if (positioned.length === 0) return '';

  // Detect two-column layout: substantial text on both sides of the midpoint with minimal center crossing
  const midX = pageWidth / 2;
  const gutterHalf = pageWidth * 0.04;
  const leftItems: PositionedTextItem[] = [];
  const rightItems: PositionedTextItem[] = [];
  let crossingCount = 0;

  for (const item of positioned) {
    const itemEnd = item.x + (item.width ?? 0);
    if (item.x < midX - gutterHalf && itemEnd > midX + gutterHalf) {
      crossingCount += 1;
    }
    if (item.x < midX) {
      leftItems.push(item);
    } else {
      rightItems.push(item);
    }
  }

  const isTwoColumn =
    leftItems.length >= 8 &&
    rightItems.length >= 8 &&
    crossingCount <= Math.max(2, positioned.length * 0.05);

  if (isTwoColumn) {
    const leftText = sortColumnLines(leftItems);
    const rightText = sortColumnLines(rightItems);
    return `${leftText}\n${rightText}`.trim();
  }

  return sortColumnLines(positioned);
}

/**
 * Extracts text from a PDF file in the browser using pdfjs-dist, automatically
 * falling back to client-side Tesseract.js OCR (at 2.5x canvas scale) for scanned PDFs.
 */
export async function extractTextFromPdf(
  file: File,
  onProgress?: (progress: PdfExtractionProgress) => void
): Promise<PdfTextExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const digitalPages: string[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
    onProgress?.({
      stage: 'reading',
      currentPage: pageNum,
      totalPages,
      message: `Reading page ${pageNum} of ${totalPages}...`,
    });
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const content = await page.getTextContent();
    const pageText = reconstructPageText(
      content.items as Array<{ str?: string; transform?: number[]; width?: number }>,
      viewport.width
    );
    digitalPages.push(pageText);
  }

  const combinedDigital = digitalPages.join('\n').trim();
  const avgCharsPerPage = totalPages > 0 ? combinedDigital.length / totalPages : 0;

  if (avgCharsPerPage >= MIN_DIGITAL_CHARS_PER_PAGE) {
    return {
      text: combinedDigital,
      pageCount: totalPages,
      usedOcr: false,
    };
  }

  // Fallback to client-side OCR via Tesseract.js WebAssembly
  const worker = await createWorker('eng');
  const ocrPages: string[] = [];
  const confidences: number[] = [];

  try {
    for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
      onProgress?.({
        stage: 'ocr',
        currentPage: pageNum,
        totalPages,
        message: `Scanning page ${pageNum} of ${totalPages}...`,
      });

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Could not initialize 2D canvas context for OCR.');
      }

      await page.render({ canvasContext: ctx, viewport }).promise;
      const { data } = await worker.recognize(canvas);
      ocrPages.push(data.text);
      if (typeof data.confidence === 'number') {
        confidences.push(data.confidence);
      }
    }
  } finally {
    await worker.terminate();
  }

  const averageOcrConfidence =
    confidences.length > 0
      ? Math.round(confidences.reduce((sum, c) => sum + c, 0) / confidences.length)
      : undefined;

  return {
    text: ocrPages.join('\n').trim(),
    pageCount: totalPages,
    usedOcr: true,
    averageOcrConfidence,
  };
}

/**
 * Cleans multi-line text while preserving intentional line breaks and Unicode math symbols
 * (√, π, ², ³, ≤, ≥, ≠, ±, ×, ÷, θ, α, β, Δ, ∑, ∫).
 */
function cleanPreservingMathLines(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && arr[idx - 1].length > 0))
    .join('\n')
    .trim();
}

/**
 * Parses extracted question paper text into structured ExamQuestion objects.
 * Supports question formats: "1.", "1)", "Q1.", "Q.1", "Question 1:"
 * Supports option formats: "(A)", "A)", "A.", "(1)", "1)", "1."
 */
export function parseQuestionsFromText(
  rawText: string,
  ocrConfidence?: number
): ExamQuestion[] {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const questionStartRegex =
    /(?:^|\n)\s*(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.):\-]\s+/gi;

  interface RawBlock {
    number: number;
    startIndex: number;
    contentStart: number;
  }

  const matches: RawBlock[] = [];
  let match: RegExpExecArray | null;

  while ((match = questionStartRegex.exec(normalized)) !== null) {
    const num = parseInt(match[1], 10);
    if (Number.isNaN(num) || num <= 0) continue;

    // Avoid mistaking numeric options (1) (2) (3) (4) inside a question for new questions
    const last = matches[matches.length - 1];
    if (last && num <= 4 && last.number >= num) {
      continue;
    }

    matches.push({
      number: num,
      startIndex: match.index,
      contentStart: match.index + match[0].length,
    });
  }

  if (matches.length === 0) return [];

  const questions: ExamQuestion[] = [];

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const blockBody = normalized
      .slice(current.contentStart, next ? next.startIndex : normalized.length)
      .trim();

    questions.push(parseQuestionBlock(current.number, blockBody, ocrConfidence));
  }

  return questions;
}

function parseQuestionBlock(
  questionNumber: number,
  blockBody: string,
  ocrConfidence?: number
): ExamQuestion {
  const options: Record<OptionKey, string> = { A: '', B: '', C: '', D: '' };

  const alphaOptionRegex = /(?:^|[\n\s])(?:\(([A-Da-d])\)|([A-Da-d])[).:])\s+/g;
  const numericOptionRegex = /(?:^|\n)\s*(?:\(([1-4])\)|([1-4])[).:])\s+/g;

  const extractOptionMatches = (regex: RegExp) => {
    const found: Array<{ key: OptionKey; matchIndex: number; valueStart: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(blockBody)) !== null) {
      const label = m[1] || m[2];
      const key = normalizeOptionKey(label);
      if (!key) continue;
      if (found.some((f) => f.key === key)) continue;
      found.push({
        key,
        matchIndex: m.index,
        valueStart: m.index + m[0].length,
      });
    }
    return found;
  };

  let optionMatches = extractOptionMatches(alphaOptionRegex);
  if (optionMatches.length < 2) {
    const numMatches = extractOptionMatches(numericOptionRegex);
    if (numMatches.length >= 2) {
      optionMatches = numMatches;
    }
  }

  let questionText = blockBody;

  if (optionMatches.length > 0) {
    questionText = cleanPreservingMathLines(blockBody.slice(0, optionMatches[0].matchIndex));

    for (let i = 0; i < optionMatches.length; i += 1) {
      const cur = optionMatches[i];
      const nxt = optionMatches[i + 1];
      const val = blockBody
        .slice(cur.valueStart, nxt ? nxt.matchIndex : blockBody.length)
        .replace(/[ \t]+/g, ' ')
        .replace(/\n+/g, ' ')
        .trim();
      options[cur.key] = val;
    }
  } else {
    questionText = cleanPreservingMathLines(blockBody);
  }

  const warnings = computeQuestionWarnings(questionText, options, null, ocrConfidence);

  return {
    number: questionNumber,
    text: questionText,
    options,
    correctOption: null,
    warnings,
    ocrConfidence,
  };
}

/**
 * Computes parsing warnings for a question (missing options, unmatched key, low OCR confidence).
 */
export function computeQuestionWarnings(
  text: string,
  options: Record<OptionKey, string>,
  correctOption: OptionKey | null,
  ocrConfidence?: number
): ParseWarning[] {
  const warnings: ParseWarning[] = [];

  if (!text.trim()) {
    warnings.push({
      type: 'empty_question_text',
      message: 'Question text is empty.',
    });
  }

  const missingOptions = OPTION_KEYS.filter((key) => !options[key]?.trim());
  if (missingOptions.length > 0) {
    warnings.push({
      type: 'missing_option',
      message: `Missing option${missingOptions.length > 1 ? 's' : ''}: ${missingOptions.join(', ')}`,
    });
  }

  if (correctOption === null) {
    warnings.push({
      type: 'unmatched_answer_key',
      message: 'No matched answer key for this question.',
    });
  }

  if (typeof ocrConfidence === 'number' && ocrConfidence < LOW_OCR_CONFIDENCE_THRESHOLD) {
    warnings.push({
      type: 'low_ocr_confidence',
      message: `Low OCR confidence (${ocrConfidence}%). Please verify math & text.`,
    });
  }

  return warnings;
}

/**
 * Parses an answer key from lists, multi-column layouts, or grid tables.
 */
export function parseAnswerKeyFromText(rawText: string): Record<number, OptionKey> {
  const keyMap: Record<number, OptionKey> = {};
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const explicitPairRegex =
    /(?:^|[\s|,;])(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.):\-–—=]\s*\(?([A-Da-d1-4])\)?(?=$|[\s|,;.)])/gi;

  let match: RegExpExecArray | null;
  while ((match = explicitPairRegex.exec(normalized)) !== null) {
    const qNum = parseInt(match[1], 10);
    const opt = normalizeOptionKey(match[2]);
    if (!Number.isNaN(qNum) && qNum > 0 && opt) {
      keyMap[qNum] = opt;
    }
  }

  if (Object.keys(keyMap).length === 0) {
    const gridPairRegex = /(?:^|[\s|,;])(\d{1,3})\s+\(?([A-Da-d])\)?(?=$|[\s|,;])/g;
    while ((match = gridPairRegex.exec(normalized)) !== null) {
      const qNum = parseInt(match[1], 10);
      const opt = normalizeOptionKey(match[2]);
      if (!Number.isNaN(qNum) && qNum > 0 && opt) {
        keyMap[qNum] = opt;
      }
    }
  }

  return keyMap;
}

/**
 * Merges parsed questions with an answer key mapping and recalculates warnings.
 */
export function mergeQuestionsWithAnswerKey(
  questions: ExamQuestion[],
  answerKey: Record<number, OptionKey>
): ExamQuestion[] {
  return questions.map((q) => {
    const matched = answerKey[q.number] ?? q.correctOption ?? null;
    return {
      ...q,
      correctOption: matched,
      warnings: computeQuestionWarnings(q.text, q.options, matched, q.ocrConfidence),
    };
  });
}
