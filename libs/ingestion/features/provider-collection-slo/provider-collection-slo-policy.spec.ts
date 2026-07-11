import { evaluateProviderCollectionSlo } from "./provider-collection-slo-policy";

const windowEnd = new Date("2026-07-11T00:00:00.000Z");

describe("evaluateProviderCollectionSlo", () => {
  it("marks collection complete only when target and freshness are met", () => {
    expect(
      evaluateProviderCollectionSlo({
        targetItemCount: 100,
        acceptedItemCount: 100,
        newestAcceptedPublishedAt: new Date("2026-07-10T22:00:00.000Z"),
        targetWindowEndedAt: windowEnd,
        maxFreshnessLagSeconds: 21_600,
        paginationStopReason: "target_items",
        rateLimitEventCount: 0,
      }),
    ).toEqual({
      met: true,
      targetItemCount: 100,
      evaluatedItemCount: 100,
      coverageRatio: 1,
      freshnessLagSeconds: 7_200,
      maxFreshnessLagSeconds: 21_600,
      reasons: [],
      retryDisposition: "none",
    });
  });

  it("requires an immediate targeted retry for a fresh target shortfall", () => {
    expect(
      evaluateProviderCollectionSlo({
        targetItemCount: 100,
        acceptedItemCount: 76,
        newestAcceptedPublishedAt: new Date("2026-07-10T23:00:00.000Z"),
        targetWindowEndedAt: windowEnd,
        maxFreshnessLagSeconds: 21_600,
        paginationStopReason: "max_pages",
        rateLimitEventCount: 0,
      }),
    ).toMatchObject({
      met: false,
      coverageRatio: 0.76,
      reasons: ["target_shortfall"],
      retryDisposition: "immediate",
    });
  });

  it("defers a rate-limited retry until provider capacity resets", () => {
    expect(
      evaluateProviderCollectionSlo({
        targetItemCount: 120,
        acceptedItemCount: 0,
        targetWindowEndedAt: windowEnd,
        maxFreshnessLagSeconds: 21_600,
        paginationStopReason: "failed",
        rateLimitEventCount: 1,
        failureKind: "rate_limited",
      }),
    ).toMatchObject({
      met: false,
      reasons: ["target_shortfall", "rate_limited", "provider_unavailable"],
      retryDisposition: "deferred",
    });
  });

  it("does not treat a full but stale collection as complete", () => {
    expect(
      evaluateProviderCollectionSlo({
        targetItemCount: 30,
        acceptedItemCount: 30,
        newestAcceptedPublishedAt: new Date("2026-07-10T12:00:00.000Z"),
        targetWindowEndedAt: windowEnd,
        maxFreshnessLagSeconds: 21_600,
        paginationStopReason: "single_page",
        rateLimitEventCount: 0,
      }),
    ).toMatchObject({
      met: false,
      reasons: ["freshness_lag_exceeded"],
      retryDisposition: "immediate",
    });
  });
});
