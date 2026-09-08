import { classifyFeedPromotionEligibility, FeedItem, rankReaderPromotionV2 } from "@social-monitor/feed/domain";
import { FixedClock, tenantId, workspaceId, type Clock, type JsonObject } from "@social-monitor/shared-kernel";
import { mapRankedItem } from "@social-monitor/summary/adapters/evidence/relevance-reader-summary-evidence-support";
import { readerSummaryPromotionV2Candidate } from "@social-monitor/summary/adapters/evidence/reader-summary-editorial-candidate";
import type { SummaryEvidenceSelection } from "@social-monitor/summary/domain";
import type { SourceContentQualityReviewerPort, SourceContentQualityReviewRequest,
  SourceContentQualityReviewResult } from "@social-monitor/relevance/ports";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";

export const cutoff = new Date("2026-09-08T12:00:00.000Z");
export const scope = { tenantId: tenantId("assessment-test-tenant"),
  workspaceId: workspaceId("assessment-test-workspace"), interestId: "assessment-interest" };
export const query = "developer tooling and secure coding";
export const body = "I measured the editor extension on a local test project. It preserved the workspace boundary and showed the failed command before retrying. These observations cover my test only.";
export const title = "Experiences with a new editor extension";
export const fixture = (id: string, providerKey = "reddit", overrides: Partial<ReturnType<FeedItem["toSnapshot"]>> = {}) => {
  const metadata: Record<string, JsonObject> = {
    reddit: { kind: "reddit_post", score: 90, upvoteRatio: 0.95 },
    "x-twitter": { kind: "x_post", contentKind: "original_post", likes: 90, reposts: 10 },
    "hacker-news": { kind: "hacker_news_story", points: 90 },
  };
  return FeedItem.rehydrate({ ...scope, id, sourceItemId: `source-${id}`,
    sourceBindingId: `binding-${providerKey}`, providerKey, title, bodyPreview: body,
    canonicalUrl: `https://example.test/${id}`, publishedAt: cutoff, observedAt: cutoff,
    providerMetadata: metadata[providerKey], ...overrides });
};

export const review = (request: SourceContentQualityReviewRequest,
  patch: Partial<SourceContentQualityReviewResult> = {}): SourceContentQualityReviewResult => ({
  candidateId: request.candidateId, decision: "promote", confidence: 0.95,
  qualityScore: 0.8, interestRelevanceScore: 0.95, engagementIntegrityScore: 0.95,
  flags: [], reason: "Synthetic assessment for plumbing tests, not model accuracy.",
  assessment: { binding: request.promotion!, resolvedSoftFlags: [], evidence: [{
    field: request.bodyPreview ? "bodyPreview" : "title", start: 0,
    end: (request.bodyPreview || request.title).length, quote: request.bodyPreview || request.title,
  }] }, ...patch,
});

export const run = async (items: readonly FeedItem[], reviewer?: SourceContentQualityReviewerPort,
  options: { authority?: "stable" | "unresolved_regression" | "missing";
    metricTime?: Date; query?: string; sourceBody?: string; clock?: Clock;
    execution?: { deadlineAtMs: number; signal?: AbortSignal } } = {}) => {
  const ranker = new RankFeedItemsUseCase({
    list: async () => ({ items: [] }), findById: async () => null,
    readPromotionSnapshot: async () => ({ ok: true, exhausted: true, physicalRowsRead: items.length,
      candidates: items.map((item) => {
        const canonical = classifyFeedPromotionEligibility(item.toSnapshot());
        if (!canonical.eligible) throw new Error("Invalid synthetic native fixture");
        return { item, canonical, ...(options.authority === "missing" ? {} : {
          metricAuthority: { observedAt: options.metricTime ?? cutoff,
            regressionState: options.authority ?? "stable" },
        }) };
      }), sourceContent: items.map((item) => ({ feedItemId: item.toSnapshot().id,
        sourceItemId: item.toSnapshot().sourceItemId, body: options.sourceBody ?? item.toSnapshot().bodyPreview })),
    }),
  }, { findByUser: async () => null } as never, options.clock ?? new FixedClock(cutoff),
  undefined, undefined, undefined, reviewer, undefined,
  { readCurrent: async (requested) => ({ kind: "available", interest: { ...requested, query: options.query ?? query } }) });
  const result = await ranker.execute({ ...scope, limit: 200, rankingProfile: "reader_post_promotion",
    promotionAssessmentExecution: options.execution,
    publishedAtOrAfter: new Date("2026-09-08T00:00:00Z"),
    publishedBefore: new Date("2026-09-09T00:00:00Z"), observedAtOrBefore: cutoff });
  if (!result.ok) throw result.error;
  const selection: SummaryEvidenceSelection = { rankingPolicyVersion: "synthetic", clusters: [], selectedEvidence: [],
    sourceWindow: { windowId: "synthetic", startedAt: new Date("2026-09-08T00:00:00Z"), endedAt: cutoff,
      ingestionCutoff: cutoff, selectedFeedItemIds: [], storyClusterIds: [] } };
  const candidates = result.value.items.map((item) => readerSummaryPromotionV2Candidate(mapRankedItem(item, cutoff), selection)!);
  return { items: result.value.items, candidates, ranking: rankReaderPromotionV2(candidates) };
};
export const accepting: SourceContentQualityReviewerPort = { reviewBatch: async (requests) => requests.map((r) => review(r)) };
