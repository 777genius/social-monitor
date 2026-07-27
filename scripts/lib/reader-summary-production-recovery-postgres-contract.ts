import {
  readerSummaryPublicationFixtureScope,
} from "./reader-summary-publication-postgres-fixture-scope";

type QueryResult<TRow> = Readonly<{ rows: readonly TRow[] }>;
export type RecoveryPostgresClient = Readonly<{
  query<TRow = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<TRow>>;
}>;

type PreparedRow = Readonly<{
  outcome: string;
  recovery_id: string;
  identity: string;
  canonical_sha256: string;
  canonical_hex: string;
}>;

const { tenantId, workspaceId } = readerSummaryPublicationFixtureScope;
const jul21FeedId = "90000000-0000-4000-8000-000000000001";
const jul21SourceId = "90000000-0000-4000-8000-000000000002";

export const seedReaderSummaryProductionRecoveryFixture = async (
  auditor: RecoveryPostgresClient,
): Promise<void> => {
  await auditor.query(`
    BEGIN;
    INSERT INTO source_catalog_entries (
      id, provider_key, display_name, acquisition_mode, readiness, created_at, updated_at
    )
    SELECT ('40000000-0000-4000-8000-' || lpad(ordinal::text, 12, '0'))::uuid,
      provider_key, provider_key, 'fixture', 'READY',
      '2026-07-20T00:00:00.000Z'::timestamptz, '2026-07-20T00:00:00.000Z'::timestamptz
    FROM (VALUES (1, 'github-trending-page'), (2, 'hacker-news'), (3, 'reddit'),
      (4, 'rss'), (5, 'x-twitter')) AS providers(ordinal, provider_key)
    ON CONFLICT (provider_key) DO NOTHING;

    INSERT INTO interests (
      id, tenant_id, workspace_id, name, query, status, created_at, updated_at, deleted_at
    ) VALUES (
      '50000000-0000-4000-8000-000000000001',
      '${tenantId}',
      '${workspaceId}',
      'Production recovery PostgreSQL fixture',
      'database-owned authority',
      'ENABLED',
      '2026-07-20T00:00:00.000Z',
      '2026-07-20T00:00:00.000Z',
      NULL
    );

    INSERT INTO source_bindings (
      id, tenant_id, workspace_id, interest_id, source_catalog_entry_id,
      capability_profile_version, status, config, created_at, updated_at, deleted_at
    )
    SELECT
      ('30000000-0000-4000-8000-' ||
        lpad(provider.ordinal::text, 12, '0'))::uuid,
      '${tenantId}'::uuid,
      '${workspaceId}'::uuid,
      '50000000-0000-4000-8000-000000000001'::uuid,
      catalog.id,
      1,
      'ENABLED',
      CASE
        WHEN provider.provider_key = 'github-trending-page'
          THEN '{"window":"daily"}'::jsonb
        ELSE '{}'::jsonb
      END,
      '2026-07-20T00:00:00.000Z'::timestamptz,
      '2026-07-20T00:00:00.000Z'::timestamptz,
      NULL
    FROM (VALUES (1, 'github-trending-page'), (2, 'hacker-news'), (3, 'reddit'),
      (4, 'rss'), (5, 'x-twitter')) AS provider(ordinal, provider_key)
    JOIN source_catalog_entries AS catalog
      ON catalog.provider_key = provider.provider_key;

    INSERT INTO scan_policies (
      id, tenant_id, workspace_id, source_binding_id, interval_seconds,
      freshness_seconds, retry_budget, next_run_at, created_at, updated_at
    ) VALUES (
      '60000000-0000-4000-8000-000000000001', '${tenantId}', '${workspaceId}',
      '30000000-0000-4000-8000-000000000001', 3600, 3600, 3,
      '2026-07-25T00:00:00.000Z', '2026-07-20T00:00:00.000Z',
      '2026-07-20T00:00:00.000Z'
    );
    INSERT INTO scan_jobs (
      id, tenant_id, workspace_id, source_binding_id, scan_policy_id, status,
      idempotency_key, leased_until, retry_count, requested_at, enqueued_at,
      completed_at, created_at, updated_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000001', '${tenantId}', '${workspaceId}',
      '30000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001', 'SUCCEEDED',
      'production-recovery-github-2026-07-24', NULL, 0,
      '2026-07-24T10:00:00.000Z', '2026-07-24T10:00:00.000Z',
      '2026-07-24T12:00:00.000Z', '2026-07-24T10:00:00.000Z',
      '2026-07-24T12:00:00.000Z'
    );
    INSERT INTO scan_attempts (
      scan_job_id, tenant_id, workspace_id, source_binding_id, attempt_number,
      status, started_at, finished_at, fetched, inserted, skipped_duplicates,
      projected, updated_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000001', '${tenantId}', '${workspaceId}',
      '30000000-0000-4000-8000-000000000001', 1, 'SUCCEEDED',
      '2026-07-24T10:00:00.000Z', '2026-07-24T12:00:00.000Z',
      10, 10, 0, 10, '2026-07-24T12:00:00.000Z'
    );

    CREATE TEMP TABLE sm_recovery_fixture_items
    ON COMMIT DROP AS
    SELECT
      row_number() OVER (
        ORDER BY requested_utc_date, provider_key, position
      )::integer AS item_number,
      requested_utc_date,
      provider_key,
      position
    FROM (
      VALUES
        (DATE '2026-07-23', 'hacker-news', 100),
        (DATE '2026-07-23', 'reddit', 100),
        (DATE '2026-07-23', 'rss', 75),
        (DATE '2026-07-23', 'x-twitter', 67),
        (DATE '2026-07-24', 'github-trending-page', 10),
        (DATE '2026-07-24', 'hacker-news', 100),
        (DATE '2026-07-24', 'reddit', 100),
        (DATE '2026-07-24', 'rss', 67),
        (DATE '2026-07-24', 'x-twitter', 73)
    ) AS requested(requested_utc_date, provider_key, item_count)
    CROSS JOIN LATERAL generate_series(1, item_count) AS positions(position);

    INSERT INTO source_items (
      id, tenant_id, workspace_id, source_binding_id, provider_key,
      provider_item_id, canonical_url, title, body, author_handle,
      published_at, content_hash, provider_content_hash, observed_at,
      last_observed_at, content_updated_at, raw_pointer, metadata,
      schema_version, created_at
    )
    SELECT
      ('10000000-0000-4000-8000-' ||
        lpad(item.item_number::text, 12, '0'))::uuid,
      '${tenantId}'::uuid,
      '${workspaceId}'::uuid,
      ('30000000-0000-4000-8000-' || lpad((
        CASE item.provider_key
          WHEN 'github-trending-page' THEN 1
          WHEN 'hacker-news' THEN 2
          WHEN 'reddit' THEN 3
          WHEN 'rss' THEN 4
          WHEN 'x-twitter' THEN 5
        END
      )::text, 12, '0'))::uuid,
      item.provider_key,
      'recovery:' || item.requested_utc_date || ':' ||
        item.provider_key || ':' || item.position,
      'https://fixture.invalid/' || item.requested_utc_date || '/' ||
        item.provider_key || '/' || item.position,
      'Recovery fixture ' || item.item_number,
      'Immutable fixture body ' || item.item_number,
      NULL,
      item.requested_utc_date::timestamp AT TIME ZONE 'UTC' -
        interval '2 days' + interval '18 hours' +
        item.position * interval '1 millisecond',
      encode(sha256(convert_to('source:' || item.item_number, 'UTF8')), 'hex'),
      CASE
        WHEN item.provider_key = 'github-trending-page'
          THEN encode(sha256(convert_to('provider:' || item.item_number, 'UTF8')), 'hex')
        ELSE NULL
      END,
      item.requested_utc_date::timestamp AT TIME ZONE 'UTC' +
        interval '12 hours' + item.position * interval '1 millisecond',
      NULL,
      NULL,
      NULL,
      CASE
        WHEN item.provider_key = 'github-trending-page' THEN
          jsonb_build_object(
            'kind', 'github_trending_page_repository',
            'repository', jsonb_build_object(
              'fullName', 'fixture/repository-' || item.position
            ),
            'trending', jsonb_build_object(
              'scanJobId',
                '70000000-0000-4000-8000-000000000001',
              'rank', item.position,
              'checkedAt', to_char(
                item.requested_utc_date::timestamp AT TIME ZONE 'UTC' +
                  interval '11 hours' + item.position * interval '1 millisecond',
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
              )
            )
          )
        ELSE '{}'::jsonb
      END,
      1,
      item.requested_utc_date::timestamp AT TIME ZONE 'UTC' +
        interval '12 hours'
    FROM sm_recovery_fixture_items AS item;

    INSERT INTO feed_items (
      id, tenant_id, workspace_id, interest_id, source_item_id,
      source_binding_id, provider_key, dedupe_key, canonical_url, title,
      body_preview, author_handle, published_at, observed_at,
      provider_metadata, status, created_at, updated_at
    )
    SELECT
      ('20000000-0000-4000-8000-' ||
        lpad(item.item_number::text, 12, '0'))::uuid,
      '${tenantId}'::uuid,
      '${workspaceId}'::uuid,
      '50000000-0000-4000-8000-000000000001'::uuid,
      ('10000000-0000-4000-8000-' ||
        lpad(item.item_number::text, 12, '0'))::uuid,
      ('30000000-0000-4000-8000-' || lpad((
        CASE item.provider_key
          WHEN 'github-trending-page' THEN 1
          WHEN 'hacker-news' THEN 2
          WHEN 'reddit' THEN 3
          WHEN 'rss' THEN 4
          WHEN 'x-twitter' THEN 5
        END
      )::text, 12, '0'))::uuid,
      item.provider_key,
      'recovery:' || item.requested_utc_date || ':' ||
        item.provider_key || ':' || item.position,
      'https://fixture.invalid/' || item.requested_utc_date || '/' ||
        item.provider_key || '/' || item.position,
      'Recovery fixture ' || item.item_number,
      'Immutable fixture body ' || item.item_number,
      NULL,
      item.requested_utc_date::timestamp AT TIME ZONE 'UTC' -
        interval '2 days' + interval '18 hours' +
        item.position * interval '1 millisecond',
      item.requested_utc_date::timestamp AT TIME ZONE 'UTC' +
        interval '12 hours' + item.position * interval '1 millisecond',
      NULL,
      'VISIBLE',
      item.requested_utc_date::timestamp AT TIME ZONE 'UTC' +
        interval '12 hours',
      item.requested_utc_date::timestamp AT TIME ZONE 'UTC' +
        interval '12 hours'
    FROM sm_recovery_fixture_items AS item;

    INSERT INTO github_repository_trend_results (
      id, tenant_id, workspace_id, interest_id, source_binding_id, scan_job_id,
      source_item_id, repository_full_name, repository_url, primary_window,
      rank, checked_at, observed_at, source, metadata, created_at
    )
    SELECT
      ('80000000-0000-4000-8000-' ||
        lpad(item.item_number::text, 12, '0'))::uuid,
      '${tenantId}'::uuid,
      '${workspaceId}'::uuid,
      '50000000-0000-4000-8000-000000000001'::uuid,
      '30000000-0000-4000-8000-000000000001'::uuid,
      '70000000-0000-4000-8000-000000000001'::uuid,
      ('10000000-0000-4000-8000-' ||
        lpad(item.item_number::text, 12, '0'))::uuid,
      'fixture/repository-' || item.position,
      'https://fixture.invalid/' || item.requested_utc_date || '/' ||
        item.provider_key || '/' || item.position,
      'daily',
      item.position,
      item.requested_utc_date::timestamp AT TIME ZONE 'UTC' +
        interval '11 hours' + item.position * interval '1 millisecond',
      item.requested_utc_date::timestamp AT TIME ZONE 'UTC' +
        interval '12 hours' + item.position * interval '1 millisecond',
      'fixture',
      '{"verifiedExisting":true}'::jsonb,
      item.requested_utc_date::timestamp AT TIME ZONE 'UTC' +
        interval '12 hours'
    FROM sm_recovery_fixture_items AS item
    WHERE item.provider_key = 'github-trending-page';

    INSERT INTO source_items (
      id, tenant_id, workspace_id, source_binding_id, provider_key,
      provider_item_id, canonical_url, title, body, published_at,
      content_hash, observed_at, metadata, schema_version, created_at
    ) VALUES (
      '${jul21SourceId}',
      '${tenantId}',
      '${workspaceId}',
      '30000000-0000-4000-8000-000000000002',
      'hacker-news',
      'jul21-sentinel',
      'https://fixture.invalid/2026-07-21/sentinel',
      'July 21 immutable sentinel',
      'Must remain unchanged',
      '2026-07-21T12:00:00.000Z',
      repeat('9', 64),
      '2026-07-21T12:00:00.000Z',
      '{"sentinel":true}',
      1,
      '2026-07-21T12:00:00.000Z'
    );
    INSERT INTO feed_items (
      id, tenant_id, workspace_id, interest_id, source_item_id,
      source_binding_id, provider_key, dedupe_key, canonical_url, title,
      body_preview, published_at, observed_at, status, created_at, updated_at
    ) VALUES (
      '${jul21FeedId}',
      '${tenantId}',
      '${workspaceId}',
      '50000000-0000-4000-8000-000000000001',
      '${jul21SourceId}',
      '30000000-0000-4000-8000-000000000002',
      'hacker-news',
      'jul21-sentinel',
      'https://fixture.invalid/2026-07-21/sentinel',
      'July 21 immutable sentinel',
      'Must remain unchanged',
      '2026-07-21T12:00:00.000Z',
      '2026-07-21T12:00:00.000Z',
      'VISIBLE',
      '2026-07-21T12:00:00.000Z',
      '2026-07-21T12:00:00.000Z'
    );
    COMMIT;
  `);
};

