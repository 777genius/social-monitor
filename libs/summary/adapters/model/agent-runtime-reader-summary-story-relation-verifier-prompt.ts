import type { ReaderSummaryStoryRelationVerifierInput } from "../../ports";
import {
  evidenceSample,
  normalizedAuthor,
  relationExcerptTerms,
  requiredEvidence,
} from "./agent-runtime-reader-summary-story-evidence-prompt";

export {
  agentRuntimeReaderSummaryRelatedTopicVerifierInstructions,
  buildAgentRuntimeReaderSummaryRelatedTopicVerifierPrompt,
  agentRuntimeReaderSummaryRelatedTopicVerifierJsonSchema,
} from "./agent-runtime-reader-summary-related-topic-verifier-prompt";

export {
  agentRuntimeReaderSummaryStoryRelationVerifierInstructions,
  agentRuntimeReaderSummaryIndependentNewsVerifierInstructions,
} from "./agent-runtime-reader-summary-story-relation-instructions";

export const buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt = (
  input: ReaderSummaryStoryRelationVerifierInput,
): string => {
  const evidenceById = new Map(
    input.evidence.map((item) => [item.feedItemId, item] as const),
  );

  return JSON.stringify(
    {
      task: "Verify shortlisted story pairs.",
      period: {
        startedAt: input.period.startedAt.toISOString(),
        endedAt: input.period.endedAt.toISOString(),
      },
      constraints: {
        requireDecisionForEveryPair: true,
        conservativeOnUncertainty: true,
        sharedTermsAreHintsOnly: true,
        distinctPrimaryEventsStaySeparate: true,
        releaseEmphasisAloneDoesNotSplitEvent: true,
        requireReleaseSubjectVersionStageDateConsistency: true,
      },
      pairs: input.candidates.map((candidate) => {
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
      }),
    },
    null,
    2,
  );
};

export { agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema } from "./agent-runtime-reader-summary-story-relation-schema";
