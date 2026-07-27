import type {
  ReaderSummaryProductionRecoveryAuthorityBinding,
  ReaderSummaryProductionRecoveryAuthorityHandle,
  ReaderSummaryProductionRecoveryAuthorityPort,
} from "@social-monitor/summary/ports";

import {
  runReaderSummaryProductionRecovery,
  readerSummaryProductionRecoveryDayIds,
  type ReaderSummaryProductionRecoveryDayExecutor,
} from "./reader-summary-production-recovery-cli";
import {
  PrismaReaderSummaryProductionRecoveryReplayGuard,
  type ReaderSummaryProductionRecoveryReplayGuardClient,
} from "./reader-summary-production-recovery-replay-guard";
import {
  discoverReaderSummaryProductionRecoveryScope,
  resolveReaderSummaryProductionRecoverySourceDatabaseUrl,
  resolveReaderSummaryProductionRecoveryScope,
  type ReaderSummaryProductionRecoveryScope,
  type ReaderSummaryProductionRecoveryScopeDiscoveryClient,
} from "../recover-reader-summary-production";

describe("reader summary production recovery CLI wrapper", () => {
  it("uses explicit tenant and workspace env without discovery", async () => {
    const explicitScope = scopeFixture("1", "2");
    const discover = jest.fn(async () => scopeFixture("3", "4"));

    await expect(
      resolveReaderSummaryProductionRecoveryScope({
        env: {
          READER_SUMMARY_PRODUCTION_RECOVERY_TENANT_ID: ` ${explicitScope.tenantId} `,
          READER_SUMMARY_PRODUCTION_RECOVERY_WORKSPACE_ID:
            explicitScope.workspaceId,
        },
        discover,
      }),
    ).resolves.toEqual(explicitScope);
    expect(discover).not.toHaveBeenCalled();
  });

  it("discovers scope when either env value is missing", async () => {
    const discoveredScope = scopeFixture("3", "4");
    const discover = jest.fn(async () => discoveredScope);

    await expect(
      resolveReaderSummaryProductionRecoveryScope({
        env: {
          READER_SUMMARY_PRODUCTION_RECOVERY_TENANT_ID:
            scopeFixture("1", "2").tenantId,
        },
        discover,
      }),
    ).resolves.toEqual(discoveredScope);
    expect(discover).toHaveBeenCalledTimes(1);
  });

  it("does not require a manual source database URL prerequisite", () => {
    expect(
      resolveReaderSummaryProductionRecoverySourceDatabaseUrl({
        env: {},
        productionDatabaseUrl: "postgresql://production.example/db",
      }),
    ).toBe("postgresql://production.example/db");
    expect(
      resolveReaderSummaryProductionRecoverySourceDatabaseUrl({
        env: {
          READER_SUMMARY_PRODUCTION_RECOVERY_SOURCE_DATABASE_URL:
            " postgresql://snapshot.example/db ",
        },
        productionDatabaseUrl: "postgresql://production.example/db",
      }),
    ).toBe("postgresql://snapshot.example/db");
  });

  it("fails discovery when no active production scope matches", async () => {
    const { client } = scopeDiscoveryClient([]);

    await expect(
      discoverReaderSummaryProductionRecoveryScope(client),
    ).rejects.toThrow("expected exactly one scope, found 0");
  });

  it("fails discovery when active production rows match multiple scopes", async () => {
    const { client } = scopeDiscoveryClient([
      scopeFixture("1", "2"),
      scopeFixture("3", "4"),
    ]);

    await expect(
      discoverReaderSummaryProductionRecoveryScope(client),
    ).rejects.toThrow("expected exactly one scope, found 2");
  });

  it("uses read-only production feed/source SQL for scope discovery", async () => {
    const expectedScope = scopeFixture("1", "2");
    const { client, queryRaw } = scopeDiscoveryClient([expectedScope]);

    await expect(
      discoverReaderSummaryProductionRecoveryScope(client),
    ).resolves.toEqual(expectedScope);

    const sql = normalizeSql(sqlFromQueryRaw(queryRaw));
    expect(sql).toContain("select distinct");
    expect(sql).toContain('feed."tenant_id"::text as "tenantid"');
    expect(sql).toContain('feed."workspace_id"::text as "workspaceid"');
    expect(sql).toContain('from "feed_items" as feed');
    expect(sql).toContain('join "source_items" as source');
    expect(sql).toContain('source."id" = feed."source_item_id"');
    expect(sql).toContain('source."tenant_id" = feed."tenant_id"');
    expect(sql).toContain('source."workspace_id" = feed."workspace_id"');
    expect(sql).toContain(
      'source."source_binding_id" = feed."source_binding_id"',
    );
    expect(sql).toContain('source."provider_key" = feed."provider_key"');
    expect(sql).toContain('source."canonical_url" = feed."canonical_url"');
    expect(sql).toContain('join "tenants" as tenant');
    expect(sql).toContain('tenant."id" = feed."tenant_id"');
    expect(sql).toContain('tenant."deleted_at" is null');
    expect(sql).toContain('join "workspaces" as workspace');
    expect(sql).toContain('workspace."id" = feed."workspace_id"');
    expect(sql).toContain('workspace."tenant_id" = feed."tenant_id"');
    expect(sql).toContain('workspace."deleted_at" is null');
    expect(sql).toContain('feed."status" = \'visible\'');
    expect(sql).toContain('feed."provider_key" = any(array[');
    expect(sql).toContain("'github-trending-page'");
    expect(sql).toContain("'hacker-news'");
    expect(sql).toContain("'reddit'");
    expect(sql).toContain("'rss'");
    expect(sql).toContain("'x-twitter'");
    expect(sql).toContain(
      "date '2026-07-24'::timestamp at time zone 'utc'",
    );
    expect(sql).toContain(
      "date '2026-07-26'::timestamp at time zone 'utc'",
    );
    expect(sql).toContain('feed."observed_at" >=');
    expect(sql).toContain('feed."observed_at" <');
    expect(sql).toContain('order by "tenantid", "workspaceid"');
    expect(sql).not.toContain('order by feed."tenant_id", feed."workspace_id"');
    expect(sql).not.toContain('feed."published_at"');
    expect(sql).not.toContain("having");
    expect(sql).not.toMatch(/\bcount\s*\(/u);
    expect(sql).not.toMatch(/=\s*(?:100|75|73|67|10|0)\b/u);
    expect(sql).not.toMatch(/\bprepare_reader_summary_production_recovery\b/u);
    expect(sql).not.toMatch(/\binsert\b|\bupdate\b|\bdelete\b/u);
    expect(sql).not.toMatch(/\bfor\s+(?:update|share)\b/u);
  });

  it("requires explicit apply before durable authority preparation", async () => {
    const authority = authorityPort("prepared");
    const executeDay = jest.fn();

    await expect(
      runReaderSummaryProductionRecovery({
        apply: false,
        authority,
        executeDay,
      }),
    ).rejects.toThrow("requires --apply");
    expect(authority.prepare).not.toHaveBeenCalled();
    expect(executeDay).not.toHaveBeenCalled();
  });

  it("short-circuits replay before provider, model, or write execution", async () => {
    const authority = authorityPort("replayed");
    const executeDay = jest.fn();

    const result = await runReaderSummaryProductionRecovery({
      apply: true,
      authority,
      executeDay,
    });

    expect(result.outcome).toBe("replayed");
    expect(result.dayResults).toEqual([
      { requestedUtcDate: "2026-07-23", outcome: "skipped" },
      { requestedUtcDate: "2026-07-24", outcome: "skipped" },
    ]);
    expect(executeDay).not.toHaveBeenCalled();
  });

  it("skips day execution when current production already has exact recovery receipts", async () => {
    const binding = bindingFixture();
    const authority = authorityPort("prepared", binding);
    const replayGuard = {
      isReplayed: jest.fn(async () => true),
    };
    const executeDay = jest.fn();

    const result = await runReaderSummaryProductionRecovery({
      apply: true,
      authority,
      replayGuard,
      executeDay,
    });

    expect(result.dayResults).toEqual([
      {
        requestedUtcDate: "2026-07-23",
        outcome: "replayed",
        readerSummaryJobId: readerSummaryProductionRecoveryDayIds(
          binding,
          "2026-07-23",
        ).readerSummaryJobId,
        readerSummaryId: readerSummaryProductionRecoveryDayIds(
          binding,
          "2026-07-23",
        ).readerSummaryId,
      },
      {
        requestedUtcDate: "2026-07-24",
        outcome: "replayed",
        readerSummaryJobId: readerSummaryProductionRecoveryDayIds(
          binding,
          "2026-07-24",
        ).readerSummaryJobId,
        readerSummaryId: readerSummaryProductionRecoveryDayIds(
          binding,
          "2026-07-24",
        ).readerSummaryId,
      },
    ]);
    expect(replayGuard.isReplayed).toHaveBeenCalledTimes(2);
    expect(executeDay).not.toHaveBeenCalled();
  });

  it("executes each exact recovery date once after a fresh authority prepare", async () => {
    const authority = authorityPort("prepared");
    const executeDay: jest.MockedFunction<ReaderSummaryProductionRecoveryDayExecutor> =
      jest.fn(async ({ requestedUtcDate }) => ({
        requestedUtcDate,
        outcome: "published",
        readerSummaryJobId: `job-${requestedUtcDate}`,
        readerSummaryId: `artifact-${requestedUtcDate}`,
      }));

    const result = await runReaderSummaryProductionRecovery({
      apply: true,
      authority,
      executeDay,
    });

    expect(result.outcome).toBe("applied");
    expect(executeDay).toHaveBeenCalledTimes(2);
    expect(executeDay.mock.calls.map((call) => call[0].requestedUtcDate)).toEqual([
      "2026-07-23",
      "2026-07-24",
    ]);
    expect(result.dayResults.map((day) => day.readerSummaryId)).toEqual([
      "artifact-2026-07-23",
      "artifact-2026-07-24",
    ]);
  });

  it("checks production receipts with read-only replay SQL", async () => {
    const { client, queryRaw } = replayGuardClient(true);
    const guard = new PrismaReaderSummaryProductionRecoveryReplayGuard(client);

    await expect(
      guard.isReplayed({
        binding: bindingFixture(),
        requestedUtcDate: "2026-07-24",
      }),
    ).resolves.toBe(true);

    const sql = normalizeSql(sqlFromQueryRaw(queryRaw));
    expect(sql).toContain(
      'from "reader_summary_recovery_receipts" as receipt',
    );
    expect(sql).toContain('join "reader_summary_publications" as publication');
    expect(sql).toContain('join "reader_summary_artifacts" as artifact');
    expect(sql).toContain('receipt."recovery_kind" = \'summary_only\'');
    expect(sql).toContain('receipt."provenance" =');
    expect(sql).toContain('artifact."status" = \'completed\'');
    expect(sql).not.toMatch(/\bfeed_items\b|\bsource_items\b/u);
    expect(sql).not.toMatch(/\binsert\b|\bupdate\b|\bdelete\b/u);
    expect(sql).not.toMatch(/\bfinalize_reader_summary_recovery\b/u);
  });
});

function authorityPort(
  outcome: "prepared" | "replayed",
  binding: ReaderSummaryProductionRecoveryAuthorityBinding = bindingFixture(),
): jest.Mocked<ReaderSummaryProductionRecoveryAuthorityPort> {
  const handle = {} as ReaderSummaryProductionRecoveryAuthorityHandle;
  return {
    prepare: jest.fn(async () => ({ outcome, authority: handle })),
    readVerifiedBinding: jest.fn(() => binding),
  };
}

function scopeFixture(
  tenantSuffix: string,
  workspaceSuffix: string,
): ReaderSummaryProductionRecoveryScope {
  return {
    tenantId: `11111111-1111-4111-8111-${tenantSuffix.repeat(12)}`,
    workspaceId: `22222222-2222-4222-8222-${workspaceSuffix.repeat(12)}`,
  };
}

type QueryRawMock = jest.MockedFunction<
  ReaderSummaryProductionRecoveryScopeDiscoveryClient["$queryRaw"]
>;

function scopeDiscoveryClient(
  rows: readonly ReaderSummaryProductionRecoveryScope[],
): Readonly<{
  client: ReaderSummaryProductionRecoveryScopeDiscoveryClient;
  queryRaw: QueryRawMock;
}> {
  const queryRaw = jest.fn(
    async <T = unknown>(
      _query: TemplateStringsArray,
      ..._values: readonly unknown[]
    ): Promise<T> => rows as unknown as T,
  ) as QueryRawMock;
  return { client: { $queryRaw: queryRaw }, queryRaw };
}

function replayGuardClient(replayed: boolean): Readonly<{
  client: ReaderSummaryProductionRecoveryReplayGuardClient;
  queryRaw: QueryRawMock;
}> {
  const queryRaw = jest.fn(
    async <T = unknown>(
      _query: TemplateStringsArray,
      ..._values: readonly unknown[]
    ): Promise<T> => [{ replayed }] as unknown as T,
  ) as QueryRawMock;
  return { client: { $queryRaw: queryRaw }, queryRaw };
}

function sqlFromQueryRaw(queryRaw: QueryRawMock): string {
  const call = queryRaw.mock.calls[0];
  if (call === undefined) {
    throw new Error("Expected discovery query to run");
  }
  const [strings, ...values] = call;
  return strings.reduce(
    (sql, chunk, index) =>
      `${sql}${chunk}${index < values.length ? String(values[index]) : ""}`,
    "",
  );
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim().toLowerCase();
}

function bindingFixture(): ReaderSummaryProductionRecoveryAuthorityBinding {
  return {
    schemaVersion: "reader_summary.production_recovery_authority.v1",
    recoveryId: "33333333-3333-4333-8333-333333333333",
    identity: "reader_summary.production_recovery.v1:fixture",
    tenantId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    requestedUtcDates: ["2026-07-23", "2026-07-24"],
    canonicalSha256: "a".repeat(64),
    dryRunCanonicalSha256s: ["a".repeat(64), "a".repeat(64)],
    lease: {
      state: "CONSUMED",
      issuedAt: "2026-07-25T00:00:00.000Z",
      consumedAt: "2026-07-25T00:00:01.000Z",
    },
    boundaries: {
      stage: "pre_model",
      modelCallPerformed: false,
      publicationPerformed: false,
      recollectionPerformed: false,
    },
    days: [
      day("2026-07-23", [0, 100, 100, 75, 67], "historical_unavailable"),
      day("2026-07-24", [10, 100, 100, 67, 73], "verified_existing"),
    ],
  };
}

function day(
  date: "2026-07-23" | "2026-07-24",
  counts: readonly [number, number, number, number, number],
  githubMode: "historical_unavailable" | "verified_existing",
): ReaderSummaryProductionRecoveryAuthorityBinding["days"][number] {
  const providerKeys = [
    "github-trending-page",
    "hacker-news",
    "reddit",
    "rss",
    "x-twitter",
  ] as const;
  const providerEvidence = Object.fromEntries(
    providerKeys.map((providerKey, providerIndex) => [
      providerKey,
      Array.from({ length: counts[providerIndex] }, (_, index) => ({
        providerKey,
        feedItemId: `20000000-0000-4000-8000-${providerIndex + 1}${String(index + 1).padStart(11, "0")}`,
        sourceItemId: `10000000-0000-4000-8000-${providerIndex + 1}${String(index + 1).padStart(11, "0")}`,
        sourceBindingId: `30000000-0000-4000-8000-${String(providerIndex + 1).padStart(12, "0")}`,
        providerItemId: `recovery:${date}:${providerKey}:${index + 1}`,
        canonicalUrl: `https://fixture.invalid/${date}/${providerKey}/${index + 1}`,
        sourceContentHash: "1".repeat(64),
        sourceProviderContentHash:
          providerKey === "github-trending-page" ? "2".repeat(64) : null,
        publishedAt: `${date}T12:00:00.000Z`,
        observedAt: `${date}T12:00:00.000Z`,
        ...(providerKey === "github-trending-page"
          ? {
              github: {
                resultId: `80000000-0000-4000-8000-${providerIndex + 1}${String(index + 1).padStart(11, "0")}`,
                scanJobId: "70000000-0000-4000-8000-000000000001",
                scanAttemptNumber: 1,
                repositoryIdentity: `owner/repo-${index + 1}`,
                rank: index + 1,
                checkedAt: `${date}T12:00:00.000Z`,
              },
            }
          : {}),
      })),
    ]),
  ) as ReaderSummaryProductionRecoveryAuthorityBinding["days"][number]["providerEvidence"];
  return {
    schemaVersion: "reader_summary.production_recovery_day.v1",
    identity: `reader_summary.production_recovery_day.v1:${date}`,
    requestedUtcDate: date,
    period: {
      startedAt: `${date}T00:00:00.000Z`,
      endedAt:
        date === "2026-07-23"
          ? "2026-07-24T00:00:00.000Z"
          : "2026-07-25T00:00:00.000Z",
      timezone: "UTC",
    },
    providerCounts: providerKeys.map((providerKey, index) => ({
      providerKey,
      count: counts[index],
    })),
    providerEvidence,
    providerEvidenceSha256: "b".repeat(64),
    githubEvidence:
      githubMode === "historical_unavailable"
        ? {
            schemaVersion:
              "reader_summary.production_recovery_github_evidence.v1",
            mode: "historical_unavailable",
            providerKey: "github-trending-page",
            requestedUtcDate: "2026-07-23",
            evidenceCount: 0,
            authorization: {
              authorizationId:
                "reader_summary.production_recovery.github.2026-07-23.v1",
              authorizedAt: "2026-07-25T00:00:00.000Z",
              reason:
                "Historical GitHub trending evidence was not collected for this UTC day; this one reviewed recovery authorizes an explicit unavailable marker and no substitute data.",
            },
          }
        : {
            schemaVersion:
              "reader_summary.production_recovery_github_evidence.v1",
            mode: "verified_existing",
            providerKey: "github-trending-page",
            requestedUtcDate: "2026-07-24",
            evidenceCount: 10,
            evidenceSha256: "c".repeat(64),
            scanJobIds: ["70000000-0000-4000-8000-000000000001"],
          },
    canonicalSha256: "d".repeat(64),
  };
}