export const assertReaderSummaryProductionRecoveryPostgresContract =
  async (params: Readonly<{
    auditor: RecoveryPostgresClient;
    first: RecoveryPostgresClient;
    second: RecoveryPostgresClient;
  }>): Promise<void> => {
    const before = await boundaryCounts(params.auditor);
    const jul21Before = await jul21Fingerprint(params.auditor);
    await assertSourceBindingMismatchFailsClosed(params.auditor);
    const [left, right] = await Promise.all([
      prepareWithSerializableRetry(params.first),
      prepareWithSerializableRetry(params.second),
    ]);
    assertDeepEqual(
      [left.outcome, right.outcome].sort(),
      ["prepared", "replayed"],
      "concurrent authority callers must prepare once and replay once",
    );
    assert(
      left.recovery_id === right.recovery_id &&
        left.identity === right.identity &&
        left.canonical_sha256 === right.canonical_sha256 &&
        left.canonical_hex === right.canonical_hex,
      "concurrent authority callers must converge on byte-identical identity",
    );
    await assertPersistedAuthority(params.first, left);
    assertDeepEqual(
      await boundaryCounts(params.auditor),
      before,
      "pre-model recovery authority must not create model or publication rows",
    );
    assert(
      (await jul21Fingerprint(params.auditor)) === jul21Before,
      "2026-07-21 source and feed rows must remain byte-identical",
    );
    await assertTenantForgeryFailsClosed(params.second);
    await assertDirectMutationFailsClosed(params.first, left.recovery_id);

    await params.auditor.query(
      `UPDATE source_items
          SET content_hash = repeat('e', 64)
        WHERE id = (
          SELECT source_item_id
            FROM feed_items
           WHERE tenant_id = $1
             AND workspace_id = $2
             AND provider_key = 'hacker-news'
             AND observed_at >= '2026-07-24T00:00:00.000Z'
           ORDER BY id
           LIMIT 1
        )`,
      [tenantId, workspaceId],
    );
    const replay = await prepareWithSerializableRetry(params.first);
    assert(
      replay.outcome === "replayed" &&
        replay.canonical_sha256 === left.canonical_sha256 &&
        replay.canonical_hex === left.canonical_hex,
      "source mutation after recovery must not rewrite immutable evidence",
    );

    await params.auditor.query(`
      ALTER TABLE reader_summary_production_recovery_days
        DISABLE TRIGGER reader_summary_production_recovery_days_immutable;
      UPDATE reader_summary_production_recovery_days
         SET canonical_sha256 = repeat('f', 64)
       WHERE requested_utc_date = DATE '2026-07-23';
      ALTER TABLE reader_summary_production_recovery_days
        ENABLE TRIGGER reader_summary_production_recovery_days_immutable;
    `);
    await assertRejects(
      () => prepareWithSerializableRetry(params.first),
      "persisted divergence must fail closed on replay",
    );
  };

