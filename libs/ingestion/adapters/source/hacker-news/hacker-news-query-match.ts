import type { AlgoliaHit } from "./http-hacker-news-client";

const hackerNewsTitlePrefix = /^(Tell HN|Show HN|Ask HN|Launch HN)\s*:\s*/iu;
const wordBoundaryPatternCache = new Map<string, RegExp>();

type QueryMatchContext = {
  readonly queryWords: readonly string[];
  readonly stripTitlePrefixes: boolean;
  readonly minimumPrecisionScore: number;
};

export const selectQueryMatchedHits = (
  hits: readonly AlgoliaHit[],
  query: string,
): readonly AlgoliaHit[] => {
  const context = queryMatchContext(query);
  const scoredHits = hits.map((hit) => ({
    hit,
    precisionScore: algoliaHitPrecisionScore(hit, context),
  }));
  const looseMatches = scoredHits.filter((scored) => scored.precisionScore > 0);

  if (context.queryWords.length === 0) {
    return hits;
  }

  const preciseMatches = looseMatches.filter(
    (scored) => scored.precisionScore >= context.minimumPrecisionScore,
  );

  return (preciseMatches.length === 0 ? looseMatches : preciseMatches).map(
    (scored) => scored.hit,
  );
};

const algoliaHitPrecisionScore = (
  hit: AlgoliaHit,
  context: QueryMatchContext,
): number => {
  const haystack = [
    normalizeTitleForQueryMatch(hit.title, context.stripTitlePrefixes),
    normalizeTitleForQueryMatch(hit.story_title, context.stripTitlePrefixes),
    hit.story_text,
    hit.comment_text,
    hit.url,
  ]
    .flatMap((value) => (value === undefined ? [] : [stripHtml(value)]))
    .join(" ")
    .toLocaleLowerCase("en-US");
  const matchedWords = context.queryWords.filter((word) =>
    queryWordMatches(word, haystack),
  );

  return context.queryWords.length === 0
    ? 1
    : matchedWords.length / context.queryWords.length;
};

const queryMatchContext = (query: string): QueryMatchContext => {
  const words = compactUnique(
    query.toLocaleLowerCase("en-US").split(" ").filter(Boolean),
  );

  if (!words.includes("hn")) {
    return {
      queryWords: words,
      stripTitlePrefixes: true,
      minimumPrecisionScore: minimumPrecisionScore(words),
    };
  }

  const topicWords = words.filter((word) => !hackerNewsPrefixWords.has(word));
  const queryWords = topicWords.length === 0 ? words : topicWords;

  return {
    queryWords,
    stripTitlePrefixes: topicWords.length > 0,
    minimumPrecisionScore: minimumPrecisionScore(queryWords),
  };
};

const compactUnique = (values: readonly string[]): readonly string[] => [
  ...new Set(values),
];

const minimumPrecisionScore = (queryWords: readonly string[]): number =>
  queryWords.length <= 2 ? 1 / Math.max(1, queryWords.length) : 0.4;

const hackerNewsPrefixWords = new Set(["tell", "show", "ask", "launch", "hn"]);

const normalizeTitleForQueryMatch = (
  value: string | undefined,
  stripTitlePrefixes: boolean,
): string | undefined =>
  stripTitlePrefixes ? value?.replace(hackerNewsTitlePrefix, "") : value;

const wordBoundaryPattern = (word: string): RegExp => {
  const cached = wordBoundaryPatternCache.get(word);
  if (cached !== undefined) {
    return cached;
  }

  const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, "iu");
  wordBoundaryPatternCache.set(word, pattern);

  return pattern;
};

const simpleWordPattern = /^[a-z0-9]+$/iu;

const queryWordMatches = (word: string, haystack: string): boolean =>
  simpleWordPattern.test(word)
    ? wordBoundaryPattern(word).test(haystack)
    : haystack.includes(word);

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export const stripHtml = (value: string): string =>
  decodeHtmlEntities(
    value
      .replace(/<p>/giu, "\n")
      .replace(/<br\s*\/?>/giu, "\n")
      .replace(/<[^>]+>/gu, ""),
  ).trim();

const decodeHtmlEntities = (value: string): string =>
  value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/giu,
    (match, entity: string) => {
      const normalizedEntity = entity.toLocaleLowerCase("en-US");
      if (normalizedEntity.startsWith("#x")) {
        return characterFromCodePoint(
          Number.parseInt(normalizedEntity.slice(2), 16),
          match,
        );
      }
      if (normalizedEntity.startsWith("#")) {
        return characterFromCodePoint(
          Number.parseInt(normalizedEntity.slice(1), 10),
          match,
        );
      }

      return namedHtmlEntities[normalizedEntity] ?? match;
    },
  );

const namedHtmlEntities: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const characterFromCodePoint = (
  codePoint: number,
  fallback: string,
): string =>
  Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : fallback;
