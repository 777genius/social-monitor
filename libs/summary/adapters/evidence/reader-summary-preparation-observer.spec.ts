import { classifyFeedPromotionEligibility } from "@social-monitor/feed/domain";
import type { FeedItemReadRepositoryPort, PromotionFeedItemSnapshotResult } from "@social-monitor/feed/ports";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { preparationValue } from "@social-monitor/relevance/features/rank-feed-items/promotion-snapshot-preparation";
import type { SourceContentQualityReviewRequest } from "@social-monitor/relevance/ports";
import { FixedClock, ok } from "@social-monitor/shared-kernel";
import { fixture, accepting, cutoff, scope, query } from "../../../../test/support/promotion-content-assessment";
import { StoryClusteringService } from "../../domain";
import type { ReaderSummaryEvidenceSelectorPort, ReaderSummaryStoryRelationVerifierInput } from "../../ports";
import { RelevanceReaderSummaryEvidenceSelector } from "./relevance-reader-summary-evidence.selector";
import type { ReaderSummaryPreparationObserver } from "./reader-summary-preparation-observer";
import { readerSummaryRankedItemFixture } from "./relevance-reader-summary-evidence-test-fixtures";
import * as policy from "./relevance-reader-summary-promotion-candidates";

const selectParams: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0] = {
  ...scope, scope: { type: "workspace" }, maxItems: 5, observedThrough: cutoff,
  period: { cadence: "daily", timezone: "UTC", periodKey: "synthetic-preparation",
    startedAt: new Date("2026-09-08T00:00:00Z"), endedAt: new Date("2026-09-09T00:00:00Z") },
};

const setup = () => {
  const primary = [fixture("a"), fixture("z", "hacker-news", {
    canonicalUrl: "https://example.test/a" }),
  fixture("distinct", "hacker-news", { title: "Compiler memory allocator measurements" }),
  fixture("outside", "reddit", { publishedAt: new Date("2026-09-07T12:00:00Z") })];
  const supplemental = [...Array.from({ length: 12 }, (_, index) => {
    const rank = index + 1;
    return fixture(`github-${rank}`, "github-trending-page", {
      canonicalUrl: `https://github.com/fixture/repository-${rank}`,
      title: `fixture/repository-${rank} is #${rank} on GitHub Trending`,
      providerMetadata: { kind: "github_trending_page_repository",
        repository: { fullName: `fixture/repository-${rank}`, totalStars: 20_000, forksCount: 500 },
        trending: { rank, starsGained: 100 + rank, window: "daily" } },
    });
  }), fixture("rss", "rss", { title: "Independent editor tooling notes" }),
  fixture("unsupported", "github-issues", { title: "Video tooling notes" })];
  const feedItems: FeedItemReadRepositoryPort = {
    list: jest.fn(async () => { throw new Error("Unexpected list"); }),
    findById: jest.fn(async () => { throw new Error("Unexpected lookup"); }),
    readPromotionSnapshot: jest.fn(async (): Promise<PromotionFeedItemSnapshotResult> => ({ ok: true, exhausted: true, physicalRowsRead: 18,
      candidates: primary.map((item) => {
        const canonical = classifyFeedPromotionEligibility(item.toSnapshot());
        if (!canonical.eligible) throw new Error("Invalid synthetic metrics");
        return { item, canonical, metricAuthority: { observedAt: cutoff, regressionState: "stable" as const } };
      }), supplementalItems: supplemental,
      sourceContent: [...primary, ...supplemental].map((item) => ({
        feedItemId: item.toSnapshot().id, sourceItemId: item.toSnapshot().sourceItemId,
        body: item.toSnapshot().bodyPreview,
      })),
    })),
  };
  const reviewBatch = jest.fn(async (requests: readonly SourceContentQualityReviewRequest[]) =>
    accepting.reviewBatch(requests));
  const ranker = new RankFeedItemsUseCase(feedItems, { findByUser: async () => {
    throw new Error("Unexpected profile");
  } } as never, new FixedClock(cutoff), undefined, undefined, undefined, { reviewBatch }, undefined,
  { readCurrent: async (requested) => ({ kind: "available", interest: { ...requested, query } }) });
  const execute = jest.spyOn(ranker, "execute");
  const verify = jest.fn(async (input: ReaderSummaryStoryRelationVerifierInput) => input.candidates.map((candidate) => ({
    leftFeedItemId: candidate.leftFeedItemId, rightFeedItemId: candidate.rightFeedItemId,
    sameStory: [candidate.leftFeedItemId, candidate.rightFeedItemId].sort().join(":") === "a:z",
    confidenceScore: 0.99,
  })));
  const run = async (observer?: ReaderSummaryPreparationObserver) => {
    const result = await new RelevanceReaderSummaryEvidenceSelector(ranker, feedItems,
      new FixedClock(cutoff), undefined, { verify }, undefined, observer).select(selectParams);
    // Drain the existing synthetic shadow task; this is not a replay scheduler.
    await new Promise<void>((resolve) => setImmediate(resolve));
    return result;
  };
  return { run, execute, reviewBatch, verify, feedItems };
};

