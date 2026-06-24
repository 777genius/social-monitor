import { createHash } from 'node:crypto';

const stopWords = new Set([
  'about',
  'after',
  'again',
  'against',
  'also',
  'because',
  'been',
  'before',
  'being',
  'between',
  'could',
  'from',
  'have',
  'into',
  'more',
  'most',
  'other',
  'over',
  'should',
  'such',
  'than',
  'that',
  'their',
  'there',
  'these',
  'they',
  'this',
  'through',
  'under',
  'were',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
]);

export const normalizeArticleText = (value: string, maxCharacters: number): string => {
  const text = value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();

  return text.length > maxCharacters ? text.slice(0, maxCharacters).trim() : text;
};

export const articleContentHash = (text: string): string =>
  createHash('sha256').update(normalizeForHashing(text)).digest('hex');

export const semanticFingerprintForArticle = (title: string | undefined, text: string): string => {
  const tokens = tokenize(`${title ?? ''} ${text}`).slice(0, 1024);
  const weights = new Map<string, number>();

  for (const token of tokens) {
    weights.set(token, (weights.get(token) ?? 0) + 1);
  }

  const vector = Array.from({ length: 64 }, () => 0);
  for (const [token, weight] of weights) {
    const bits = BigInt(`0x${createHash('sha256').update(token).digest('hex').slice(0, 16)}`);
    for (let index = 0; index < 64; index += 1) {
      const bit = (bits >> BigInt(index)) & 1n;
      vector[index] = (vector[index] ?? 0) + (bit === 1n ? weight : -weight);
    }
  }

  let fingerprint = 0n;
  for (let index = 0; index < vector.length; index += 1) {
    if ((vector[index] ?? 0) >= 0) {
      fingerprint |= 1n << BigInt(index);
    }
  }

  return fingerprint.toString(16).padStart(16, '0');
};

export const countWords = (text: string): number => tokenize(text).length;

const normalizeForHashing = (text: string): string =>
  text
    .toLocaleLowerCase('en-US')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (text: string): string[] =>
  normalizeForHashing(text)
    .split(' ')
    .filter((token) => token.length >= 3 && !stopWords.has(token));
