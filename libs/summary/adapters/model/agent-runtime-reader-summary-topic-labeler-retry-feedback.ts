import type {
  ReaderSummaryTopicLabelerInput,
  ReaderSummaryTopicMapAttemptContext,
} from "../../ports";

/**
 * The second-attempt feedback contract is separate from the fixed taxonomy
 * instructions and grounded cohort projection. Never echo provider output.
 */
export const projectAgentRuntimeTopicLabelRetryFeedback = (
  candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][],
  attemptContext?: ReaderSummaryTopicMapAttemptContext,
) =>
  attemptContext?.retryFeedback === undefined
    ? null
    : {
        ...attemptContext.retryFeedback,
        minimumGroupedNodeCount: Math.ceil(
          candidates.length *
            attemptContext.retryFeedback.minimumGroupedCoverage,
        ),
        instruction:
          "The previous map was rejected only for low grouped coverage. Rebuild the global taxonomy, keep distinct stories as distinct topicId values, and group at least the minimum node count when grounded broad domains support it.",
      };