const ids = (items: readonly { readonly feedItemId: string }[]) => items.map((item) => item.feedItemId);

describe("reader summary preparation observation", () => {
  afterEach(() => jest.restoreAllMocks());

  it("observes full raw mapping, actual filtered stages and both real groupings before reduction", async () => {
    const baseline = setup();
    const expected = await baseline.run();
    const clustering = jest.spyOn(StoryClusteringService.prototype, "cluster");
    const reduction = jest.spyOn(policy, "promotionPolicySelection");
    const promotionSnapshot = jest.fn<ReturnType<ReaderSummaryPreparationObserver["promotionSnapshot"]>,
      Parameters<ReaderSummaryPreparationObserver["promotionSnapshot"]>>();
    const beforePolicy = jest.fn<ReturnType<ReaderSummaryPreparationObserver["beforePolicy"]>,
      Parameters<ReaderSummaryPreparationObserver["beforePolicy"]>>();
    const boundaryCalls: number[][] = [];
    const observed = setup();
    const actual = await observed.run({ promotionSnapshot, beforePolicy: (preparation) => {
      boundaryCalls.push([clustering.mock.calls.length, reduction.mock.calls.length]);
      beforePolicy(preparation);
    } });
    expect(actual).toEqual(expected);
    expect(boundaryCalls).toEqual([[2, 0]]);
    expect(promotionSnapshot).toHaveBeenCalledTimes(1);
    expect(beforePolicy).toHaveBeenCalledTimes(1);
    const raw = promotionSnapshot.mock.calls[0]![0];
    const prepared = beforePolicy.mock.calls[0]![0];
    expect(ids(raw.primary)).toEqual(["a", "z", "distinct", "outside"]);
    expect(ids(raw.supplemental)).toEqual([...Array.from({ length: 12 }, (_, i) => `github-${i + 1}`), "rss", "unsupported"]);
    expect(ids(raw.primary)).toEqual(ids(raw.ranked.primary));
    expect(ids(raw.supplemental)).toEqual(ids(raw.ranked.supplemental));
    const ranked: Awaited<ReturnType<RankFeedItemsUseCase["execute"]>> = await observed.execute.mock.results[0]!.value;
    if (!ranked.ok) throw ranked.error;
    expect(ids(prepared.rankedInventory)).toEqual(ids(ranked.value.items));
    expect(prepared.rankingOrder).toEqual(ranked.value.items.map(({ feedItemId, rank }) => ({ feedItemId, rank })));
    expect(ids(prepared.rankedInventory)).not.toEqual([...ids(raw.primary), ...ids(raw.supplemental)]);
    expect(prepared.rankedInventory).toHaveLength(18);
    expect(prepared.periodFiltered).toHaveLength(17);
    expect(prepared.periodExcludedIds).toEqual(["outside"]);
    expect(prepared.defaultProviderExcludedIds).toContain("unsupported");
    expect(ids(prepared.periodFiltered)).not.toContain("outside");
    expect(ids(prepared.defaultProviderFiltered)).not.toContain("unsupported");
    // Promotion candidates are intentionally reintroduced after the default provider filter.
    expect(ids(prepared.candidateItems)).toContain("unsupported");
    expect(ids(prepared.groupingInput).sort()).toEqual(["a", "distinct", "rss", "unsupported", "z"]);
    expect(ids(prepared.policyItems).sort()).toEqual(["a", "distinct", "rss", "unsupported", "z"]);
    expect(ids(prepared.admittedSupplemental)).toEqual(Array.from({ length: 10 }, (_, i) => `github-${i + 1}`));
    expect(prepared.initialGrouping).toEqual(preparationValue(clustering.mock.results[0]!.value));
    expect(prepared.authoritativeGrouping).toEqual(preparationValue(clustering.mock.results[1]!.value));
    expect(prepared.groupingInput).toEqual(preparationValue(clustering.mock.calls[0]![0].items));
    expect(clustering.mock.calls[1]![0].items).toBe(clustering.mock.calls[0]![0].items);
    expect(prepared.initialGrouping.clusters.length).toBeGreaterThan(1);
    expect(prepared.initialGrouping.clusters.some((cluster) => cluster.duplicateFeedItemIds.length > 0)).toBe(true);
    expect(prepared.verifiedPairs).toContain("a\u0000z");
    expect(prepared.graduatedRelations).toContainEqual({
      leftFeedItemId: "z", rightFeedItemId: "a", confidence: 0.99,
    });
    expect(prepared.verifiedPairs).toEqual([...clustering.mock.calls[1]![0].verifiedStoryRelationPairs!]);
    expect(prepared.strictTitlePairs).toEqual([...clustering.mock.calls[1]![0].verifiedStrictTitleRelationPairs!]);
    expect(prepared.initialUnclusteredIds).toEqual([]);
    expect(prepared.authoritativeUnclusteredIds).toEqual([]);
    expect(prepared.prePolicySelection).toEqual(preparationValue(reduction.mock.calls[0]![0]));
    expect(prepared.prePolicySelection.sourceWindow).toMatchObject({
      periodStartedAt: selectParams.period.startedAt.toISOString(),
      periodEndedAt: selectParams.period.endedAt.toISOString(), ingestionCutoff: cutoff.toISOString(),
    });
    expect(observed.execute).toHaveBeenCalledTimes(1);
    expect(observed.reviewBatch).toHaveBeenCalledTimes(1);
    expect(observed.feedItems.readPromotionSnapshot).toHaveBeenCalledTimes(1);
    expect(observed.verify.mock.calls.map(([input]) => preparationValue({ ...input, signal: undefined })))
      .toEqual(baseline.verify.mock.calls.map(([input]) => preparationValue({ ...input, signal: undefined })));
    expect(reduction).toHaveBeenCalledTimes(1);
  });

  it("retains the real cluster-cap omissions before policy fills unclustered candidates", async () => {
    const items = Array.from({ length: 202 }, (_, index) => readerSummaryRankedItemFixture({
      feedItemId: `capacity-${index}`, providerKey: "rss", rank: index + 1, score: 1,
      canonicalUrl: `https://capacity-${index}.test/independent`,
      title: `Independent source ${index}`, publishedAt: cutoff.toISOString(), observedAt: cutoff.toISOString(),
    }));
    const execute = jest.fn(async () => ok({ items, profileApplied: false, generatedAt: cutoff.toISOString() }));
    const beforePolicy = jest.fn<ReturnType<ReaderSummaryPreparationObserver["beforePolicy"]>,
      Parameters<ReaderSummaryPreparationObserver["beforePolicy"]>>();
    await new RelevanceReaderSummaryEvidenceSelector({ execute } as unknown as RankFeedItemsUseCase,
      setup().feedItems, new FixedClock(cutoff), undefined, undefined, undefined,
      { promotionSnapshot: jest.fn(), beforePolicy }).select(selectParams);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(beforePolicy).toHaveBeenCalledTimes(1);
    const value = beforePolicy.mock.calls[0]![0];
    expect(value.groupingInput).toHaveLength(202);
    expect(value.authoritativeGrouping.clusters).toHaveLength(200);
    expect(value.authoritativeUnclusteredIds).toHaveLength(2);
    expect(value.initialUnclusteredIds).toEqual(value.authoritativeUnclusteredIds);
    const members = value.authoritativeGrouping.clusters.flatMap((cluster) =>
      [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds]);
    expect([...members, ...value.authoritativeUnclusteredIds].sort()).toEqual(ids(items).sort());
    expect(value.policyItems).toHaveLength(202);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("prevents nested callback mutation including dates from changing selection", async () => {
    const expected = await setup().run();
    const attempts: boolean[] = [];
    const observed = setup();
    const actual = await observed.run({ promotionSnapshot: (value) => {
      attempts.push(!Reflect.set(value.primary[0]!, "title", "forged"),
        !Reflect.set(value.ranked.primary[0]!.contentQuality, "qualityScore", 0));
    }, beforePolicy: (value) => {
      attempts.push(typeof value.prePolicySelection.sourceWindow.ingestionCutoff === "string",
        !Reflect.set(value.prePolicySelection.sourceWindow, "ingestionCutoff", "invalid"),
        !Reflect.set(value.authoritativeGrouping.clusters[0]!, "score", 999),
        Object.isFrozen(value.policyItems[0]!.contentQuality!.flags));
      throw new Error("Synthetic observer failure");
    } });
    expect(attempts).toEqual([true, true, true, true, true, true]);
    expect(actual).toEqual(expected);
    expect(observed.reviewBatch).toHaveBeenCalledTimes(1);
  });
});
