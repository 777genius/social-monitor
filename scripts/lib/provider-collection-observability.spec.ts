import {
  configuredProviderCollectionTargetItemCount,
  successfulProviderCollectionObservation,
  unavailableProviderCollectionObservation,
} from "./provider-collection-observability";

describe("provider collection observability", () => {
  it("builds complete structured telemetry for a successful scan", () => {
    const observation = successfulProviderCollectionObservation({
      telemetry: {
        targetItemCount: 20,
        collectedItemCount: 22,
        acceptedItemCount: 20,
        outsideWindowItemCount: 2,
        pageCount: 2,
        paginationDuplicateItemCount: 3,
        paginationStopReason: "target_items",
        rateLimitEventCount: 0,
        oldestAcceptedPublishedAt: new Date("2026-07-09T02:00:00.000Z"),
        newestAcceptedPublishedAt: new Date("2026-07-09T22:00:00.000Z"),
      },
      fetched: 20,
      inserted: 16,
      storageDuplicates: 4,
      targetWindowEndedAt: new Date("2026-07-10T00:00:00.000Z"),
    });

    expect(observation).toMatchObject({
      targetItemCount: 20,
      collectedItemCount: 22,
      acceptedItemCount: 20,
      insertedItemCount: 16,
      outsideWindowItemCount: 2,
      paginationDuplicateItemCount: 3,
      storageDuplicateItemCount: 4,
      totalDuplicateItemCount: 7,
      pageCount: 2,
      paginationStopReason: "target_items",
      rateLimitEventCount: 0,
      coverageState: "complete",
      freshness: { lagToWindowEndSeconds: 7200 },
    });
  });

  it("marks partial rate-limited scans as degraded", () => {
    const observation = successfulProviderCollectionObservation({
      telemetry: {
        targetItemCount: 20,
        collectedItemCount: 8,
        acceptedItemCount: 8,
        outsideWindowItemCount: 0,
        pageCount: 1,
        paginationDuplicateItemCount: 0,
        paginationStopReason: "partial_retryable_failure",
        rateLimitEventCount: 1,
      },
      fetched: 8,
      inserted: 8,
      storageDuplicates: 0,
      targetWindowEndedAt: new Date("2026-07-10T00:00:00.000Z"),
    });

    expect(observation.coverageState).toBe("degraded");
  });

  it("keeps failed provider targets explicit", () => {
    expect(
      unavailableProviderCollectionObservation({
        targetItemCount: 25,
        status: "failed",
        rateLimited: true,
        failureKind: "rate_limited",
      }),
    ).toMatchObject({
      targetItemCount: 25,
      coverageState: "unavailable",
      paginationStopReason: "failed",
      rateLimitEventCount: 1,
      failureKind: "rate_limited",
    });
  });

  it("reads the configured adaptive target for failed scans", () => {
    expect(
      configuredProviderCollectionTargetItemCount({
        adaptivePagination: { enabled: true, targetItems: 80 },
        maxItems: 20,
      }),
    ).toBe(80);
  });
});
