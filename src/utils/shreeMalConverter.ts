const BASE_MAP: Record<string, string> = {
  A: 'അ',
  B: 'ആ',
  C: 'ഇ',
  D: 'ഉ',
  E: 'ഊ',
  F: 'ഋ',
  G: 'എ',
  H: 'ഏ',
  I: 'എ',
  J: 'ഏ',
  K: 'ഒ',
  L: 'ാ',
  M: 'ി',
  N: '്ര',
  O: 'ു',
  P: 'ൂ',
  Q: 'ൃ',
  R: 'െ',
  S: 'േ',
  T: 'ൗ',
  U: 'ം',
  V: '്',
  W: 'ക',
  X: 'ഖ',
  Y: 'ഗ',
  Z: 'ഘ',
  a: 'ട',
  b: 'ഠ',
  c: 'ഡ',
  d: 'ഢ',
  e: 'ണ',
  f: 'ത',
  g: 'ഥ',
  h: 'ദ',
  i: 'ധ',
  j: 'ന',
  k: 'പ',
  l: 'ഫ',
  m: 'ബ',
  n: 'ഭ',
  o: 'മ',
  p: 'യ',
  q: 'ര',
  r: 'റ',
  s: 'ല',
  t: 'ള',
  u: 'ഴ',
  v: 'വ',
  w: 'ശ',
  x: 'ഷ',
  y: 'സ',
  z: 'ഹ',
  ']': 'ി',
  '}': 'ീ',
  '^': 'ജ',
  '_': 'ഞ',
  '¡': 'ർ',
  '¢': 'ൻ',
  '£': 'ന്റ',
  '¤': 'ൽ',
  '¥': 'ൾ',
  '¦': 'ൺ',
  '¨': 'ക്ക',
  '©': 'ക്ത',
  '«': 'ഗ്ഗ',
  '°': 'ങ്ങ',
  '²': 'ജ്ജ',
  '³': 'ജ്ഞ',
  'µ': 'ഞ്ച',
  'μ': 'ഞ്ച',
  '¹': 'ണ്ണ',
  'º': 'ണ്ട',
  '¼': 'ണ്ഡ',
  '½': 'ന്റ',
  '¾': 'ത്ത',
  'À': 'ത്ഥ',
  'Ã': 'ത്സ',
  'Ä': 'ത്മ',
  'Å': '്ത',
  'Æ': 'ത്ര',
  'Ç': 'ദ്ധ',
  'È': 'ദ്ധ',
  'Ë': 'ങ്ക',
  'Ì': 'ന്ധ',
  'Í': 'ന്ത',
  'Î': 'ന്ദ്ര',
  'Ð': 'ന്ന',
  'Ò': 'മ്പ',
  'Ó': 'മ്മ',
  'Õ': 'പ്പ',
  '×': 'പ',
  'Ø': 'സ്ക',
  'Ú': 'മ്മ',
  'Ü': '്മ',
  'Ý': 'ഞ',
  'Þ': 'ച',
  'à': 'ക്ക',
  'á': 'യ്യ',
  'ã': 'റ്റ',
  'æ': 'ല്ല',
  'ç': 'ള്ള',
  'è': 'വ്വ',
  'é': 'ശ്ച',
  'ê': 'ശ്ശ',
  'ì': 'ഷ്ട',
  'î': 'ഞ്ഞ',
  'ð': 'സ്റ്റ',
  'ñ': 'സ്ഥ',
  'ò': 'സ്ഥ',
  'ô': 'സ്സ',
  'õ': 'സ്പ',
  'ÿ': '്ച',
  'Ÿ': 'ട്ട',
  'ƒ': 'ക്ഷ',
  '|': '്യ',
  '~': '്വ',
  '‚': 'ഞ്ഞ',
  '›': 'ക്ട',
  '&': '-',
};

const ENGLISH_KEEP_WORDS = new Set([
  'UPI',
  'RBI',
  'SEBI',
  'NPCI',
  'TRAI',
  'LAN',
  'WAN',
  'MAN',
  'PAN',
  'UMANG',
  'DISHA',
  'BNS',
  'OMR',
  'G20',
  'PDF',
  'OCR',
  'mmHg',
  'g',
  'kg',
  'cm',
  'm',
  'km',
  'and',
  'or',
  'of',
  'in',
  'to',
  'for',
  'with',
  'the',
  'is',
  'are',
  'Hub',
  'Switch',
  'Gateway',
  'Media',
  'Ramsar',
  'Site',
  'Aditya-L1',
  'Narration',
  'Indian',
  'Post',
  'Office',
  'Act',
  'Unified',
  'Payments',
  'Interface',
  'Mobile',
  'Application',
  'New-age',
  'Governance',
  'Universal',
  'Management',
  'National',
  'Access',
  'New',
  'Network',
  'Government',
]);

function isExplicitNonMalayalamToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) return true;
  if (/[\u0D00-\u0D7F]/.test(trimmed)) return true;
  if (/^[\d.,:;!?()[\]{}+\-*/%=<>°'"`–—_]+$/.test(trimmed)) return true;
  if (/^\(?[A-Da-d][).:]$/.test(trimmed)) return true;
  if (/^(?:i|ii|iii|iv|v)\.?$/i.test(trimmed)) return true;
  if (/^[P-S]\.?$/.test(trimmed)) return true;
  if (/^[xXyYnN]$/.test(trimmed)) return true;
  if (/^\d+(?:\.\d+)?%?$/.test(trimmed)) return true;
  if (/^\d+°C$/i.test(trimmed)) return true;

  const bare = trimmed.replace(/^[("'«]+|[)"'».,:;!?]+$/g, '');
  if (ENGLISH_KEEP_WORDS.has(bare)) return true;
  if (/^\([A-Za-z0-9\- ]+\)$/.test(trimmed)) return true;

  return false;
}

export function isShreeMalToken(token: string): boolean {
  const trimmed = token.trim();
  if (isExplicitNonMalayalamToken(trimmed)) return false;

  if (/[\u0080-\u00FF\u0152-\u017E\u0192\u03BC\u2018-\u203A]/.test(trimmed)) return true;
  if (/[\[\]|~^}]/.test(trimmed)) return true;
  if (/[a-z][A-Z]/.test(trimmed) && /[LMOQRSVW]/.test(trimmed)) return true;
  if (/^[A-Za-z]{2,}V[.,?]?$/.test(trimmed)) return true;
  if (
    /^(?:INf|Zj|Z\.|Ry\.|o\}\.|yopU|KqO|JfV|BqV|CfV|AfV|CT|DU|Bp]|B|oOÒV|k]Ð]¤|j]ÐV|fLRu|oOWt]¤)[.,?]?$/.test(
      trimmed
    )
  ) {
    return true;
  }

  return false;
}

export function isShreeMalText(text: string): boolean {
  if (!text || /[\u0D00-\u0D7F]{5,}/.test(text)) return false;
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const flagged = tokens.filter((t) => isShreeMalToken(t)).length;
  return flagged >= 2 || (tokens.length <= 3 && flagged >= 1);
}

function convertSingleShreeMalWord(word: string): string {
  const s = word
    .replace(/R£/g, 'ന്റെ')
    .replace(/Þÿ/g, 'ച്ച')
    .replace(/sæ/g, 'ല്ല')
    .replace(/vÿ/g, 'വ്വ')
    .replace(/pÅ/g, 'യ്ത')
    .replace(/W¥/g, 'കൾ')
    .replace(/°¥/g, 'ങ്ങൾ');

  const out: string[] = [];
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (/[\u0D00-\u0D7F]/.test(ch)) {
      out.push(ch);
      i += 1;
      continue;
    }

    if (ch === 'R' && s[i + 1] === 'R') {
      i += 2;
      let base = '';
      if (s[i] === 'N' && i + 1 < s.length) {
        i += 1;
        base = (BASE_MAP[s[i]] ?? s[i]) + '്ര';
        i += 1;
      } else if (i < s.length) {
        base = BASE_MAP[s[i]] ?? s[i];
        i += 1;
      }
      while (i < s.length && (s[i] === '|' || s[i] === '~' || s[i] === 'ÿ')) {
        base += BASE_MAP[s[i]] ?? s[i];
        i += 1;
      }
      out.push(base + 'ൈ');
      continue;
    }

    if ((ch === 'R' || ch === 'S') && i + 1 < s.length) {
      let vowel = BASE_MAP[ch];
      i += 1;
      let base = '';
      if (s[i] === 'N' && i + 1 < s.length) {
        i += 1;
        base = (BASE_MAP[s[i]] ?? s[i]) + '്ര';
        i += 1;
      } else if (i < s.length) {
        base = BASE_MAP[s[i]] ?? s[i];
        i += 1;
      }
      while (i < s.length && (s[i] === '|' || s[i] === '~' || s[i] === 'ÿ')) {
        base += BASE_MAP[s[i]] ?? s[i];
        i += 1;
      }
      if (i < s.length && s[i] === 'L') {
        vowel = vowel === 'െ' ? 'ൊ' : 'ോ';
        i += 1;
      }
      out.push(base + vowel);
      continue;
    }

    if (ch === 'N' && i + 1 < s.length) {
      i += 1;
      const base = BASE_MAP[s[i]] ?? s[i];
      i += 1;
      out.push(base + '്ര');
      continue;
    }

    if (ch === 'D' && s[i + 1] === 'T') {
      out.push('ഊ');
      i += 2;
      continue;
    }
    if (ch === 'K' && s[i + 1] === 'T') {
      out.push('ഔ');
      i += 2;
      continue;
    }
    if (ch === 'K' && s[i + 1] === 'L') {
      out.push('ഓ');
      i += 2;
      continue;
    }
    if (ch === 'I' && s[i + 1] === 'L') {
      out.push('ഐ');
      i += 2;
      continue;
    }

    out.push(BASE_MAP[ch] ?? ch);
    i += 1;
  }

  return out.join('');
}

export function convertShreeMalToUnicode(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const tokens = line.split(/\s+/).filter(Boolean);
      const shreeCount = tokens.filter((t) => isShreeMalToken(t)).length;
      const isMalayalamLine = shreeCount >= 1;

      return line
        .split(/(\s+)/)
        .map((segment) => {
          if (!segment || /^\s+$/.test(segment)) return segment;
          if (isExplicitNonMalayalamToken(segment)) return segment;
          if (isShreeMalToken(segment)) {
            return convertSingleShreeMalWord(segment);
          }
          if (isMalayalamLine) {
            const bare = segment.replace(/^[("'«]+|[)"'».,:;!?]+$/g, '');
            const looksLikeEnglishWord =
              /^[A-Z][a-z]{3,}$/.test(bare) || /^[a-z]{4,}$/.test(bare);
            if (!looksLikeEnglishWord) {
              return convertSingleShreeMalWord(segment);
            }
          }
          return segment;
        })
        .join('');
    })
    .join('\n');
}

export function autoFixMalayalamPaste(pastedText: string): string {
  if (isShreeMalText(pastedText)) {
    return convertShreeMalToUnicode(pastedText);
  }
  return pastedText;
}
