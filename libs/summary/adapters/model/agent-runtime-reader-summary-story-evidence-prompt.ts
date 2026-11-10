import type { ReaderSummaryStoryRelationVerifierInput } from "../../ports";

export const evidenceSample = (item: {
  readonly providerKey: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly sourceText?: string;
  readonly authorHandle?: string;
  readonly canonicalUrl: string;
  readonly publishedAt: Date;
}, relevanceTerms: readonly string[] = []): Record<string, unknown> => ({
  providerKey: item.providerKey,
  title: item.title,
  bodyPreview: item.bodyPreview?.slice(0, 640),
  sourceText: boundedRelevantSourceExcerpt(item.sourceText, relevanceTerms),
  authorHandle: item.authorHandle,
  canonicalUrl: item.canonicalUrl,
  publishedAt: item.publishedAt.toISOString(),
});

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

export const requiredEvidence = <T>(
  evidenceById: ReadonlyMap<string, T>,
  feedItemId: string,
): T => {
  const item = evidenceById.get(feedItemId);
  if (item === undefined) {
    throw new Error(`Unknown story relation evidence ${feedItemId}`);
  }
  return item;
};

export const normalizedAuthor = (value: string | undefined): string | undefined => {
  const normalized = value?.trim().toLocaleLowerCase("en-US");
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};
