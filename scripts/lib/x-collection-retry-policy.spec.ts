import type { ProviderCollectionObservation } from "./provider-collection-observability";
import { xCollectionReadinessRetryPolicy } from "./x-collection-retry-policy";

describe("X collection readiness retry policy", () => {
  it("is opt-in", () => {
    expect(xCollectionReadinessRetryPolicy(false)).toBeUndefined();
  });

  it("retries incomplete or explicitly transient X collections", () => {
    const policy = xCollectionReadinessRetryPolicy(true);
    expect(policy).toBeDefined();
    const target = targetFor("x-twitter");

    expect(policy?.shouldRetry(target, result(17))).toBe(true);
    expect(policy?.shouldRetry(target, result(20))).toBe(false);
    expect(policy?.shouldRetry(target, result(17, "failed"))).toBe(false);
    expect(
      policy?.shouldRetry(
        target,
        result(0, "failed", "unavailable"),
      ),
    ).toBe(true);
    expect(
      policy?.shouldRetry(target, result(0, "failed", "rate_limited")),
    ).toBe(true);
    expect(
      policy?.shouldRetry(target, result(0, "failed", "auth_failed")),
    ).toBe(false);
    expect(policy?.shouldRetry(targetFor("reddit"), result(17))).toBe(false);
  });

  it("keeps total attempts bounded to the collection report contract", () => {
    const policy = xCollectionReadinessRetryPolicy(true);

    expect(policy?.maxTotalAttempts).toBe(3);
    expect(policy?.delaysMs).toEqual([15 * 60_000, 50 * 60_000]);
  });
});

const targetFor = (providerKey: string) => ({
  providerKey,
  sourceBindingId: "binding",
  sourceQuery: { mode: "search" as const, query: "coding agents" },
  config: {},
});

const result = (
  accepted: number,
  status: "succeeded" | "failed" = "succeeded",
  failureKind?: "rate_limited" | "auth_failed" | "unavailable" | "unknown",
) => ({
  providerKey: "x-twitter" as const,
  status,
  observability: {
    ...observation(accepted),
    ...(failureKind === undefined ? {} : { failureKind }),
  },
});

const observation = (accepted: number): ProviderCollectionObservation => ({
  targetItemCount: 25,
  collectedItemCount: accepted,
  acceptedItemCount: accepted,
  insertedItemCount: 0,
  outsideWindowItemCount: 0,
  paginationDuplicateItemCount: 0,
  storageDuplicateItemCount: 0,
  totalDuplicateItemCount: 0,
  pageCount: accepted > 0 ? 1 : 0,
  paginationStopReason: accepted > 0 ? "target_items" : "single_page",
  rateLimitEventCount: 0,
  coverageState: accepted >= 20 ? "complete" : "partial",
  slo: {
    met: accepted >= 25,
    targetItemCount: 25,
    evaluatedItemCount: accepted,
    coverageRatio: accepted / 25,
    freshnessLagSeconds: 60,
    maxFreshnessLagSeconds: 21_600,
    reasons: accepted < 25 ? ["target_shortfall"] : [],
    retryDisposition: accepted < 25 ? "immediate" : "none",
  },
  freshness: {
    newestAcceptedPublishedAt: "2026-07-13T23:59:00.000Z",
    lagToWindowEndSeconds: 60,
  },
});
