import {
  failedScanCollectionExecutionMetadata,
  successfulScanCollectionExecutionMetadata,
} from "./scan-collection-execution-metadata";

describe("scan collection execution metadata", () => {
  it("persists the target window and complete successful scan counters", () => {
    expect(
      successfulScanCollectionExecutionMetadata({
        providerKey: "reddit",
        sourceQuery: windowedQuery,
        telemetry: {
          targetItemCount: 80,
          collectedItemCount: 73,
          acceptedItemCount: 60,
          outsideWindowItemCount: 13,
          pageCount: 4,
          paginationDuplicateItemCount: 7,
          paginationStopReason: "low_new_item_yield",
          rateLimitEventCount: 0,
          targetPublishedWindowStartedAt: periodStartedAt,
          targetPublishedWindowEndedAt: periodEndedAt,
          oldestAcceptedPublishedAt: new Date("2026-07-09T01:00:00.000Z"),
          newestAcceptedPublishedAt: new Date("2026-07-09T23:00:00.000Z"),
        },
        insertedItemCount: 52,
        storageDuplicateItemCount: 8,
      }),
    ).toEqual({
      schemaVersion: 1,
      status: "succeeded",
      providerKey: "reddit",
      targetPublishedWindowStartedAt: periodStartedAt.toISOString(),
      targetPublishedWindowEndedAt: periodEndedAt.toISOString(),
      targetItemCount: 80,
      collectedItemCount: 73,
      acceptedItemCount: 60,
      insertedItemCount: 52,
      outsideWindowItemCount: 13,
      paginationDuplicateItemCount: 7,
      storageDuplicateItemCount: 8,
      candidateMemorySuppressedItemCount: 0,
      pageCount: 4,
      paginationStopReason: "low_new_item_yield",
      rateLimitEventCount: 0,
      oldestAcceptedPublishedAt: "2026-07-09T01:00:00.000Z",
      newestAcceptedPublishedAt: "2026-07-09T23:00:00.000Z",
    });
  });

  it("records unavailable rate-limited scans against their requested window", () => {
    expect(
      failedScanCollectionExecutionMetadata({
        providerKey: "x-twitter",
        sourceQuery: windowedQuery,
        rateLimited: true,
        failureKind: "rate_limited",
      }),
    ).toMatchObject({
      status: "failed",
      providerKey: "x-twitter",
      targetPublishedWindowStartedAt: periodStartedAt.toISOString(),
      targetPublishedWindowEndedAt: periodEndedAt.toISOString(),
      acceptedItemCount: 0,
      paginationStopReason: "failed",
      rateLimitEventCount: 1,
      failureKind: "rate_limited",
    });
  });
});

const periodStartedAt = new Date("2026-07-09T00:00:00.000Z");
const periodEndedAt = new Date("2026-07-10T00:00:00.000Z");
const windowedQuery = {
  mode: "search" as const,
  query: "AI agents",
  parameters: {
    targetPublishedWindow: {
      startInclusive: periodStartedAt.toISOString(),
      endExclusive: periodEndedAt.toISOString(),
    },
  },
};
