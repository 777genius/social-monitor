import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { PrismaReaderSummaryProviderCollectionHealthReader } from "./prisma-reader-summary-provider-collection-health.reader";

describe("PrismaReaderSummaryProviderCollectionHealthReader", () => {
  it("aggregates the latest per-binding telemetry and exposes degraded providers", async () => {
    const prisma = new FakeRawQueryClient([
      row("reddit", "binding-reddit-a", {
        status: "succeeded",
        targetItemCount: 40,
        collectedItemCount: 43,
        acceptedItemCount: 40,
        insertedItemCount: 35,
        outsideWindowItemCount: 3,
        paginationDuplicateItemCount: 2,
        storageDuplicateItemCount: 5,
        pageCount: 2,
        paginationStopReason: "target_items",
        rateLimitEventCount: 0,
        oldestAcceptedPublishedAt: "2026-07-09T01:00:00.000Z",
        newestAcceptedPublishedAt: "2026-07-09T20:00:00.000Z",
      }),
      row("reddit", "binding-reddit-b", {
        status: "succeeded",
        targetItemCount: 40,
        collectedItemCount: 18,
        acceptedItemCount: 18,
        insertedItemCount: 18,
        outsideWindowItemCount: 0,
        paginationDuplicateItemCount: 0,
        storageDuplicateItemCount: 0,
        pageCount: 1,
        paginationStopReason: "partial_retryable_failure",
        rateLimitEventCount: 1,
        oldestAcceptedPublishedAt: "2026-07-09T02:00:00.000Z",
        newestAcceptedPublishedAt: "2026-07-09T22:00:00.000Z",
      }),
      row(
        "x-twitter",
        "binding-x",
        {
          status: "failed",
          paginationStopReason: "failed",
          rateLimitEventCount: 1,
          failureKind: "rate_limited",
        },
        "FAILED",
      ),
    ]);
    const reader = new PrismaReaderSummaryProviderCollectionHealthReader(
      prisma,
    );

    const result = await reader.readProviderCollectionHealth(query);

    expect(result).toEqual([
      {
        providerKey: "reddit",
        state: "degraded",
        scanCount: 2,
        targetItemCount: 80,
        collectedItemCount: 61,
        acceptedItemCount: 58,
        insertedItemCount: 53,
        outsideWindowItemCount: 3,
        paginationDuplicateItemCount: 2,
        storageDuplicateItemCount: 5,
        pageCount: 3,
        paginationStopReasons: ["partial_retryable_failure", "target_items"],
        failureKinds: [],
        rateLimitEventCount: 1,
        oldestAcceptedPublishedAt: new Date("2026-07-09T01:00:00.000Z"),
        newestAcceptedPublishedAt: new Date("2026-07-09T22:00:00.000Z"),
      },
      {
        providerKey: "x-twitter",
        state: "unavailable",
        scanCount: 1,
        collectedItemCount: 0,
        acceptedItemCount: 0,
        insertedItemCount: 0,
        outsideWindowItemCount: 0,
        paginationDuplicateItemCount: 0,
        storageDuplicateItemCount: 0,
        pageCount: 0,
        paginationStopReasons: ["failed"],
        failureKinds: ["rate_limited"],
        rateLimitEventCount: 1,
      },
    ]);
    expect(prisma.values).toEqual([
      query.tenantId,
      query.workspaceId,
      null,
      null,
      query.period.startedAt.toISOString(),
      query.period.endedAt.toISOString(),
    ]);
  });

  it("keeps exhausted scans below their target explicitly partial", async () => {
    const reader = new PrismaReaderSummaryProviderCollectionHealthReader(
      new FakeRawQueryClient([
        row("reddit", "binding-reddit", {
          status: "succeeded",
          targetItemCount: 100,
          collectedItemCount: 91,
          acceptedItemCount: 91,
          insertedItemCount: 9,
          outsideWindowItemCount: 0,
          paginationDuplicateItemCount: 0,
          storageDuplicateItemCount: 82,
          pageCount: 1,
          paginationStopReason: "no_next_cursor",
          rateLimitEventCount: 0,
        }),
      ]),
    );

    const result = await reader.readProviderCollectionHealth(query);

    expect(result).toEqual([
      expect.objectContaining({
        providerKey: "reddit",
        state: "partial",
        targetItemCount: 100,
        acceptedItemCount: 91,
        paginationStopReasons: ["no_next_cursor"],
        failureKinds: [],
      }),
    ]);
  });
});

class FakeRawQueryClient {
  readonly values: unknown[] = [];

  constructor(private readonly rows: readonly unknown[]) {}

  readonly $queryRaw = async <T>(
    _query: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T> => {
    this.values.push(...values);
    return this.rows as T;
  };
}

const row = (
  providerKey: string,
  sourceBindingId: string,
  metadata: Readonly<Record<string, unknown>>,
  status = "SUCCEEDED",
) => ({
  provider_key: providerKey,
  source_binding_id: sourceBindingId,
  status,
  execution_metadata: { schemaVersion: 1, ...metadata },
});

const query = {
  tenantId: tenantId("00000000-0000-4000-8000-000000000001"),
  workspaceId: workspaceId("00000000-0000-4000-8000-000000000002"),
  scope: { type: "workspace" as const },
  period: {
    cadence: "daily" as const,
    startedAt: new Date("2026-07-09T00:00:00.000Z"),
    endedAt: new Date("2026-07-10T00:00:00.000Z"),
    timezone: "UTC",
    periodKey: "daily:2026-07-09T00:00:00.000Z:2026-07-10T00:00:00.000Z:UTC",
  },
};
