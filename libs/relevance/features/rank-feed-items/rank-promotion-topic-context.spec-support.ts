import type { ReaderPromotionV2Candidate, ReaderPromotionV2ObservedMetrics } from "@social-monitor/feed/domain";
import type { RankedFeedItemView } from "./rank-feed-items.result";
import { classifyFeedPromotionEligibility, FeedItem } from "@social-monitor/feed/domain";
import { FixedClock, tenantId, workspaceId, type JsonObject } from "@social-monitor/shared-kernel";
import { SourceContentQualityPolicy, SourceContentSafetyPolicy } from "../../domain";
import { rankPromotionSnapshot } from "./rank-promotion-snapshot";

export const now = new Date("2026-09-08T08:00:00.000Z");
export const scope = {
  tenantId: tenantId("synthetic-tenant"), workspaceId: workspaceId("synthetic-workspace"),
  interestId: "synthetic-interest", sourceBindingId: "synthetic-binding", providerKey: "hacker-news",
};
export const matchingTitle = "Mistral raises three billion in new financing round";
export const context = {
  interestQuerySnapshot: { interestId: scope.interestId, query: "Mistral financing" },
  sourceBindingSnapshot: { sourceBindingId: scope.sourceBindingId, providerKey: scope.providerKey,
    sourceQuery: { mode: "search", query: "Mistral financing" } },
  workspaceScopeSnapshot: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
};
export const nativeMetadata = { kind: "hacker_news_story", contentKind: "story", points: 338 };
export const projectedContext = {
  interestQuerySnapshot: { query: "Mistral financing" },
  sourceBindingSnapshot: { sourceQuery: { mode: "search", query: "Mistral financing" } },
};
export const feedItem = (overrides: Partial<ReturnType<FeedItem["toSnapshot"]>> = {}): FeedItem =>
  FeedItem.rehydrate({
    ...scope, id: "synthetic-feed", sourceItemId: "synthetic-source",
    canonicalUrl: "https://example.test/synthetic-financing", title: matchingTitle,
    bodyPreview: "", publishedAt: now, observedAt: now,
    providerMetadata: { ...nativeMetadata, ...context }, ...overrides,
  });

export const rankItems = async (
  items: readonly FeedItem[],
  options: { readonly authority?: "stable" | "unresolved_regression" | "missing" } = {},
) => {
  const qualityPolicy = new SourceContentQualityPolicy();
  const qualityInput = jest.spyOn(qualityPolicy, "evaluate");
  const result = await rankPromotionSnapshot({
    command: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, limit: items.length,
      publishedAtOrAfter: new Date("2026-09-08T00:00:00Z"),
      publishedBefore: new Date("2026-09-09T00:00:00Z") },
    feedItems: {
      list: async () => ({ items: [] }), findById: async () => null,
      readPromotionSnapshot: async () => ({
        ok: true, exhausted: true, physicalRowsRead: items.length,
        candidates: items.map((item) => {
          const canonical = classifyFeedPromotionEligibility(item.toSnapshot());
          if (!canonical.eligible) throw new Error("Expected canonical fixture");
          return { item, canonical, ...(options.authority === "missing" ? {} : {
            metricAuthority: { observedAt: now, regressionState: options.authority ?? "stable" },
          }) };
        }),
        sourceContent: items.map((item) => ({ feedItemId: item.toSnapshot().id,
          sourceItemId: item.toSnapshot().sourceItemId, body: item.toSnapshot().bodyPreview })),
      }),
    },
    clock: new FixedClock(now), qualityPolicy, safetyPolicy: new SourceContentSafetyPolicy(),
  });
  if (!result.ok) throw result.error;
  for (const item of result.value.items) {
    const input = qualityInput.mock.calls.find(([input]) => input.canonicalUrl === item.canonicalUrl)?.[0];
    expect(input?.providerMetadata).toBe(item.providerMetadata);
  }
  return result.value.items;
};

export const metadataWith = (patch: JsonObject): JsonObject => ({ ...nativeMetadata, ...context, ...patch });

// Exercise the public V2 domain contract with actual ranked quality and metrics.
// Summary adapter integration is also replayed separately in the audit artifact.
export const v2Candidate = (item: RankedFeedItemView): ReaderPromotionV2Candidate => {
  const canonical = classifyFeedPromotionEligibility(item);
  if (!canonical.eligible) throw new Error("Expected canonical fixture");
  const native = canonical.metrics;
  let metrics: ReaderPromotionV2ObservedMetrics;
  switch (native.kind) {
    case "hacker_news_story": metrics = { provider: "hacker_news", points: native.points }; break;
    case "reddit_post": metrics = { provider: "reddit", score: native.score, upvoteRatio: native.upvoteRatio }; break;
    case "x_post": metrics = { provider: "x", likes: native.likes!, reposts: native.reposts! }; break;
    case "github_repository": metrics = { provider: "github", window: "24h", checkedAt: native.checkedAt!,
      starsDelta: native.trendingDelta.value!, forksDelta: native.forkTrendDeltas[0]!.value! }; break;
  }
  const authority = native.kind === "github_repository"
    ? { source: "github_checked_at" as const, observedAt: native.checkedAt!, regressionState: "stable" as const }
    : item.engagementAuthority === undefined ? undefined
      : { source: "durable_projection" as const, ...item.engagementAuthority };
  const quality = item.contentQuality;
  return {
    candidateId: item.feedItemId, canonicalIdentity: item.canonicalUrl,
    provider: metrics.provider, contentKind: canonical.contentKind,
    publishedAt: item.publishedAt, engagementCutoffAt: now.toISOString(),
    admission: {
      relevanceFloorMet: quality.eligibleForSummary,
      qualityFloorMet: quality.eligibleForTopRead && !quality.needsLlmReview &&
        quality.decision !== "downrank" && quality.decision !== "reject",
      integrityFloorMet: Number.isFinite(quality.engagementIntegrityScore),
      safetyFloorMet: item.safety.status !== "blocked",
      freshnessFloorMet: item.publishedAt <= now.toISOString() && item.publishedAt >= "2026-09-08T00:00:00.000Z",
    },
    engagement: { state: "observed", authoritative: authority !== undefined, authority, metrics },
    relevanceScore: quality.interestRelevanceScore, evidenceQualityScore: quality.qualityScore,
    integrityScore: quality.engagementIntegrityScore, freshnessScore: 1,
  };
};
