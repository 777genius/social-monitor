import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { PrismaReaderSummaryGitHubProjectionReader } from "./prisma-reader-summary-github-projection.reader";
import type { PrismaSummaryClient } from "./prisma-summary-client";

describe("PrismaReaderSummaryGitHubProjectionReader", () => {
  it("reads every binding and item page beyond 1,000", async () => {
    const firstBindingPage = Array.from({ length: 1_000 }, (_, index) => ({
      sourceBindingId: `binding-${String(index + 1).padStart(4, "0")}`,
    }));
    const secondBindingPage = [
      { sourceBindingId: "binding-1001" },
      { sourceBindingId: "binding-1002" },
    ];
    const firstItemPage = Array.from({ length: 1_000 }, (_, index) =>
      row(index + 1, `binding-${String(index + 1).padStart(4, "0")}`),
    );
    const secondItemPage = [
      row(1_001, "binding-active-a"),
      row(1_002, "binding-active-b"),
    ];
    const prisma = new FakeRawQueryClient(
      new Map([
        [0, firstBindingPage],
        [1_000, secondBindingPage],
      ]),
      new Map([
        [0, firstItemPage],
        [1_000, secondItemPage],
      ]),
    );
    const reader = new PrismaReaderSummaryGitHubProjectionReader(
      prisma as unknown as PrismaSummaryClient,
    );

    const result = await reader.read(query);

    expect(result.pageCount).toBe(4);
    expect(result.eligibleBindingIds).toHaveLength(1_002);
    expect(result.items).toHaveLength(1_002);
    expect(prisma.calls.map((call) => call.values.at(-1))).toEqual([
      0, 1_000, 0, 1_000,
    ]);
  });

  it("pins tenant, workspace, durable observation windows, and the cutoff", async () => {
    const prisma = clientWithBindings("binding-active-a");
    const reader = new PrismaReaderSummaryGitHubProjectionReader(
      prisma as unknown as PrismaSummaryClient,
    );

    await reader.read(query);

    expect(prisma.calls[0]?.values).toEqual([
      query.tenantId,
      query.workspaceId,
      query.dayEndedAt,
      1_000,
      0,
    ]);
    expect(prisma.calls[1]?.values).toEqual([
      query.tenantId,
      query.workspaceId,
      query.dayStartedAt,
      query.observedThrough,
      query.dayStartedAt,
      query.observedThrough,
      query.dayEndedAt,
      1_000,
      0,
    ]);
    const bindingSql = prisma.calls[0]?.sql ?? "";
    expect(bindingSql).toContain("sb.tenant_id =");
    expect(bindingSql).toContain("sb.workspace_id =");
    expect(bindingSql).toContain("sb.created_at <");
    expect(bindingSql).toContain("sce.provider_key = 'github-trending-page'");
    const sql = prisma.calls[1]?.sql ?? "";
    expect(sql).toContain("fi.tenant_id =");
    expect(sql).toContain("fi.workspace_id =");
    expect(sql).toContain("fi.observed_at >=");
    expect(sql).toContain("fi.observed_at <=");
    expect(sql).toContain("si.observed_at >=");
    expect(sql).toContain("si.observed_at <=");
    expect(sql).not.toContain("fi.published_at >=");
    expect(sql).not.toContain("si.published_at >=");
    expect(sql).toContain(
      `si.metadata->'trending'->>'fetchStartedAt' as "fetchStartedAt"`,
    );
  });

  it("requires active bindings and prevents a cross-binding source item join", async () => {
    const prisma = clientWithBindings("binding-active-a");
    const reader = new PrismaReaderSummaryGitHubProjectionReader(
      prisma as unknown as PrismaSummaryClient,
    );

    await reader.read(query);

    const sql = prisma.calls[1]?.sql ?? "";
    expect(sql).toContain("si.source_binding_id = fi.source_binding_id");
    expect(sql).toContain("si.canonical_url = fi.canonical_url");
    expect(sql).toContain("sb.id = fi.source_binding_id");
    expect(sql).toContain("sb.status = 'ENABLED'");
    expect(sql).toContain("sb.deleted_at is null");
    expect(sql).toContain("i.status = 'ENABLED'");
    expect(sql).toContain("i.deleted_at is null");
    expect(sql).toContain("sb.config->>'query'");
  });

  it.each([
    {
      label: "non-midnight start",
      overrides: {
        dayStartedAt: new Date("2026-07-10T00:00:00.001Z"),
      },
    },
    {
      label: "non-exclusive next midnight end",
      overrides: {
        dayEndedAt: new Date("2026-07-10T23:59:59.999Z"),
      },
    },
    {
      label: "cutoff before the requested day",
      overrides: {
        observedThrough: new Date("2026-07-09T23:59:59.999Z"),
      },
    },
  ])("rejects $label before issuing SQL", async ({ overrides }) => {
    const prisma = new FakeRawQueryClient(new Map(), new Map());
    const reader = new PrismaReaderSummaryGitHubProjectionReader(
      prisma as unknown as PrismaSummaryClient,
    );

    await expect(reader.read({ ...query, ...overrides })).rejects.toThrow(
      "GitHub projection query must be scoped to one exact UTC day",
    );
    expect(prisma.calls).toEqual([]);
  });
});

type RawQueryCall = {
  readonly sql: string;
  readonly values: readonly unknown[];
};

class FakeRawQueryClient {
  readonly calls: RawQueryCall[] = [];

  constructor(
    private readonly bindingPages: ReadonlyMap<number, readonly unknown[]>,
    private readonly itemPages: ReadonlyMap<number, readonly unknown[]>,
  ) {}

  readonly $queryRaw = async <T>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T> => {
    this.calls.push({ sql: strings.join("?"), values });
    const offset = values.at(-1);
    const pages = strings.join("?").includes(
      'select sb.id::text as "sourceBindingId"',
    )
      ? this.bindingPages
      : this.itemPages;
    return (pages.get(typeof offset === "number" ? offset : -1) ?? []) as T;
  };
}

const clientWithBindings = (...sourceBindingIds: readonly string[]) =>
  new FakeRawQueryClient(
    new Map([
      [
        0,
        sourceBindingIds.map((sourceBindingId) => ({ sourceBindingId })),
      ],
    ]),
    new Map([[0, []]]),
  );

const row = (index: number, sourceBindingId: string) => ({
  feedItemId: `feed-${index}`,
  sourceItemId: `source-${index}`,
  sourceBindingId,
  providerKey: "github-trending-page",
  metadataKind: "github_trending_page_repository",
  scanJobId: "scan-github-1",
  canonicalUrl: `https://github.com/owner/repo-${index}`,
  repositoryFullName: `owner/repo-${index}`,
  rank: String(index),
  starsGained: String(100 + index),
  window: "daily",
  fetchStartedAt: "2026-07-10T12:00:00.000Z",
  checkedAt: "2026-07-10T12:00:00.000Z",
  publishedAt: new Date("2026-07-10T12:00:00.000Z"),
  observedAt: new Date("2026-07-10T12:05:00.000Z"),
  sourceContentHash: "a".repeat(64),
  sourceProviderContentHash: "b".repeat(64),
});

const query = {
  tenantId: tenantId("00000000-0000-4000-8000-000000000001"),
  workspaceId: workspaceId("00000000-0000-4000-8000-000000000002"),
  dayStartedAt: new Date("2026-07-10T00:00:00.000Z"),
  dayEndedAt: new Date("2026-07-11T00:00:00.000Z"),
  observedThrough: new Date("2026-07-11T01:00:00.000Z"),
};
