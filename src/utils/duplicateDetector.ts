import { DuplicateMatch, IncomingVerifiedQuestion, PooledQuestion } from '../types/examHead';

const NEAR_DUPLICATE_THRESHOLD = 0.85;

export function normalizeQuestionText(text: string): string {
  return text
    .replace(/^\s*(?:(?:Q(?:uestion)?|ചോദ്യം)\.?\s*)?\d{1,4}\s*[.):\-–—]\s*/i, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}+\-=×÷√²³π%/\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMathSignature(normalizedText: string): string {
  const tokens = normalizedText.match(/(?:\d+(?:\.\d+)?%?|[+\-=×÷√²³π/])/g) ?? [];
  return tokens.join('|');
}

function buildBigrams(str: string): Map<string, number> {
  const map = new Map<string, number>();
  const compact = str.replace(/\s+/g, ' ');
  for (let i = 0; i < compact.length - 1; i += 1) {
    const bg = compact.slice(i, i + 2);
    map.set(bg, (map.get(bg) ?? 0) + 1);
  }
  return map;
}

function diceBigramSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length < 2 || b.length < 2) return 0.0;

  const bigramsA = buildBigrams(a);
  const bigramsB = buildBigrams(b);

  let intersection = 0;
  bigramsA.forEach((countA, bg) => {
    const countB = bigramsB.get(bg) ?? 0;
    if (countB > 0) {
      intersection += Math.min(countA, countB);
    }
  });

  const totalA = a.length - 1;
  const totalB = b.length - 1;
  return (2 * intersection) / (totalA + totalB);
}

function tokenOverlapSimilarity(a: string, b: string): number {
  const tokensA = a.split(' ').filter((t) => t.length > 0);
  const tokensB = b.split(' ').filter((t) => t.length > 0);
  if (tokensA.length === 0 || tokensB.length === 0) return 0.0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let shared = 0;
  setA.forEach((tok) => {
    if (setB.has(tok)) shared += 1;
  });

  return (2 * shared) / (setA.size + setB.size);
}

export function computeQuestionSimilarity(normalizedA: string, normalizedB: string): number {
  if (!normalizedA || !normalizedB) return 0.0;
  if (normalizedA === normalizedB) return 1.0;

  const mathA = extractMathSignature(normalizedA);
  const mathB = extractMathSignature(normalizedB);
  if (mathA && mathB && mathA !== mathB) {
    return 0.0;
  }

  const bigramScore = diceBigramSimilarity(normalizedA, normalizedB);
  const tokenScore = tokenOverlapSimilarity(normalizedA, normalizedB);
  return Math.round((bigramScore * 0.65 + tokenScore * 0.35) * 1000) / 1000;
}

export function detectDuplicates(
  incomingQuestions: IncomingVerifiedQuestion[],
  existingQuestions: PooledQuestion[]
): Record<string, DuplicateMatch> {
  const matches: Record<string, DuplicateMatch> = {};

  const existingExactMap = new Map<string, PooledQuestion>();
  const existingPrepared = existingQuestions.map((q) => {
    const norm = q.normalizedText || normalizeQuestionText(q.text);
    if (norm && !existingExactMap.has(norm)) {
      existingExactMap.set(norm, q);
    }
    return { q, norm };
  });

  const seenIncomingMap = new Map<string, { q: IncomingVerifiedQuestion; index: number }>();

  for (let i = 0; i < incomingQuestions.length; i += 1) {
    const incoming = incomingQuestions[i];
    const norm = normalizeQuestionText(incoming.text);
    if (!norm) continue;

    const exactExisting = existingExactMap.get(norm);
    if (exactExisting) {
      matches[incoming.tempId] = {
        incomingTempId: incoming.tempId,
        matchType: 'exact',
        similarityScore: 1.0,
        matchedExistingQuestion: {
          id: exactExisting.id,
          poolNumber: exactExisting.poolNumber,
          paperLabel: exactExisting.paperLabel,
          text: exactExisting.text,
          correctOption: exactExisting.correctOption,
        },
      };
      continue;
    }

    const intraMatch = seenIncomingMap.get(norm);
    if (intraMatch) {
      matches[incoming.tempId] = {
        incomingTempId: incoming.tempId,
        matchType: 'intra-batch',
        similarityScore: 1.0,
        matchedExistingQuestion: {
          id: intraMatch.q.tempId,
          poolNumber: intraMatch.index + 1,
          paperLabel: 'Current Upload (Duplicate in Same Paper)',
          text: intraMatch.q.text,
          correctOption: intraMatch.q.correctOption ?? 'A',
        },
      };
      continue;
    }

    let bestExisting: { q: PooledQuestion; score: number } | null = null;
    for (const item of existingPrepared) {
      if (!item.norm) continue;
      const lenRatio =
        Math.min(norm.length, item.norm.length) / Math.max(norm.length, item.norm.length);
      if (lenRatio < 0.65) continue;

      const score = computeQuestionSimilarity(norm, item.norm);
      if (score >= NEAR_DUPLICATE_THRESHOLD && (!bestExisting || score > bestExisting.score)) {
        bestExisting = { q: item.q, score };
      }
    }

    if (bestExisting) {
      matches[incoming.tempId] = {
        incomingTempId: incoming.tempId,
        matchType: 'near-duplicate',
        similarityScore: bestExisting.score,
        matchedExistingQuestion: {
          id: bestExisting.q.id,
          poolNumber: bestExisting.q.poolNumber,
          paperLabel: bestExisting.q.paperLabel,
          text: bestExisting.q.text,
          correctOption: bestExisting.q.correctOption,
        },
      };
    } else {
      seenIncomingMap.set(norm, { q: incoming, index: i });
    }
  }

  return matches;
}