const assertPersistedAuthority = async (
  client: RecoveryPostgresClient,
  prepared: PreparedRow,
): Promise<void> => {
  const result = await client.query<{
    canonical_equal: boolean;
    consumed_after_snapshots: boolean;
    day_count: string;
    duplicate_feed_count: string;
    duplicate_source_count: string;
    evidence_count: string;
    lease_count: string;
    snapshots_equal: boolean;
    dry_run_count: string;
    jul23_counts: unknown;
    jul23_github_mode: string;
    jul24_counts: unknown;
    jul24_github_mode: string;
    jul24_github_count: number;
    retained_published_at: string;
    retained_observed_at: string;
  }>(
    `SELECT
       (SELECT count(*) FROM reader_summary_production_recovery_leases) AS lease_count,
       (SELECT count(*) FROM reader_summary_production_recovery_days) AS day_count,
       (SELECT count(*) FROM reader_summary_production_recovery_dry_runs) AS dry_run_count,
       (SELECT bool_and(
          dry.canonical_bytes = lease.canonical_bytes
          AND btrim(dry.canonical_sha256) =
            btrim(lease.canonical_sha256)
        )
          FROM reader_summary_production_recovery_dry_runs dry
          JOIN reader_summary_production_recovery_leases lease
            ON lease.id = dry.recovery_id) AS snapshots_equal,
       (SELECT max(dry.captured_at) <= lease.consumed_at
          FROM reader_summary_production_recovery_dry_runs dry
          JOIN reader_summary_production_recovery_leases lease
            ON lease.id = dry.recovery_id
         GROUP BY lease.consumed_at) AS consumed_after_snapshots,
       (SELECT encode(canonical_bytes, 'hex') = $2
          FROM reader_summary_production_recovery_leases
         WHERE id = $1) AS canonical_equal,
       (SELECT provider_counts FROM reader_summary_production_recovery_days
         WHERE requested_utc_date = DATE '2026-07-23') AS jul23_counts,
       (SELECT github_evidence->>'mode' FROM reader_summary_production_recovery_days
         WHERE requested_utc_date = DATE '2026-07-23') AS jul23_github_mode,
       (SELECT provider_counts FROM reader_summary_production_recovery_days
         WHERE requested_utc_date = DATE '2026-07-24') AS jul24_counts,
       (SELECT github_evidence->>'mode' FROM reader_summary_production_recovery_days
         WHERE requested_utc_date = DATE '2026-07-24') AS jul24_github_mode,
       (SELECT (github_evidence->>'evidenceCount')::integer
          FROM reader_summary_production_recovery_days
         WHERE requested_utc_date = DATE '2026-07-24')
           AS jul24_github_count,
       (SELECT entry->>'publishedAt'
          FROM reader_summary_production_recovery_days day
          CROSS JOIN LATERAL jsonb_array_elements(
            day.provider_evidence->'hacker-news'
          ) evidence(entry)
         WHERE requested_utc_date = DATE '2026-07-23'
         ORDER BY entry->>'feedItemId'
         LIMIT 1) AS retained_published_at,
       (SELECT entry->>'observedAt'
          FROM reader_summary_production_recovery_days day
          CROSS JOIN LATERAL jsonb_array_elements(
            day.provider_evidence->'hacker-news'
          ) evidence(entry)
         WHERE requested_utc_date = DATE '2026-07-23'
         ORDER BY entry->>'feedItemId'
         LIMIT 1) AS retained_observed_at,
       evidence.evidence_count::text AS evidence_count,
       (evidence.evidence_count -
         evidence.distinct_feed_count)::text AS duplicate_feed_count,
       (evidence.evidence_count -
         evidence.distinct_source_count)::text AS duplicate_source_count
     FROM (
       SELECT
         count(*) AS evidence_count,
         count(DISTINCT entry->>'feedItemId') AS distinct_feed_count,
         count(DISTINCT entry->>'sourceItemId') AS distinct_source_count
       FROM reader_summary_production_recovery_days day
       CROSS JOIN LATERAL
         jsonb_each(day.provider_evidence) provider
       CROSS JOIN LATERAL
         jsonb_array_elements(provider.value) evidence(entry)
     ) evidence`,
    [prepared.recovery_id, prepared.canonical_hex],
  );
  const row = result.rows[0];
  assert(row !== undefined, "persisted recovery authority must exist");
  assertDeepEqual(
    {
      leaseCount: row.lease_count,
      dayCount: row.day_count,
      dryRunCount: row.dry_run_count,
      evidenceCount: row.evidence_count,
      duplicateFeedCount: row.duplicate_feed_count,
      duplicateSourceCount: row.duplicate_source_count,
      snapshotsEqual: row.snapshots_equal,
      consumedAfterSnapshots: row.consumed_after_snapshots,
      canonicalEqual: row.canonical_equal,
      jul23Mode: row.jul23_github_mode,
      jul24Mode: row.jul24_github_mode,
      jul24GitHubCount: row.jul24_github_count,
      retainedPublishedAt: row.retained_published_at,
      retainedObservedAt: row.retained_observed_at,
    },
    {
      leaseCount: "1",
      dayCount: "2",
      dryRunCount: "2",
      evidenceCount: "692",
      duplicateFeedCount: "0",
      duplicateSourceCount: "0",
      snapshotsEqual: true,
      consumedAfterSnapshots: true,
      canonicalEqual: true,
      jul23Mode: "historical_unavailable",
      jul24Mode: "verified_existing",
      jul24GitHubCount: 10,
      retainedPublishedAt: "2026-07-21T18:00:00.001Z",
      retainedObservedAt: "2026-07-23T12:00:00.001Z",
    },
    "persisted recovery cardinality and evidence seals must be exact",
  );
  assertDeepEqual(
    row.jul23_counts,
    expectedCounts([0, 100, 100, 75, 67]),
    "2026-07-23 provider counts must be exact",
  );
  assertDeepEqual(
    row.jul24_counts,
    expectedCounts([10, 100, 100, 67, 73]),
    "2026-07-24 provider counts must be exact",
  );
  const privileges = await client.query<{
    can_execute: boolean;
    can_insert: boolean;
    can_update: boolean;
    fixed_path: boolean;
    rls_forced: boolean;
  }>(
    `SELECT
       has_function_privilege(
         current_user,
         'prepare_reader_summary_production_recovery()',
         'EXECUTE'
       ) AS can_execute,
       has_table_privilege(
         current_user,
         'reader_summary_production_recovery_days',
         'INSERT'
       ) AS can_insert,
       has_table_privilege(
         current_user,
         'reader_summary_production_recovery_days',
         'UPDATE'
       ) AS can_update,
       (
         SELECT proconfig @> ARRAY[
           'search_path=pg_catalog, public, pg_temp'
         ]
         FROM pg_proc
         WHERE oid =
           'prepare_reader_summary_production_recovery()'::regprocedure
       ) AS fixed_path,
       (
         SELECT bool_and(relrowsecurity AND relforcerowsecurity)
         FROM pg_class
         WHERE oid = ANY(ARRAY[
           'reader_summary_production_recovery_leases'::regclass,
           'reader_summary_production_recovery_days'::regclass,
           'reader_summary_production_recovery_dry_runs'::regclass
         ])
       ) AS rls_forced`,
  );
  assertDeepEqual(
    privileges.rows[0],
    {
      can_execute: true,
      can_insert: false,
      can_update: false,
      fixed_path: true,
      rls_forced: true,
    },
    "runtime must receive only fixed-path prepare and read authority",
  );
};

