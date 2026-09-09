import { classifyFeedPromotionEligibility } from "@social-monitor/feed/domain";
import type { FeedItemReadRepositoryPort, PromotionFeedItemSnapshotResult } from "@social-monitor/feed/ports";
import { FixedClock } from "@social-monitor/shared-kernel";
import { fixture, review, cutoff, scope, query } from "../../../../test/support/promotion-content-assessment";
import { SourceContentQualityPolicy, SourceContentSafetyPolicy } from "../../domain";
import type { SourceContentQualityReviewRequest } from "../../ports";
import { rankPromotionSnapshot } from "./rank-promotion-snapshot";
import type { PromotionSnapshotPreparationObserver } from "./promotion-snapshot-preparation";

const setup = () => {
  const primary = [fixture("a", "reddit"), fixture("z", "hacker-news"),
    fixture("hard", "reddit", { providerMetadata: { kind: "reddit_post", score: 1 } })];
  const supplemental = [fixture("supp-b", "github-trending-page"), fixture("supp-a", "rss")];
  const sourceContent = [...primary, ...supplemental].map((item) => ({
    feedItemId: item.toSnapshot().id, sourceItemId: item.toSnapshot().sourceItemId,
    body: `${item.toSnapshot().bodyPreview} token=fixture-secret`,
  }));
  const candidates = primary.map((item) => {
    const canonical = classifyFeedPromotionEligibility(item.toSnapshot());
    if (!canonical.eligible) throw new Error("Invalid synthetic metrics");
    return { item, canonical,
      metricAuthority: { observedAt: cutoff, regressionState: "stable" as const } };
  });
  const feedItems: FeedItemReadRepositoryPort = {
    list: jest.fn(async () => { throw new Error("Unexpected list"); }),
    findById: jest.fn(async () => { throw new Error("Unexpected lookup"); }),
    readPromotionSnapshot: jest.fn(async (): Promise<PromotionFeedItemSnapshotResult> => ({ ok: true, candidates, supplementalItems: supplemental,
      sourceContent, physicalRowsRead: 5, exhausted: true })),
  };
  const reviewBatch = jest.fn(async (requests: readonly SourceContentQualityReviewRequest[]) =>
    requests.map((request) => review(request)));
  const run = (observePromotionPreparation?: PromotionSnapshotPreparationObserver) => rankPromotionSnapshot({
    command: { ...scope, limit: 1, observedAtOrBefore: cutoff,
      publishedAtOrAfter: new Date("2026-09-08T00:00:00Z"),
      publishedBefore: new Date("2026-09-09T00:00:00Z"), observePromotionPreparation },
    feedItems, clock: new FixedClock(cutoff), qualityReviewer: { reviewBatch },
    qualityPolicy: new SourceContentQualityPolicy(), safetyPolicy: new SourceContentSafetyPolicy(),
    configuredInterests: { readCurrent: async (requested) => ({ kind: "available", interest: { ...requested, query } }) },
  });
  return { run, reviewBatch, feedItems };
};

describe("promotion preparation observation", () => {
  it("captures every raw partition before sort without a second review or rank pass", async () => {
    const baseline = setup();
    const observed = setup();
    const callback = jest.fn<ReturnType<PromotionSnapshotPreparationObserver>, Parameters<PromotionSnapshotPreparationObserver>>();
    const expected = await baseline.run();
    const actual = await observed.run(callback);
    expect(actual).toEqual(expected);
    expect(callback).toHaveBeenCalledTimes(1);
    const preparation = callback.mock.calls[0]![0];
    expect(preparation.primary.map((item) => item.feedItemId)).toEqual(["a", "z", "hard"]);
    expect(preparation.supplemental.map((item) => item.feedItemId)).toEqual(["supp-b", "supp-a"]);
    expect(preparation.primary.every((item) => item.rank === 0)).toBe(true);
    expect(preparation.requestedCandidateIds).toEqual(["a", "z"]);
    expect(preparation.primary[2]!.contentQuality.reason).toBe("promotion_assessment_not_requested:hard_gate");
    expect(preparation.primary[0]!.contentQuality.qualityScore).toBe(0.8);
    expect(preparation.primary[0]!.sourceText).toContain("workspace boundary");
    expect(JSON.stringify(preparation)).not.toContain("fixture-secret");
    if (!actual.ok) throw actual.error;
    expect(preparation.primary[0]!.contentQuality).not.toBe(
      actual.value.items.find((item) => item.feedItemId === "a")!.contentQuality);
    expect(preparation.primary[0]!.providerMetadata).not.toBe(
      actual.value.items.find((item) => item.feedItemId === "a")!.providerMetadata);
    expect(actual.value.items[0]!.feedItemId).toBe("z");
    expect(actual.value.items.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(observed.reviewBatch).toHaveBeenCalledTimes(1);
    expect(observed.reviewBatch.mock.calls[0]![0].map((request) => request.candidateId)).toEqual(["a", "z"]);
    expect(observed.feedItems.readPromotionSnapshot).toHaveBeenCalledTimes(1);
    expect(observed.feedItems.list).not.toHaveBeenCalled();
  });

  it("detaches and freezes nested values, and mutation exceptions cannot alter ranking", async () => {
    const expected = await setup().run();
    const attempts: boolean[] = [];
    const actual = await setup().run((preparation) => {
      attempts.push(Object.isFrozen(preparation.primary),
        Object.isFrozen(preparation.primary[0]!.contentQuality.flags),
        !Reflect.set(preparation.primary[0]!, "score", 999),
        !Reflect.set(preparation.primary[0]!.contentQuality, "qualityScore", 0),
        !Reflect.set(preparation.primary[0]!.providerMetadata!, "kind", "forged"));
      throw new Error("Synthetic observer failure");
    });
    expect(attempts).toEqual([true, true, true, true, true]);
    expect(actual).toEqual(expected);
  });
});
