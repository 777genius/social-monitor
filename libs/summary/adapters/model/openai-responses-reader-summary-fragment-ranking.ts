import type { SummaryEvidenceItem } from "../../domain";

import { sourceChunks } from "./openai-responses-reader-summary-fragment-chunking";

const maxRelevantFragments = 3;

export const relevantSourceFragments = (
  source: string,
  item: SummaryEvidenceItem,
): readonly string[] => {
  const terms = sourceTerms(`${item.title} ${item.whyImportant.join(" ")}`);
  const chunks = sourceChunks(source);
  return chunks
    .map((text, index) => ({
      text,
      index,
      score: fragmentScore(text, terms, index),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxRelevantFragments)
    .sort((left, right) => left.index - right.index)
    .map((candidate) => candidate.text);
};

const fragmentScore = (
  value: string,
  terms: ReadonlySet<string>,
  index: number,
): number => {
  const tokens = sourceTerms(value);
  let overlap = 0;
  for (const term of tokens) {
    if (terms.has(term)) {
      overlap += 1;
    }
  }
  const qualifierBoost =
    /\b(?:ultra|pro|max|preview|thinking|enterprise|plus)\b/iu.test(value)
      ? 4
      : 0;
  return overlap * 10 + qualifierBoost + 1 / (index + 1);
};

const sourceTerms = (value: string): ReadonlySet<string> =>
  new Set(
    value
      .toLocaleLowerCase("en-US")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/u)
      .filter((part) => part.length >= 3)
      .filter((part) => !sourceStopWords.has(part)),
  );

const sourceStopWords = new Set([
  "and",
  "are",
  "for",
  "from",
  "that",
  "the",
  "this",
  "was",
  "with",
]);