const assertSourceBindingMismatchFailsClosed = async (
  client: RecoveryPostgresClient,
): Promise<void> => {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query(
      `SELECT
         set_config('social_monitor.tenant_id', $1, false),
         set_config('social_monitor.workspace_id', $2, false),
         set_config('social_monitor.system_access', 'false', false)`,
      [tenantId, workspaceId],
    );
    await client.query(
      `UPDATE source_items
          SET source_binding_id =
            '30000000-0000-4000-8000-000000000003'::uuid
        WHERE id = (
          SELECT source_item_id
            FROM feed_items
           WHERE tenant_id = $1
             AND workspace_id = $2
             AND provider_key = 'hacker-news'
             AND observed_at >= '2026-07-24T00:00:00.000Z'
           ORDER BY id
           LIMIT 1
        )`,
      [tenantId, workspaceId],
    );
    await assertRejects(
      () =>
        client.query(
          `SELECT recovery_id
             FROM prepare_reader_summary_production_recovery()`,
        ),
      "source/feed source_binding mismatch must fail closed",
    );
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
  }
};

const prepareWithSerializableRetry = async (
  client: RecoveryPostgresClient,
): Promise<PreparedRow> => {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      const result = await client.query<PreparedRow>(
        `SELECT
           outcome,
           recovery_id::text,
           identity,
           btrim(canonical_sha256) AS canonical_sha256,
           encode(canonical_bytes, 'hex') AS canonical_hex
         FROM prepare_reader_summary_production_recovery()`,
      );
      const row = result.rows[0];
      assert(
        row !== undefined && result.rows.length === 1,
        "prepare function must return exactly one authority",
      );
      await client.query("COMMIT");
      return row;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      const code = String(
        (error as { readonly code?: unknown }).code ?? "",
      );
      if ((code === "40001" || code === "40P01") && attempt < 5) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("production recovery SERIALIZABLE retry exhausted");
};

