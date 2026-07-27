import type {
  ReaderSummaryProductionRecoveryAuthorityBinding,
  ReaderSummaryProductionRecoveryAuthorityHandle,
  ReaderSummaryProductionRecoveryAuthorityPort,
} from "@social-monitor/summary/ports";

import {
  runReaderSummaryProductionRecovery,
  type ReaderSummaryProductionRecoveryDayExecutor,
} from "./reader-summary-production-recovery-cli";
import {
  discoverReaderSummaryProductionRecoveryScope,
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

  it("fails discovery when the immutable counts match multiple scopes", async () => {
    const { client } = scopeDiscoveryClient([
      scopeFixture("1", "2"),
      scopeFixture("3", "4"),
    ]);

    await expect(
      discoverReaderSummaryProductionRecoveryScope(client),
    ).rejects.toThrow("expected exactly one scope, found 2");
  });

  it("uses read-only immutable count SQL for scope discovery", async () => {
    const expectedScope = scopeFixture("1", "2");
    const { client, queryRaw } = scopeDiscoveryClient([expectedScope]);

    await expect(
      discoverReaderSummaryProductionRecoveryScope(client),
    ).resolves.toEqual(expectedScope);

    const sql = normalizeSql(sqlFromQueryRaw(queryRaw));
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
    expect(sql).toContain('tenant."deleted_at" is null');
    expect(sql).toContain('join "workspaces" as workspace');
    expect(sql).toContain('workspace."deleted_at" is null');
    expect(sql).toContain('feed."status" = \'visible\'');
    expect(sql).toContain(
      "date '2026-07-23'::timestamp at time zone 'utc'",
    );
    expect(sql).toContain(
      "date '2026-07-25'::timestamp at time zone 'utc'",
    );
    expect(sql).toContain('count(*) = count(distinct source."id")');
    expectProviderCount(sql, "github-trending-page", 0, 1);
    expectProviderCount(sql, "hacker-news", 100, 2);
    expectProviderCount(sql, "reddit", 100, 2);
    expectProviderCount(sql, "rss", 75, 1);
    expectProviderCount(sql, "x-twitter", 67, 1);
    expectProviderCount(sql, "github-trending-page", 10, 1);
    expectProviderCount(sql, "rss", 67, 1);
    expectProviderCount(sql, "x-twitter", 73, 1);
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
});

function authorityPort(
  outcome: "prepared" | "replayed",
): jest.Mocked<ReaderSummaryProductionRecoveryAuthorityPort> {
  const handle = {} as ReaderSummaryProductionRecoveryAuthorityHandle;
  return {
    prepare: jest.fn(async () => ({ outcome, authority: handle })),
    readVerifiedBinding: jest.fn(() => bindingFixture()),
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

function expectProviderCount(
  sql: string,
  providerKey: string,
  count: number,
  occurrences: number,
): void {
  const token = `feed."provider_key" = '${providerKey}' ) = ${count}`;
  expect(sql.split(token).length - 1).toBe(occurrences);
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
