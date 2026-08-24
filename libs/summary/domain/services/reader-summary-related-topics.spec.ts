import {
  aug14RelatedTopicSelection,
} from "../../test-fixtures/aug-14-related-topic.fixture";
import {
  buildRelatedTopicCandidates,
  reconcileRelatedTopicVerdicts,
} from "./reader-summary-related-topics";

describe("Aug 14 related topic", () => {
  it("directs the distinct Reddit cluster to the sole official cluster", () => {
    const selection = aug14RelatedTopicSelection();
    const candidates = buildRelatedTopicCandidates({ selection });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      subjectFeedItemId: "aug14-watermark-reddit",
      officialAnchorFeedItemId: "aug14-watermark-official",
      subjectStoryClusterId: "story:aug14-reddit-watermark-question",
      targetStoryClusterId: "story:aug14-anthropic-watermark",
    });
  });

  it("does not open the relation lane for lookalike stories outside the exact case", () => {
    const selection = aug14RelatedTopicSelection();
    const lookalike = {
      ...selection,
      selectedEvidence: selection.selectedEvidence.map((item) =>
        item.feedItemId === "aug14-watermark-reddit"
          ? { ...item, title: "Do generated files contain hidden markers?" }
          : item,
      ),
    };

    expect(buildRelatedTopicCandidates({ selection: lookalike })).toEqual([]);
  });

  it("requires an explicit related_topic verdict and keeps immutable cluster state", () => {
    const selection = aug14RelatedTopicSelection();
    const candidates = buildRelatedTopicCandidates({ selection });
    const before = structuredClone(selection);
    const candidate = candidates[0]!;
    const decide = (relation: "same_story" | "related_topic" | "unrelated") =>
      reconcileRelatedTopicVerdicts({
        candidates,
        evidence: selection.selectedEvidence,
        clusters: selection.clusters,
        decisions: [{
          leftFeedItemId: candidate.leftFeedItemId,
          rightFeedItemId: candidate.rightFeedItemId,
          relation,
          confidenceScore: 0.99,
          rationale: "Explicit fixture verdict.",
        }],
      });

    expect(decide("same_story")).toEqual([]);
    expect(decide("unrelated")).toEqual([]);
    const relations = decide("related_topic");
    expect(relations[0]?.relationId).toBe(
      "related-topic:v1:reddit:reddit-1mt-watermark-code:rss:anthropic-text-watermarking",
    );
    expect(selection).toEqual(before);
  });

  it("is permutation stable and fails closed for zero or two official endpoints", () => {
    const selection = aug14RelatedTopicSelection();
    const reversed = {
      ...selection,
      clusters: [...selection.clusters].reverse(),
      selectedEvidence: [...selection.selectedEvidence].reverse(),
    };
    expect(buildRelatedTopicCandidates({ selection: reversed })).toEqual(
      buildRelatedTopicCandidates({ selection }),
    );
    const withoutAuthority = {
      ...selection,
      selectedEvidence: selection.selectedEvidence.map((item) => ({
        ...item,
        contentQuality: item.contentQuality === undefined ? undefined : {
          ...item.contentQuality,
          flags: [],
        },
      })),
    };
    expect(buildRelatedTopicCandidates({ selection: withoutAuthority })).toEqual([]);
    const twoAuthorities = {
      ...selection,
      selectedEvidence: selection.selectedEvidence.map((item) =>
        item.feedItemId === "aug14-watermark-reddit"
          ? {
              ...item,
              contentQuality: {
                ...item.contentQuality!,
                eligibleForTopRead: true,
                flags: ["official_account", "trusted_author"],
              },
            }
          : item,
      ),
    };
    expect(buildRelatedTopicCandidates({ selection: twoAuthorities })).toEqual([]);
  });
});