const assertTenantForgeryFailsClosed = async (
  client: RecoveryPostgresClient,
): Promise<void> => {
  await client.query(
    `SELECT
       set_config(
         'social_monitor.tenant_id',
         '00000000-0000-7000-8000-000000000091',
         false
       ),
       set_config(
         'social_monitor.workspace_id',
         '00000000-0000-7000-8000-000000000092',
         false
       )`,
  );
  await assertRejects(
    () => prepareWithSerializableRetry(client),
    "a forged tenant/workspace scope must not replay authority",
  );
  await client.query(
    `SELECT
       set_config('social_monitor.tenant_id', $1, false),
       set_config('social_monitor.workspace_id', $2, false)`,
    [tenantId, workspaceId],
  );
};

const assertDirectMutationFailsClosed = async (
  client: RecoveryPostgresClient,
  recoveryId: string,
): Promise<void> => {
  await assertRejects(
    () =>
      client.query(
        `UPDATE reader_summary_production_recovery_days
            SET provider_counts = provider_counts
          WHERE recovery_id = $1`,
        [recoveryId],
      ),
    "runtime must not update immutable recovery days",
  );
};

const boundaryCounts = async (
  client: RecoveryPostgresClient,
): Promise<Record<string, string>> => {
  const result = await client.query<Record<string, string>>(
    `SELECT
       (SELECT count(*) FROM reader_summary_jobs)::text AS jobs,
       (SELECT count(*) FROM reader_summary_artifacts)::text AS artifacts,
       (SELECT count(*) FROM reader_summary_publications)::text
         AS publications,
       (SELECT count(*) FROM reader_summary_recovery_receipts)::text
         AS receipts`,
  );
  return result.rows[0] ?? {};
};

