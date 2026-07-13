import type { ProviderCollectionObservation } from "./provider-collection-observability";
import {
  productionCollectionThresholds,
  providerMeetsProductionBlockingPolicy,
} from "./production-collection-quality-policy";

describe("production collection quality policy", () => {
  it("accepts a complete daily GitHub snapshot independently of repository timestamps", () => {
    expect(
      providerMeetsProductionBlockingPolicy({
        providerKey: "github-trending-page",
        status: "succeeded",
        observability: observation({
          target: 100,
          collected: 100,
          evaluated: 0,
          coverageRatio: 0,
          reasons: ["target_shortfall", "freshness_lag_exceeded"],
        }),
      }),
    ).toBe(true);
  });

  it("accepts bounded HN and X inventories without treating desired depth as an exact minimum", () => {
    expect(
      providerMeetsProductionBlockingPolicy({
        providerKey: "hacker-news",
        status: "succeeded",
        observability: observation({
          target: 100,
          collected: 71,
          evaluated: 71,
          coverageRatio: 0.71,
          reasons: ["target_shortfall"],
        }),
      }),
    ).toBe(true);
    expect(
      providerMeetsProductionBlockingPolicy({
        providerKey: "x-twitter",
        status: "succeeded",
        observability: observation({
          target: 25,
          collected: 22,
          evaluated: 22,
          coverageRatio: 0.88,
          reasons: ["target_shortfall"],
        }),
      }),
    ).toBe(true);
  });

  it("still blocks unavailable, stale, rate-limited or insufficient inventories", () => {
    expect(
      providerMeetsProductionBlockingPolicy({
        providerKey: "x-twitter",
        status: "succeeded",
        observability: observation({
          target: 25,
          collected: 19,
          evaluated: 19,
          coverageRatio: 0.76,
          reasons: ["target_shortfall"],
        }),
      }),
    ).toBe(false);
    expect(
      providerMeetsProductionBlockingPolicy({
        providerKey: "hacker-news",
        status: "succeeded",
        observability: observation({
          target: 100,
          collected: 80,
          evaluated: 80,
          coverageRatio: 0.8,
          reasons: ["target_shortfall", "freshness_lag_exceeded"],
        }),
      }),
    ).toBe(false);
    expect(
      providerMeetsProductionBlockingPolicy({
        providerKey: "reddit",
        status: "failed",
        observability: observation({
          target: 100,
          collected: 100,
          evaluated: 100,
          coverageRatio: 1,
          reasons: [],
        }),
      }),
    ).toBe(false);
  });

  it("keeps the X day minimum aligned with the accepted scan policy", () => {
    expect(productionCollectionThresholds).toMatchObject({
      xTwitterVisibleFeedItems: 20,
      xTwitterCollectedFeedItems: 20,
      xCollectorCompletedRunRatePercent: 80,
      xCollectorUsableRunRatePercent: 80,
    });
  });
});

const observation = (params: {
  readonly target: number;
  readonly collected: number;
  readonly evaluated: number;
  readonly coverageRatio: number;
  readonly reasons: ProviderCollectionObservation["slo"]["reasons"];
}): ProviderCollectionObservation => ({
  targetItemCount: params.target,
  collectedItemCount: params.collected,
  acceptedItemCount: params.evaluated,
  insertedItemCount: params.evaluated,
  outsideWindowItemCount: 0,
  paginationDuplicateItemCount: 0,
  storageDuplicateItemCount: 0,
  totalDuplicateItemCount: 0,
  pageCount: 1,
  paginationStopReason: "single_page",
  rateLimitEventCount: 0,
  coverageState: params.reasons.length === 0 ? "complete" : "partial",
  slo: {
    met: params.reasons.length === 0,
    targetItemCount: params.target,
    evaluatedItemCount: params.evaluated,
    coverageRatio: params.coverageRatio,
    maxFreshnessLagSeconds: 21_600,
    reasons: params.reasons,
    retryDisposition: params.reasons.length === 0 ? "none" : "immediate",
  },
  freshness: {},
});
