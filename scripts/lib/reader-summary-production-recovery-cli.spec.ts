import type {
  FeedItemReadRepositoryPort,
  FeedSourceContentItem,
} from "@social-monitor/feed/ports";
import type { ReaderSummaryGitHubProjectionItem } from "@social-monitor/summary/domain";
import type {
  ReaderSummaryGitHubProjectionReaderPort,
  ReaderSummaryProductionRecoveryAuthorityBinding,
  ReaderSummaryProductionRecoveryAuthorityHandle,
  ReaderSummaryProductionRecoveryAuthorityPort,
  ReadReaderSummaryGitHubProjectionQuery,
  ReadReaderSummaryGitHubProjectionResult,
} from "@social-monitor/summary/ports";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import type { PrismaSummaryTransactionOptions } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-transaction";
import { resolvePostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";

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
  configureProductionRecoverySession,
  createReaderSummaryProductionRecoveryGitHubProjectionSnapshot,
  discoverReaderSummaryProductionRecoveryScope,
  resolveReaderSummaryProductionRecoveryRuntimePoolConfigs,
  resolveReaderSummaryProductionRecoverySourceDatabaseUrl,
  resolveReaderSummaryProductionRecoveryScope,
  runReaderSummaryProductionRecoveryPhases,
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

  it("uses entrypoint runtime pool config and rejects separate source DB", () => {
    const productionDatabaseUrl = "postgresql://production.example/db";
    const env = {
      DATABASE_URL: productionDatabaseUrl,
      POSTGRES_RUNTIME_PROCESS: "daily-runner",
      POSTGRES_RUNTIME_POOL_MIN: "0",
      POSTGRES_RUNTIME_POOL_MAX: "2",
    };
    const defaultSource = resolveReaderSummaryProductionRecoverySourceDatabaseUrl({
      env: {},
      productionDatabaseUrl,
    });
    const configs = resolveReaderSummaryProductionRecoveryRuntimePoolConfigs({
      env,
      sourceDatabaseUrl: defaultSource,
      resolveRuntimePoolConfig: resolvePostgresRuntimePoolConfig,
    });
    expect(defaultSource).toBe(productionDatabaseUrl);
    expect(configs.productionRuntimePoolConfig.processId).toBe("daily-runner");
    expect(configs.productionRuntimePoolConfig.max).toBe(2);
    expect(configs.sourceRuntimePoolConfig).toBe(configs.productionRuntimePoolConfig);
    expect(() =>
      resolveReaderSummaryProductionRecoveryRuntimePoolConfigs({
        env,
        sourceDatabaseUrl: "postgresql://snapshot.example/db",
        resolveRuntimePoolConfig: resolvePostgresRuntimePoolConfig,
      }),
    ).toThrow("must match DATABASE_URL");
  });

  it("fails discovery with bounded sanitized feed-item scope diagnostics", async () => {
    const diagnostics = [
      { timestamp_column: "observed_at", tenant_sha256_12: "aaaaaaaaaaaa", workspace_sha256_12: "bbbbbbbbbbbb", utc_date: "2026-07-23", provider_key: "hacker-news", normalized_status: "VISIBLE", count: 100 },
      { timestamp_column: "created_at", tenant_sha256_12: "cccccccccccc", workspace_sha256_12: "dddddddddddd", utc_date: "2026-07-24", provider_key: "rss", normalized_status: "HIDDEN", count: 3 },
      { timestamp_column: "published_at", tenant_sha256_12: "eeeeeeeeeeee", workspace_sha256_12: "ffffffffffff", utc_date: "2026-07-24", provider_key: "x-twitter", normalized_status: "VISIBLE", count: 73 },
    ] satisfies readonly ScopeDiagnosticsFixture[];
    const { client, queryRaw } = scopeDiscoveryClient([], diagnostics);

    const message = await rejectedMessage(discoverReaderSummaryProductionRecoveryScope(client));

    expect(message).toContain("expected exactly one scope, found 0");
    expect(queryRaw).toHaveBeenCalledTimes(2);
    const sql = normalizeSql(sqlFromQueryRaw(queryRaw, 1));
    for (const expected of [
      'from "feed_items" as feed', "'observed_at'::text as \"timestamp_column\"", "'created_at'::text as \"timestamp_column\"", "'published_at'::text as \"timestamp_column\"",
      'left(encode(sha256(convert_to(feed."tenant_id"::text, \'utf8\')), \'hex\'), 12) as "tenant_sha256_12"', 'left(encode(sha256(convert_to(feed."workspace_id"::text, \'utf8\')), \'hex\'), 12) as "workspace_sha256_12"',
      'coalesce(upper(feed."status"::text), \'unknown\') as "normalized_status"', 'count(*)::integer as "count"', "date '2026-07-23'::timestamp at time zone 'utc'", "date '2026-07-25'::timestamp at time zone 'utc'", "group by 1, 2, 3, 4, 5, 6", 'order by diagnostics."timestamp_column", diagnostics."tenant_sha256_12", diagnostics."workspace_sha256_12", diagnostics."utc_date", diagnostics."provider_key", diagnostics."normalized_status", diagnostics."count"', "union all",
    ]) {
      expect(sql).toContain(expected);
    }
    for (const provider of ["github-trending-page", "hacker-news", "reddit", "rss", "x-twitter"]) {
      expect(sql).toContain(`'${provider}'`);
    }
    expect(sql).not.toMatch(/\bjoin\b|\binsert\b|\bupdate\b|\bdelete\b|\bmerge\b|\btruncate\b|\bfor\s+(?:update|share|key\s+share|no\s+key\s+update)\b/u);
    expect(sql).not.toMatch(/\bcanonical_url\b|\burl\b|\btitle\b|\bcontent_hash\b|\bmetadata\b|\bsource_(?:item|binding)_id\b/u);
    expect(message).toContain('{"scope_diagnostics"');
    const json = message.slice(message.indexOf('{"scope_diagnostics"'));
    expect(JSON.parse(json)).toEqual({ scope_diagnostics: diagnostics });
    expect(json.length).toBeLessThan(900);
    for (const field of ['"tenant_sha256_12"', '"workspace_sha256_12"']) expect(json).toContain(field);
    expect(message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu);
    for (const fullId of Object.values(scopeFixture("9", "8"))) expect(message).not.toContain(fullId);
    expect(json).not.toMatch(/\bcanonical_url\b|\burl\b|\btitle\b|\bcontent_hash\b|\bmetadata\b|\bsource_(?:item|binding)_id\b/u);
  });

  it("discovers scope from visible feed counts without source joins", async () => {
    const expectedScope = scopeFixture("1", "2");
    const { client, queryRaw } = scopeDiscoveryClient([expectedScope]);

    await expect(discoverReaderSummaryProductionRecoveryScope(client)).resolves.toEqual(expectedScope);
    expect(queryRaw).toHaveBeenCalledTimes(1);

    const sql = normalizeSql(sqlFromQueryRaw(queryRaw));
    expect(sql).toContain('feed."tenant_id"::text as "tenantid"');
    expect(sql).toContain('feed."workspace_id"::text as "workspaceid"');
    for (const expected of [
      'from "feed_items" as feed',
      'upper(feed."status"::text) = \'visible\'',
      'feed."provider_key" = any(array[',
      "date '2026-07-23'::timestamp at time zone 'utc'",
      "date '2026-07-24'::timestamp at time zone 'utc'",
      "date '2026-07-25'::timestamp at time zone 'utc'",
      "group by feed.\"tenant_id\", feed.\"workspace_id\"",
      "having count(*) = 696",
      ") = 345", ") = 351", ") = 0", ") = 10", ") = 100", ") = 78",
      ") = 67", ") = 68", ") = 73",
    ]) {
      expect(sql).toContain(expected);
    }
    for (const provider of ["github-trending-page", "hacker-news", "reddit", "rss", "x-twitter"]) {
      expect(sql).toContain(`'${provider}'`);
    }
    expect(sql).toContain('order by "tenantid", "workspaceid"');
    expect(sql).not.toContain('order by feed."tenant_id", feed."workspace_id"');
    expect(sql).not.toContain("sha256");
    expect(sql).not.toMatch(/\bjoin\b/u);
    expect(sql).not.toContain('feed."observed_at"');
    const forbiddenScopeTables = /\b(?:tenants|workspaces|source_items|source_bindings|source_catalog_entries|interests|github_[a-z_]+|scan_jobs|scan_attempts)\b/u;
    expect(sql).not.toMatch(forbiddenScopeTables);
    expect(sql).not.toMatch(/\bcontent_hash\b|\bprovider_content_hash\b|\bmetadata\b/u);
    expect(sql).not.toContain('source."source_binding_id"');
    expect(sql).not.toContain('source."canonical_url"');
    expect(sql).not.toMatch(/\bprepare_reader_summary_production_recovery\b|\bprepare\b/u);
    expect(sql).not.toMatch(/\binsert\b|\bupdate\b|\bdelete\b/u);
    expect(sql).not.toMatch(/\bfor\s+(?:update|share)\b/u);
  });

  it("configures production recovery session with exact non-system scope", async () => {
    const scope = scopeFixture("1", "2");
    const { client, queryRaw } = scopeDiscoveryClient([]);

    await configureProductionRecoverySession(client, scope);

    const sql = normalizeSql(sqlFromQueryRaw(queryRaw));
    expect(sql).toContain("set_config('social_monitor.tenant_id',");
    expect(sql).toContain("set_config('social_monitor.workspace_id',");
    expect(sql).toContain(
      "set_config('social_monitor.system_access', 'false', false)",
    );
    expect(queryRaw.mock.calls[0]?.slice(1)).toEqual([
      scope.tenantId,
      scope.workspaceId,
    ]);
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

  it("prepares authority on production while source snapshot serves evidence", async () => {
    const events: string[] = [];
    const binding = bindingFixture();
    const expectedSourceRows = uniqueSourceOnlyEvidenceRows(binding);
    const expectedFeedIds = expectedSourceRows.map((row) => row.feedItemId);
    const expectedFeedSourcePairs = expectedSourceRows.map((row) => ({
      feedItemId: row.feedItemId,
      sourceItemId: row.sourceItemId,
    }));
    const sourceSummaryConnection = {
      $queryRaw: jest.fn(),
      close: jest.fn(async () => {
        events.push("source-summary.close");
      }),
    };
    const sourceFeedConnection = {
      close: jest.fn(async () => {
        events.push("source-feed.close");
      }),
    };
    const productionSummaryConnection = {
      $queryRaw: jest.fn(async <T = unknown>(): Promise<T> => {
        events.push("production-session.configure");
        return [] as unknown as T;
      }) as QueryRawMock,
      close: jest.fn(async () => {
        events.push("production.close");
      }),
    };
    const productionAuthority = authorityPort("prepared", binding);
    const sourceFeedItems = sourceFeedItemsForBinding(binding);
    const sourceFindById =
      sourceFeedItems.findById as jest.MockedFunction<
        FeedItemReadRepositoryPort["findById"]
      >;
    const sourceReadSourceContent =
      sourceFeedItems.readSourceContent as jest.MockedFunction<
        NonNullable<FeedItemReadRepositoryPort["readSourceContent"]>
      >;
    const result = await runReaderSummaryProductionRecoveryPhases({
      env: {},
      createSourceSummaryConnection: async () => {
        events.push("source-summary.open");
        return sourceSummaryConnection;
      },
      createSourceFeedConnection: async () => {
        events.push("source-feed.open");
        return sourceFeedConnection;
      },
      createProductionSummaryConnection: async () => {
        events.push("production.open");
        return productionSummaryConnection;
      },
      createProductionAuthority: (productionSummary) => {
        expect(productionSummary).toBe(productionSummaryConnection);
        expect(productionSummary).not.toBe(sourceSummaryConnection);
        events.push("production-authority.create");
        productionAuthority.prepare.mockImplementationOnce(async () => {
          events.push("production-authority.prepare");
          return {
            outcome: "prepared",
            authority: {} as ReaderSummaryProductionRecoveryAuthorityHandle,
          };
        });
        productionAuthority.readVerifiedBinding.mockImplementationOnce(() => {
          events.push("production-authority.read-binding");
          return binding;
        });
        return productionAuthority;
      },
      discoverScope: async (sourceSummary) => {
        expect(sourceSummary).toBe(sourceSummaryConnection);
        events.push("scope.discover");
        return {
          tenantId: binding.tenantId,
          workspaceId: binding.workspaceId,
        };
      },
      createSourceFeedItems: (feedConnection) => {
        expect(feedConnection).toBe(sourceFeedConnection);
        events.push("source-feed-items.create");
        return sourceFeedItems;
      },
      createSourceGitHubProjectionReader: (sourceSummary) => {
        expect(sourceSummary).toBe(sourceSummaryConnection);
        events.push("source-github-reader.create");
        return githubProjectionReaderForBinding(binding);
      },
      runProduction: async ({ sourceSnapshot }) => {
        events.push("production.run");
        expect(sourceSnapshot.scope).toEqual({
          tenantId: binding.tenantId,
          workspaceId: binding.workspaceId,
        });
        if (sourceSnapshot.feedItems.readSourceContent === undefined) {
          throw new Error("Expected source snapshot content reader");
        }
        const sourceContents =
          await sourceSnapshot.feedItems.readSourceContent({
            tenantId: binding.tenantId,
            workspaceId: binding.workspaceId,
            feedItemIds: expectedFeedIds,
          });
        expect(
          sourceContents.map((item) => ({
            feedItemId: item.feedItemId,
            sourceItemId: item.sourceItemId,
          })),
        ).toEqual(expectedFeedSourcePairs);
        const firstExpected = expectedSourceRows[0];
        if (firstExpected === undefined) {
          throw new Error("Expected source evidence rows");
        }
        const firstFeedItem = await sourceSnapshot.feedItems.findById({
          tenantId: binding.tenantId,
          workspaceId: binding.workspaceId,
          feedItemId: firstExpected.feedItemId,
        });
        expect(firstFeedItem?.toSnapshot().sourceItemId).toBe(
          firstExpected.sourceItemId,
        );
        await sourceSnapshot.githubProjectionReader.read(
          githubProjectionQueryForBinding(
            binding,
            new Date("2026-07-25T00:00:00.000Z"),
          ),
        );
        return "ok" as const;
      },
    });

    expect(result).toBe("ok");
    expect(productionAuthority.prepare).toHaveBeenCalledTimes(1);
    expect(productionAuthority.readVerifiedBinding).toHaveBeenCalledTimes(1);
    expect(productionSummaryConnection.$queryRaw).toHaveBeenCalledTimes(1);
    expect(
      productionSummaryConnection.$queryRaw.mock.calls[0]?.slice(1),
    ).toEqual([binding.tenantId, binding.workspaceId]);
    expect(sourceFindById.mock.calls.map((call) => call[0].feedItemId)).toEqual(
      expectedFeedIds,
    );
    expect(sourceReadSourceContent).toHaveBeenCalledTimes(1);
    expect(sourceReadSourceContent.mock.calls[0]?.[0].feedItemIds).toEqual(
      expectedFeedIds,
    );
    expect(events.indexOf("source-feed.close")).toBeLessThan(
      events.indexOf("production.run"),
    );
    expect(events.indexOf("source-summary.close")).toBeLessThan(
      events.indexOf("production.run"),
    );
    expect(events).toEqual([
      "production.open",
      "source-summary.open",
      "scope.discover",
      "production-session.configure",
      "production-authority.create",
      "production-authority.prepare",
      "production-authority.read-binding",
      "source-feed.open",
      "source-feed-items.create",
      "source-github-reader.create",
      "source-feed.close",
      "source-summary.close",
      "production.run",
      "production.close",
    ]);
  });

  it("fails closed when resolved source/env scope diverges from production binding", async () => {
    const events: string[] = [];
    const binding = bindingFixture();
    const resolvedScope = scopeFixture("9", "8");
    const sourceSummaryConnection = {
      $queryRaw: jest.fn(),
      close: jest.fn(async () => {
        events.push("source-summary.close");
      }),
    };
    const productionSummaryConnection = {
      $queryRaw: jest.fn(async <T = unknown>(): Promise<T> => {
        events.push("production-session.configure");
        return [] as unknown as T;
      }) as QueryRawMock,
      close: jest.fn(async () => {
        events.push("production.close");
      }),
    };
    const productionAuthority = authorityPort("prepared", binding);
    productionAuthority.prepare.mockImplementationOnce(async () => {
      events.push("production-authority.prepare");
      return {
        outcome: "prepared",
        authority: {} as ReaderSummaryProductionRecoveryAuthorityHandle,
      };
    });
    productionAuthority.readVerifiedBinding.mockImplementationOnce(() => {
      events.push("production-authority.read-binding");
      return binding;
    });
    const runProduction = jest.fn(async () => "unexpected" as const);
    const createSourceFeedConnection = jest.fn(async () => ({
      close: jest.fn(),
    }));

    await expect(
      runReaderSummaryProductionRecoveryPhases({
        env: {},
        createSourceSummaryConnection: async () => {
          events.push("source-summary.open");
          return sourceSummaryConnection;
        },
        createSourceFeedConnection,
        createProductionSummaryConnection: async () => {
          events.push("production.open");
          return productionSummaryConnection;
        },
        createProductionAuthority: () => {
          events.push("production-authority.create");
          return productionAuthority;
        },
        discoverScope: async () => {
          events.push("scope.discover");
          return resolvedScope;
        },
        createSourceFeedItems: () => sourceFeedItemsForBinding(binding),
        createSourceGitHubProjectionReader: () =>
          githubProjectionReaderForBinding(binding),
        runProduction,
      }),
    ).rejects.toThrow("session scope diverged from production authority");

    expect(
      productionSummaryConnection.$queryRaw.mock.calls[0]?.slice(1),
    ).toEqual([resolvedScope.tenantId, resolvedScope.workspaceId]);
    expect(createSourceFeedConnection).not.toHaveBeenCalled();
    expect(runProduction).not.toHaveBeenCalled();
    expect(events).toEqual([
      "production.open",
      "source-summary.open",
      "scope.discover",
      "production-session.configure",
      "production-authority.create",
      "production-authority.prepare",
      "production-authority.read-binding",
      "source-summary.close",
      "production.close",
    ]);
  });

  it("serves Jul24 GitHub projection at consumedAt and later prepublication observedThrough", async () => {
    const binding = bindingFixture();
    const sourceReader = githubProjectionReaderForBinding(binding);
    const snapshot =
      await createReaderSummaryProductionRecoveryGitHubProjectionSnapshot({
        binding,
        sourceReader,
      });

    const consumedAt = await snapshot.read(
      githubProjectionQueryForBinding(
        binding,
        new Date(binding.lease.consumedAt),
      ),
    );
    const dayEnd = await snapshot.read(
      githubProjectionQueryForBinding(
        binding,
        new Date("2026-07-25T00:00:00.000Z"),
      ),
    );
    const laterPrepublication = await snapshot.read(
      githubProjectionQueryForBinding(
        binding,
        new Date("2026-07-27T12:00:00.000Z"),
      ),
    );

    expect(sourceReader.read).toHaveBeenCalledTimes(1);
    const sourceQuery = sourceReader.read.mock.calls[0]?.[0];
    expect(sourceQuery?.observedThrough.toISOString()).toBe(
      binding.lease.consumedAt,
    );
    expect(consumedAt.items).toHaveLength(10);
    expect(dayEnd.items.map((item) => item.feedItemId)).toEqual(
      consumedAt.items.map((item) => item.feedItemId),
    );
    expect(laterPrepublication).toEqual(consumedAt);
  });

  it("checks production receipts with read-only replay SQL", async () => {
    const { client, queryRaw, transaction } = replayGuardClient(true);
    const guard = new PrismaReaderSummaryProductionRecoveryReplayGuard(client);

    await expect(
      guard.isReplayed({
        binding: bindingFixture(),
        requestedUtcDate: "2026-07-24",
      }),
    ).resolves.toBe(true);

    expectReplayGuardTransactionOptions(transaction);
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

  it("returns false when exact production recovery receipts are absent", async () => {
    const { client, transaction } = replayGuardClient(false);
    const guard = new PrismaReaderSummaryProductionRecoveryReplayGuard(client);

    await expect(
      guard.isReplayed({
        binding: bindingFixture(),
        requestedUtcDate: "2026-07-24",
      }),
    ).resolves.toBe(false);

    expectReplayGuardTransactionOptions(transaction);
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

type QueryRawMock = jest.MockedFunction<ReaderSummaryProductionRecoveryScopeDiscoveryClient["$queryRaw"]>;
type ReplayGuardTransactionMock = jest.MockedFunction<NonNullable<ReaderSummaryProductionRecoveryReplayGuardClient["$transaction"]>>;
type ScopeDiagnosticsFixture = Readonly<{ timestamp_column: string; tenant_sha256_12: string; workspace_sha256_12: string; utc_date: string; provider_key: string; normalized_status: string; count: number }>;

function scopeDiscoveryClient(
  rows: readonly ReaderSummaryProductionRecoveryScope[],
  diagnostics: readonly ScopeDiagnosticsFixture[] = [],
): Readonly<{ client: ReaderSummaryProductionRecoveryScopeDiscoveryClient; queryRaw: QueryRawMock }> {
  let callIndex = 0;
  const queryRaw = jest.fn(
    async <T = unknown>(): Promise<T> => {
      const result = callIndex++ === 0 ? rows : diagnostics;
      return result as unknown as T;
    },
  ) as QueryRawMock;
  return { client: { $queryRaw: queryRaw }, queryRaw };
}

function replayGuardClient(replayed: boolean): Readonly<{ client: ReaderSummaryProductionRecoveryReplayGuardClient; queryRaw: QueryRawMock; transaction: ReplayGuardTransactionMock }> {
  const queryRaw = jest.fn(
    async <T = unknown>(
      _query: TemplateStringsArray,
      ..._values: readonly unknown[]
    ): Promise<T> => [{ replayed }] as unknown as T,
  ) as QueryRawMock;
  const transaction = jest.fn(
    async <TValue>(
      operation: (client: PrismaReaderSummaryClient) => Promise<TValue>,
      _options?: PrismaSummaryTransactionOptions,
    ): Promise<TValue> =>
      operation({ $queryRaw: queryRaw } as PrismaReaderSummaryClient),
  ) as ReplayGuardTransactionMock;
  return { client: { $queryRaw: queryRaw, $transaction: transaction }, queryRaw, transaction };
}

function expectReplayGuardTransactionOptions(
  transaction: ReplayGuardTransactionMock,
): void {
  expect(transaction).toHaveBeenCalledTimes(1);
  expect(transaction.mock.calls[0]?.[1]).toEqual({
    isolationLevel: "Serializable",
    maxWait: 30_000,
    timeout: 300_000,
  });
}

async function rejectedMessage(operation: Promise<unknown>): Promise<string> {
  try { await operation; } catch (error) { if (error instanceof Error) return error.message; }
  throw new Error("Expected operation to reject with Error");
}

function sqlFromQueryRaw(queryRaw: QueryRawMock, callIndex = 0): string {
  const call = queryRaw.mock.calls[callIndex];
  if (call === undefined) {
    throw new Error(`Expected query ${callIndex} to run`);
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
      day("2026-07-23", [0, 100, 100, 78, 67], "historical_unavailable"),
      day("2026-07-24", [10, 100, 100, 68, 73], "verified_existing"),
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

type FeedItemResult = NonNullable<
  Awaited<ReturnType<FeedItemReadRepositoryPort["findById"]>>
>;

function sourceFeedItemsForBinding(
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
): FeedItemReadRepositoryPort {
  const rowsByFeedItemId = new Map(
    uniqueSourceOnlyEvidenceRows(binding).map(
      (row) => [row.feedItemId, row] as const,
    ),
  );
  return {
    list: jest.fn(async () => ({ items: [] })),
    findById: jest.fn(async ({ feedItemId }) => {
      const row = rowsByFeedItemId.get(feedItemId);
      return row === undefined ? null : feedItemForAuthorityRow(binding, row);
    }),
    readSourceContent: jest.fn(async ({ feedItemIds }) =>
      feedItemIds.flatMap((feedItemId): readonly FeedSourceContentItem[] => {
        const row = rowsByFeedItemId.get(feedItemId);
        return row === undefined
          ? []
          : [
              {
                feedItemId,
                sourceItemId: row.sourceItemId,
                body: `Source text for ${feedItemId}`,
              },
            ];
      }),
    ),
  };
}

function sourceOnlyEvidenceRows(
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
) {
  return binding.days.flatMap((recoveryDay) =>
    Object.values(recoveryDay.providerEvidence).flatMap((rows) =>
      rows.filter((row) => row.providerKey !== "github-trending-page"),
    ),
  );
}

function uniqueSourceOnlyEvidenceRows(
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
): ReturnType<typeof sourceOnlyEvidenceRows> {
  const rowsByFeedItemId = new Map<
    string,
    ReturnType<typeof sourceOnlyEvidenceRows>[number]
  >();
  for (const row of sourceOnlyEvidenceRows(binding)) {
    rowsByFeedItemId.set(row.feedItemId, row);
  }
  return [...rowsByFeedItemId.values()].sort((left, right) =>
    left.feedItemId.localeCompare(right.feedItemId),
  );
}

function feedItemForAuthorityRow(
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  row: ReturnType<typeof sourceOnlyEvidenceRows>[number],
): FeedItemResult {
  return {
    toSnapshot: () => ({
      id: row.feedItemId,
      tenantId: binding.tenantId,
      workspaceId: binding.workspaceId,
      interestId: `interest:${row.providerKey}`,
      sourceItemId: row.sourceItemId,
      sourceBindingId: row.sourceBindingId,
      providerKey: row.providerKey,
      canonicalUrl: row.canonicalUrl,
      title: `Title for ${row.feedItemId}`,
      bodyPreview: `Preview for ${row.feedItemId}`,
      publishedAt: new Date(row.publishedAt),
      observedAt: new Date(row.observedAt),
    }),
  } as FeedItemResult;
}

function githubProjectionReaderForBinding(
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
): jest.Mocked<ReaderSummaryGitHubProjectionReaderPort> {
  return {
    read: jest.fn(async () => githubProjectionResultForBinding(binding)),
  };
}

function githubProjectionResultForBinding(
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
): ReadReaderSummaryGitHubProjectionResult {
  const day = binding.days.find(
    (candidate) => candidate.requestedUtcDate === "2026-07-24",
  );
  if (day === undefined) {
    throw new Error("Jul24 binding fixture is required");
  }
  const items = day.providerEvidence["github-trending-page"].map(
    (row, index): ReaderSummaryGitHubProjectionItem => {
      const github = row.github;
      if (github === undefined) {
        throw new Error("Jul24 GitHub projection fixture is incomplete");
      }
      return {
        feedItemId: row.feedItemId,
        sourceItemId: row.sourceItemId,
        sourceBindingId: row.sourceBindingId,
        providerKey: "github-trending-page",
        metadataKind: "github_trending_page_repository",
        scanJobId: github.scanJobId,
        canonicalUrl: row.canonicalUrl,
        repositoryFullName: github.repositoryIdentity,
        rank: github.rank,
        starsGained: 100 + index,
        window: "daily",
        fetchStartedAt: new Date("2026-07-24T00:00:01.000Z"),
        checkedAt: new Date(github.checkedAt),
        publishedAt: new Date(row.publishedAt),
        observedAt: new Date(row.observedAt),
        sourceContentHash: row.sourceContentHash,
        sourceProviderContentHash: row.sourceProviderContentHash ?? "",
      };
    },
  );
  return {
    eligibleBindingIds: [
      ...new Set(items.map((item) => item.sourceBindingId)),
    ].sort(),
    items,
    pageCount: 2,
  };
}

function githubProjectionQueryForBinding(
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  observedThrough: Date,
): ReadReaderSummaryGitHubProjectionQuery {
  const day = binding.days.find(
    (candidate) => candidate.requestedUtcDate === "2026-07-24",
  );
  if (day === undefined) {
    throw new Error("Jul24 binding fixture is required");
  }
  return {
    tenantId: binding.tenantId as ReadReaderSummaryGitHubProjectionQuery["tenantId"],
    workspaceId: binding.workspaceId as ReadReaderSummaryGitHubProjectionQuery["workspaceId"],
    dayStartedAt: new Date(day.period.startedAt),
    dayEndedAt: new Date(day.period.endedAt),
    observedThrough,
  };
}
