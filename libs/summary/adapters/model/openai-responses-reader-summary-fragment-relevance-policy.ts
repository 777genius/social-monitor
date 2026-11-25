/** Provider-local lexical token and qualifier scoring. Selection, bounding and
 * original-order ranking remain with the fragment-ranking coordinator. */
export const fragmentScore = (
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

export const sourceTerms = (value: string): ReadonlySet<string> =>
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
