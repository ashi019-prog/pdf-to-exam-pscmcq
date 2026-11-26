import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { ExamQuestion, OPTION_KEYS, OptionKey, ParseWarning } from '../types/exam';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

export type OcrLanguageOption = 'mal+eng' | 'eng' | 'mal';
export type DetectedLanguage = 'malayalam' | 'english' | 'bilingual' | 'unknown';

export interface PdfExtractionProgress {
  stage: 'reading' | 'ocr' | 'parsing';
  currentPage: number;
  totalPages: number;
  message: string;
}

export interface PdfExtractionOptions {
  ocrLanguage?: OcrLanguageOption;
  forceOcr?: boolean;
}

export interface PdfTextExtractionResult {
  text: string;
  pageCount: number;
  usedOcr: boolean;
  detectedLanguage: DetectedLanguage;
  ocrReason?: 'scanned' | 'legacy_font' | 'forced';
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

const MALAYALAM_DIGIT_MAP: Record<string, string> = {
  '൦': '0',
  '൧': '1',
  '൨': '2',
  '൩': '3',
  '൪': '4',
  '൫': '5',
  '൬': '6',
  '൭': '7',
  '൮': '8',
  '൯': '9',
};

const INSTRUCTION_PATTERNS: RegExp[] = [
  /instructions?\s+to\s+candidates?/i,
  /read\s+the\s+following\s+instructions/i,
  /question\s+booklet\s+(?:code|series|contains)/i,
  /register\s+number/i,
  /omr\s+answer\s+sheet/i,
  /ball\s*point\s*pen/i,
  /space\s+for\s+rough\s+work/i,
  /നിർദ്ദേശങ്ങൾ/,
  /ഉദ്യോഗാർത്ഥികൾക്കുള്ള\s+നിർദ്ദേശങ്ങൾ/,
  /ചോദ്യപുസ്തക\s+അക്ഷരകോഡ്/,
  /രജിസ്റ്റർ\s+നമ്പർ/,
  /ഒ\.?എം\.?ആർ/,
];

export function normalizeMalayalamDigits(text: string): string {
  return text.replace(/[൦-൯]/g, (ch) => MALAYALAM_DIGIT_MAP[ch] ?? ch);
}

export function detectTextLanguage(text: string): DetectedLanguage {
  const malayalamMatches = text.match(/[\u0D00-\u0D7F]/g) ?? [];
  const englishMatches = text.match(/[A-Za-z]/g) ?? [];
  const malCount = malayalamMatches.length;
  const engCount = englishMatches.length;

  if (malCount === 0 && engCount === 0) return 'unknown';
  if (malCount >= 10 && engCount >= 20) return 'bilingual';
  if (malCount >= 10) return 'malayalam';
  if (engCount > 0) return 'english';
  return 'unknown';
}

export function isLikelyLegacyNonUnicodeFont(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 30) return false;

  const unicodeMalayalamCount = (compact.match(/[\u0D00-\u0D7F]/g) ?? []).length;
  if (unicodeMalayalamCount >= 15) return false;

  const suspiciousChars = (
    compact.match(/[\u0080-\u00FF\uFFFD\uE000-\uF8FF]/g) ?? []
  ).length;
  if (suspiciousChars / compact.length >= 0.06) return true;

