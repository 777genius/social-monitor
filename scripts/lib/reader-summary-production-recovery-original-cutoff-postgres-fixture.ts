import type { PrismaReaderSummaryProductionRecoveryAuthority } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority";
import type { RecoveryPostgresClient } from "./reader-summary-production-recovery-postgres-contract";

type RecoveryScope = Readonly<{
  tenantId: string;
  workspaceId: string;
}>;

type LegacyMutation =
  | "none"
  | "unknown_identity"
  | "missing_hash"
  | "duplicate_identity"
  | "duplicate_hash";

export const seedOriginalCutoffOutsidePeriodRss = async (
  client: RecoveryPostgresClient,
  scope: RecoveryScope,
): Promise<void> => {
  await client.query(`
    BEGIN;
    CREATE TEMP TABLE original_cutoff_outside_rss ON COMMIT DROP AS
    SELECT * FROM (VALUES
      (1, DATE '2026-07-23', 76, TIMESTAMPTZ '2026-07-22T08:00:00.001Z'),
      (2, DATE '2026-07-23', 77, TIMESTAMPTZ '2026-07-22T08:00:00.002Z'),
      (3, DATE '2026-07-23', 78, TIMESTAMPTZ '2026-07-22T08:00:00.003Z'),
      (4, DATE '2026-07-24', 68, TIMESTAMPTZ '2026-07-29T08:00:00.004Z')
    ) AS excluded(ordinal, requested_date, position, published_at);

    INSERT INTO source_items (
      id, tenant_id, workspace_id, source_binding_id, provider_key,
      provider_item_id, canonical_url, title, body, author_handle,
      published_at, content_hash, provider_content_hash, observed_at,
      last_observed_at, content_updated_at, raw_pointer, metadata,
      schema_version, created_at
    )
    SELECT
      ('91000000-0000-4000-8000-' ||
        lpad(excluded.ordinal::TEXT, 12, '0'))::UUID,
      '${scope.tenantId}', '${scope.workspaceId}',
      '30000000-0000-4000-8000-000000000004', 'rss',
      'original-cutoff-excluded:' || excluded.requested_date || ':' ||
        excluded.position,
      'https://outside-period.invalid/' || excluded.requested_date || '/' ||
        excluded.position,
      'Outside-period RSS ' || excluded.ordinal,
      'Immutable outside-period body ' || excluded.ordinal,
      NULL, excluded.published_at,
      encode(sha256(convert_to(
        'original-cutoff-excluded:' || excluded.ordinal, 'UTF8'
      )), 'hex'),
      NULL,
      TIMESTAMPTZ '2026-07-30T12:00:00Z' +
        excluded.ordinal * INTERVAL '1 millisecond',
      NULL, NULL, NULL, '{}'::JSONB, 1,
      TIMESTAMPTZ '2026-07-30T12:00:00Z'
    FROM original_cutoff_outside_rss AS excluded;

    INSERT INTO feed_items (
      id, tenant_id, workspace_id, interest_id, source_item_id,
      source_binding_id, provider_key, dedupe_key, canonical_url, title,
      body_preview, author_handle, published_at, observed_at,
      provider_metadata, status, created_at, updated_at
    )
    SELECT
      ('92000000-0000-4000-8000-' ||
        lpad(excluded.ordinal::TEXT, 12, '0'))::UUID,
      '${scope.tenantId}', '${scope.workspaceId}',
      '50000000-0000-4000-8000-000000000001', source.id,
      source.source_binding_id, 'rss',
      'original-cutoff-excluded:' || excluded.requested_date || ':' ||
        excluded.position,
      source.canonical_url, source.title, source.body, NULL,
      source.published_at, source.observed_at, NULL, 'VISIBLE',
      TIMESTAMPTZ '2026-07-30T12:00:00Z',
      TIMESTAMPTZ '2026-07-30T12:00:00Z'
    FROM original_cutoff_outside_rss AS excluded
    JOIN source_items AS source ON source.id =
      ('91000000-0000-4000-8000-' ||
        lpad(excluded.ordinal::TEXT, 12, '0'))::UUID;
    COMMIT;
  `);
};

