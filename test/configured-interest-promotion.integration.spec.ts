import { buildReaderSummaryPeriod } from "@social-monitor/summary/domain";
import { classifyFeedPromotionEligibility, evaluateReaderPromotionV2, type FeedItem } from "@social-monitor/feed/domain";
import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { RelevanceReaderSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/relevance-reader-summary-evidence.selector";
import { InMemoryUserRelevanceProfileRepository } from "@social-monitor/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import type { ConfiguredInterestReaderPort, ConfiguredInterestScope, SourceContentQualityReviewerPort } from "@social-monitor/relevance/ports";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { context, feedItem, nativeMetadata, now, scope, v2Candidate } from "@social-monitor/relevance/features/rank-feed-items/rank-promotion-topic-context.spec-support";

import { SyntheticPublicationAssessmentReviewer } from
  "@social-monitor/summary/test-fixtures/synthetic-publication-assessment.spec-support";

const bread = feedItem({ title: "Local bakers share their best bread recipes with neighbors",
  providerMetadata: { ...nativeMetadata, ...context,
    query: "best", searchQuery: "best", topic: "best", topics: ["best"],
    interestQuerySnapshot: { ...context.interestQuerySnapshot, query: "best" },
    sourceBindingSnapshot: { ...context.sourceBindingSnapshot, sourceQuery: { mode: "listing", query: "best" } } } });
// Match the selector and V2 assertion cutoff; next midnight would stale the 08:00 metrics.
const command = { ...scope, limit: 200, rankingProfile: "reader_post_promotion" as const, observedAtOrBefore: now,
  publishedAtOrAfter: new Date("2026-09-08T00:00:00Z"), publishedBefore: new Date("2026-09-09T00:00:00Z") };
const clock = new FixedClock(now);
const repository = (items: readonly FeedItem[], supplemental: readonly FeedItem[] = []): FeedItemReadRepositoryPort => ({
  list: async () => ({ items: [] }), findById: async () => null,
  readPromotionSnapshot: async () => ({ ok: true, exhausted: true, physicalRowsRead: items.length + supplemental.length,
    candidates: items.map((item) => {
      const canonical = classifyFeedPromotionEligibility(item.toSnapshot());
      if (!canonical.eligible) throw new Error("Invalid fixture");
      return { item, canonical, metricAuthority: { observedAt: now, regressionState: "stable" as const } };
    }), supplementalItems: supplemental,
    sourceContent: [...items, ...supplemental].map((item) => ({ feedItemId: item.toSnapshot().id,
      sourceItemId: item.toSnapshot().sourceItemId, body: item.toSnapshot().bodyPreview })),
  }),
});
// Only these explicit synthetic headline/intent pairs have positive judgments.
// No unseen recipe/article body is invented, and unrelated intent stays pending.
const breadHeadlineReviewer = () => new SyntheticPublicationAssessmentReviewer(
  ["best", "bread recipes"].map((trustedIntent) => ({
    candidateId: "synthetic-feed", providerKey: "hacker-news",
    title: "Local bakers share their best bread recipes with neighbors",
    bodyPreview: "", evidenceField: "title",
    scope: {
      tenantId: scope.tenantId, workspaceId: scope.workspaceId,
      interestId: "synthetic-interest", sourceBindingId: "synthetic-binding",
      sourceItemId: "synthetic-source", trustedIntent, availability: "title_only",
    },
  })),
);
const ranker = (feed: FeedItemReadRepositoryPort, reader?: ConfiguredInterestReaderPort,
  reviewer?: SourceContentQualityReviewerPort) => new RankFeedItemsUseCase(
  feed, new InMemoryUserRelevanceProfileRepository(), clock,
  undefined, undefined, undefined, reviewer, undefined, reader,
);
const configured = (query: string): ConfiguredInterestReaderPort => ({
  readCurrent: async (requested) => ({ kind: "available", interest: { ...requested, query } }),
});

describe("configured authority through the actual ranking and Summary caller", () => {
  it.each(["best", "bread recipes"])("rejects copied metadata for unrelated intent and accepts independently configured %s", async (query) => {
    const feed = repository([bread]);
    const reviewer = breadHeadlineReviewer();
    const unrelated = await ranker(feed, configured("Mistral financing"), reviewer).execute(command);
    const matching = await ranker(feed, configured(query), reviewer).execute(command);
    if (!unrelated.ok || !matching.ok) throw new Error("Expected resolved authority");
    expect(evaluateReaderPromotionV2(v2Candidate(unrelated.value.items[0]!)).admitted).toBe(false);
    expect(evaluateReaderPromotionV2(v2Candidate(matching.value.items[0]!))).toMatchObject({ admitted: true, topQualified: true });
    const select = (intent: string) => new RelevanceReaderSummaryEvidenceSelector(ranker(feed, configured(intent), reviewer), feed, clock).select({
      ...scope, scope: { type: "interest", interestId: scope.interestId },
      period: buildReaderSummaryPeriod({ cadence: "daily", startedAt: command.publishedAtOrAfter, endedAt: command.publishedBefore, timezone: "UTC" }),
      observedThrough: now, maxItems: 120,
    });
    expect((await select("Mistral financing")).selectedEvidence).toHaveLength(0);
    expect((await select(query)).selectedEvidence.map((item) => item.feedItemId)).toContain(bread.toSnapshot().id);
    expect([...reviewer.assessedCandidateIds]).toEqual(["synthetic-feed"]);
  });

  it("reads repeated interests once per invocation and fresh configuration next generation, even for an old window", async () => {
    const reader = { readCurrent: jest.fn().mockResolvedValueOnce({ kind: "available", interest: { ...scope, query: "best" } })
      .mockResolvedValueOnce({ kind: "available", interest: { ...scope, query: "Mistral financing" } }) };
    const sameInterest = feedItem({ ...bread.toSnapshot(), id: "second", sourceItemId: "second-source" });
    const useCase = ranker(repository([bread, sameInterest]), reader);
    const first = await useCase.execute(command);
    expect(reader.readCurrent).toHaveBeenCalledTimes(1);
    const second = await useCase.execute(command);
    expect(reader.readCurrent).toHaveBeenCalledTimes(2);
    if (!first.ok || !second.ok) throw new Error("Expected resolved authority");
    expect(first.value.items.every((item) => item.providerMetadata?.query === "best")).toBe(true);
    expect(second.value.items.every((item) => item.providerMetadata?.query === "Mistral financing")).toBe(true);
    expect(first.value.items.every((item) => item.providerMetadata?.query === "best")).toBe(true);
  });

  it("resolves each independent interest in a workspace without sharing query state", async () => {
    const other = feedItem({ ...bread.toSnapshot(), id: "other", sourceItemId: "other-source", interestId: "other-interest" });
    const readCurrent = jest.fn(async (requested: ConfiguredInterestScope) => ({
      kind: "available" as const, interest: { ...requested,
        query: requested.interestId === scope.interestId ? "best" : "Mistral financing" },
    }));
    const result = await ranker(repository([bread, other]), { readCurrent }, breadHeadlineReviewer()).execute({ ...command, interestId: undefined });
    if (!result.ok) throw result.error;
    expect(readCurrent).toHaveBeenCalledTimes(2);
    expect(result.value.items.find((item) => item.feedItemId === "other")!.contentQuality.flags).toContain("weak_topic_match");
    expect(result.value.items.find((item) => item.feedItemId === bread.toSnapshot().id)!.contentQuality.eligibleForTopRead).toBe(true);
  });

  it.each(["missing", "unavailable", "throw", "tenant", "workspace", "interest", "blank", "absent"])(
    "returns a typed operation conflict for %s authority", async (kind) => {
      const reader: ConfiguredInterestReaderPort = { readCurrent: async () => {
        if (kind === "throw") throw new Error("Unavailable");
        if (kind === "missing" || kind === "unavailable") return { kind };
        return { kind: "available", interest: { ...scope, query: kind === "blank" ? " " : "best",
          ...(kind === "tenant" ? { tenantId: tenantId("other") } : {}),
          ...(kind === "workspace" ? { workspaceId: workspaceId("other") } : {}),
          ...(kind === "interest" ? { interestId: "other" } : {}) } };
      } };
      expect(await ranker(repository([bread]), kind === "absent" ? undefined : reader).execute(command))
        .toMatchObject({ ok: false, error: { code: "operation.conflict" } });
    },
  );

  it("sanitizes supplemental contexts and retains legitimate native GitHub topics and fields", async () => {
    const supplemental = feedItem({ ...bread.toSnapshot(), id: "supplemental", sourceItemId: "supplemental-source",
      providerKey: "github-trending-page", providerMetadata: { ...bread.toSnapshot().providerMetadata,
        kind: "github_trending_page", topics: ["bread"], rank: 3, repositoryFullName: "fixture/bread" } });
    const reader = { readCurrent: jest.fn(configured("Mistral financing").readCurrent) };
    const result = await ranker(repository([bread], [supplemental]), reader).execute(command);
    if (!result.ok) throw result.error;
    expect(reader.readCurrent).toHaveBeenCalledTimes(1);
    const item = result.value.items.find((item) => item.feedItemId === "supplemental")!;
    expect(item.providerMetadata).toMatchObject({ query: "Mistral financing", topics: ["bread"], rank: 3, repositoryFullName: "fixture/bread" });
    expect(item.providerMetadata).not.toHaveProperty("interestQuerySnapshot");
    expect(item.providerMetadata).not.toHaveProperty("sourceBindingSnapshot");
    expect(item.providerMetadata).not.toHaveProperty("searchQuery");
    const noNativeTopics = feedItem({ ...supplemental.toSnapshot(), providerMetadata: {
      ...supplemental.toSnapshot().providerMetadata, topics: [] } });
    const without = await ranker(repository([], [noNativeTopics]), configured("Mistral financing")).execute(command);
    if (!without.ok) throw without.error;
    expect(without.value.items[0]!.contentQuality.flags).toContain("weak_topic_match");
  });
});
