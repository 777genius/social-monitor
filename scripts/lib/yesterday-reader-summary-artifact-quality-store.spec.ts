import type { Pool } from "pg";

import type { PrismaReaderSummaryArtifactRecord } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";

import type { SelectedFeedItemProvenance } from "./reader-summary-artifact-coverage";
import {
  type TopReadFeedItemQualityRow,
  YesterdayReaderSummaryArtifactQualityStore,
} from "./yesterday-reader-summary-artifact-quality-store";

const tenantId = "00000000-0000-7000-8000-000000000201";
const workspaceId = "00000000-0000-7000-8000-000000000301";
const collectionDate = "2026-07-18";
const periodKey =
  "daily:2026-07-18T00:00:00.000Z:2026-07-19T00:00:00.000Z:UTC";

describe("YesterdayReaderSummaryArtifactQualityStore", () => {
  it("reads the latest visible artifact for the scoped UTC collection day", async () => {
    const artifact = artifactRecord();
    const query = jest.fn().mockResolvedValue({ rows: [artifact] });
    const store = createStore(query);

    await expect(
      store.readLatestArtifact({ tenantId, workspaceId }),
    ).resolves.toEqual(artifact);

    const sql = querySql(query);
    expect(sql).toContain("tenant_id = $1::uuid");
    expect(sql).toContain("workspace_id = $2::uuid");
    expect(sql).toContain("status in ('COMPLETED', 'NO_SIGNAL')");
    expect(sql).toContain("scope_type = 'workspace'");
    expect(sql).toContain("cadence = 'daily'");
    expect(sql).toContain("period_key = $3");
    expect(sql).toContain("order by created_at desc, id desc");
    expect(query.mock.calls[0]?.[1]).toEqual([
      tenantId,
      workspaceId,
      periodKey,
    ]);
  });

  it("reads the latest visible artifact across periods within tenant scope", async () => {
    const artifact = artifactRecord({
      id: "00000000-0000-7000-8000-000000000102",
      status: "NO_SIGNAL",
    });
    const query = jest.fn().mockResolvedValue({ rows: [artifact] });
    const store = createStore(query);

    await expect(
      store.readLatestVisibleArtifact({ tenantId, workspaceId }),
    ).resolves.toEqual(artifact);

    const sql = querySql(query);
    expect(sql).toContain("tenant_id = $1::uuid");
    expect(sql).toContain("workspace_id = $2::uuid");
    expect(sql).toContain("scope_type = 'workspace'");
    expect(sql).toContain("cadence = 'daily'");
    expect(sql).toContain("status in ('COMPLETED', 'NO_SIGNAL')");
    expect(sql).toContain(
      "order by period_started_at desc, created_at desc, id desc",
    );
    expect(query.mock.calls[0]?.[1]).toEqual([tenantId, workspaceId]);
  });

  it("fails closed when either latest-artifact lookup has no row", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const store = createStore(query);

    await expect(
      store.readLatestArtifact({ tenantId, workspaceId }),
    ).rejects.toThrow(
      "No persisted reader summary artifact found for 2026-07-18",
    );
    await expect(
      store.readLatestVisibleArtifact({ tenantId, workspaceId }),
    ).rejects.toThrow("No persisted latest reader summary artifact found");
  });

  it("maps scoped period artifact status counts", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { status: "COMPLETED", count: "4" },
        { status: "FAILED", count: "2" },
      ],
    });
    const store = createStore(query);

    await expect(
      store.readPeriodArtifactStatusCounts({ tenantId, workspaceId }),
    ).resolves.toEqual({ COMPLETED: 4, FAILED: 2 });

    const sql = querySql(query);
    expect(sql).toContain("tenant_id = $1::uuid");
    expect(sql).toContain("workspace_id = $2::uuid");
    expect(sql).toContain("scope_type = 'workspace'");
    expect(sql).toContain("cadence = 'daily'");
    expect(sql).toContain("period_key = $3");
    expect(sql).toContain("group by status");
    expect(query.mock.calls[0]?.[1]).toEqual([
      tenantId,
      workspaceId,
      periodKey,
    ]);
  });

  it("escapes the same literal needle in both bad-gaming queries", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { status: "COMPLETED", count: "3" },
          { status: "REJECTED", count: "1" },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: "3" }] });
    const store = createStore(query, "bad\\path_100%");

    await expect(
      store.readBadGamingArtifactStatusCounts({ tenantId, workspaceId }),
    ).resolves.toEqual({ COMPLETED: 3, REJECTED: 1 });
    await expect(
      store.readVisibleBadGamingArtifactCount({ tenantId, workspaceId }),
    ).resolves.toBe(3);

    const escapedPattern = "%bad\\\\path\\_100\\%%";
    expect(query.mock.calls[0]?.[1]).toEqual([
      tenantId,
      workspaceId,
      escapedPattern,
    ]);
    expect(query.mock.calls[1]?.[1]).toEqual([
      tenantId,
      workspaceId,
      escapedPattern,
    ]);

    const statusSql = querySql(query, 0);
    const visibleSql = querySql(query, 1);
    for (const sql of [statusSql, visibleSql]) {
      expect(sql).toContain("tenant_id = $1::uuid");
      expect(sql).toContain("workspace_id = $2::uuid");
      expect(sql).toContain("artifact_payload::text ilike $3 escape E'\\\\'");
    }
    expect(visibleSql).toContain("status in ('COMPLETED', 'NO_SIGNAL')");
  });

  it("maps UTC collection coverage for eligible providers only", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { providerKey: "reddit", collectedFeedItemCount: "2" },
        { providerKey: "rss", collectedFeedItemCount: "5" },
        { providerKey: "github-issues", collectedFeedItemCount: "11" },
        {
          providerKey: "GITHUB-TRENDING-PAGE",
          collectedFeedItemCount: "13",
        },
      ],
    });
    const store = createStore(query);

    await expect(
      store.readCollectedCoverage({ tenantId, workspaceId }),
    ).resolves.toEqual({
      collectedFeedItemCount: 7,
      lowRelevanceFeedItemCount: 0,
      mutedFeedItemCount: 0,
      userRatedFeedItemCount: 0,
      providerBreakdown: [
        {
          providerKey: "rss",
          collectedFeedItemCount: 5,
          lowRelevanceFeedItemCount: 0,
          mutedFeedItemCount: 0,
          userRatedFeedItemCount: 0,
        },
        {
          providerKey: "reddit",
          collectedFeedItemCount: 2,
          lowRelevanceFeedItemCount: 0,
          mutedFeedItemCount: 0,
          userRatedFeedItemCount: 0,
        },
      ],
      topicBreakdown: [],
      queryBreakdown: [],
    });

    const sql = querySql(query);
    expect(sql).toContain("tenant_id = $1::uuid");
    expect(sql).toContain("workspace_id = $2::uuid");
    expect(sql).toContain("published_at >= $3::timestamptz");
    expect(sql).toContain("published_at < $4::timestamptz");
    expect(sql).toContain("group by provider_key");
    expect(query.mock.calls[0]?.[1]).toEqual([
      tenantId,
      workspaceId,
      "2026-07-18T00:00:00.000Z",
      "2026-07-19T00:00:00.000Z",
    ]);
  });

  it("reads tenant-scoped feed items by UUID", async () => {
    const rows: readonly TopReadFeedItemQualityRow[] = [
      {
        id: "00000000-0000-7000-8000-000000000101",
        providerKey: "reddit",
        canonicalUrl: "https://example.test/posts/101",
        authorHandle: "example-author",
        title: "Example title",
        bodyPreview: "Example preview",
        sourceBody: "Full original source body",
        providerMetadata: { score: 42 },
      },
    ];
    const feedItemIds = rows.map((row) => row.id);
    const query = jest.fn().mockResolvedValue({ rows });
    const store = createStore(query);

    await expect(
      store.readFeedItemsByIds({ tenantId, workspaceId, feedItemIds }),
    ).resolves.toEqual(rows);

    const sql = querySql(query);
    expect(sql).toContain('fi.id::text as "id"');
    expect(sql).toContain('fi.provider_key as "providerKey"');
    expect(sql).toContain('si.body as "sourceBody"');
    expect(sql).toContain("join source_items si");
    expect(sql).toContain("si.id = fi.source_item_id");
    expect(sql).toContain("si.tenant_id = fi.tenant_id");
    expect(sql).toContain("si.workspace_id = fi.workspace_id");
    expect(sql).toContain("fi.tenant_id = $1::uuid");
    expect(sql).toContain("fi.workspace_id = $2::uuid");
    expect(sql).toContain("fi.id = any($3::uuid[])");
    expect(query.mock.calls[0]?.[1]).toEqual([
      tenantId,
      workspaceId,
      feedItemIds,
    ]);
  });

  it("preserves tenant-scoped DB and interest provenance for selected UUIDs", async () => {
    const rows: readonly SelectedFeedItemProvenance[] = [
      {
        feedItemId: "00000000-0000-7000-8000-000000000101",
        tenantId,
        workspaceId,
        interestId: "00000000-0000-7000-8000-000000000401",
        interestTenantId: tenantId,
        interestWorkspaceId: workspaceId,
        providerKey: "reddit",
      },
    ];
    const feedItemIds = rows.map((row) => row.feedItemId);
    const query = jest.fn().mockResolvedValue({ rows });
    const store = createStore(query);

    await expect(
      store.readSelectedFeedItemProvenance({
        tenantId,
        workspaceId,
        feedItemIds,
      }),
    ).resolves.toEqual(rows);

    const sql = querySql(query);
    expect(sql).toContain('fi.tenant_id::text as "tenantId"');
    expect(sql).toContain('fi.workspace_id::text as "workspaceId"');
    expect(sql).toContain('fi.interest_id::text as "interestId"');
    expect(sql).toContain('i.tenant_id::text as "interestTenantId"');
    expect(sql).toContain('i.workspace_id::text as "interestWorkspaceId"');
    expect(sql).toContain("on i.id = fi.interest_id");
    expect(sql).toContain("and i.tenant_id = $1::uuid");
    expect(sql).toContain("and i.workspace_id = $2::uuid");
    expect(sql).toContain("where fi.tenant_id = $1::uuid");
    expect(sql).toContain("and fi.workspace_id = $2::uuid");
    expect(sql).toContain("and fi.id = any($3::uuid[])");
    expect(query.mock.calls[0]?.[1]).toEqual([
      tenantId,
      workspaceId,
      feedItemIds,
    ]);
  });

  it("short-circuits every empty UUID list without querying PostgreSQL", async () => {
    const query = jest.fn();
    const store = createStore(query);
    const params = { tenantId, workspaceId, feedItemIds: [] };

    await expect(store.readFeedItemsByIds(params)).resolves.toEqual([]);
    await expect(
      store.readSelectedFeedItemProvenance(params),
    ).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

function createStore(
  query: jest.Mock,
  badGamingFalsePositiveNeedle = "false-positive-needle",
): YesterdayReaderSummaryArtifactQualityStore {
  return new YesterdayReaderSummaryArtifactQualityStore(
    { query } as unknown as Pool,
    collectionDate,
    badGamingFalsePositiveNeedle,
  );
}

function querySql(query: jest.Mock, callIndex = 0): string {
  return String(query.mock.calls[callIndex]?.[0]);
}

function artifactRecord(
  overrides: Partial<PrismaReaderSummaryArtifactRecord> = {},
): PrismaReaderSummaryArtifactRecord {
  return {
    id: "00000000-0000-7000-8000-000000000101",
    tenantId,
    workspaceId,
    scopeType: "workspace",
    scopeKey: "workspace",
    interestId: null,
    cadence: "daily",
    periodStartedAt: new Date("2026-07-18T00:00:00.000Z"),
    periodEndedAt: new Date("2026-07-19T00:00:00.000Z"),
    periodTimezone: "UTC",
    periodKey,
    userId: null,
    subscriptionId: null,
    status: "COMPLETED",
    schemaVersion: 1,
    modelVersion: "model-v1",
    promptVersion: "prompt-v1",
    headline: "Example headline",
    summaryText: "Example summary",
    artifactPayload: { schemaVersion: 1 },
    citations: [],
    qualitySignals: { grounded: true },
    createdAt: new Date("2026-07-19T00:01:00.000Z"),
    updatedAt: new Date("2026-07-19T00:02:00.000Z"),
    ...overrides,
  };
}
