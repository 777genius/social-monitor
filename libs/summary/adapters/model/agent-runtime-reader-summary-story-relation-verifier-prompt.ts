import type { ReaderSummaryStoryRelationVerifierInput } from "../../ports";
import { buildAgentRuntimeStoryRelationEvidencePairs } from "./agent-runtime-reader-summary-story-evidence-prompt";

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
      pairs: buildAgentRuntimeStoryRelationEvidencePairs(input),
    },
    null,
    2,
  );
};

export { agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema } from "./agent-runtime-reader-summary-story-relation-schema";
