import type { StoryCluster, SummaryEvidenceSelection } from "../../domain";
import { mapRankedItem } from "./relevance-reader-summary-evidence-support";
import { readerSummaryRankedItemFixture } from
  "./relevance-reader-summary-evidence-test-fixtures";
import { promotionPolicySelection } from
  "./relevance-reader-summary-promotion-candidates";

describe("promotionPolicySelection cross-source cluster identity", () => {
  it("keeps the production Cursor and Claude-watermark source clusters intact", () => {
    const items = [
      evidence("cursor-x", "x-twitter", 2.4, "Cursor deployed at SpaceX"),
      evidence("cursor-reddit", "reddit", 2.2, "SpaceX deploying Cursor"),
      evidence("watermark-x", "x-twitter", 2.3,
        "Anthropic adds Claude Code watermarking"),
      evidence("watermark-hn", "hacker-news", 2.1,
        "Claude Code output contains a watermark"),
      evidence("watermark-reddit", "reddit", 2,
        "Claude watermark found in generated snippets"),
      evidence("cursor-editor-theme", "reddit", 1.9,
        "Cursor editor releases a new color theme"),
    ];
    const base = selection(items, [
      cluster("cursor-production", "cursor-x", ["cursor-reddit"],
        ["x-twitter", "reddit"]),
      cluster("claude-watermark-production", "watermark-x",
        ["watermark-hn", "watermark-reddit"],
        ["x-twitter", "hacker-news", "reddit"]),
      cluster("cursor-theme-control", "cursor-editor-theme", [], ["reddit"]),
    ]);

    const promoted = promotionPolicySelection(base, items);

    expect(promoted.clusters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "cursor-production",
        representativeFeedItemId: "cursor-x",
        duplicateFeedItemIds: ["cursor-reddit"],
        providerKeys: ["reddit", "x-twitter"],
      }),
      expect.objectContaining({
        id: "claude-watermark-production",
        representativeFeedItemId: "watermark-x",
        duplicateFeedItemIds: ["watermark-hn", "watermark-reddit"],
        providerKeys: ["hacker-news", "reddit", "x-twitter"],
      }),
      expect.objectContaining({
        id: "cursor-theme-control",
        duplicateFeedItemIds: [],
      }),
    ]));
    expect(promoted.clusters).toHaveLength(3);
    expect(promotionPolicySelection(base, [...items].reverse()).clusters)
      .toEqual(promoted.clusters);
  });
});

const evidence = (
  id: string,
  providerKey: string,
  score: number,
  title: string,
) => mapRankedItem(readerSummaryRankedItemFixture({
  feedItemId: id,
  providerKey,
  rank: 1,
  score,
  title,
}), new Date("2026-06-24T00:00:00.000Z"));

const cluster = (
  id: string,
  representativeFeedItemId: string,
  duplicateFeedItemIds: readonly string[],
  providerKeys: readonly string[],
): StoryCluster => ({
  id,
  storyKey: id,
  rankingPolicyVersion: "story-ranking.v1",
  representativeFeedItemId,
  duplicateFeedItemIds,
  interestIds: ["interest-ai"],
  providerKeys,
  score: 2,
  observedAtRange: {
    startedAt: new Date("2026-06-23T10:00:00.000Z"),
    endedAt: new Date("2026-06-23T11:00:00.000Z"),
  },
  whyImportant: ["Cross-source production regression"],
});

const selection = (
  items: ReturnType<typeof evidence>[],
  clusters: readonly StoryCluster[],
): SummaryEvidenceSelection => ({
  rankingPolicyVersion: "story-ranking.v1",
  sourceWindow: {
    windowId: "window-production-regression",
    startedAt: new Date("2026-06-23T00:00:00.000Z"),
    endedAt: new Date("2026-06-24T00:00:00.000Z"),
    selectedFeedItemIds: items.map((item) => item.feedItemId),
    storyClusterIds: clusters.map((item) => item.id),
  },
  selectedEvidence: items,
  clusters,
});