const jul21Fingerprint = async (
  client: RecoveryPostgresClient,
): Promise<string> => {
  const result = await client.query<{ fingerprint: string }>(
    `SELECT md5(source_row::text || feed_row::text) AS fingerprint
       FROM source_items source_row
       JOIN feed_items feed_row
         ON feed_row.source_item_id = source_row.id
      WHERE source_row.id = $1
        AND feed_row.id = $2`,
    [jul21SourceId, jul21FeedId],
  );
  const fingerprint = result.rows[0]?.fingerprint;
  assert(fingerprint !== undefined, "2026-07-21 sentinel must exist");
  return fingerprint;
};

const expectedCounts = (
  counts: readonly number[],
): readonly Record<string, unknown>[] =>
  [
    "github-trending-page",
    "hacker-news",
    "reddit",
    "rss",
    "x-twitter",
  ].map((providerKey, index) => ({
    providerKey,
    count: counts[index],
  }));

const assertRejects = async (
  operation: () => Promise<unknown>,
  message: string,
): Promise<void> => {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(message);
};

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const assertDeepEqual = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(
        actual,
      )}`,
    );
  }
};

const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_key, candidate: unknown) => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      return candidate;
    }
    return Object.fromEntries(
      Object.entries(candidate as Record<string, unknown>).sort(
        ([left], [right]) => left.localeCompare(right),
      ),
    );
  });
