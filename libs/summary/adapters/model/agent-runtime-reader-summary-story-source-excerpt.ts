import type { ReaderSummaryStoryRelationVerifierInput } from "../../ports";

/** Pure source excerpt projection, independently of trusted feed binding. */
export const relationExcerptTerms = (
  candidate: ReaderSummaryStoryRelationVerifierInput["candidates"][number],
): readonly string[] => [
  ...candidate.sharedSpecificProductTokens,
  ...candidate.sharedEventTokens,
  ...candidate.sharedAnchorTokens,
  ...candidate.sharedTopicTokens,
];

export const boundedRelevantSourceExcerpt = (
  sourceText: string | undefined,
  relevanceTerms: readonly string[],
): string | undefined => {
  if (sourceText === undefined || sourceText.length <= 4_096) return sourceText;
  const headLength = 2_048;
  const tailLength = 2_048;
  const normalized = sourceText.toLocaleLowerCase("en-US");
  const relevantIndex = relevanceTerms
    .map((term) => normalized.indexOf(term.toLocaleLowerCase("en-US"), headLength))
    .filter((index) => index >= headLength)
    .sort((left, right) => left - right)[0];
  const excerptStart = relevantIndex === undefined
    ? sourceText.length - tailLength
    : Math.min(
        Math.max(headLength, relevantIndex - 512),
        sourceText.length - tailLength,
      );
  return `${sourceText.slice(0, headLength)}${sourceText.slice(
    excerptStart,
    excerptStart + tailLength,
  )}`;
};

