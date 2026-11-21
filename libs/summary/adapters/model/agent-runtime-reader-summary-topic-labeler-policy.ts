import type {
  ReaderSummaryTopicLabelerInput,
  ReaderSummaryTopicMapAttemptContext,
} from "../../ports";
import { buildGroundedTopicCohortsForCandidates } from "./agent-runtime-reader-summary-topic-grounded-cohorts";
import { projectAgentRuntimeTopicLabelRetryFeedback } from "./agent-runtime-reader-summary-topic-labeler-retry-feedback";
import { buildAgentRuntimeTopicLabelerTaxonomyConstraints } from "./agent-runtime-reader-summary-topic-labeler-taxonomy-policy";

// This is the trusted taxonomy/coverage contract. The prompt adapter owns
// serialization and the separate evidence module owns untrusted node data.
export const buildAgentRuntimeTopicLabelerPromptPolicy = (
  candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][],
  attemptContext?: ReaderSummaryTopicMapAttemptContext,
) => {
  const requiredGroundedCohorts = buildGroundedTopicCohortsForCandidates(
    candidates,
  );

  return {
    retryFeedback: projectAgentRuntimeTopicLabelRetryFeedback(candidates, attemptContext),
    constraints: buildAgentRuntimeTopicLabelerTaxonomyConstraints(),
    requiredGroundedCohorts: {
      minimumGroupedNodeCount: requiredGroundedCohorts.reduce(
        (total, cohort) => total + cohort.nodeIds.length,
        0,
      ),
      instruction:
        "Apply every listed groupId to exactly its nodeIds, preserve a distinct topicId for distinct stories, and copy sharedAnchor into each member's keywords plus the group's semanticAnchors.",
      groups: requiredGroundedCohorts.map((cohort) => ({
        groupId: cohort.groupId,
        label: cohort.label,
        sharedAnchor: cohort.sharedAnchor,
        nodeIds: cohort.nodeIds,
      })),
    },
  };
};
