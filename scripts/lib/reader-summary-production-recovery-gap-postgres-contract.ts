import type { PrismaSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";

import {
  prepareReaderSummaryProductionRecoveryGapAuthority,
  readerSummaryProductionRecoveryGapExpectedCounts,
  readerSummaryProductionRecoveryGapProviderKeys,
  type ReaderSummaryProductionRecoveryGapAuthorityBinding,
} from "./reader-summary-production-recovery-gap-authority";
import type { RecoveryPostgresClient } from "./reader-summary-production-recovery-postgres-contract";

const tenantId = "00000000-0000-7000-8000-000000000901";
const workspaceId = "00000000-0000-7000-8000-000000000902";

type FingerprintRow = Readonly<{ fingerprint: string }>;
type CountRow = Readonly<{
  authorities: number;
  days: number;
  dryRuns: number;
}>;

export const seedReaderSummaryProductionRecoveryGapFixture = async (
  client: RecoveryPostgresClient,
): Promise<void> => {
  await client.query(`
    BEGIN;
    CREATE TEMP TABLE recovery_gap_days ON COMMIT DROP AS
    SELECT day::DATE AS requested_date,
      row_number() OVER (ORDER BY day)::INTEGER AS day_number
    FROM generate_series(DATE '2026-07-29', DATE '2026-07-31',
      INTERVAL '1 day') AS days(day);

    INSERT INTO scan_jobs (id, tenant_id, workspace_id, source_binding_id,
      scan_policy_id, status, idempotency_key, leased_until, retry_count,
      requested_at, enqueued_at, completed_at, created_at, updated_at)
    SELECT
      ('71000000-0000-4000-8000-' ||
        lpad(day_number::TEXT, 12, '0'))::UUID,
      '${tenantId}', '${workspaceId}',
      '30000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001', 'SUCCEEDED',
      'recovery-gap-github-' || requested_date, NULL, 0,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '10 hours',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '10 hours',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '10 hours',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours'
    FROM recovery_gap_days;

    INSERT INTO scan_attempts (scan_job_id, tenant_id, workspace_id,
      source_binding_id, attempt_number, status, started_at, finished_at,
      fetched, inserted, skipped_duplicates, projected, updated_at)
    SELECT
      ('71000000-0000-4000-8000-' ||
        lpad(day_number::TEXT, 12, '0'))::UUID,
      '${tenantId}', '${workspaceId}',
      '30000000-0000-4000-8000-000000000001', 1, 'SUCCEEDED',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '10 hours',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours',
      1, 1, 0, 1,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours'
    FROM recovery_gap_days;

    CREATE TEMP TABLE recovery_gap_items ON COMMIT DROP AS
    SELECT
      900000 + (authority.day_number * 100000) +
        (authority.provider_number * 10000) + evidence.ordinal AS item_number,
      authority.requested_date, authority.day_number, authority.provider_key,
      authority.provider_number, evidence.ordinal AS evidence_number,
      TRUE AS authority_eligible
    FROM (VALUES
      (DATE '2026-07-29', 1, 1, 'github-trending-page', 10),
      (DATE '2026-07-29', 1, 4, 'rss', 32),
      (DATE '2026-07-29', 1, 5, 'x-twitter', 17),
      (DATE '2026-07-30', 2, 4, 'rss', 34),
      (DATE '2026-07-30', 2, 5, 'x-twitter', 64),
      (DATE '2026-07-31', 3, 1, 'github-trending-page', 10),
      (DATE '2026-07-31', 3, 4, 'rss', 32),
      (DATE '2026-07-31', 3, 5, 'x-twitter', 15)
    ) AS authority(
      requested_date, day_number, provider_number, provider_key, expected_count
    )
    CROSS JOIN LATERAL generate_series(
      1, authority.expected_count
    ) AS evidence(ordinal)
    UNION ALL
    SELECT 1999999, DATE '2026-07-29', 1, 'rss', 4, 999, FALSE;

    INSERT INTO source_items (id, tenant_id, workspace_id,
      source_binding_id, provider_key, provider_item_id, canonical_url, title,
      body, author_handle, published_at, content_hash, provider_content_hash,
      observed_at, last_observed_at, content_updated_at, raw_pointer, metadata,
      schema_version, created_at)
    SELECT
      ('11000000-0000-4000-8000-' ||
        lpad(item_number::TEXT, 12, '0'))::UUID,
      '${tenantId}', '${workspaceId}',
      ('30000000-0000-4000-8000-' ||
        lpad(provider_number::TEXT, 12, '0'))::UUID,
      provider_key,
      CASE WHEN provider_key = 'github-trending-page'
        THEN 'github-trending-page:daily:' ||
          ('71000000-0000-4000-8000-' ||
            lpad(day_number::TEXT, 12, '0')) || ':' ||
          'fixture/gap-' || requested_date || '-' || evidence_number
        ELSE 'recovery-gap:' || requested_date || ':' || provider_key || ':' ||
          evidence_number END,
      CASE WHEN provider_key = 'github-trending-page'
        THEN 'https://github.com/fixture/gap-' || requested_date || '-' ||
          evidence_number
        ELSE 'https://fixture.invalid/gap/' || requested_date || '/' ||
          provider_key || '/' || evidence_number END,
      'Recovery gap fixture ' || item_number,
      'Immutable recovery gap body ' || item_number,
      NULL,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '8 hours',
      encode(sha256(convert_to('gap-source:' || item_number, 'UTF8')), 'hex'),
      CASE WHEN provider_key = 'github-trending-page' THEN encode(sha256(
        convert_to('gap-provider:' || item_number, 'UTF8')), 'hex') ELSE NULL END,
      CASE WHEN authority_eligible
        THEN requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours'
        ELSE TIMESTAMPTZ '2026-08-02T00:00:00Z' END,
      NULL, NULL, NULL,
      CASE WHEN provider_key = 'github-trending-page' THEN jsonb_build_object(
        'kind', 'github_trending_page_repository',
        'repository', jsonb_build_object(
          'fullName', 'fixture/gap-' || requested_date || '-' || evidence_number,
          'url', 'https://github.com/fixture/gap-' || requested_date || '-' ||
            evidence_number
        ),
        'trending', jsonb_build_object(
          'scanJobId', ('71000000-0000-4000-8000-' ||
            lpad(day_number::TEXT, 12, '0'))::UUID,
          'rank', evidence_number,
          'checkedAt', to_char(
            requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '11 hours',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ),
          'window', 'daily'
        )
      ) ELSE '{}'::JSONB END,
      1,
      CASE WHEN authority_eligible
        THEN requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours'
        ELSE TIMESTAMPTZ '2026-08-02T00:00:00Z' END
    FROM recovery_gap_items;

    INSERT INTO feed_items (id, tenant_id, workspace_id, interest_id,
      source_item_id, source_binding_id, provider_key, dedupe_key,
      canonical_url, title, body_preview, author_handle, published_at,
      observed_at, provider_metadata, status, created_at, updated_at)
    SELECT
      ('21000000-0000-4000-8000-' ||
        lpad(item_number::TEXT, 12, '0'))::UUID,
      '${tenantId}', '${workspaceId}',
      '50000000-0000-4000-8000-000000000001',
      ('11000000-0000-4000-8000-' ||
        lpad(item_number::TEXT, 12, '0'))::UUID,
      ('30000000-0000-4000-8000-' ||
        lpad(provider_number::TEXT, 12, '0'))::UUID,
      provider_key,
      'recovery-gap:' || requested_date || ':' || provider_key || ':' ||
        evidence_number,
      CASE WHEN provider_key = 'github-trending-page'
        THEN 'https://github.com/fixture/gap-' || requested_date || '-' ||
          evidence_number
        ELSE 'https://fixture.invalid/gap/' || requested_date || '/' ||
          provider_key || '/' || evidence_number END,
      'Recovery gap fixture ' || item_number,
      'Immutable recovery gap body ' || item_number,
      NULL,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '8 hours',
      CASE WHEN authority_eligible
        THEN requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours'
        ELSE TIMESTAMPTZ '2026-08-02T00:00:00Z' END,
      NULL, 'VISIBLE',
      CASE WHEN authority_eligible
        THEN requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours'
        ELSE TIMESTAMPTZ '2026-08-02T00:00:00Z' END,
      CASE WHEN authority_eligible
        THEN requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours'
        ELSE TIMESTAMPTZ '2026-08-02T00:00:00Z' END
    FROM recovery_gap_items;

    INSERT INTO github_repository_trend_results (id, tenant_id,
      workspace_id, interest_id, source_binding_id, scan_job_id,
      source_item_id, repository_full_name, repository_url, primary_window,
      rank, checked_at, observed_at, source, metadata, created_at)
    SELECT
      ('81000000-0000-4000-8000-' ||
        lpad(item_number::TEXT, 12, '0'))::UUID,
      '${tenantId}', '${workspaceId}',
      '50000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      ('71000000-0000-4000-8000-' ||
        lpad(day_number::TEXT, 12, '0'))::UUID,
      ('11000000-0000-4000-8000-' ||
        lpad(item_number::TEXT, 12, '0'))::UUID,
      'fixture/gap-' || requested_date || '-' || evidence_number,
      'https://github.com/fixture/gap-' || requested_date || '-' ||
        evidence_number,
      'daily', evidence_number,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '11 hours',
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours',
      'fixture', '{"verifiedExisting":true}'::JSONB,
      requested_date::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '12 hours'
    FROM recovery_gap_items
    WHERE provider_key = 'github-trending-page';
    COMMIT;
  `);
};

export const removeOriginalCutoffGapFixtureCollision = async (
  client: RecoveryPostgresClient,
): Promise<void> => {
  await client.query("BEGIN");
  try {
    const feed = await client.query<{ removed: number }>(`
      WITH removed AS (
        DELETE FROM feed_items
        WHERE id = '92000000-0000-4000-8000-000000000004'
          AND tenant_id = '${tenantId}' AND workspace_id = '${workspaceId}'
          AND provider_key = 'rss'
          AND published_at = TIMESTAMPTZ '2026-07-29T08:00:00.004Z'
        RETURNING 1
      ) SELECT count(*)::INTEGER AS removed FROM removed
    `);
    assert(feed.rows[0]?.removed === 1,
      "synthetic Jul29 RSS feed collision diverged");
    const source = await client.query<{ removed: number }>(`
      WITH removed AS (
        DELETE FROM source_items
        WHERE id = '91000000-0000-4000-8000-000000000004'
          AND tenant_id = '${tenantId}' AND workspace_id = '${workspaceId}'
          AND provider_key = 'rss'
          AND published_at = TIMESTAMPTZ '2026-07-29T08:00:00.004Z'
        RETURNING 1
      ) SELECT count(*)::INTEGER AS removed FROM removed
    `);
    assert(source.rows[0]?.removed === 1,
      "synthetic Jul29 RSS source collision diverged");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

export const assertReaderSummaryProductionRecoveryGapPostgresContract = async (
  params: Readonly<{
    auditor: RecoveryPostgresClient;
    first: RecoveryPostgresClient;
    second: RecoveryPostgresClient;
  }>,
): Promise<ReaderSummaryProductionRecoveryGapAuthorityBinding> => {
  const beforeV2 = await v2Fingerprint(params.auditor);
  const first = await prepareReaderSummaryProductionRecoveryGapAuthority(
    new PgPrismaClient(params.first) as unknown as PrismaSummaryClient,
    { tenantId, workspaceId },
  );
  const second = await prepareReaderSummaryProductionRecoveryGapAuthority(
    new PgPrismaClient(params.second) as unknown as PrismaSummaryClient,
    { tenantId, workspaceId },
  );
  assert(first.outcome === "prepared", "gap authority was not freshly prepared");
  assert(second.outcome === "replayed", "gap authority replay performed writes");
  assert(
    JSON.stringify(first.binding) === JSON.stringify(second.binding),
    "gap authority replay bytes diverged",
  );
  assert(
    first.binding.days.every(
      (day) =>
        !day.modelEligibility.eligible &&
        day.terminalOutcome?.status === "PARTIAL" &&
        day.providerCoverage.every((provider, index) => {
          const providerKey = readerSummaryProductionRecoveryGapProviderKeys[index];
          return provider.providerKey === providerKey &&
            provider.count === (providerKey === undefined
              ? undefined
              : readerSummaryProductionRecoveryGapExpectedCounts[
                  day.requestedUtcDate
                ][providerKey]) &&
            provider.evidenceState ===
              (provider.count === 0 ? "missing" : "verified_existing");
        }) &&
        day.dominance.permitted,
    ),
    "gap provider coverage, dominance, or terminal outcome diverged",
  );
  await assertNoRecoveryPublications(params.auditor);
  const afterV2 = await v2Fingerprint(params.auditor);
  assert(
    beforeV2 === afterV2,
    "Jul23-Jul28 v2 authority bytes or semantics changed",
  );
  await assertPersistedShape(params.auditor, first.binding);
  await assertGapPrivilegesAndDefinitions(params.first);
  return first.binding;
};

const v2Fingerprint = async (
  client: RecoveryPostgresClient,
): Promise<string> => {
  const result = await client.query<FingerprintRow>(`
    SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(entry ORDER BY entry),
      '[]'::JSONB)::TEXT, 'UTF8')), 'hex') AS fingerprint
    FROM (
      SELECT jsonb_build_object(
        'kind', 'lease', 'id', lease.id,
        'bytes', encode(lease.canonical_bytes, 'hex'),
        'sha256', btrim(lease.canonical_sha256)
      ) AS entry
      FROM reader_summary_production_recovery_leases AS lease
      WHERE lease.tenant_id = '${tenantId}'
        AND lease.workspace_id = '${workspaceId}'
        AND lease.canonical_record->>'schemaVersion' =
          'reader_summary.production_recovery_authority.v2'
      UNION ALL
      SELECT jsonb_build_object(
        'kind', 'day', 'id', day.identity,
        'bytes', encode(day.canonical_bytes, 'hex'),
        'sha256', btrim(day.canonical_sha256),
        'providerCounts', day.provider_counts,
        'providerEvidence', day.provider_evidence,
        'providerEvidenceSha256', btrim(day.provider_evidence_sha256),
        'githubEvidence', day.github_evidence
      ) AS entry
      FROM reader_summary_production_recovery_days AS day
      WHERE day.tenant_id = '${tenantId}'
        AND day.workspace_id = '${workspaceId}'
        AND day.canonical_record->>'schemaVersion' =
          'reader_summary.production_recovery_day.v2'
      UNION ALL
      SELECT jsonb_build_object(
        'kind', 'dry-run', 'id', dry.recovery_id, 'ordinal', dry.ordinal,
        'bytes', encode(dry.canonical_bytes, 'hex'),
        'sha256', btrim(dry.canonical_sha256)
      ) AS entry
      FROM reader_summary_production_recovery_dry_runs AS dry
      JOIN reader_summary_production_recovery_leases AS lease
        ON lease.id = dry.recovery_id
      WHERE dry.tenant_id = '${tenantId}'
        AND dry.workspace_id = '${workspaceId}'
        AND lease.canonical_record->>'schemaVersion' =
          'reader_summary.production_recovery_authority.v2'
    ) AS protected
  `);
  const fingerprint = result.rows[0]?.fingerprint;
  if (fingerprint === undefined) {
    throw new Error("Recovery v2 fingerprint was unavailable");
  }
  return fingerprint;
};

const assertPersistedShape = async (
  client: RecoveryPostgresClient,
  binding: ReaderSummaryProductionRecoveryGapAuthorityBinding,
): Promise<void> => {
  const result = await client.query<CountRow>(`
    SELECT
      count(DISTINCT lease.id)::INTEGER AS authorities,
      count(DISTINCT day.requested_utc_date)::INTEGER AS days,
      count(DISTINCT dry.ordinal)::INTEGER AS "dryRuns"
    FROM reader_summary_production_recovery_leases AS lease
    JOIN reader_summary_production_recovery_days AS day
      ON day.recovery_id = lease.id
    JOIN reader_summary_production_recovery_dry_runs AS dry
      ON dry.recovery_id = lease.id
    WHERE lease.id = '${binding.recoveryId}'::UUID
      AND lease.state = 'CONSUMED'
      AND lease.canonical_bytes = dry.canonical_bytes
      AND btrim(lease.canonical_sha256) = btrim(dry.canonical_sha256)
      AND encode(sha256(lease.canonical_bytes), 'hex') =
        btrim(lease.canonical_sha256)
  `);
  const row = result.rows[0];
  assert(
    Number(row?.authorities) === 1 &&
      Number(row?.days) === 3 &&
      Number(row?.dryRuns) === 2,
    "gap authority append-only rows diverged",
  );
};

const assertNoRecoveryPublications = async (
  client: RecoveryPostgresClient,
): Promise<void> => {
  const result = await client.query<{ publicationCount: number }>(`
    SELECT count(*)::INTEGER AS "publicationCount"
    FROM reader_summary_publications AS publication
    JOIN reader_summary_jobs AS job
      ON job.id = publication.reader_summary_job_id
      AND job.tenant_id = publication.tenant_id
      AND job.workspace_id = publication.workspace_id
    WHERE publication.tenant_id = '${tenantId}'
      AND publication.workspace_id = '${workspaceId}'
      AND job.period_started_at >= TIMESTAMPTZ '2026-07-23T00:00:00Z'
      AND job.period_started_at < TIMESTAMPTZ '2026-08-01T00:00:00Z'
  `);
  assert(
    Number(result.rows[0]?.publicationCount) === 0,
    "Jul23-Jul31 recovery publications must remain exactly zero",
  );
};

const assertGapPrivilegesAndDefinitions = async (
  client: RecoveryPostgresClient,
): Promise<void> => {
  const result = await client.query<{
    definitionFixed: boolean;
    leastPrivilege: boolean;
    ownerLockPrivilege: boolean;
  }>(`
    SELECT
      bool_and(
        authority.prosecdef
        AND authority.proowner =
          'social_monitor_reader_summary_publication_owner'::regrole
        AND authority.proconfig @> ARRAY['search_path=pg_catalog, public']
      ) AS "definitionFixed",
      has_function_privilege(current_user,
        'persist_reader_summary_production_recovery_gap_v3(jsonb,jsonb)',
        'EXECUTE')
        AND has_function_privilege(current_user,
          'read_reader_summary_production_recovery_gap_v3(uuid,uuid)',
          'EXECUTE')
        AND NOT has_table_privilege(current_user,
          'reader_summary_production_recovery_leases',
          'INSERT,UPDATE,DELETE,TRUNCATE')
        AND NOT has_table_privilege(current_user,
          'reader_summary_production_recovery_days',
          'INSERT,UPDATE,DELETE,TRUNCATE')
        AND NOT has_table_privilege(current_user,
          'reader_summary_production_recovery_dry_runs',
          'INSERT,UPDATE,DELETE,TRUNCATE') AS "leastPrivilege",
      has_column_privilege(
        'social_monitor_reader_summary_publication_owner',
        'source_catalog_entries', 'id', 'UPDATE'
      )
        AND NOT has_column_privilege(
          'social_monitor_reader_summary_publication_owner',
          'source_catalog_entries', 'provider_key', 'UPDATE'
        ) AS "ownerLockPrivilege"
    FROM pg_proc AS authority
    WHERE authority.oid = ANY(ARRAY[
      'persist_reader_summary_production_recovery_gap_v3(jsonb,jsonb)'::regprocedure,
      'read_reader_summary_production_recovery_gap_v3(uuid,uuid)'::regprocedure
    ])
  `);
  const row = result.rows[0];
  assert(
    row?.definitionFixed === true && row.leastPrivilege === true &&
      row.ownerLockPrivilege === true,
    "gap authority fixed search path, least privilege, or lock ACL diverged",
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
