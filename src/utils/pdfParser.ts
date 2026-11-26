import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import {
  ExamQuestion,
  OPTION_KEYS,
  OptionKey,
  ParseWarning,
  QuestionTableData,
} from '../types/exam';
import { convertShreeMalToUnicode } from './shreeMalConverter';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

export type OcrLanguageOption = 'mal+eng' | 'eng' | 'mal';
export type DetectedLanguage = 'malayalam' | 'english' | 'bilingual' | 'unknown';
export type PageEncodingKind =
  | 'unicode_or_english'
  | 'shree_mal'
  | 'unsupported_legacy_font'
  | 'scanned';

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
  questionImages?: Record<number, string>;
  questionTables?: Record<number, QuestionTableData>;
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

function countGarbledLegacyChars(text: string): number {
  const cleaned = text.replace(/[–—‘’“”•×÷±°µμ∈√∑∫]/g, '');
  const garbled = cleaned.match(/[\u0080-\u024F\uE000-\uF8EA\uFFFD]/g) ?? [];
  const cidTokens = text.match(/\(cid:\d+\)/g) ?? [];
  return garbled.length + cidTokens.length * 4;
}

export function classifyPageTextEncoding(text: string): PageEncodingKind {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < MIN_DIGITAL_CHARS_PER_PAGE) return 'scanned';

  const unicodeMalCount = (compact.match(/[\u0D00-\u0D7F]/g) ?? []).length;
  const latinExtCount = (compact.match(/[\u0100-\u024F]/g) ?? []).length;
  const garbledCount = countGarbledLegacyChars(compact);
  const garbledRatio = garbledCount / compact.length;

  const midWordSymbols = (
    text.match(/[A-Za-z][\]\[\\^_`{}|~¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿][A-Za-z]/g) ?? []
  ).length;

  if (unicodeMalCount >= 15 && garbledRatio < 0.04) {
    return 'unicode_or_english';
  }

  if (garbledRatio < 0.04 && midWordSymbols < 4 && latinExtCount < 5) {
    return 'unicode_or_english';
  }

  const testSample = text.slice(0, 2000);
  const convertedSample = convertShreeMalToUnicode(testSample);
  const convertedCompact = convertedSample.replace(/\s+/g, '');
  const malAfter = (convertedCompact.match(/[\u0D00-\u0D7F]/g) ?? []).length;
  const remainingGarbled = countGarbledLegacyChars(convertedCompact);

  if (
    malAfter >= 20 &&
    convertedCompact.length > 0 &&
    remainingGarbled / convertedCompact.length < 0.04
  ) {
    return 'shree_mal';
  }

  return 'unsupported_legacy_font';
}

export function isLikelyLegacyNonUnicodeFont(text: string): boolean {
  const kind = classifyPageTextEncoding(text);
  return kind === 'shree_mal' || kind === 'unsupported_legacy_font';
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
    /(?:^|[\n\s])(?:\(A\)|A\))\s+/m.test(digitalText) &&
    /(?:^|[\n\s])(?:\(B\)|B\))\s+/m.test(digitalText);
  const mentionsSeries = /\bA,\s*B,\s*C,\s*D\b|\(A\),\s*\(B\),\s*\(C\),\s*\(D\)/.test(digitalText);
  if (hasOptionMarkers && !mentionsSeries) return false;

  const numberedLines = (digitalText.match(/(?:^|\n)\s*\d{1,2}\.\s+/g) ?? []).length;
  return numberedLines >= 5 && mentionsSeries;
}

export function stripPageHeadersAndFooters(text: string): string {
  return text
    .split('\n')
    .filter((rawLine) => {
      const line = rawLine.trim();
      if (!line) return true;
      if (/^\d{1,4}\/\d{2,4}-[A-Z](?:\s+\d{1,3})?(?:\s+[A-D])?$/i.test(line)) return false;
      if (/^(?:[A-D]\s+)?-\s*\d{1,3}\s*-$/i.test(line)) return false;
      if (/^[A-D]$/.test(line)) return false;
      if (/^\[?P\.?T\.?O\.?\]?$/i.test(line)) return false;
      if (/^space\s+for\s+rough\s+work$/i.test(line)) return false;
      if (/^maximum\s*:\s*\d+\s*marks?$/i.test(line)) return false;
      if (/^time\s*:\s*\d+/i.test(line)) return false;
      return true;
    })
    .join('\n');
}

function cleanOcrMalayalamText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[|¦]/g, ' ')
    .replace(/(^|\n)\s*(\d{1,3})\.(?=[\u0D00-\u0D7FA-Za-z‘'“"])/g, '$1$2. ')
    .replace(/\(\s*([A-Da-d])\s*\)/g, '($1)')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function normalizeOptionKey(raw: string): OptionKey | null {
  const digitsNormalized = normalizeMalayalamDigits(raw).trim();
  const stripped = digitsNormalized.replace(/[().:\-\s]/g, '');

  if (stripped === 'അ' || stripped === 'എ' || stripped === 'ക') return 'A';
  if (stripped === 'ആ' || stripped === 'ബി' || stripped === '8') return 'B';
  if (
    stripped === 'ഇ' ||
    stripped === 'സി' ||
    stripped === '0' ||
    stripped === 'O' ||
    stripped === 'ധ'
  ) {
    return 'C';
  }
  if (stripped === 'ഈ' || stripped === 'ഡി') return 'D';

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
    const val = gray > 220 ? 255 : gray < 140 ? 0 : gray;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }

  ctx.putImageData(imageData, 0, 0);
}

function extractQuestionTablesFromPage(
  rawItems: Array<{ str?: string; transform?: number[]; width?: number }>,
  isLegacyShreeMal: boolean
): Record<number, QuestionTableData> {
  const tables: Record<number, QuestionTableData> = {};

  interface WordItem {
    x: number;
    endX: number;
    y: number;
    text: string;
  }

  interface LineGroup {
    y: number;
    minX: number;
    words: WordItem[];
    fullText: string;
  }

  const lines: LineGroup[] = [];
  for (const item of rawItems) {
    const text = (item.str ?? '').trim();
    if (!text) continue;
    const x = item.transform ? item.transform[4] : 0;
    const y = item.transform ? item.transform[5] : 0;
    const width = item.width ?? text.length * 5;

    let line = lines.find((l) => Math.abs(l.y - y) < 4);
    if (!line) {
      line = { y, minX: x, words: [], fullText: '' };
      lines.push(line);
    }
    line.words.push({ x, endX: x + width, y, text });
    line.minX = Math.min(line.minX, x);
  }

  lines.sort((a, b) => b.y - a.y);
  for (const l of lines) {
    l.words.sort((a, b) => a.x - b.x);
    l.fullText = l.words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
  }

  const formatCell = (raw: string) => {
    const cleaned = raw.replace(/\s+/g, ' ').trim();
    return isLegacyShreeMal ? convertShreeMalToUnicode(cleaned) : cleaned;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const qMatch = lines[i].fullText.match(/^(\d{1,3})\.(?:\s*(.*))?$/);
    if (!qMatch || lines[i].minX > 120) continue;
    const qNum = parseInt(qMatch[1], 10);
    if (Number.isNaN(qNum) || qNum <= 0) continue;

    const regionLines: LineGroup[] = [];
    const firstStemRemainder = (qMatch[2] ?? '').trim();
    if (firstStemRemainder) {
      regionLines.push({
        ...lines[i],
        words: lines[i].words.slice(1),
        fullText: firstStemRemainder,
      });
    }

    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].minX <= 120 && /^\d{1,3}\./.test(lines[j].fullText)) break;
      if (/^(?:\(A\)|A\))/.test(lines[j].fullText)) break;
      regionLines.push(lines[j]);
    }

    const firstRowIdx = regionLines.findIndex((l) => /^(?:i\.|\(i\))\s+/.test(l.fullText));
    if (firstRowIdx === -1) continue;

    const headerIdx = firstRowIdx - 1;
    let headers: string[] = ['Column 1', 'Column 2'];
    let hasHeaderGap = false;
    let splitX = 220;
    let tableStartIdx = firstRowIdx;

    if (headerIdx >= 0) {
      const hWords = regionLines[headerIdx].words;
      let maxGap = 0;
      let splitWordIdx = -1;
      for (let k = 1; k < hWords.length; k += 1) {
        const gap = hWords[k].x - hWords[k - 1].endX;
        if (gap > maxGap) {
          maxGap = gap;
          splitWordIdx = k;
        }
      }
      if (splitWordIdx !== -1 && maxGap >= 25) {
        const leftHeader = hWords
          .slice(0, splitWordIdx)
          .map((w) => w.text)
          .join(' ');
        const rightHeader = hWords
          .slice(splitWordIdx)
          .map((w) => w.text)
          .join(' ');
        headers = [formatCell(leftHeader), formatCell(rightHeader)];
        splitX = Math.min(hWords[splitWordIdx].x - 18, 290);
        tableStartIdx = headerIdx;
        hasHeaderGap = true;
      }
    }

    const bodyLines = regionLines.slice(firstRowIdx);
    let rightColumnMarkerCount = 0;
    let bodyGapSplitX: number | null = null;

    for (const l of bodyLines) {
      const pWord = l.words.find(
        (w) => /^(?:P|Q|R|S|\([a-d]\)|[a-d]\.|[1-4]\.)\.?$/.test(w.text) && w.x >= 180
      );
      if (pWord) {
        rightColumnMarkerCount += 1;
        bodyGapSplitX =
          bodyGapSplitX === null ? pWord.x - 10 : Math.min(bodyGapSplitX, pWord.x - 10);
      } else {
        for (let k = 1; k < l.words.length; k += 1) {
          if (l.words[k].x - l.words[k - 1].endX >= 35 && l.words[k].x >= 180) {
            rightColumnMarkerCount += 1;
            bodyGapSplitX =
              bodyGapSplitX === null
                ? l.words[k].x - 10
                : Math.min(bodyGapSplitX, l.words[k].x - 10);
            break;
          }
        }
      }
    }

    if (!hasHeaderGap && rightColumnMarkerCount < 2) continue;

    if (bodyGapSplitX !== null) {
      splitX = hasHeaderGap ? Math.min(splitX, bodyGapSplitX) : bodyGapSplitX;
    }

    const hasRightColumn = bodyLines.some((l) => l.words.some((w) => w.x >= splitX));
    if (!hasRightColumn) continue;

    const rows: string[][] = [];
    let tableEndIdx = regionLines.length;

    for (let idx = firstRowIdx; idx < regionLines.length; idx += 1) {
      const line = regionLines[idx];
      const isRowStart = /^(?:(?:i|ii|iii|iv|v)\.|\((?:i|ii|iii|iv|v)\))\s+/.test(line.fullText);

      if (!isRowStart && line.minX <= 94 && rows.length >= 2) {
        tableEndIdx = idx;
        break;
      }

      const leftPart = line.words
        .filter((w) => w.x < splitX)
        .map((w) => w.text)
        .join(' ')
        .trim();
      const rightPart = line.words
        .filter((w) => w.x >= splitX)
        .map((w) => w.text)
        .join(' ')
        .trim();

      if (isRowStart) {
        rows.push([formatCell(leftPart), formatCell(rightPart)]);
      } else if (rows.length > 0) {
        const curRow = rows[rows.length - 1];
        if (leftPart) {
          curRow[0] = `${curRow[0]} ${formatCell(leftPart)}`.trim();
        }
        if (rightPart) {
          curRow[1] = `${curRow[1]} ${formatCell(rightPart)}`.trim();
        }
      }
    }

    if (rows.length >= 2) {
      const introRaw = regionLines
        .slice(0, tableStartIdx)
        .map((l) => l.fullText)
        .join(' ')
        .trim();
      const outroRaw = regionLines
        .slice(tableEndIdx)
        .map((l) => l.fullText)
        .join(' ')
        .trim();

      tables[qNum] = {
        headers,
        rows,
        introText: introRaw ? formatCell(introRaw) : undefined,
        outroText: outroRaw ? formatCell(outroRaw) : undefined,
      };
    }
  }

  return tables;
}

async function extractVisualQuestionSnapshots(
  page: pdfjsLib.PDFPageProxy,
  rawItems: Array<{ str?: string; transform?: number[]; width?: number }>,
  includeTables = false
): Promise<Record<number, string>> {
  const snapshots: Record<number, string> = {};
  const viewport1x = page.getViewport({ scale: 1.0 });
  const pageHeight = viewport1x.height;

  const lines: Array<{ y: number; text: string; minX: number }> = [];
  for (const item of rawItems) {
    const str = (item.str ?? '').trim();
    if (!str) continue;
    const x = item.transform ? item.transform[4] : 0;
    const y = item.transform ? item.transform[5] : 0;
    let line = lines.find((l) => Math.abs(l.y - y) < 4);
    if (!line) {
      line = { y, text: str, minX: x };
      lines.push(line);
    } else {
      line.text += ` ${str}`;
      line.minX = Math.min(line.minX, x);
    }
  }
  lines.sort((a, b) => b.y - a.y);

  const qRegions: Array<{
    qNum: number;
    topPdfY: number;
    bottomPdfY: number;
  }> = [];

  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].text.match(/^(\d{1,3})\./);
    if (!m || lines[i].minX > 120) continue;
    const qNum = parseInt(m[1], 10);
    if (Number.isNaN(qNum) || qNum <= 0) continue;

    const topPdfY = lines[i].y + 22;
    let bottomPdfY = Math.max(40, lines[i].y - 100);
    let regionText = lines[i].text;

    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].minX <= 120 && /^\d{1,3}\./.test(lines[j].text)) {
        bottomPdfY = lines[j].y + 14;
        break;
      }
      if (/^(?:\(A\)|A\))/.test(lines[j].text.trim())) {
        bottomPdfY = lines[j].y + 16;
        break;
      }
      regionText += `\n${lines[j].text}`;
      bottomPdfY = lines[j].y - 10;
    }

    const hasStackedMath = /[∑∫√∈μ]/.test(regionText);
    const hasMatchTable =
      includeTables &&
      /(?:^|\n)\s*(?:\(i\)|i\.)\s+/.test(regionText) &&
      /(?:\(a\)|P\.|\bP\b)/.test(regionText);

    if (hasStackedMath || hasMatchTable) {
      qRegions.push({ qNum, topPdfY, bottomPdfY });
    }
  }

  if (qRegions.length === 0) return snapshots;

  const scale = 2.2;
  const viewport = page.getViewport({ scale });
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = Math.ceil(viewport.width);
  fullCanvas.height = Math.ceil(viewport.height);
  const fullCtx = fullCanvas.getContext('2d');
  if (!fullCtx) return snapshots;

  fullCtx.fillStyle = '#ffffff';
  fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
  await page.render({ canvasContext: fullCtx, viewport }).promise;

  for (const reg of qRegions) {
    const cropTopPx = Math.max(0, Math.floor((pageHeight - reg.topPdfY) * scale));
    const cropBottomPx = Math.min(
      fullCanvas.height,
      Math.ceil((pageHeight - reg.bottomPdfY) * scale)
    );
    const cropHeight = cropBottomPx - cropTopPx;
    if (cropHeight < 20) continue;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = fullCanvas.width;
    cropCanvas.height = cropHeight;
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) continue;

    cropCtx.drawImage(
      fullCanvas,
      0,
      cropTopPx,
      fullCanvas.width,
      cropHeight,
      0,
      0,
      fullCanvas.width,
      cropHeight
    );
    snapshots[reg.qNum] = cropCanvas.toDataURL('image/png');
  }

  return snapshots;
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

  const questionImages: Record<number, string> = {};
  const questionTables: Record<number, QuestionTableData> = {};
  const pageResults: Array<{
    pageNum: number;
    text: string;
    needsOcr: boolean;
    reason?: 'scanned' | 'legacy_font' | 'forced';
  }> = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
    if (onProgress) {
      onProgress({
        stage: 'reading',
        currentPage: pageNum,
        totalPages,
        message: `Analyzing page ${pageNum} of ${totalPages}...`,
      });
    }

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const content = await page.getTextContent();
    const rawItems = content.items as Array<{ str?: string; transform?: number[]; width?: number }>;
    const rawDigital = reconstructPageText(rawItems, viewport.width);

    if (!forceOcr) {
      if (isBlankOrRoughWorkPage(rawDigital)) {
        pageResults.push({ pageNum, text: '', needsOcr: false });
        continue;
      }
      if (pageNum <= 2 && isDigitalInstructionsOnlyPage(rawDigital)) {
        pageResults.push({ pageNum, text: '', needsOcr: false });
        continue;
      }

      const encoding = classifyPageTextEncoding(rawDigital);

      if (encoding === 'scanned') {
        pageResults.push({ pageNum, text: '', needsOcr: true, reason: 'scanned' });
      } else if (encoding === 'unsupported_legacy_font') {
        if (typeof document !== 'undefined') {
          const pageSnaps = await extractVisualQuestionSnapshots(page, rawItems, true);
          Object.assign(questionImages, pageSnaps);
        }
        pageResults.push({ pageNum, text: '', needsOcr: true, reason: 'legacy_font' });
      } else {
        const isShreeMal = encoding === 'shree_mal';

        const pageTables = extractQuestionTablesFromPage(rawItems, isShreeMal);
        Object.assign(questionTables, pageTables);

        if (typeof document !== 'undefined') {
          const pageSnaps = await extractVisualQuestionSnapshots(page, rawItems, false);
          Object.assign(questionImages, pageSnaps);
        }

        if (isShreeMal) {
          const cleaned = stripPageHeadersAndFooters(rawDigital);
          const converted = convertShreeMalToUnicode(cleaned);
          pageResults.push({
            pageNum,
            text: converted,
            needsOcr: false,
          });
        } else {
          pageResults.push({
            pageNum,
            text: stripPageHeadersAndFooters(rawDigital),
            needsOcr: false,
          });
        }
      }
    } else {
      if (isBlankOrRoughWorkPage(rawDigital)) {
        pageResults.push({ pageNum, text: '', needsOcr: false });
      } else if (pageNum <= 2 && isDigitalInstructionsOnlyPage(rawDigital)) {
        pageResults.push({ pageNum, text: '', needsOcr: false });
      } else {
        if (typeof document !== 'undefined') {
          const pageSnaps = await extractVisualQuestionSnapshots(page, rawItems, true);
          Object.assign(questionImages, pageSnaps);
        }
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
        if (onProgress) {
          onProgress({
            stage: 'ocr',
            currentPage: i + 1,
            totalPages: pagesNeedingOcr.length,
            message: `Scanning ${langLabel} OCR — page ${entry.pageNum} (${i + 1}/${pagesNeedingOcr.length})...`,
          });
        }

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
        entry.text = cleanOcrMalayalamText(stripPageHeadersAndFooters(data.text));
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
    questionImages,
    questionTables,
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
    .replace(/(?:space\s+for\s+rough\s+work|\[?p\.?t\.?o\.?\]?|please\s+turn\s+over).*/gi, '')
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
    C: ['C', 'c', 'ധ', '0', 'O', '©'],
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
    return new RegExp(`(?:^|\\n|[ \\t]{2,}|\\s)(?:\\((${joined})\\)|(${joined})[).:])\\s*`, 'g');
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
  ocrConfidence?: number,
  questionImages?: Record<number, string>,
  questionTables?: Record<number, QuestionTableData>
): ExamQuestion[] {
  const cleanedRaw = stripPageHeadersAndFooters(normalizeMalayalamDigits(rawText))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!cleanedRaw) return [];

  const questionStartRegex =
    /(?:^|\n)\s*(?:(?:Q(?:uestion)?|ചോദ്യം)\.?\s*)?(\d{1,3})\s*[.):\-](?=\s*[^\d\n])/gi;

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
    if (candidate.number > lastQuestionNum && candidate.number <= lastQuestionNum + 25) {
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
      ocrConfidence,
      questionImages ? questionImages[current.number] : undefined,
      questionTables ? questionTables[current.number] : undefined
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
  ocrConfidence?: number,
  imageDataUrl?: string,
  table?: QuestionTableData
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
      imageDataUrl,
      table,
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

  const missingOptions = OPTION_KEYS.filter((key) => !(options[key] && options[key].trim()));
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
