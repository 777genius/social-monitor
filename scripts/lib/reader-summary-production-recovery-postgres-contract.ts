import { createRequire } from "node:module";
import { join } from "node:path";

import { PrismaReaderSummaryProductionRecoveryAuthority } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority";
import type { PrismaSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import {
  type ReaderSummaryProductionRecoveryAuthorityBinding,
  type ReaderSummaryProductionRecoveryRequestedUtcDate,
  readerSummaryProductionRecoveryRequestedUtcDates,
  readerSummaryProductionRecoveryTenantId,
  readerSummaryProductionRecoveryWorkspaceId,
} from "@social-monitor/summary/ports";
import {
  assertReaderSummaryProductionRecoveryCanonicalBounds,
} from "./reader-summary-production-recovery-canonical-bounds-postgres-contract";

type RecoveryExecutionGuardModule = Readonly<{
  PrismaReaderSummaryProductionRecoveryExecutionGuard: new (
    client: unknown,
  ) => Readonly<{
    claim(params: {
      readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
      readonly requestedUtcDate:
        ReaderSummaryProductionRecoveryRequestedUtcDate;
    }): Promise<"execute" | "replayed">;
  }>;
}>;

const runtimeRequire = createRequire(join(process.cwd(), "package.json"));
(
  process as NodeJS.Process & {
    [key: symbol]: Readonly<{ enabled(value: boolean): boolean }> | undefined;
  }
)[Symbol.for("ts-node.register.instance")]?.enabled(false);
(runtimeRequire("ts-node") as {
  register(options: {
    readonly transpileOnly: boolean;
    readonly compilerOptions: Readonly<{ rootDir: string }>;
  }): unknown;
}).register({
  transpileOnly: true,
  compilerOptions: { rootDir: process.cwd() },
});
const { PrismaReaderSummaryProductionRecoveryExecutionGuard } =
  runtimeRequire(
    "./scripts/lib/reader-summary-production-recovery-replay-guard",
  ) as RecoveryExecutionGuardModule;

type QueryResult<TRow> = Readonly<{ rows: readonly TRow[] }>;
export type RecoveryPostgresClient = Readonly<{
  query<TRow = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<TRow>>;
}>;

export const readerSummaryProductionRecoveryFixtureScope = {
  tenantId: readerSummaryProductionRecoveryTenantId,
  workspaceId: readerSummaryProductionRecoveryWorkspaceId,
} as const;

const { tenantId, workspaceId } =
  readerSummaryProductionRecoveryFixtureScope;

const expectedRecoveryProviderCounts = [
  ["2026-07-23", "github-trending-page", 0, "historical_unavailable"],
  ["2026-07-23", "hacker-news", 100, "verified_existing"],
  ["2026-07-23", "reddit", 100, "verified_existing"],
  ["2026-07-23", "rss", 78, "verified_existing"],
  ["2026-07-23", "x-twitter", 67, "verified_existing"],
  ["2026-07-24", "github-trending-page", 10, "verified_existing"],
  ["2026-07-24", "hacker-news", 100, "verified_existing"],
  ["2026-07-24", "reddit", 100, "verified_existing"],
  ["2026-07-24", "rss", 68, "verified_existing"],
  ["2026-07-24", "x-twitter", 73, "verified_existing"],
  ["2026-07-25", "github-trending-page", 10, "verified_existing"],
  ["2026-07-25", "hacker-news", 100, "verified_existing"],
  ["2026-07-25", "reddit", 100, "verified_existing"],
  ["2026-07-25", "rss", 63, "verified_existing"],
  ["2026-07-25", "x-twitter", 96, "verified_existing"],
  ["2026-07-26", "github-trending-page", 10, "verified_existing"],
  ["2026-07-26", "hacker-news", 78, "verified_existing"],
  ["2026-07-26", "reddit", 100, "verified_existing"],
  ["2026-07-26", "rss", 62, "verified_existing"],
  ["2026-07-26", "x-twitter", 94, "verified_existing"],
  ["2026-07-27", "github-trending-page", 10, "verified_existing"],
  ["2026-07-27", "hacker-news", 87, "verified_existing"],
  ["2026-07-27", "reddit", 99, "verified_existing"],
  ["2026-07-27", "rss", 47, "verified_existing"],
  ["2026-07-27", "x-twitter", 58, "verified_existing"],
  ["2026-07-28", "github-trending-page", 0, "historical_unavailable"],
  ["2026-07-28", "hacker-news", 0, "historical_unavailable"],
  ["2026-07-28", "reddit", 0, "historical_unavailable"],
  ["2026-07-28", "rss", 31, "partial_existing"],
  ["2026-07-28", "x-twitter", 107, "partial_existing"],
] as const;

export const seedReaderSummaryProductionRecoveryFixture = async (
  client: RecoveryPostgresClient,
): Promise<void> => {
  await client.query(`
    BEGIN;
    INSERT INTO source_catalog_entries (
      id, provider_key, display_name, acquisition_mode, readiness,
      created_at, updated_at
    )
    SELECT
      ('40000000-0000-4000-8000-' ||
        lpad(provider.ordinal::TEXT, 12, '0'))::UUID,
      provider.provider_key,
      provider.provider_key,
      'fixture',
      'READY',
      '2026-07-20T00:00:00Z',
      '2026-07-20T00:00:00Z'
    FROM (VALUES
      (1, 'github-trending-page'),
      (2, 'hacker-news'),
      (3, 'reddit'),
      (4, 'rss'),
      (5, 'x-twitter')
    ) AS provider(ordinal, provider_key);

    INSERT INTO interests (
      id, tenant_id, workspace_id, name, query, status,
      created_at, updated_at, deleted_at
    ) VALUES (
      '50000000-0000-4000-8000-000000000001',
      '${tenantId}', '${workspaceId}',
      'Production recovery fixture', 'DB authority', 'ENABLED',
      '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z', NULL
    );

    INSERT INTO source_bindings (
      id, tenant_id, workspace_id, interest_id, source_catalog_entry_id,
      capability_profile_version, status, config,
      created_at, updated_at, deleted_at
    )
    SELECT
      ('30000000-0000-4000-8000-' ||
        lpad(provider.ordinal::TEXT, 12, '0'))::UUID,
      '${tenantId}', '${workspaceId}',
      '50000000-0000-4000-8000-000000000001',
      catalog.id, 1, 'ENABLED',
      CASE WHEN provider.provider_key = 'github-trending-page'
        THEN '{"window":"daily"}'::JSONB ELSE '{}'::JSONB END,
      '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z', NULL
    FROM (VALUES
      (1, 'github-trending-page'),
      (2, 'hacker-news'),
      (3, 'reddit'),
      (4, 'rss'),
      (5, 'x-twitter')
    ) AS provider(ordinal, provider_key)
    JOIN source_catalog_entries AS catalog
      ON catalog.provider_key = provider.provider_key;

    INSERT INTO scan_policies (
      id, tenant_id, workspace_id, source_binding_id, interval_seconds,
      freshness_seconds, retry_budget, next_run_at, created_at, updated_at
    ) VALUES (
      '60000000-0000-4000-8000-000000000001',
      '${tenantId}', '${workspaceId}',
      '30000000-0000-4000-8000-000000000001',
      3600, 3600, 3, '2026-07-28T00:00:00Z',
      '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z'
    );

    CREATE TEMP TABLE recovery_days ON COMMIT DROP AS
    SELECT
      day::DATE AS requested_date,
      row_number() OVER (ORDER BY day)::INTEGER AS day_number
    FROM generate_series(
      DATE '2026-07-23',
      DATE '2026-07-28',
      INTERVAL '1 day'
    ) AS days(day);

    INSERT INTO scan_jobs (
      id, tenant_id, workspace_id, source_binding_id, scan_policy_id,
      status, idempotency_key, leased_until, retry_count, requested_at,
      enqueued_at, completed_at, created_at, updated_at
    )
    SELECT
      ('70000000-0000-4000-8000-' ||
        lpad(day_number::TEXT, 12, '0'))::UUID,
      '${tenantId}', '${workspaceId}',
      '30000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      'SUCCEEDED',
      'recovery-github-' || requested_date,
      NULL, 0,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '10 hours',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '10 hours',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '10 hours',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours'
    FROM recovery_days
    WHERE requested_date > DATE '2026-07-23'
      AND requested_date < DATE '2026-07-28';

    INSERT INTO scan_attempts (
      scan_job_id, tenant_id, workspace_id, source_binding_id,
      attempt_number, status, started_at, finished_at,
      fetched, inserted, skipped_duplicates, projected, updated_at
    )
    SELECT
      ('70000000-0000-4000-8000-' ||
        lpad(day_number::TEXT, 12, '0'))::UUID,
      '${tenantId}', '${workspaceId}',
      '30000000-0000-4000-8000-000000000001',
      1, 'SUCCEEDED',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '10 hours',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours',
      10, 10, 0, 10,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours'
    FROM recovery_days
    WHERE requested_date > DATE '2026-07-23'
      AND requested_date < DATE '2026-07-28';

    CREATE TEMP TABLE recovery_items ON COMMIT DROP AS
    SELECT
      row_number() OVER (
        ORDER BY day.requested_date, provider.ordinal, position
      )::INTEGER AS item_number,
      day.requested_date,
      day.day_number,
      provider.provider_key,
      provider.ordinal AS provider_number,
      position
    FROM recovery_days AS day
    CROSS JOIN LATERAL (VALUES
      (
        1,
        'github-trending-page',
        CASE
          WHEN day.requested_date IN (
            DATE '2026-07-23',
            DATE '2026-07-28'
          ) THEN 0
          ELSE 10
        END
      ),
      (
        2,
        'hacker-news',
        CASE day.requested_date
          WHEN DATE '2026-07-26' THEN 78
          WHEN DATE '2026-07-27' THEN 87
          WHEN DATE '2026-07-28' THEN 0
          ELSE 100
        END
      ),
      (
        3,
        'reddit',
        CASE day.requested_date
          WHEN DATE '2026-07-27' THEN 99
          WHEN DATE '2026-07-28' THEN 0
          ELSE 100
        END
      ),
      (
        4,
        'rss',
        CASE day.requested_date
          WHEN DATE '2026-07-23' THEN 78
          WHEN DATE '2026-07-24' THEN 68
          WHEN DATE '2026-07-25' THEN 63
          WHEN DATE '2026-07-26' THEN 62
          WHEN DATE '2026-07-27' THEN 47
          ELSE 31
        END
      ),
      (
        5,
        'x-twitter',
        CASE day.requested_date
          WHEN DATE '2026-07-23' THEN 67
          WHEN DATE '2026-07-24' THEN 73
          WHEN DATE '2026-07-25' THEN 96
          WHEN DATE '2026-07-26' THEN 94
          WHEN DATE '2026-07-27' THEN 58
          ELSE 107
        END
      )
    ) AS provider(ordinal, provider_key, item_count)
    CROSS JOIN LATERAL
      generate_series(1, provider.item_count) AS positions(position);

    INSERT INTO source_items (
      id, tenant_id, workspace_id, source_binding_id, provider_key,
      provider_item_id, canonical_url, title, body, author_handle,
      published_at, content_hash, provider_content_hash, observed_at,
      last_observed_at, content_updated_at, raw_pointer, metadata,
      schema_version, created_at
    )
    SELECT
      ('10000000-0000-4000-8000-' ||
        lpad(item_number::TEXT, 12, '0'))::UUID,
      '${tenantId}', '${workspaceId}',
      ('30000000-0000-4000-8000-' ||
        lpad(provider_number::TEXT, 12, '0'))::UUID,
      provider_key,
      CASE WHEN provider_key = 'github-trending-page'
        THEN 'github-trending-page:daily:' ||
          ('70000000-0000-4000-8000-' ||
            lpad(day_number::TEXT, 12, '0')) || ':' ||
          'fixture/repository-' || position
        ELSE 'recovery:' || requested_date || ':' ||
          provider_key || ':' || position END,
      CASE WHEN provider_key = 'github-trending-page'
        THEN 'https://github.com/fixture/repository-' || position
        ELSE 'https://fixture.invalid/' || requested_date || '/' ||
          provider_key || '/' || position END,
      'Recovery fixture ' || item_number,
      'Immutable body ' || item_number,
      NULL,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' +
        INTERVAL '8 hours' + position * INTERVAL '1 millisecond',
      encode(sha256(convert_to('source:' || item_number, 'UTF8')), 'hex'),
      CASE WHEN provider_key = 'github-trending-page'
        THEN encode(
          sha256(convert_to('provider:' || item_number, 'UTF8')),
          'hex'
        )
        ELSE NULL END,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' +
        INTERVAL '12 hours' + position * INTERVAL '1 millisecond',
      NULL, NULL, NULL,
      CASE WHEN provider_key = 'github-trending-page'
        THEN jsonb_build_object(
          'kind', 'github_trending_page_repository',
          'repository', jsonb_build_object(
            'fullName', 'fixture/repository-' || position,
            'url', 'https://github.com/fixture/repository-' || position
          ),
          'trending', jsonb_build_object(
            'scanJobId',
            ('70000000-0000-4000-8000-' ||
              lpad(day_number::TEXT, 12, '0'))::UUID,
            'rank', position,
            'checkedAt', to_char(
              requested_date::TIMESTAMP AT TIME ZONE 'UTC' +
                INTERVAL '11 hours' + position * INTERVAL '1 millisecond',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            'window', 'daily'
          )
        )
        ELSE '{}'::JSONB END,
      1,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours'
    FROM recovery_items;

    INSERT INTO feed_items (
      id, tenant_id, workspace_id, interest_id, source_item_id,
      source_binding_id, provider_key, dedupe_key, canonical_url, title,
      body_preview, author_handle, published_at, observed_at,
      provider_metadata, status, created_at, updated_at
    )
    SELECT
      ('20000000-0000-4000-8000-' ||
        lpad(item_number::TEXT, 12, '0'))::UUID,
      '${tenantId}', '${workspaceId}',
      '50000000-0000-4000-8000-000000000001',
      ('10000000-0000-4000-8000-' ||
        lpad(item_number::TEXT, 12, '0'))::UUID,
      ('30000000-0000-4000-8000-' ||
        lpad(provider_number::TEXT, 12, '0'))::UUID,
      provider_key,
      'recovery:' || requested_date || ':' || provider_key || ':' || position,
      CASE WHEN provider_key = 'github-trending-page'
        THEN 'https://github.com/fixture/repository-' || position
        ELSE 'https://fixture.invalid/' || requested_date || '/' ||
          provider_key || '/' || position END,
      'Recovery fixture ' || item_number,
      'Immutable body ' || item_number,
      NULL,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' +
        INTERVAL '8 hours' + position * INTERVAL '1 millisecond',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' +
        INTERVAL '12 hours' + position * INTERVAL '1 millisecond',
      NULL, 'VISIBLE',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours'
    FROM recovery_items;

    INSERT INTO github_repository_trend_results (
      id, tenant_id, workspace_id, interest_id, source_binding_id,
      scan_job_id, source_item_id, repository_full_name, repository_url,
      primary_window, rank, checked_at, observed_at, source,
      metadata, created_at
    )
    SELECT
      ('80000000-0000-4000-8000-' ||
        lpad(item_number::TEXT, 12, '0'))::UUID,
      '${tenantId}', '${workspaceId}',
      '50000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      ('70000000-0000-4000-8000-' ||
        lpad(day_number::TEXT, 12, '0'))::UUID,
      ('10000000-0000-4000-8000-' ||
        lpad(item_number::TEXT, 12, '0'))::UUID,
      'fixture/repository-' || position,
      'https://github.com/fixture/repository-' || position,
      'daily', position,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' +
        INTERVAL '11 hours' + position * INTERVAL '1 millisecond',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' +
        INTERVAL '12 hours' + position * INTERVAL '1 millisecond',
      'fixture', '{"verifiedExisting":true}'::JSONB,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours'
    FROM recovery_items
    WHERE provider_key = 'github-trending-page'
      AND requested_date <> DATE '2026-07-24';
    COMMIT;
  `);
};

export const assertReaderSummaryProductionRecoveryPostgresContract =
  async (params: Readonly<{
    auditor: RecoveryPostgresClient;
    first: RecoveryPostgresClient;
    second: RecoveryPostgresClient;
  }>): Promise<void> => {
    await assertReaderSummaryProductionRecoveryCanonicalBounds({
      client: params.auditor,
      tenantId,
      workspaceId,
    });
    await assertRecoveryDaysDateConstraintDefinition(params.auditor);
    await assertRecoveryExpectedCountsFunctionDefinition(params.auditor);
    await assertRecoveryPersistenceFunctionDefinition(params.first);
    await assertRecoveryAuthorityRuntimePrivileges(params.first);
    const firstClient = new PgPrismaClient(params.first);
    const secondClient = new PgPrismaClient(params.second);
    const firstAuthority = new PrismaReaderSummaryProductionRecoveryAuthority(
      firstClient as unknown as PrismaSummaryClient,
    );
    const secondAuthority =
      new PrismaReaderSummaryProductionRecoveryAuthority(
        secondClient as unknown as PrismaSummaryClient,
      );
    const [left, right] = await Promise.all([
      firstAuthority.prepare(),
      secondAuthority.prepare(),
    ]);
    const leftBinding = firstAuthority.readVerifiedBinding(left.authority);
    const rightBinding = secondAuthority.readVerifiedBinding(right.authority);
    assert(
      JSON.stringify(Object.keys(leftBinding).sort()) ===
        JSON.stringify(
          [
            "boundaries",
            "canonicalSha256",
            "days",
            "dryRunCanonicalSha256s",
            "identity",
            "lease",
            "recoveryId",
            "requestedUtcDates",
            "schemaVersion",
            "tenantId",
            "workspaceId",
          ].sort(),
        ) &&
        JSON.stringify(leftBinding.requestedUtcDates) ===
          JSON.stringify(
            readerSummaryProductionRecoveryRequestedUtcDates,
          ) &&
        leftBinding.days.length ===
          readerSummaryProductionRecoveryRequestedUtcDates.length,
      "production recovery canonical six-day binding shape diverged",
    );
    assert(
      leftBinding.canonicalSha256 === rightBinding.canonicalSha256,
      "concurrent authority callers diverged",
    );
    assert(
      leftBinding.lease.issuedAt === leftBinding.lease.consumedAt &&
        leftBinding.lease.issuedAt === rightBinding.lease.issuedAt &&
        /\.[0-9]{3}Z$/u.test(leftBinding.lease.issuedAt),
      "production recovery lease timestamp was not canonical and stable",
    );
    assert(
      JSON.stringify(
        leftBinding.days.map((day) => [
          day.requestedUtcDate,
          day.providerCounts.reduce(
            (total, provider) => total + provider.count,
            0,
          ),
          day.githubEvidence.mode,
        ]),
      ) ===
        JSON.stringify([
          ["2026-07-23", 345, "historical_unavailable"],
          ["2026-07-24", 351, "verified_existing"],
          ["2026-07-25", 369, "verified_existing"],
          ["2026-07-26", 344, "verified_existing"],
          ["2026-07-27", 301, "verified_existing"],
          ["2026-07-28", 138, "historical_unavailable"],
        ]),
      "production recovery immutable daily counts diverged",
    );
    const metadataFallbackDay = leftBinding.days.find(
      (day) => day.requestedUtcDate === "2026-07-24",
    );
    assert(
      metadataFallbackDay?.providerEvidence[
        "github-trending-page"
      ].every(
        (evidence) =>
          evidence.github?.resultId === evidence.sourceItemId &&
          evidence.github.scanAttemptNumber === 1,
      ) === true,
      "production recovery GitHub metadata fallback was not DB-derived",
    );
    assert(
      leftBinding.days.every(
        (day) =>
          day.planSha256s[0] === day.canonicalSha256 &&
          day.planSha256s[1] === day.canonicalSha256,
      ),
      "daily two-pass plan hashes diverged",
    );
    const beforeClaim = await recoveryWriteCounts(params.auditor);
    const firstGuard =
      new PrismaReaderSummaryProductionRecoveryExecutionGuard(
        firstClient as never,
      );
    const secondGuard =
      new PrismaReaderSummaryProductionRecoveryExecutionGuard(
        secondClient as never,
      );
    const firstClaim = await firstGuard.claim({
      binding: leftBinding,
      requestedUtcDate: "2026-07-24",
    });
    const afterClaim = await recoveryWriteCounts(params.auditor);
    const replay = await secondGuard.claim({
      binding: rightBinding,
      requestedUtcDate: "2026-07-24",
    });
    const afterReplay = await recoveryWriteCounts(params.auditor);
    assert(firstClaim === "execute", "first model claim did not win");
    assert(replay === "replayed", "second model claim was not replayed");
    assert(
      afterClaim.authorities === beforeClaim.authorities &&
        afterClaim.claims === beforeClaim.claims + 1 &&
        afterClaim.jobs === beforeClaim.jobs + 1 &&
        afterClaim.artifacts === beforeClaim.artifacts &&
        afterClaim.publications === beforeClaim.publications &&
        afterClaim.receipts === beforeClaim.receipts,
      "pre-model authority/claim/job writes were not exact",
    );
    assert(
      JSON.stringify(afterReplay) === JSON.stringify(afterClaim),
      "claim replay performed a write",
    );
  };

const assertRecoveryDaysDateConstraintDefinition = async (
  client: RecoveryPostgresClient,
): Promise<void> => {
  const result = await client.query<{
    readonly definition: string;
    readonly is_check: boolean;
    readonly is_validated: boolean;
  }>(`
    SELECT
      pg_get_constraintdef(authority.oid) AS definition,
      authority.contype = 'c' AS is_check,
      authority.convalidated AS is_validated
    FROM pg_constraint AS authority
    WHERE authority.conrelid =
        'reader_summary_production_recovery_days'::regclass
      AND authority.conname =
        'reader_summary_production_recovery_days_date_check'
  `);
  const authority = result.rows[0];
  const normalizedDefinition = authority?.definition.replace(/\s+/gu, " ");
  const expectedDates = readerSummaryProductionRecoveryRequestedUtcDates
    .map((date) => `'${date}'::date`)
    .join(", ");
  assert(
    result.rows.length === 1 &&
      authority?.is_check === true &&
      authority.is_validated === true &&
      normalizedDefinition ===
        `CHECK ((requested_utc_date = ANY (ARRAY[${expectedDates}])))`,
    "production recovery days date constraint is not the exact six-day definition",
  );
};

const assertRecoveryExpectedCountsFunctionDefinition = async (
  client: RecoveryPostgresClient,
): Promise<void> => {
  const result = await client.query<{
    readonly bounds_are_closed: boolean;
    readonly definition: string;
    readonly expected_counts: unknown;
    readonly is_immutable: boolean;
    readonly is_invoker: boolean;
    readonly is_parallel_safe: boolean;
    readonly is_strict: boolean;
  }>(`
    SELECT
      pg_get_functiondef(authority.oid) AS definition,
      authority.provolatile = 'i' AS is_immutable,
      authority.proisstrict AS is_strict,
      authority.proparallel = 's' AS is_parallel_safe,
      NOT authority.prosecdef AS is_invoker,
      "reader_summary_production_recovery_expected_counts_v2"(
        DATE '2026-07-22'
      ) IS NULL
      AND "reader_summary_production_recovery_expected_counts_v2"(
        DATE '2026-07-29'
      ) IS NULL AS bounds_are_closed,
      (
        SELECT jsonb_agg(
          jsonb_build_array(
            day.requested_utc_date,
            provider.entry->>'providerKey',
            (provider.entry->>'count')::INTEGER,
            provider.entry->>'evidenceState'
          )
          ORDER BY day.requested_utc_date, provider.ordinal
        )
        FROM unnest(ARRAY[
          DATE '2026-07-23',
          DATE '2026-07-24',
          DATE '2026-07-25',
          DATE '2026-07-26',
          DATE '2026-07-27',
          DATE '2026-07-28'
        ]) AS day(requested_utc_date)
        CROSS JOIN LATERAL jsonb_array_elements(
          "reader_summary_production_recovery_expected_counts_v2"(
            day.requested_utc_date
          )
        ) WITH ORDINALITY AS provider(entry, ordinal)
      ) AS expected_counts
    FROM pg_proc AS authority
    WHERE authority.oid =
      'reader_summary_production_recovery_expected_counts_v2(date)'
        ::regprocedure
  `);
  const authority = result.rows[0];
  const normalizedDefinition = authority?.definition.replace(/\s+/gu, " ");
  const definitionHasExactDates =
    normalizedDefinition !== undefined &&
    readerSummaryProductionRecoveryRequestedUtcDates.every((date) =>
      normalizedDefinition.includes(`'${date}'::date`),
    );
  assert(
    authority?.is_immutable === true &&
      authority.is_strict === true &&
      authority.is_parallel_safe === true &&
      authority.is_invoker === true &&
      authority.bounds_are_closed === true &&
      definitionHasExactDates &&
      normalizedDefinition?.includes("feed_items") === false &&
      JSON.stringify(authority.expected_counts) ===
        JSON.stringify(expectedRecoveryProviderCounts),
    "production recovery expected-counts function is not the exact six-day DB authority",
  );
};

const assertRecoveryPersistenceFunctionDefinition = async (
  client: RecoveryPostgresClient,
): Promise<void> => {
  const result = await client.query<{ readonly definition: string }>(`
    SELECT pg_get_functiondef(
      'persist_reader_summary_production_recovery_v2(jsonb)'::regprocedure
    ) AS definition
  `);
  const normalizedDefinition = result.rows[0]?.definition.replace(
    /\s+/gu,
    " ",
  );
  const requestedDates = readerSummaryProductionRecoveryRequestedUtcDates
    .map((date) => `'${date}'`)
    .join(", ");
  assert(
    normalizedDefinition?.includes(
      "jsonb_object_length(binding) <> 11",
    ) === true &&
      normalizedDefinition.includes(
        "binding->'requestedUtcDates' IS DISTINCT FROM " +
          `jsonb_build_array( ${requestedDates} )`,
      ) &&
      normalizedDefinition.includes(
        "jsonb_array_length(binding->'days') <> 6",
      ),
    "production recovery persistence function is not the canonical six-day definition",
  );
};

const assertRecoveryAuthorityRuntimePrivileges = async (
  client: RecoveryPostgresClient,
): Promise<void> => {
  const result = await client.query<{
    readonly exact_function_execute: boolean;
    readonly least_privilege_tables: boolean;
  }>(`
    SELECT
      has_function_privilege(
        current_user,
        'persist_reader_summary_production_recovery_v2(jsonb)',
        'EXECUTE'
      )
      AND NOT has_function_privilege(
        current_user,
        'reader_summary_production_recovery_expected_counts_v2(date)',
        'EXECUTE'
      ) AS exact_function_execute,
      bool_and(
        has_any_column_privilege(current_user, authority_table, 'SELECT')
        AND NOT has_table_privilege(
          current_user,
          authority_table,
          'SELECT'
        )
        AND NOT has_any_column_privilege(
          current_user,
          authority_table,
          'INSERT'
        )
        AND NOT has_any_column_privilege(
          current_user,
          authority_table,
          'UPDATE'
        )
        AND NOT has_table_privilege(
          current_user,
          authority_table,
          'DELETE, TRUNCATE, REFERENCES, TRIGGER'
        )
      ) AS least_privilege_tables
    FROM unnest(ARRAY[
      'reader_summary_production_recovery_leases',
      'reader_summary_production_recovery_days',
      'reader_summary_production_recovery_dry_runs'
    ]) AS authority(authority_table)
  `);
  const privileges = result.rows[0];
  assert(
    privileges?.exact_function_execute === true,
    "production recovery runtime function ACL diverged",
  );
  assert(
    privileges.least_privilege_tables === true,
    "production recovery runtime table ACL diverged",
  );
};

class PgPrismaClient {
  constructor(private readonly client: RecoveryPostgresClient) {}

  readonly $queryRaw = async <T>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T> => {
    const sql = strings.reduce(
      (query, part, index) =>
        query + part + (index < values.length ? `$${index + 1}` : ""),
      "",
    );
    return (await this.client.query(sql, values)).rows as T;
  };

  readonly $transaction = async <T>(
    operation: (client: this) => Promise<T>,
  ): Promise<T> => {
    await this.client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      const result = await operation(this);
      await this.client.query("COMMIT");
      return result;
    } catch (error) {
      await this.client.query("ROLLBACK");
      throw error;
    }
  };
}

