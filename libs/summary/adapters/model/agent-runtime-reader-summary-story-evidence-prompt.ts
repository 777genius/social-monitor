import type { ReaderSummaryStoryRelationVerifierInput } from "../../ports";
import { boundedRelevantSourceExcerpt, relationExcerptTerms } from "./agent-runtime-reader-summary-story-source-excerpt";

export { boundedRelevantSourceExcerpt, relationExcerptTerms } from "./agent-runtime-reader-summary-story-source-excerpt";

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

/** Bind each candidate only to its explicitly selected feed evidence.
 * Missing identities fail closed before the model receives a prompt.
 * Prompt metadata and output schema remain owned by the story verifier.
 */
export const buildAgentRuntimeStoryRelationEvidencePairs = (
  input: Pick<ReaderSummaryStoryRelationVerifierInput, "candidates" | "evidence">,
) => {
  const evidenceById = new Map(
    input.evidence.map((item) => [item.feedItemId, item] as const),
  );
  return input.candidates.map((candidate) => {
        const left = requiredEvidence(evidenceById, candidate.leftFeedItemId);
        const right = requiredEvidence(evidenceById, candidate.rightFeedItemId);

        return {
          leftFeedItemId: candidate.leftFeedItemId,
          rightFeedItemId: candidate.rightFeedItemId,
          retrievalSignals: {
            sameProvider: left.providerKey === right.providerKey,
            sameAuthor:
              normalizedAuthor(left.authorHandle) !== undefined &&
              normalizedAuthor(left.authorHandle) ===
                normalizedAuthor(right.authorHandle),
            sharedTopicTokens: candidate.sharedTopicTokens,
            sharedAnchorTokens: candidate.sharedAnchorTokens,
            sharedEventTokens: candidate.sharedEventTokens,
            sharedSpecificProductTokens: candidate.sharedSpecificProductTokens,
            topicSimilarity: candidate.topicSimilarity,
          },
          left: evidenceSample(left, relationExcerptTerms(candidate)),
          right: evidenceSample(right, relationExcerptTerms(candidate)),
        };
      });
};