  const midWordSymbols = (
    text.match(/[A-Za-z][\]\[\\^_`{}|~¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿][A-Za-z]/g) ?? []
  ).length;
  if (midWordSymbols >= 4) return true;

  return false;
}

function isBlankOrRoughWorkPage(digitalText: string): boolean {
  const stripped = stripPageHeadersAndFooters(digitalText)
    .replace(/space\s+for\s+rough\s+work/gi, '')
    .trim();
  return stripped.length < 15 && digitalText.trim().length > 0;
}

function isDigitalInstructionsOnlyPage(digitalText: string): boolean {
  if (digitalText.length < 200) return false;
  const hasOptionMarkers =
    /(?:^|[\n\s])A\)\s+/m.test(digitalText) && /(?:^|[\n\s])B\)\s+/m.test(digitalText);
  if (hasOptionMarkers) return false;

  const numberedLines = (digitalText.match(/(?:^|\n)\s*\d{1,2}\.\s+/g) ?? []).length;
  const mentionsSeries = /\bA,\s*B,\s*C,\s*D\b|\(A\),\s*\(B\),\s*\(C\),\s*\(D\)/.test(digitalText);
  return numberedLines >= 5 && mentionsSeries;
}

export function stripPageHeadersAndFooters(text: string): string {
  return text
    .split('\n')
    .filter((rawLine) => {
      const line = rawLine.trim();
      if (!line) return true;
      if (/^\d{1,4}\/\d{2,4}-[A-Z]$/i.test(line)) return false;
      if (/^(?:[A-D]\s+)?-\s*\d{1,3}\s*-$/i.test(line)) return false;
      if (/^[A-D]$/.test(line)) return false;
      if (/^space\s+for\s+rough\s+work$/i.test(line)) return false;
      return true;
    })
    .join('\n');
}

export function normalizeOptionKey(raw: string): OptionKey | null {
  const digitsNormalized = normalizeMalayalamDigits(raw).trim();
  const stripped = digitsNormalized.replace(/[().:\-\s]/g, '');

  if (stripped === 'അ' || stripped === 'എ' || stripped === 'ക') return 'A';
  if (stripped === 'ആ' || stripped === 'ബി' || stripped === '8') return 'B';
  if (stripped === 'ഇ' || stripped === 'സി') return 'C';
  if (stripped === 'ഈ' || stripped === 'ഡി' || stripped === '0' || stripped === 'O') return 'D';

  const cleaned = stripped.toUpperCase().replace(/[^A-D1-4]/g, '');
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

function preprocessCanvasForOcr(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const val = gray > 215 ? 255 : gray < 135 ? 0 : gray;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }

  ctx.putImageData(imageData, 0, 0);
}

export async function extractTextFromPdf(
  file: File,
  onProgress?: (progress: PdfExtractionProgress) => void,
  options: PdfExtractionOptions = {}
): Promise<PdfTextExtractionResult> {
  const ocrLanguage: OcrLanguageOption = options.ocrLanguage ?? 'mal+eng';
  const forceOcr = options.forceOcr ?? false;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const pageResults: Array<{
    pageNum: number;
    text: string;
    needsOcr: boolean;
    reason?: 'scanned' | 'legacy_font' | 'forced';
  }> = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
    onProgress?.({
      stage: 'reading',
      currentPage: pageNum,
      totalPages,
      message: `Analyzing page ${pageNum} of ${totalPages}...`,
    });

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const content = await page.getTextContent();
    const rawDigital = reconstructPageText(
      content.items as Array<{ str?: string; transform?: number[]; width?: number }>,
      viewport.width
    );

    if (!forceOcr) {
      if (isBlankOrRoughWorkPage(rawDigital)) {
        pageResults.push({ pageNum, text: '', needsOcr: false });
        continue;
      }
      if (pageNum <= 2 && isDigitalInstructionsOnlyPage(rawDigital)) {
        pageResults.push({ pageNum, text: '', needsOcr: false });
        continue;
      }

      if (rawDigital.trim().length < MIN_DIGITAL_CHARS_PER_PAGE) {
        pageResults.push({ pageNum, text: '', needsOcr: true, reason: 'scanned' });
      } else if (isLikelyLegacyNonUnicodeFont(rawDigital)) {
        pageResults.push({ pageNum, text: '', needsOcr: true, reason: 'legacy_font' });
      } else {
        pageResults.push({
          pageNum,
          text: stripPageHeadersAndFooters(rawDigital),
          needsOcr: false,
        });
      }
    } else {
      if (isBlankOrRoughWorkPage(rawDigital)) {
        pageResults.push({ pageNum, text: '', needsOcr: false });
      } else {
        pageResults.push({ pageNum, text: '', needsOcr: true, reason: 'forced' });
      }
    }
  }

  const pagesNeedingOcr = pageResults.filter((p) => p.needsOcr);
  let usedOcr = false;
  let ocrReason: 'scanned' | 'legacy_font' | 'forced' | undefined;
  const confidences: number[] = [];

  if (pagesNeedingOcr.length > 0) {
    usedOcr = true;
    ocrReason = pagesNeedingOcr[0].reason;

    const langLabel =
      ocrLanguage === 'mal+eng'
        ? 'Malayalam + English'
        : ocrLanguage === 'mal'
        ? 'Malayalam'
        : 'English';

    const worker = await createWorker(ocrLanguage);

    try {
      for (let i = 0; i < pagesNeedingOcr.length; i += 1) {
        const entry = pagesNeedingOcr[i];
        onProgress?.({
          stage: 'ocr',
          currentPage: i + 1,
          totalPages: pagesNeedingOcr.length,
          message: `Scanning ${langLabel} OCR — page ${entry.pageNum} (${i + 1}/${pagesNeedingOcr.length})...`,
        });

        const page = await pdf.getPage(entry.pageNum);
        const viewport = page.getViewport({ scale: 3.0 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Could not initialize 2D canvas context for OCR.');
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;
        preprocessCanvasForOcr(canvas);

        const { data } = await worker.recognize(canvas);
        entry.text = stripPageHeadersAndFooters(data.text);
        if (typeof data.confidence === 'number') {
          confidences.push(data.confidence);
        }
      }
    } finally {
      await worker.terminate();
    }
  }

  const finalText = pageResults
    .map((p) => p.text)
    .filter((t) => t.trim().length > 0)
    .join('\n')
    .trim();

  const averageOcrConfidence =
    confidences.length > 0
      ? Math.round(confidences.reduce((sum, c) => sum + c, 0) / confidences.length)
      : undefined;

  return {
    text: finalText,
    pageCount: totalPages,
    usedOcr,
    detectedLanguage: detectTextLanguage(finalText),
    ocrReason,
    averageOcrConfidence,
  };
}

function cleanPreservingMathLines(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && arr[idx - 1].length > 0))
    .join('\n')
    .trim();
}

function stripBoilerplateFooter(text: string): string {
  return text
    .replace(/(?:space\s+for\s+rough\s+work|p\.?t\.?o\.?|please\s+turn\s+over).*/gi, '')
    .trim();
}

function looksLikeInstructionBlock(body: string, matchedOptionCount: number): boolean {
  if (matchedOptionCount >= 2) return false;
  if (INSTRUCTION_PATTERNS.some((rx) => rx.test(body))) return true;
  return matchedOptionCount === 0;
}

interface SequentialOptionMatch {
  key: OptionKey;
  matchIndex: number;
  valueStart: number;
}

const OPTION_LABEL_SETS: Array<Record<OptionKey, string[]>> = [
  {
    A: ['A', 'a', 'ക', '4', 'Ä'],
    B: ['B', 'b', '8', 'ß'],
    C: ['C', 'c', '©'],
    D: ['D', 'd', '0', 'O'],
  },
  {
    A: ['അ', 'എ'],
    B: ['ആ', 'ബി'],
    C: ['ഇ', 'സി'],
    D: ['ഈ', 'ഡി'],
  },
  {
    A: ['1'],
    B: ['2'],
    C: ['3'],
    D: ['4'],
  },
];

function findSequentialOptions(blockBody: string): SequentialOptionMatch[] {
  const buildRegex = (alts: string[]) => {
    const joined = alts.join('|');
    return new RegExp(`(?:^|\\n|[ \\t]{2,}|\\s)(?:\\((${joined})\\)|(${joined})[).:])\\s+`, 'g');
  };

  for (const labelSet of OPTION_LABEL_SETS) {
    const found: SequentialOptionMatch[] = [];
    let cursor = 0;

    for (const key of OPTION_KEYS) {
      const primaryChars = [labelSet[key][0], ...(labelSet[key][1] ? [labelSet[key][1]] : [])];
      const allChars = labelSet[key];

      const searchWith = (chars: string[]) => {
        const rx = buildRegex(chars);
        let m: RegExpExecArray | null;
        while ((m = rx.exec(blockBody)) !== null) {
          const full = m[0];
          const leadingWs = full.length - full.trimStart().length;
          const markerStart = m.index + leadingWs;
          if (markerStart < cursor) continue;
          return {
            matchIndex: markerStart,
            valueStart: m.index + full.length,
          };
        }
        return null;
      };

      let best = searchWith(primaryChars);
      if (!best && allChars.length > primaryChars.length) {
        best = searchWith(allChars);
      }

      if (best) {
        found.push({
          key,
          matchIndex: best.matchIndex,
          valueStart: best.valueStart,
        });
        cursor = best.valueStart;
      }
    }

    if (found.length >= 2) {
      return found;
    }
  }

  return [];
}

export function parseQuestionsFromText(
  rawText: string,
  ocrConfidence?: number
): ExamQuestion[] {
  const cleanedRaw = stripPageHeadersAndFooters(normalizeMalayalamDigits(rawText))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!cleanedRaw) return [];

  const questionStartRegex =
    /(?:^|\n)\s*(?:(?:Q(?:uestion)?|ചോദ്യം)\.?\s*)?(\d{1,3})\s*[.):\-]\s+/gi;

  interface RawMarker {
    number: number;
    startIndex: number;
    contentStart: number;
  }

  const allMarkers: RawMarker[] = [];
  let match: RegExpExecArray | null;

  while ((match = questionStartRegex.exec(cleanedRaw)) !== null) {
    const num = parseInt(match[1], 10);
    if (Number.isNaN(num) || num <= 0 || num > 300) continue;

    allMarkers.push({
      number: num,
      startIndex: match.index,
      contentStart: match.index + match[0].length,
    });
  }

  if (allMarkers.length === 0) return [];

  let firstMcqMarkerIdx = -1;
  for (let i = 0; i < allMarkers.length; i += 1) {
    const cur = allMarkers[i];
    const nxt = allMarkers[i + 1];
    const snippet = cleanedRaw.slice(cur.contentStart, nxt ? nxt.startIndex : cleanedRaw.length);
    if (findSequentialOptions(snippet).length >= 2) {
      firstMcqMarkerIdx = i;
      break;
    }
  }

  if (firstMcqMarkerIdx === -1) {
    firstMcqMarkerIdx = 0;
  }

  const questionMarkers: RawMarker[] = [allMarkers[firstMcqMarkerIdx]];
  let lastQuestionNum = allMarkers[firstMcqMarkerIdx].number;

  for (let i = firstMcqMarkerIdx + 1; i < allMarkers.length; i += 1) {
    const candidate = allMarkers[i];
    if (candidate.number > lastQuestionNum && candidate.number <= lastQuestionNum + 10) {
      questionMarkers.push(candidate);
      lastQuestionNum = candidate.number;
    }
  }

  const results: ExamQuestion[] = [];

  for (let i = 0; i < questionMarkers.length; i += 1) {
    const current = questionMarkers[i];
    const next = questionMarkers[i + 1];
    const blockBody = cleanedRaw
      .slice(current.contentStart, next ? next.startIndex : cleanedRaw.length)
      .trim();

    const { question, optionCount } = parseQuestionBlock(
      current.number,
      blockBody,
      ocrConfidence
    );

    if (looksLikeInstructionBlock(blockBody, optionCount) && results.length === 0) {
      continue;
    }

    results.push(question);
  }

  return results;
}

function parseQuestionBlock(
  questionNumber: number,
  blockBody: string,
  ocrConfidence?: number
): { question: ExamQuestion; optionCount: number } {
  const options: Record<OptionKey, string> = { A: '', B: '', C: '', D: '' };
  const optionMatches = findSequentialOptions(blockBody);

  let questionText = blockBody;

  if (optionMatches.length > 0) {
    questionText = cleanPreservingMathLines(blockBody.slice(0, optionMatches[0].matchIndex));

    for (let i = 0; i < optionMatches.length; i += 1) {
      const cur = optionMatches[i];
      const nxt = optionMatches[i + 1];
      let val = blockBody
        .slice(cur.valueStart, nxt ? nxt.matchIndex : blockBody.length)
        .replace(/[ \t]+/g, ' ')
        .replace(/\n+/g, ' ')
        .trim();
      if (i === optionMatches.length - 1) {
        val = stripBoilerplateFooter(val);
      }
      options[cur.key] = val;
    }
  } else {
    questionText = cleanPreservingMathLines(blockBody);
  }

  const warnings = computeQuestionWarnings(questionText, options, null, ocrConfidence);

  return {
    question: {
      number: questionNumber,
      text: questionText,
      options,
      correctOption: null,
      warnings,
      ocrConfidence,
    },
    optionCount: optionMatches.length,
  };
}

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
      message: `Low OCR confidence (${ocrConfidence}%). Please verify text carefully.`,
    });
  }

  return warnings;
}

export function parseAnswerKeyFromText(rawText: string): Record<number, OptionKey> {
  const keyMap: Record<number, OptionKey> = {};
  const normalized = normalizeMalayalamDigits(rawText)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const explicitPairRegex =
    /(?:^|[\s|,;])(?:(?:Q(?:uestion)?|ചോദ്യം)\.?\s*)?(\d{1,3})\s*[.):\-–—=]\s*\(?([A-Da-d1-4]|അ|ആ|ഇ|ഈ|എ|ബി|സി|ഡി)\)?(?=$|[\s|,;.)])/gi;

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
