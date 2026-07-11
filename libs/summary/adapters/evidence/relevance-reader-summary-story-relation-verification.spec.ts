import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import { ok, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryStoryRelationVerifierInput,
  ReaderSummaryStoryRelationVerifierPort,
  StoryRankingMetricsPort,
  StoryRelationVerificationMetric,
} from "../../ports";
import { RelevanceReaderSummaryEvidenceSelector } from "./relevance-reader-summary-evidence.selector";

const now = new Date("2026-07-11T12:00:00.000Z");
const period = {
  cadence: "daily" as const,
  startedAt: new Date("2026-07-11T00:00:00.000Z"),
  endedAt: new Date("2026-07-12T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "2026-07-11",
};

describe("RelevanceReaderSummaryEvidenceSelector story verification", () => {
  it("re-clusters only high-confidence approved cross-provider pairs", async () => {
    const verifier = new ApprovingVerifier();
    const metrics = new CapturingMetrics();
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      ranker([ranked("hn", "hacker-news", 2), ranked("rss", "rss", 1.9)]),
      emptyFeedRepository(),
      { now: () => now },
      metrics,
      verifier,
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-story-verification"),
      workspaceId: workspaceId("workspace-story-verification"),
      scope: { type: "workspace" },
      period,
      maxItems: 2,
    });

    expect(verifier.inputs).toHaveLength(1);
    expect(verifier.inputs[0]?.candidates).toHaveLength(1);
    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]?.providerKeys).toEqual(["hacker-news", "rss"]);
    expect(metrics.relationMetrics).toContainEqual({
      status: "completed",
      candidateCount: 1,
      approvedCount: 1,
    });
  });

  it("keeps deterministic clusters when the verifier fails", async () => {
    const metrics = new CapturingMetrics();
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      ranker([ranked("hn", "hacker-news", 2), ranked("rss", "rss", 1.9)]),
      emptyFeedRepository(),
      { now: () => now },
      metrics,
      {
        verify: async () => {
          throw new Error("runtime unavailable");
        },
      },
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-story-verification-failure"),
      workspaceId: workspaceId("workspace-story-verification-failure"),
      scope: { type: "workspace" },
      period,
      maxItems: 2,
    });

    expect(selection.clusters).toHaveLength(2);
    expect(metrics.relationMetrics).toContainEqual({
      status: "failed_closed",
      candidateCount: 1,
      approvedCount: 0,
    });
  });
});

const ranker = (items: readonly RankedFeedItemView[]): RankFeedItemsUseCase =>
  ({
    execute: async () =>
      ok({
        generatedAt: now.toISOString(),
        profileApplied: false,
        items,
      }),
  }) as unknown as RankFeedItemsUseCase;

const emptyFeedRepository = (): FeedItemReadRepositoryPort => ({
  list: async () => ({ items: [] }),
  findById: async () => null,
});

const ranked = (
  id: string,
  providerKey: string,
  score: number,
): RankedFeedItemView => ({
  feedItemId: id,
  sourceItemId: `source-${id}`,
  sourceBindingId: `binding-${providerKey}`,
  interestId: "interest-ai",
  providerKey,
  canonicalUrl: `https://${providerKey}.example.test/${id}`,
  title:
    providerKey === "hacker-news"
      ? "TypeScript compiler rewrite moves to Go"
      : "Go rewrite changes the TypeScript compiler",
  bodyPreview:
    providerKey === "hacker-news"
      ? "Microsoft details the native compiler migration plan."
      : "The engineering team explains its faster compiler pipeline.",
  publishedAt: "2026-07-11T08:00:00.000Z",
  observedAt: "2026-07-11T08:01:00.000Z",
  score,
  rank: providerKey === "hacker-news" ? 1 : 2,
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

class ApprovingVerifier implements ReaderSummaryStoryRelationVerifierPort {
  readonly inputs: ReaderSummaryStoryRelationVerifierInput[] = [];

  async verify(input: ReaderSummaryStoryRelationVerifierInput) {
    this.inputs.push(input);
    return input.candidates.map((candidate) => ({
      leftFeedItemId: candidate.leftFeedItemId,
      rightFeedItemId: candidate.rightFeedItemId,
      sameStory: true,
      confidenceScore: 0.97,
      rationale: "Same concrete compiler rewrite.",
    }));
  }
}

class CapturingMetrics implements StoryRankingMetricsPort {
  readonly relationMetrics: StoryRelationVerificationMetric[] = [];

  recordStoryRanking(): void {}

  recordStoryRelationVerification(
    metric: StoryRelationVerificationMetric,
  ): void {
    this.relationMetrics.push(metric);
  }
}
