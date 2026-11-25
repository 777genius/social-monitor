import type { TopRead, TopReadCandidate } from "../entities/top-read";

export type EditoriallyCuratedTopReadCandidate = TopReadCandidate & {
  readonly editoriallyCurated?: true;
};

export const readerSummaryEditorialCurationRule =
  "rule:reader-summary-model-curated";

export const readerSummaryUnverifiedLegalSafetyDemotionRule =
  "rule:reader-summary-unverified-legal-safety-demotion";

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

export const readerSummaryUnverifiedLegalSafetyDemotionRules = (
  builderConfirmed: boolean,
): readonly string[] =>
  builderConfirmed ? [readerSummaryUnverifiedLegalSafetyDemotionRule] : [];

export const withoutReaderSummaryUnverifiedLegalSafetyDemotionRule = (
  matchedRules: readonly string[],
): readonly string[] =>
  matchedRules.filter(
    (rule) => rule !== readerSummaryUnverifiedLegalSafetyDemotionRule,
  );

export const hasReaderSummaryUnverifiedLegalSafetyDemotionRule = (
  matchedRules: readonly string[] | undefined,
): boolean =>
  matchedRules?.includes(readerSummaryUnverifiedLegalSafetyDemotionRule) ===
  true;

const isReaderSummaryEditoriallyCuratedCandidate = (
  candidate: TopReadCandidate,
): boolean =>
  (candidate as EditoriallyCuratedTopReadCandidate).editoriallyCurated === true;

const editorialCurationProviderKeys = new Set(["reddit", "hacker-news"]);