export const installLegacyOriginalCutoffAuthority = async (
  client: RecoveryPostgresClient,
  recoveryId: string,
  mutation: LegacyMutation = "none",
): Promise<void> => {
  await client.query("BEGIN");
  try {
    await client.query(
      `
        CREATE TEMP TABLE original_cutoff_target ON COMMIT DROP AS
        SELECT $1::UUID AS recovery_id, $2::TEXT AS mutation;
      `,
      [recoveryId, mutation],
    );
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(`DO $fixture$
    DECLARE
      v_authority JSONB;
      v_authority_bytes BYTEA;
      v_authority_sha TEXT;
      v_date DATE;
      v_day reader_summary_production_recovery_days%ROWTYPE;
      v_day_bytes BYTEA;
      v_day_record JSONB;
      v_day_sha TEXT;
      v_digests JSONB;
      v_evidence JSONB;
      v_evidence_sha TEXT;
      v_legacy_rss JSONB;
      v_lease reader_summary_production_recovery_leases%ROWTYPE;
      v_mutation TEXT;
      v_plan_days JSONB;
      v_provider TEXT;
      v_provider_count INTEGER;
      v_recovery_id UUID;
    BEGIN
      SELECT recovery_id, mutation INTO STRICT v_recovery_id, v_mutation
      FROM original_cutoff_target;
      FOREACH v_date IN ARRAY ARRAY[
        DATE '2026-07-23', DATE '2026-07-24'
      ] LOOP
        SELECT day.* INTO STRICT v_day
        FROM reader_summary_production_recovery_days AS day
        WHERE day.recovery_id = v_recovery_id
          AND day.requested_utc_date = v_date;
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'providerKey', 'rss',
          'feedItemId', feed.id::TEXT,
          'sourceItemId', source.id::TEXT,
          'sourceBindingId', source.source_binding_id::TEXT,
          'interestId', feed.interest_id::TEXT,
          'providerItemId', source.provider_item_id,
          'canonicalUrl', source.canonical_url,
          'title', feed.title,
          'bodyPreview', feed.body_preview,
          'sourceText', LEFT(
            COALESCE(NULLIF(feed.body_preview, ''), source.body), 4096
          ),
          'sourceContentHash', source.content_hash,
          'sourceProviderContentHash', source.provider_content_hash,
          'publishedAt', to_char(
            feed.published_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ),
          'observedAt', to_char(
            feed.observed_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        ) || (CASE WHEN feed.author_handle IS NULL
          THEN '{}'::JSONB
          ELSE jsonb_build_object('authorHandle', feed.author_handle)
        END) ORDER BY feed.id), '[]'::JSONB)
        INTO v_legacy_rss
        FROM feed_items AS feed
        JOIN source_items AS source
          ON source.id = feed.source_item_id
          AND source.tenant_id = feed.tenant_id
          AND source.workspace_id = feed.workspace_id
        WHERE feed.tenant_id = v_day.tenant_id
          AND feed.workspace_id = v_day.workspace_id
          AND feed.provider_key = 'rss'
          AND (
            (
              feed.published_at >=
                (v_date::TIMESTAMP AT TIME ZONE 'UTC')
              AND feed.published_at <
                ((v_date + 1)::TIMESTAMP AT TIME ZONE 'UTC')
            )
            OR source.provider_item_id LIKE
              'original-cutoff-excluded:' || v_date || ':%'
          );
        IF jsonb_array_length(v_legacy_rss) <>
          (CASE WHEN v_date = DATE '2026-07-23' THEN 78 ELSE 68 END) THEN
          RAISE EXCEPTION 'original-cutoff fixture legacy rows diverged';
        END IF;
        v_evidence := jsonb_set(
          v_day.provider_evidence, '{rss}', v_legacy_rss, FALSE
        );
        IF v_date = DATE '2026-07-23' THEN
          CASE v_mutation
            WHEN 'unknown_identity' THEN
              v_evidence := jsonb_set(
                v_evidence, '{rss,0,unknownIdentity}', '"unknown"', TRUE
              );
            WHEN 'missing_hash' THEN
              v_evidence := v_evidence #- '{rss,0,sourceContentHash}';
            WHEN 'duplicate_identity' THEN
              v_evidence := jsonb_set(
                v_evidence,
                '{rss,1,providerItemId}',
                v_evidence#>'{rss,0,providerItemId}',
                FALSE
              );
            WHEN 'duplicate_hash' THEN
              v_evidence := jsonb_set(
                v_evidence,
                '{rss,1,sourceContentHash}',
                v_evidence#>'{rss,0,sourceContentHash}',
                FALSE
              );
            WHEN 'none' THEN NULL;
            ELSE RAISE EXCEPTION
              'original-cutoff fixture mutation is unknown';
          END CASE;
        END IF;
        v_day.provider_counts := jsonb_set(
          v_day.provider_counts,
          '{3,count}',
          to_jsonb(CASE
            WHEN v_date = DATE '2026-07-23' THEN 78 ELSE 68
          END),
          FALSE
        );
        v_digests := '[]'::JSONB;
        FOREACH v_provider IN ARRAY ARRAY[
          'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'
        ] LOOP
          SELECT (count_entry->>'count')::INTEGER
          INTO STRICT v_provider_count
          FROM jsonb_array_elements(v_day.provider_counts)
            AS count(count_entry)
          WHERE count_entry->>'providerKey' = v_provider;
          v_evidence_sha := encode(sha256(convert_to(
            reader_summary_production_recovery_canonical_json(
              v_evidence->v_provider
            ), 'UTF8'
          )), 'hex');
          v_digests := v_digests || jsonb_build_array(jsonb_build_object(
            'providerKey', v_provider,
            'count', v_provider_count,
            'sha256', v_evidence_sha
          ));
        END LOOP;
        v_evidence_sha := encode(sha256(convert_to(
          reader_summary_production_recovery_canonical_json(v_digests),
          'UTF8'
        )), 'hex');
        v_day_record := jsonb_set(
          jsonb_set(
            jsonb_set(
              v_day.canonical_record,
              '{providerCounts}', v_day.provider_counts, FALSE
            ),
            '{providerEvidenceDigests}', v_digests, FALSE
          ),
          '{providerEvidenceSha256}', to_jsonb(v_evidence_sha), FALSE
        );
        v_day_bytes := convert_to(
          reader_summary_weekly_canonical_json(v_day_record), 'UTF8'
        );
        v_day_sha := encode(sha256(v_day_bytes), 'hex');
        UPDATE reader_summary_production_recovery_days AS day
        SET identity = 'reader_summary.production_recovery_day.v2:' ||
              v_day_sha,
            provider_counts = v_day.provider_counts,
            provider_evidence = v_evidence,
            provider_evidence_sha256 = v_evidence_sha,
            canonical_record = v_day_record,
            canonical_bytes = v_day_bytes,
            canonical_sha256 = v_day_sha
        WHERE day.recovery_id = v_recovery_id
          AND day.requested_utc_date = v_date;
      END LOOP;

      SELECT lease.* INTO STRICT v_lease
      FROM reader_summary_production_recovery_leases AS lease
      WHERE lease.id = v_recovery_id;
      SELECT jsonb_agg(jsonb_build_object(
        'identity', day.identity,
        'requestedUtcDate', to_char(day.requested_utc_date, 'YYYY-MM-DD'),
        'canonicalSha256', btrim(day.canonical_sha256),
        'providerEvidenceSha256', btrim(day.provider_evidence_sha256),
        'planSha256s', jsonb_build_array(
          btrim(day.canonical_sha256), btrim(day.canonical_sha256)
        )
      ) ORDER BY day.requested_utc_date)
      INTO v_plan_days
      FROM reader_summary_production_recovery_days AS day
      WHERE day.recovery_id = v_recovery_id;
      v_authority := jsonb_set(
        v_lease.canonical_record, '{days}', v_plan_days, FALSE
      );
      v_authority_bytes := convert_to(
        reader_summary_weekly_canonical_json(v_authority), 'UTF8'
      );
      v_authority_sha := encode(sha256(v_authority_bytes), 'hex');
      UPDATE reader_summary_production_recovery_dry_runs AS dry
      SET canonical_record = v_authority,
          canonical_bytes = v_authority_bytes,
          canonical_sha256 = v_authority_sha
      WHERE dry.recovery_id = v_recovery_id;
      UPDATE reader_summary_production_recovery_leases AS lease
      SET canonical_record = v_authority,
          canonical_bytes = v_authority_bytes,
          canonical_sha256 = v_authority_sha
      WHERE lease.id = v_recovery_id;
    END;
    $fixture$;
  `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

export const assertOriginalCutoffPostgresRepair = async (params: Readonly<{
  authority: PrismaReaderSummaryProductionRecoveryAuthority;
  canonicalSha256: string;
  client: RecoveryPostgresClient;
  migrationSql: string;
  scope: RecoveryScope;
}>): Promise<void> => {
  for (const mutation of [
    "unknown_identity",
    "missing_hash",
    "duplicate_identity",
    "duplicate_hash",
  ] as const) {
    await installLegacyOriginalCutoffAuthority(
      params.client,
      (await recoveryId(params.client, params.scope)),
      mutation,
    );
    await assertMigrationRejects(params.client, params.migrationSql, mutation);
  }
  const targetRecoveryId = await recoveryId(params.client, params.scope);
  await installLegacyOriginalCutoffAuthority(params.client, targetRecoveryId);
  const legacy = await originalCutoffLegacyRows(params.client, params.scope);
  assert(
    JSON.stringify(legacy.map((row) => ({
      allBeforeLease: row.allBeforeLease,
      nullAuthorKeys: row.nullAuthorKeys,
      requestedDate: row.requestedDate,
      retainedCount: row.retainedCount,
      rssCount: row.rssCount,
    }))) === JSON.stringify([
      { allBeforeLease: true, nullAuthorKeys: 0,
        requestedDate: "2026-07-23", retainedCount: 75, rssCount: 78 },
      { allBeforeLease: true, nullAuthorKeys: 0,
        requestedDate: "2026-07-24", retainedCount: 67, rssCount: 68 },
    ]),
    "production-shaped RSS rows did not bind to the sealed daily periods",
  );
  const effectsBeforeRepair = await recoverySideEffectVersions(
    params.client,
    params.scope,
  );
  assert(
    effectsBeforeRepair.length === 0,
    "original-cutoff fixture unexpectedly contained model or publication state",
  );
  await params.client.query(params.migrationSql);
  const replay = await params.authority.prepare();
  const binding = params.authority.readVerifiedBinding(replay.authority);
  assert(
    replay.outcome === "prepared" &&
      binding.canonicalSha256 === params.canonicalSha256,
    "original-cutoff migration did not restore the sealed canonical SHA",
  );
  const repaired = await originalCutoffRows(params.client, params.scope);
  assert(
    JSON.stringify(repaired.map((row) => row.nonRssSha256)) ===
      JSON.stringify(legacy.map((row) => row.nonRssSha256)) &&
      JSON.stringify(repaired.map((row) => row.rssCount)) ===
        JSON.stringify([75, 67]),
    "original-cutoff migration changed non-RSS bytes or retained RSS counts",
  );
  const effectsAfterRepair = await recoverySideEffectVersions(
    params.client,
    params.scope,
  );
  assert(
    JSON.stringify(effectsAfterRepair) === JSON.stringify(effectsBeforeRepair),
    "original-cutoff migration wrote model/job/publication/receipt state",
  );
  const authorityBeforeReplay = await recoveryAuthorityVersions(
    params.client,
    params.scope,
  );
  await params.client.query(params.migrationSql);
  const authorityAfterReplay = await recoveryAuthorityVersions(
    params.client,
    params.scope,
  );
  const effectsAfterReplay = await recoverySideEffectVersions(
    params.client,
    params.scope,
  );
  assert(
    JSON.stringify(authorityAfterReplay) ===
      JSON.stringify(authorityBeforeReplay),
    "original-cutoff migration replay performed an authority-row write",
  );
  assert(
    JSON.stringify(effectsAfterReplay) === JSON.stringify(effectsAfterRepair),
    "original-cutoff migration replay performed a non-authority write",
  );
};

const assertMigrationRejects = async (
  client: RecoveryPostgresClient,
  migrationSql: string,
  mutation: LegacyMutation,
): Promise<void> => {
  let rejection: unknown;
  try {
    await client.query(migrationSql);
  } catch (error) {
    rejection = error;
    await client.query("ROLLBACK");
  }
  assert(
    rejection instanceof Error,
    `original-cutoff migration admitted ${mutation}`,
  );
};

const recoveryId = async (
  client: RecoveryPostgresClient,
  scope: RecoveryScope,
): Promise<string> => {
  const result = await client.query<{ id: string }>(`
    SELECT lease.id::TEXT AS id
    FROM reader_summary_production_recovery_leases AS lease
    WHERE lease.tenant_id = '${scope.tenantId}'
      AND lease.workspace_id = '${scope.workspaceId}'
  `);
  const id = result.rows[0]?.id;
  assert(id !== undefined && result.rows.length === 1,
    "original-cutoff fixture authority identity diverged");
  return id;
};

const originalCutoffLegacyRows = async (
  client: RecoveryPostgresClient,
  scope: RecoveryScope,
): Promise<readonly Readonly<{
  allBeforeLease: boolean;
  nonRssSha256: string;
  nullAuthorKeys: number;
  requestedDate: string;
  retainedCount: number;
  rssCount: number;
}>[]> => {
  const result = await client.query<{
    all_before_lease: boolean;
    non_rss_sha256: string;
    null_author_keys: number;
    requested_date: string;
    retained_count: number;
    rss_count: number;
  }>(`
    SELECT
      to_char(day.requested_utc_date, 'YYYY-MM-DD') AS requested_date,
      jsonb_array_length(day.provider_evidence->'rss')::INTEGER AS rss_count,
      count(*) FILTER (
        WHERE item.entry ? 'authorHandle'
          AND item.entry->'authorHandle' = 'null'::JSONB
      )::INTEGER AS null_author_keys,
      count(*) FILTER (
        WHERE (item.entry->>'publishedAt')::TIMESTAMPTZ >=
            (day.canonical_record->'period'->>'startedAt')::TIMESTAMPTZ
          AND (item.entry->>'publishedAt')::TIMESTAMPTZ <
            (day.canonical_record->'period'->>'endedAt')::TIMESTAMPTZ
      )::INTEGER AS retained_count,
      bool_and(
        (item.entry->>'observedAt')::TIMESTAMPTZ < lease.issued_at
      ) AS all_before_lease,
      encode(sha256(convert_to(
        reader_summary_production_recovery_canonical_json(
          day.provider_evidence - 'rss'
        ), 'UTF8'
      )), 'hex') AS non_rss_sha256
    FROM reader_summary_production_recovery_days AS day
    JOIN reader_summary_production_recovery_leases AS lease
      ON lease.id = day.recovery_id
    CROSS JOIN LATERAL jsonb_array_elements(
      day.provider_evidence->'rss'
    ) AS item(entry)
    WHERE day.tenant_id = '${scope.tenantId}'
      AND day.workspace_id = '${scope.workspaceId}'
      AND day.requested_utc_date IN (
        DATE '2026-07-23', DATE '2026-07-24'
      )
    GROUP BY day.requested_utc_date, day.provider_evidence,
      day.canonical_record, lease.issued_at
    ORDER BY day.requested_utc_date
  `);
  return result.rows.map((row) => ({
    allBeforeLease: row.all_before_lease,
    nonRssSha256: row.non_rss_sha256,
    nullAuthorKeys: Number(row.null_author_keys),
    requestedDate: row.requested_date,
    retainedCount: Number(row.retained_count),
    rssCount: Number(row.rss_count),
  }));
};

const originalCutoffRows = async (
  client: RecoveryPostgresClient,
  scope: RecoveryScope,
): Promise<readonly Readonly<{
  nonRssSha256: string;
  requestedDate: string;
  rssCount: number;
}>[]> => {
  const result = await client.query<{
    non_rss_sha256: string;
    requested_date: string;
    rss_count: number;
  }>(`
    SELECT
      to_char(day.requested_utc_date, 'YYYY-MM-DD') AS requested_date,
      jsonb_array_length(day.provider_evidence->'rss')::INTEGER AS rss_count,
      encode(sha256(convert_to(
        reader_summary_production_recovery_canonical_json(
          day.provider_evidence - 'rss'
        ), 'UTF8'
      )), 'hex') AS non_rss_sha256
    FROM reader_summary_production_recovery_days AS day
    WHERE day.tenant_id = '${scope.tenantId}'
      AND day.workspace_id = '${scope.workspaceId}'
      AND day.requested_utc_date IN (
        DATE '2026-07-23', DATE '2026-07-24'
      )
    ORDER BY day.requested_utc_date
  `);
  return result.rows.map((row) => ({
    nonRssSha256: row.non_rss_sha256,
    requestedDate: row.requested_date,
    rssCount: Number(row.rss_count),
  }));
};

const recoveryAuthorityVersions = async (
  client: RecoveryPostgresClient,
  scope: RecoveryScope,
): Promise<readonly Readonly<{ key: string; version: string }>[]> => {
  const result = await client.query<{ key: string; version: string }>(`
    SELECT 'lease:' || lease.id::TEXT AS key, lease.xmin::TEXT AS version
    FROM reader_summary_production_recovery_leases AS lease
    WHERE lease.tenant_id = '${scope.tenantId}'
      AND lease.workspace_id = '${scope.workspaceId}'
    UNION ALL
    SELECT 'day:' || day.recovery_id::TEXT || ':' ||
        to_char(day.requested_utc_date, 'YYYY-MM-DD'), day.xmin::TEXT
    FROM reader_summary_production_recovery_days AS day
    WHERE day.tenant_id = '${scope.tenantId}'
      AND day.workspace_id = '${scope.workspaceId}'
    UNION ALL
    SELECT 'dry:' || dry.recovery_id::TEXT || ':' || dry.ordinal::TEXT,
      dry.xmin::TEXT
    FROM reader_summary_production_recovery_dry_runs AS dry
    WHERE dry.tenant_id = '${scope.tenantId}'
      AND dry.workspace_id = '${scope.workspaceId}'
    ORDER BY key
  `);
  return result.rows;
};

const recoverySideEffectVersions = async (
  client: RecoveryPostgresClient,
  scope: RecoveryScope,
): Promise<readonly Readonly<{ key: string; version: string }>[]> => {
  const result = await client.query<{ key: string; version: string }>(`
    SELECT 'model:' || claim.id::TEXT AS key, claim.xmin::TEXT AS version
    FROM idempotency_keys AS claim
    WHERE claim.tenant_id = '${scope.tenantId}'
      AND claim.workspace_id = '${scope.workspaceId}'
      AND claim.scope LIKE 'reader-summary-production-recovery-model%'
    UNION ALL
    SELECT 'job:' || job.id::TEXT, job.xmin::TEXT
    FROM reader_summary_jobs AS job
    WHERE job.tenant_id = '${scope.tenantId}'
      AND job.workspace_id = '${scope.workspaceId}'
      AND job.idempotency_key LIKE 'reader-summary-production-recovery%'
    UNION ALL
    SELECT 'artifact:' || artifact.id::TEXT, artifact.xmin::TEXT
    FROM reader_summary_artifacts AS artifact
    WHERE artifact.tenant_id = '${scope.tenantId}'
      AND artifact.workspace_id = '${scope.workspaceId}'
    UNION ALL
    SELECT 'publication:' || publication.id::TEXT, publication.xmin::TEXT
    FROM reader_summary_publications AS publication
    WHERE publication.tenant_id = '${scope.tenantId}'
      AND publication.workspace_id = '${scope.workspaceId}'
    UNION ALL
    SELECT 'receipt:' || receipt.publication_id::TEXT, receipt.xmin::TEXT
    FROM reader_summary_recovery_receipts AS receipt
    WHERE receipt.tenant_id = '${scope.tenantId}'
      AND receipt.workspace_id = '${scope.workspaceId}'
    ORDER BY key
  `);
  return result.rows;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
