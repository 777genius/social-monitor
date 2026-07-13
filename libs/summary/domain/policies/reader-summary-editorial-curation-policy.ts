import type { TopRead, TopReadCandidate } from "../entities/top-read";

export type EditoriallyCuratedTopReadCandidate = TopReadCandidate & {
  readonly editoriallyCurated?: true;
};

export const readerSummaryEditorialCurationRule =
  "rule:reader-summary-model-curated";

export const withReaderSummaryEditorialCuration = (
  candidate: TopReadCandidate,
  editoriallyCurated: boolean,
): EditoriallyCuratedTopReadCandidate =>
  editoriallyCurated ? { ...candidate, editoriallyCurated: true } : candidate;

export const readerSummaryEditorialCurationRules = (
  candidate: TopReadCandidate,
): readonly string[] =>
  isReaderSummaryEditoriallyCuratedCandidate(candidate) &&
  candidate.providerKeys.some((providerKey) =>
    editorialCurationProviderKeys.has(providerKey),
  )
    ? [readerSummaryEditorialCurationRule]
    : [];

export const hasReaderSummaryEditorialCurationRule = (
  matchedRules: Pick<TopRead, "matchedRules">["matchedRules"],
): boolean => matchedRules.includes(readerSummaryEditorialCurationRule);

const isReaderSummaryEditoriallyCuratedCandidate = (
  candidate: TopReadCandidate,
): boolean =>
  (candidate as EditoriallyCuratedTopReadCandidate).editoriallyCurated === true;

const editorialCurationProviderKeys = new Set(["reddit", "hacker-news"]);
