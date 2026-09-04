import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import { ok, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { NOOP_STORY_RANKING_METRICS } from "../../ports";
import { authoritativeReaderSummaryProviderMetadata } from
  "../../test-fixtures/reader-summary-authoritative-provider-metadata.fixture";
import { RelevanceReaderSummaryEvidenceSelector } from
  "./relevance-reader-summary-evidence.selector";

const now = new Date("2026-07-11T12:00:00.000Z");
const period = {
  cadence: "daily" as const,
  startedAt: new Date("2026-07-11T00:00:00.000Z"),
  endedAt: new Date("2026-07-12T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "2026-07-11",
};

describe("fresh daily approved story relation composition", () => {
  it.each([
    [
      "Cursor and SpaceX deployment",
      "Cursor deployed at SpaceX",
      "SpaceX deploying Cursor",
    ],
    [
      "strong Claude watermark report",
      "Claude's snippets are watermarked",
      "Watermarking Claude Code output",
    ],
  ])("groups an approved %s before composing the slate", async (
    _caseName,
    xTitle,
    hackerNewsTitle,
  ) => {
    const selection = await selectFreshPair(xTitle, hackerNewsTitle);

    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]?.providerKeys).toEqual([
      "hacker-news",
      "x-twitter",
    ]);
    expect(selection.editorialSlate?.orderedCandidateIds).toEqual(["hn"]);
    expect(selection.approvedSameStoryRelations).toHaveLength(1);
    const relation = selection.approvedSameStoryRelations?.[0];
    expect([
      relation?.leftFeedItemId,
      relation?.rightFeedItemId,
    ].sort()).toEqual(["hn", "x"]);
  });
});

const selectFreshPair = (
  xTitle: string,
  hackerNewsTitle: string,
) => new RelevanceReaderSummaryEvidenceSelector(
  ranker([
    ranked("x", "x-twitter", 2, xTitle),
    ranked("hn", "hacker-news", 1.9, hackerNewsTitle),
  ]),
  emptyFeedRepository(),
  { now: () => now },
  NOOP_STORY_RANKING_METRICS,
  {
    verify: async (input) => input.candidates.map((candidate) => ({
      leftFeedItemId: candidate.leftFeedItemId,
      rightFeedItemId: candidate.rightFeedItemId,
      sameStory: true,
      confidenceScore: 0.99,
    })),
  },
).select({
  tenantId: tenantId("tenant-fresh-relation"),
  workspaceId: workspaceId("workspace-fresh-relation"),
  scope: { type: "workspace" },
  period,
  maxItems: 2,
});

const ranker = (items: readonly RankedFeedItemView[]): RankFeedItemsUseCase =>
  ({
    execute: async () => ok({
      generatedAt: now.toISOString(),
      profileApplied: false,
      items,
    }),
  }) as unknown as RankFeedItemsUseCase;

const emptyFeedRepository = (): FeedItemReadRepositoryPort => ({
  readPromotionSnapshot: async () => ({
    ok: true,
    candidates: [],
    sourceContent: [],
    physicalRowsRead: 0,
    exhausted: true,
  }),
  list: async () => ({ items: [] }),
  findById: async () => null,
});

const ranked = (
  id: string,
  providerKey: "x-twitter" | "hacker-news",
  score: number,
  title: string,
): RankedFeedItemView => ({
  feedItemId: id,
  sourceItemId: `source-${id}`,
  sourceBindingId: `binding-${providerKey}`,
  interestId: "interest-ai",
  providerKey,
  providerMetadata: authoritativeReaderSummaryProviderMetadata(
    providerKey,
    120,
  ),
  canonicalUrl: `https://${providerKey}.example.test/${id}`,
  title,
  bodyPreview: "Independent bounded source evidence.",
  publishedAt: "2026-07-11T08:00:00.000Z",
  observedAt: "2026-07-11T08:01:00.000Z",
  engagementAuthority: {
    observedAt: "2026-07-11T11:30:00.000Z",
    regressionState: "stable",
  },
  score,
  rank: id === "x" ? 1 : 2,
  clusterId: `rank-cluster-${id}`,
  clusterSize: 1,
  duplicateFeedItemIds: [],
  whyImportant: ["Relevant today"],
  safety: {
    status: "allowed",
    categories: ["normalized_preview_only"],
    rawPayloadRetained: false,
    retentionPolicy: "normalized_preview_only",
  },
  contentQuality: {
    qualityScore: 0.9,
    interestRelevanceScore: 0.9,
    engagementIntegrityScore: 0.8,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "promote",
    flags: [],
    reason: "Strong fixture evidence",
  },
});
