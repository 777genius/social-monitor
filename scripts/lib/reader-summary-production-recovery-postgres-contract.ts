import { PrismaReaderSummaryProductionRecoveryAuthority } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority";
import type { PrismaSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";

import { PrismaReaderSummaryProductionRecoveryExecutionGuard } from "./reader-summary-production-recovery-replay-guard";
import { readerSummaryPublicationFixtureScope } from "./reader-summary-publication-postgres-fixture-scope";

type QueryResult<TRow> = Readonly<{ rows: readonly TRow[] }>;
export type RecoveryPostgresClient = Readonly<{
  query<TRow = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<TRow>>;
}>;

const { tenantId, workspaceId } = readerSummaryPublicationFixtureScope;

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
      DATE '2026-07-24',
      DATE '2026-07-27',
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
    FROM recovery_days;

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
      2, 2, 0, 2,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours'
    FROM recovery_days;

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
    CROSS JOIN (VALUES
      (1, 'github-trending-page', 2),
      (2, 'hacker-news', 100),
      (3, 'reddit', 100),
      (4, 'rss', 2),
      (5, 'x-twitter', 2)
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
      'recovery:' || requested_date || ':' || provider_key || ':' || position,
      'https://fixture.invalid/' || requested_date || '/' ||
        provider_key || '/' || position,
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
            'fullName', 'fixture/repository-' || position
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
            )
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
      'https://fixture.invalid/' || requested_date || '/' ||
        provider_key || '/' || position,
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
      'https://fixture.invalid/' || requested_date || '/' ||
        provider_key || '/' || position,
      'daily', position,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' +
        INTERVAL '11 hours' + position * INTERVAL '1 millisecond',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' +
        INTERVAL '12 hours' + position * INTERVAL '1 millisecond',
      'fixture', '{"verifiedExisting":true}'::JSONB,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours'
    FROM recovery_items
    WHERE provider_key = 'github-trending-page';
    COMMIT;
  `);
};

export const assertReaderSummaryProductionRecoveryPostgresContract =
  async (params: Readonly<{
    auditor: RecoveryPostgresClient;
    first: RecoveryPostgresClient;
    second: RecoveryPostgresClient;
  }>): Promise<void> => {
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
      leftBinding.canonicalSha256 === rightBinding.canonicalSha256,
      "concurrent authority callers diverged",
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
        afterClaim.jobs === beforeClaim.jobs + 1,
      "pre-model authority/claim/job writes were not exact",
    );
    assert(
      JSON.stringify(afterReplay) === JSON.stringify(afterClaim),
      "claim replay performed a write",
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
  readonly authorities: number;
  readonly claims: number;
  readonly jobs: number;
}> => {
  const result = await client.query<{
    authorities: number;
    claims: number;
    jobs: number;
  }>(`
    SELECT
      count(*) FILTER (
        WHERE key."scope" =
          'reader-summary-production-recovery-authority-v2'
      )::INTEGER AS authorities,
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
      ) AS jobs
    FROM idempotency_keys AS key
    WHERE key.tenant_id = '${tenantId}'
      AND key.workspace_id = '${workspaceId}'
  `);
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error("Recovery write counts were unavailable");
  }
  return {
    authorities: Number(row.authorities),
    claims: Number(row.claims),
    jobs: Number(row.jobs),
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
