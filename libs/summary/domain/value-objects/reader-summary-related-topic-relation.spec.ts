import {
  ReaderSummaryRelatedTopicRelation,
  stableReaderSummaryRelatedTopicRelationId,
} from "./reader-summary-related-topic-relation";

describe("ReaderSummaryRelatedTopicRelation", () => {
  const props = {
    subjectStoryClusterId: "story:discussion",
    targetStoryClusterId: "story:official",
    subjectFeedItemId: "feed:discussion",
    subjectProviderKey: "Community",
    subjectSourceItemId: "discussion-42",
    subjectCanonicalUrl: "https://community.example/discussions/42",
    subjectProviderMetrics: [{ label: "Replies", value: "12" }],
    officialAnchorFeedItemId: "feed:official",
    officialAnchorProviderKey: "Publisher",
    officialAnchorSourceItemId: "release-7",
    officialAnchorContentQuality: officialQuality(),
  } as const;

  it("normalizes immutable source identity and recomputes a stable id", () => {
    const relation = ReaderSummaryRelatedTopicRelation.create(props).toSnapshot();

    expect(relation).toEqual({
      ...props,
      subjectProviderKey: "community",
      officialAnchorProviderKey: "publisher",
      subjectIsOfficial: false,
      officialAnchorIsOfficial: true,
      relationId:
        "related-topic:v1:community:discussion-42:publisher:release-7",
    });
    expect(Object.isFrozen(relation)).toBe(true);
    expect(Object.isFrozen(relation.subjectProviderMetrics)).toBe(true);
    expect(Object.isFrozen(relation.subjectProviderMetrics[0])).toBe(true);
    expect(stableReaderSummaryRelatedTopicRelationId(relation)).toBe(
      relation.relationId,
    );
  });

  it.each([
    { relationId: "related-topic:v1:forged" },
    { targetStoryClusterId: "story:discussion" },
    { officialAnchorSourceItemId: " " },
    { officialAnchorIsOfficial: "true" },
    { officialAnchorContentQuality: { ...officialQuality(), flags: [] } },
  ])("rejects invalid rehydration %#", (change) => {
    const valid = ReaderSummaryRelatedTopicRelation.create(props).toSnapshot();
    expect(() => ReaderSummaryRelatedTopicRelation.rehydrate({
      ...valid,
      ...change,
    } as unknown as typeof valid)).toThrow();
  });
});

function officialQuality() {
  return {
    qualityScore: 0.9,
    interestRelevanceScore: 0.9,
    engagementIntegrityScore: 0.9,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "promote",
    flags: ["official_account", "trusted_author"],
    reason: "Verified first-party source authority",
  };
}
