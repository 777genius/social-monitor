import {
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  readerSummaryTopicClaimTypes,
} from "../../domain";

/** Static provider-facing taxonomy contract; independent of candidate evidence and retries. */
export const buildAgentRuntimeTopicLabelerTaxonomyConstraints = () => ({
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
});