const recoveryWriteCounts = async (
  client: RecoveryPostgresClient,
): Promise<{
  readonly artifacts: number;
  readonly authorities: number;
  readonly claims: number;
  readonly jobs: number;
  readonly publications: number;
  readonly receipts: number;
}> => {
  const result = await client.query<{
    artifacts: number;
    authorities: number;
    claims: number;
    jobs: number;
    publications: number;
    receipts: number;
  }>(`
    SELECT
      (
        SELECT count(*)::INTEGER
        FROM reader_summary_production_recovery_leases AS lease
        WHERE lease.tenant_id = '${tenantId}'
          AND lease.workspace_id = '${workspaceId}'
          AND lease.canonical_record->>'schemaVersion' =
            'reader_summary.production_recovery_authority.v2'
      ) AS authorities,
      count(*) FILTER (
        WHERE key."scope" =
          'reader-summary-production-recovery-model-v2'
      )::INTEGER AS claims,
      (
        SELECT count(*)::INTEGER
        FROM reader_summary_jobs AS job
        WHERE job.tenant_id = '${tenantId}'
          AND job.workspace_id = '${workspaceId}'
          AND job.idempotency_key LIKE
            'reader-summary-production-recovery:%'
      ) AS jobs,
      (
        SELECT count(*)::INTEGER
        FROM reader_summary_artifacts AS artifact
        WHERE artifact.tenant_id = '${tenantId}'
          AND artifact.workspace_id = '${workspaceId}'
      ) AS artifacts,
      (
        SELECT count(*)::INTEGER
        FROM reader_summary_publications AS publication
        WHERE publication.tenant_id = '${tenantId}'
          AND publication.workspace_id = '${workspaceId}'
      ) AS publications,
      (
        SELECT count(*)::INTEGER
        FROM reader_summary_recovery_receipts AS receipt
        WHERE receipt.tenant_id = '${tenantId}'
          AND receipt.workspace_id = '${workspaceId}'
      ) AS receipts
    FROM idempotency_keys AS key
    WHERE key.tenant_id = '${tenantId}'
      AND key.workspace_id = '${workspaceId}'
  `);
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error("Recovery write counts were unavailable");
  }
  return {
    artifacts: Number(row.artifacts),
    authorities: Number(row.authorities),
    claims: Number(row.claims),
    jobs: Number(row.jobs),
    publications: Number(row.publications),
    receipts: Number(row.receipts),
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
