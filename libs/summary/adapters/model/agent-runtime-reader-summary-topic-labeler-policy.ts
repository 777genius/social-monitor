import {
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  readerSummaryTopicClaimTypes,
} from "../../domain";
import type {
  ReaderSummaryTopicLabelerInput,
  ReaderSummaryTopicMapAttemptContext,
} from "../../ports";
import { buildGroundedTopicCohortsForCandidates } from "./agent-runtime-reader-summary-topic-grounded-cohorts";

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
    retryFeedback:
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
          },
    constraints: {
      maxLabelWords: 4,
      maxGroups: READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
      minimumNodesPerSemanticGroup: 2,
      ungroupedGroupId: READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
      preserveNodeIds: true,
      sameTopicIdMergesBubble: true,
      requireNodeLabelForEveryInput: true,
      topicIdFormat: "topic:<stable-short-slug>",
      groupIdFormat: "group:<semantic-family-slug>",
      groupPolicy:
        "Choose one global taxonomy first. Prefer broad parent ecosystems or durable domains; never create a group for a single node or a product-specific subgroup when a parent ecosystem is present.",
      semanticAnchorPolicy:
        "Every semantic anchor must be evidence-grounded, shared by at least two assigned nodes, discriminative for this group, and the returned anchors must cover every assigned node. Generic AI/category words alone are insufficient.",
      labelSourcePolicy:
        "Use labelCandidates first; subject and qualifier must be evidence-grounded.",
      labelGrammar:
        "Structured subject plus claimType and optional qualifier; no pronouns, action/reporting verbs, repeated words, or truncated headline syntax.",
      claimTypes: readerSummaryTopicClaimTypes,
      avoidGenericLabels: [
        "The",
        "Why",
        "What",
        "How",
        "Ask",
        "Show",
        "People",
        "Users",
        "Posts",
        "Updates",
        "Discussion",
        "News",
        "Signal",
      ],
    },
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
