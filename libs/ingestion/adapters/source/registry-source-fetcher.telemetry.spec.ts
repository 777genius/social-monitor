import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  FetchedSourceItem,
  ProviderFailure,
  SourceCapabilityProfile,
  SourceConfigReaderPort,
  SourceProviderPort,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
  SourceRuntimeConfig,
} from "../../ports";
import { InMemorySourceProviderRegistry } from "./in-memory-source-provider.registry";
import { RegistrySourceFetcherAdapter } from "./registry-source-fetcher.adapter";

describe("RegistrySourceFetcherAdapter collection telemetry", () => {
  it("reports pagination, duplicates, target-window filtering and freshness", async () => {
    const provider = new TelemetryProvider([
      page(
        [
          item("inside-1", "2026-07-09T08:00:00.000Z"),
          item("outside", "2026-07-08T22:00:00.000Z"),
        ],
        "page-2",
      ),
      page([
        item("inside-1", "2026-07-09T08:00:00.000Z"),
        item("inside-2", "2026-07-09T18:00:00.000Z"),
      ]),
    ]);
    const result = await fetchWith(provider, {
      adaptivePagination: {
        enabled: true,
        targetItems: 3,
        maxPages: 3,
        minNewItemsPerPage: 1,
        maxDuplicateRate: 0.9,
      },
      targetPublishedWindow: {
        startInclusive: "2026-07-09T00:00:00.000Z",
        endExclusive: "2026-07-10T00:00:00.000Z",
      },
    });

    expect(result.items.map((entry) => entry.externalId)).toEqual([
      "inside-1",
      "inside-2",
    ]);
    expect(result.telemetry).toEqual({
      targetItemCount: 3,
      collectedItemCount: 3,
      acceptedItemCount: 2,
      outsideWindowItemCount: 1,
      pageCount: 2,
      paginationDuplicateItemCount: 1,
      paginationStopReason: "target_items",
      rateLimitEventCount: 0,
      targetPublishedWindowStartedAt: new Date("2026-07-09T00:00:00.000Z"),
      targetPublishedWindowEndedAt: new Date("2026-07-10T00:00:00.000Z"),
      oldestAcceptedPublishedAt: new Date("2026-07-09T08:00:00.000Z"),
      newestAcceptedPublishedAt: new Date("2026-07-09T18:00:00.000Z"),
    });
  });

  it("reports a partial pagination rate limit without discarding accepted items", async () => {
    const provider = new TelemetryProvider(
      [page([item("inside-1", "2026-07-09T08:00:00.000Z")], "page-2")],
      1,
    );
    const result = await fetchWith(provider, {
      adaptivePagination: {
        enabled: true,
        targetItems: 4,
        maxPages: 3,
        minNewItemsPerPage: 1,
        maxDuplicateRate: 0.9,
      },
    });

    expect(result.items).toHaveLength(1);
    expect(result.telemetry).toMatchObject({
      targetItemCount: 4,
      collectedItemCount: 1,
      acceptedItemCount: 1,
      pageCount: 1,
      paginationStopReason: "partial_retryable_failure",
      rateLimitEventCount: 1,
    });
  });
});

const fetchWith = async (
  provider: SourceProviderPort,
  config: SourceRuntimeConfig,
) => {
  const configReader: SourceConfigReaderPort = {
    async readConfig() {
      return config;
    },
  };
  const fetcher = new RegistrySourceFetcherAdapter(
    new InMemorySourceProviderRegistry([provider], []),
    configReader,
  );

  return fetcher.fetch({
    tenantId: tenantId("tenant-telemetry"),
    workspaceId: workspaceId("workspace-telemetry"),
    sourceBindingId: "binding-telemetry",
    scanJobId: "scan-telemetry",
    providerKey: "telemetry-source",
    sourceQuery: { mode: "search", query: "AI agents" },
    correlationId: "correlation-telemetry",
  });
};

class TelemetryProvider implements SourceProviderPort {
  private callCount = 0;

  constructor(
    private readonly pages: readonly SourceProviderScanResult[],
    private readonly failAtCall?: number,
  ) {}

  key(): string {
    return "telemetry-source";
  }

  capabilityProfile(): SourceCapabilityProfile {
    return {
      providerKey: "telemetry-source",
      displayName: "Telemetry Source",
      version: 1,
      productionSafe: true,
      supportedContentUnits: ["post"],
      supportedQueryModes: ["search"],
      cursorModel: "opaque",
      stableIdentity: ["externalId", "canonicalUrl"],
      quotaModel: "none",
      limitations: [],
    };
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    return query.mode === "search"
      ? { ok: true }
      : { ok: false, reason: "search is required" };
  }

  planScan(query: SourceQuery): SourceProviderScanPlan {
    return { query, maxItems: 2 };
  }

  async scan(): Promise<SourceProviderScanResult> {
    const call = this.callCount;
    this.callCount += 1;
    if (call === this.failAtCall) {
      throw new Error("rate limited");
    }

    return this.pages[call] ?? page([]);
  }

  classifyError(error: unknown): ProviderFailure {
    return {
      kind: "rate_limited",
      retryable: true,
      message: error instanceof Error ? error.message : "rate limited",
    };
  }
}

const page = (
  items: readonly FetchedSourceItem[],
  nextCursor?: string,
): SourceProviderScanResult => ({
  items,
  ...(nextCursor === undefined ? {} : { nextCursor }),
  warnings: [],
});

const item = (externalId: string, publishedAt: string): FetchedSourceItem => ({
  externalId,
  canonicalUrl: `https://example.test/${externalId}`,
  title: externalId,
  body: externalId,
  publishedAt: new Date(publishedAt),
});
