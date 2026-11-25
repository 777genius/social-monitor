import { READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS, READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID, readerSummaryTopicClaimTypes } from "../../domain";
import { buildAgentRuntimeTopicLabelerTaxonomyConstraints } from "./agent-runtime-reader-summary-topic-labeler-taxonomy-policy";
import { buildAgentRuntimeTopicLabelerPromptPolicy } from "./agent-runtime-reader-summary-topic-labeler-policy";

describe("topic-label taxonomy instruction ownership", () => {
  it("keeps the exact closed vocabulary, taxonomy IDs and original field order", () => {
    const constraints = buildAgentRuntimeTopicLabelerTaxonomyConstraints();
    expect(Object.keys(constraints)).toEqual([
      "maxLabelWords", "maxGroups", "minimumNodesPerSemanticGroup", "ungroupedGroupId",
      "preserveNodeIds", "sameTopicIdMergesBubble", "requireNodeLabelForEveryInput",
      "topicIdFormat", "groupIdFormat", "groupPolicy", "semanticAnchorPolicy",
      "labelSourcePolicy", "labelGrammar", "claimTypes", "avoidGenericLabels",
    ]);
    expect(constraints.maxLabelWords).toBe(4);
    expect(constraints.maxGroups).toBe(READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS);
    expect(constraints.ungroupedGroupId).toBe(READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID);
    expect(constraints.claimTypes).toBe(readerSummaryTopicClaimTypes);
    expect(constraints.avoidGenericLabels).toEqual([
      "The", "Why", "What", "How", "Ask", "Show", "People", "Users",
      "Posts", "Updates", "Discussion", "News", "Signal",
    ]);
    expect(constraints.groupPolicy).toBe(
      "Choose one global taxonomy first. Prefer broad parent ecosystems or durable domains; never create a group for a single node or a product-specific subgroup when a parent ecosystem is present.",
    );
    expect(constraints.semanticAnchorPolicy).toBe(
      "Every semantic anchor must be evidence-grounded, shared by at least two assigned nodes, discriminative for this group, and the returned anchors must cover every assigned node. Generic AI/category words alone are insufficient.",
    );
  });

  it("keeps taxonomy independent of runtime feedback and freshly materializes mutable arrays", () => {
    const a = buildAgentRuntimeTopicLabelerTaxonomyConstraints();
    const b = buildAgentRuntimeTopicLabelerTaxonomyConstraints();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.avoidGenericLabels).not.toBe(b.avoidGenericLabels);
    expect(buildAgentRuntimeTopicLabelerPromptPolicy([]).constraints).toEqual(a);
    expect(JSON.stringify(buildAgentRuntimeTopicLabelerPromptPolicy([]).constraints)).toBe(JSON.stringify(a));
  });
});
