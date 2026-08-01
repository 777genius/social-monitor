-- @social-monitor-forward-migration
-- Append-only alias for the reviewed consumed original-cutoff authority.
-- Lock risk: bounded row locks only; no legacy or source row is changed.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
SET LOCAL search_path = pg_catalog, public, pg_temp;
SET LOCAL social_monitor.system_access = 'false';
SET LOCAL social_monitor.tenant_id =
  '00000000-0000-7000-8000-000000000901';
SET LOCAL social_monitor.workspace_id =
  '00000000-0000-7000-8000-000000000902';

CREATE TABLE IF NOT EXISTS
  public."reader_summary_production_recovery_authority_corrections" (
  "recovery_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "legacy_canonical_sha256" CHAR(64) NOT NULL,
  "corrected_canonical_record" JSONB NOT NULL,
  "corrected_canonical_bytes" BYTEA NOT NULL,
  "corrected_canonical_sha256" CHAR(64) NOT NULL,
  "correction_manifest" JSONB NOT NULL,
  "correction_manifest_bytes" BYTEA NOT NULL,
  "correction_manifest_sha256" CHAR(64) NOT NULL,
  CONSTRAINT "reader_summary_production_recovery_authority_corrections_pkey"
    PRIMARY KEY ("recovery_id"),
  CONSTRAINT "reader_summary_production_recovery_authority_corrections_scope_key"
    UNIQUE (
      "recovery_id", "tenant_id", "workspace_id",
      "legacy_canonical_sha256", "corrected_canonical_sha256"
    ),
  CONSTRAINT "reader_summary_production_recovery_authority_corrections_lease_fkey"
    FOREIGN KEY ("recovery_id", "tenant_id", "workspace_id")
    REFERENCES public."reader_summary_production_recovery_leases" (
      "id", "tenant_id", "workspace_id"
    ) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "reader_summary_production_recovery_authority_corrections_hashes_check"
    CHECK (
      "legacy_canonical_sha256" ~ '^[0-9a-f]{64}$'
      AND "corrected_canonical_sha256" ~ '^[0-9a-f]{64}$'
      AND "correction_manifest_sha256" ~ '^[0-9a-f]{64}$'
      AND btrim("corrected_canonical_sha256") =
        encode(sha256("corrected_canonical_bytes"), 'hex')
      AND btrim("correction_manifest_sha256") =
        encode(sha256("correction_manifest_bytes"), 'hex')
    ),
  CONSTRAINT "reader_summary_production_recovery_authority_corrections_records_check"
    CHECK (
      jsonb_typeof("corrected_canonical_record") = 'object'
      AND jsonb_typeof("correction_manifest") = 'object'
    )
);

ALTER TABLE public."reader_summary_production_recovery_authority_corrections"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reader_summary_production_recovery_authority_corrections"
  FORCE ROW LEVEL SECURITY;

DO $create_correction_policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    WHERE policy.polrelid =
        'public.reader_summary_production_recovery_authority_corrections'
          ::regclass
      AND policy.polname = 'tenant_isolation'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "tenant_isolation"
      ON public."reader_summary_production_recovery_authority_corrections"
      USING (public.social_monitor_rls_workspace_match(
        "tenant_id", "workspace_id"
      ))
      WITH CHECK (public.social_monitor_rls_workspace_match(
        "tenant_id", "workspace_id"
      ))
    $policy$;
  END IF;
END;
$create_correction_policy$;

REVOKE ALL PRIVILEGES ON TABLE
  public."reader_summary_production_recovery_authority_corrections"
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
GRANT SELECT (
  "recovery_id", "tenant_id", "workspace_id",
  "legacy_canonical_sha256", "corrected_canonical_record",
  "corrected_canonical_bytes", "corrected_canonical_sha256",
  "correction_manifest", "correction_manifest_bytes",
  "correction_manifest_sha256"
) ON public."reader_summary_production_recovery_authority_corrections"
TO "social_monitor_reader_summary_publication_runtime";

DO $validate_correction_boundary$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_roles AS owner ON owner.oid = relation.relowner
    WHERE relation.oid =
        'public.reader_summary_production_recovery_authority_corrections'
          ::regclass
      AND relation.relkind = 'r'
      AND relation.relrowsecurity
      AND relation.relforcerowsecurity
      AND owner.rolname =
        'social_monitor_reader_summary_publication_owner'
  ) OR (
    SELECT count(*)
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid =
        'public.reader_summary_production_recovery_authority_corrections'
          ::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.attnotnull
      AND (attribute.attname, format_type(
        attribute.atttypid, attribute.atttypmod
      )) IN (
        ('recovery_id', 'uuid'),
        ('tenant_id', 'uuid'),
        ('workspace_id', 'uuid'),
        ('legacy_canonical_sha256', 'character(64)'),
        ('corrected_canonical_record', 'jsonb'),
        ('corrected_canonical_bytes', 'bytea'),
        ('corrected_canonical_sha256', 'character(64)'),
        ('correction_manifest', 'jsonb'),
        ('correction_manifest_bytes', 'bytea'),
        ('correction_manifest_sha256', 'character(64)')
      )
  ) <> 10 OR (
    SELECT count(*)
    FROM pg_constraint AS boundary
    WHERE boundary.conrelid =
        'public.reader_summary_production_recovery_authority_corrections'
          ::regclass
      AND boundary.conname IN (
        'reader_summary_production_recovery_authority_corrections_pkey',
        'reader_summary_production_recovery_authority_corrections_scope_key',
        'reader_summary_production_recovery_authority_corrections_lease_fkey',
        'reader_summary_production_recovery_authority_corrections_hashes_check',
        'reader_summary_production_recovery_authority_corrections_records_check'
      )
  ) <> 5 OR NOT EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    WHERE policy.polrelid =
        'public.reader_summary_production_recovery_authority_corrections'
          ::regclass
      AND policy.polname = 'tenant_isolation'
      AND policy.polcmd = '*'
      AND strpos(pg_get_expr(policy.polqual, policy.polrelid),
        'social_monitor_rls_workspace_match') > 0
      AND strpos(pg_get_expr(policy.polwithcheck, policy.polrelid),
        'social_monitor_rls_workspace_match') > 0
  ) OR has_table_privilege(
    'social_monitor_reader_summary_publication_runtime',
    'public.reader_summary_production_recovery_authority_corrections',
    'SELECT'
  ) OR has_any_column_privilege(
    'social_monitor_reader_summary_publication_runtime',
    'public.reader_summary_production_recovery_authority_corrections',
    'INSERT, UPDATE, REFERENCES'
  ) OR has_table_privilege(
    'social_monitor_reader_summary_publication_runtime',
    'public.reader_summary_production_recovery_authority_corrections',
    'DELETE, TRUNCATE, TRIGGER'
  ) OR NOT has_any_column_privilege(
    'social_monitor_reader_summary_publication_runtime',
    'public.reader_summary_production_recovery_authority_corrections',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'original-cutoff correction table boundary diverged';
  END IF;
END;
$validate_correction_boundary$;

DO $original_cutoff_correction$
DECLARE
  c_recovery_id CONSTANT UUID :=
    '0b5e172f-743e-52b5-807c-f54631295def';
  c_tenant_id CONSTANT UUID :=
    '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID :=
    '00000000-0000-7000-8000-000000000902';
  c_legacy_sha CONSTANT TEXT :=
    '7fa94c8538f55592349e820685dc4d34d84c4f3a4afe9165e18df6271d7816f3';
  c_corrected_sha CONSTANT TEXT :=
    'c51223e11e4631f3c613aa7708fe92d9c308ce31fd8ee5e626e5cee2972ad3e5';
  v_alias_count INTEGER;
  v_artifact_count INTEGER;
  v_authority JSONB;
  v_authority_bytes BYTEA;
  v_authority_sha TEXT;
  v_claim_count INTEGER;
  v_count INTEGER;
  v_corrected_day_sha TEXT;
  v_corrected_evidence_sha TEXT;
  v_date DATE;
  v_day "reader_summary_production_recovery_days"%ROWTYPE;
  v_day_record JSONB;
  v_day_sha TEXT;
  v_digests JSONB;
  v_dry_count INTEGER;
  v_evidence JSONB;
  v_evidence_sha TEXT;
  v_expected_counts JSONB;
  v_expected_day_sha TEXT;
  v_expected_evidence_sha TEXT;
  v_expected_removed_sha TEXT;
  v_expected_retained_sha TEXT;
  v_job_count INTEGER;
  v_lease "reader_summary_production_recovery_leases"%ROWTYPE;
  v_manifest JSONB;
  v_manifest_bytes BYTEA;
  v_manifest_sha TEXT;
  v_plan_days JSONB;
  v_provider TEXT;
  v_provider_count INTEGER;
  v_publication_count INTEGER;
  v_removed_day_manifest JSONB;
  v_removed_evidence JSONB;
  v_removed_manifest JSONB;
  v_receipt_count INTEGER;
  v_retained JSONB;
  v_scope_lease_count INTEGER;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off'
    OR current_setting('social_monitor.system_access', TRUE)
      IS DISTINCT FROM 'false'
    OR NULLIF(current_setting('social_monitor.tenant_id', TRUE), '')::UUID
      IS DISTINCT FROM c_tenant_id
    OR NULLIF(current_setting('social_monitor.workspace_id', TRUE), '')::UUID
      IS DISTINCT FROM c_workspace_id THEN
    RAISE EXCEPTION 'original-cutoff correction session scope is invalid';
  END IF;

  SELECT count(*)::INTEGER INTO v_alias_count
  FROM "reader_summary_production_recovery_authority_corrections" AS alias
  WHERE alias."tenant_id" = c_tenant_id
    AND alias."workspace_id" = c_workspace_id;
  SELECT count(*)::INTEGER INTO v_scope_lease_count
  FROM "reader_summary_production_recovery_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
    AND lease."canonical_record"->>'schemaVersion' =
      'reader_summary.production_recovery_authority.v2';
  IF v_scope_lease_count = 0 AND v_alias_count = 0 THEN
    RETURN;
  ELSIF v_scope_lease_count <> 1 OR v_alias_count > 1 THEN
    RAISE EXCEPTION 'original-cutoff correction authority is ambiguous';
  END IF;

  PERFORM tenant."id"
  FROM "tenants" AS tenant
  WHERE tenant."id" = c_tenant_id AND tenant."deleted_at" IS NULL
  ORDER BY tenant."id"
  FOR KEY SHARE OF tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'original-cutoff correction tenant is absent';
  END IF;
  PERFORM workspace."id"
  FROM "workspaces" AS workspace
  WHERE workspace."id" = c_workspace_id
    AND workspace."tenant_id" = c_tenant_id
    AND workspace."deleted_at" IS NULL
  ORDER BY workspace."id"
  FOR KEY SHARE OF workspace;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'original-cutoff correction workspace is absent';
  END IF;

  SELECT lease.* INTO v_lease
  FROM "reader_summary_production_recovery_leases" AS lease
  WHERE lease."id" = c_recovery_id
    AND lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
  ORDER BY lease."id"
  FOR UPDATE OF lease;
  IF NOT FOUND
    OR v_lease."state" <> 'CONSUMED'
    OR v_lease."issued_at" IS DISTINCT FROM
      TIMESTAMPTZ '2026-07-29T10:18:11.062Z'
    OR v_lease."consumed_at" IS DISTINCT FROM v_lease."issued_at"
    OR btrim(v_lease."canonical_sha256") <> c_legacy_sha
    OR octet_length(v_lease."canonical_bytes") <> 3454
    OR v_lease."canonical_bytes" IS DISTINCT FROM convert_to(
      "reader_summary_weekly_canonical_json"(v_lease."canonical_record"),
      'UTF8'
    )
    OR encode(sha256(v_lease."canonical_bytes"), 'hex') <> c_legacy_sha
    OR jsonb_object_length(v_lease."canonical_record") <> 8
    OR v_lease."canonical_record"->>'recoveryId' <> c_recovery_id::TEXT
    OR v_lease."canonical_record"->>'tenantId' <> c_tenant_id::TEXT
    OR v_lease."canonical_record"->>'workspaceId' <> c_workspace_id::TEXT
    OR v_lease."canonical_record"->'requestedUtcDates' IS DISTINCT FROM
      jsonb_build_array(
        '2026-07-23', '2026-07-24', '2026-07-25',
        '2026-07-26', '2026-07-27', '2026-07-28'
      )
    OR v_lease."canonical_record"->'boundaries' IS DISTINCT FROM
      jsonb_build_object(
        'stage', 'pre_model',
        'modelCallPerformed', FALSE,
        'publicationPerformed', FALSE,
        'recollectionPerformed', FALSE
      ) THEN
    RAISE EXCEPTION 'original-cutoff correction legacy lease diverged';
  END IF;

  PERFORM day."recovery_id"
  FROM "reader_summary_production_recovery_days" AS day
  WHERE day."recovery_id" = c_recovery_id
    AND day."tenant_id" = c_tenant_id
    AND day."workspace_id" = c_workspace_id
  ORDER BY day."requested_utc_date"
  FOR UPDATE OF day;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 6 OR EXISTS (
    SELECT 1
    FROM "reader_summary_production_recovery_days" AS day
    WHERE day."recovery_id" = c_recovery_id
      AND (
        day."tenant_id" <> c_tenant_id
        OR day."workspace_id" <> c_workspace_id
        OR day."canonical_bytes" IS DISTINCT FROM convert_to(
          "reader_summary_weekly_canonical_json"(day."canonical_record"),
          'UTF8'
        )
        OR btrim(day."canonical_sha256") <>
          encode(sha256(day."canonical_bytes"), 'hex')
      )
  ) OR (
    SELECT jsonb_agg(jsonb_build_object(
      'identity', day."identity",
      'requestedUtcDate', to_char(day."requested_utc_date", 'YYYY-MM-DD'),
      'canonicalSha256', btrim(day."canonical_sha256"),
      'providerEvidenceSha256', btrim(day."provider_evidence_sha256"),
      'planSha256s', jsonb_build_array(
        btrim(day."canonical_sha256"), btrim(day."canonical_sha256")
      )
    ) ORDER BY day."requested_utc_date")
    FROM "reader_summary_production_recovery_days" AS day
    WHERE day."recovery_id" = c_recovery_id
  ) IS DISTINCT FROM v_lease."canonical_record"->'days' THEN
    RAISE EXCEPTION 'original-cutoff correction legacy days diverged';
  END IF;

  PERFORM dry."ordinal"
  FROM "reader_summary_production_recovery_dry_runs" AS dry
  WHERE dry."recovery_id" = c_recovery_id
    AND dry."tenant_id" = c_tenant_id
    AND dry."workspace_id" = c_workspace_id
  ORDER BY dry."ordinal"
  FOR UPDATE OF dry;
  GET DIAGNOSTICS v_dry_count = ROW_COUNT;
  IF v_dry_count <> 2 OR EXISTS (
    SELECT 1
    FROM "reader_summary_production_recovery_dry_runs" AS dry
    WHERE dry."recovery_id" = c_recovery_id
      AND (
        dry."tenant_id" <> c_tenant_id
        OR dry."workspace_id" <> c_workspace_id
        OR dry."ordinal" NOT IN (1, 2)
        OR dry."captured_at" IS DISTINCT FROM v_lease."issued_at"
        OR dry."canonical_record" IS DISTINCT FROM v_lease."canonical_record"
        OR dry."canonical_bytes" IS DISTINCT FROM v_lease."canonical_bytes"
        OR btrim(dry."canonical_sha256") <> c_legacy_sha
      )
  ) THEN
    RAISE EXCEPTION 'original-cutoff correction legacy dry runs diverged';
  END IF;

  PERFORM claim."id"
  FROM "idempotency_keys" AS claim
  WHERE claim."tenant_id" = c_tenant_id
    AND claim."workspace_id" = c_workspace_id
    AND claim."scope" IN (
      'reader-summary-production-recovery-model-v2',
      'reader-summary-production-recovery-model-retry-v1',
      'reader-summary-production-recovery-model-resume-v1',
      'reader-summary-production-recovery-model-quality-remediation-v1',
      'reader-summary-production-recovery-model-quality-remediation-resume-v1'
    )
  ORDER BY claim."id"
  FOR UPDATE OF claim;
  GET DIAGNOSTICS v_claim_count = ROW_COUNT;

  PERFORM job."id"
  FROM "reader_summary_jobs" AS job
  WHERE job."tenant_id" = c_tenant_id
    AND job."workspace_id" = c_workspace_id
    AND job."period_started_at" >= TIMESTAMPTZ '2026-07-23T00:00:00Z'
    AND job."period_started_at" < TIMESTAMPTZ '2026-07-29T00:00:00Z'
    AND (
      job."idempotency_key" LIKE 'reader-summary-production-recovery%'
      OR job."idempotency_key" LIKE 'reader_summary.production_recovery.%'
    )
  ORDER BY job."id"
  FOR UPDATE OF job;
  GET DIAGNOSTICS v_job_count = ROW_COUNT;

  PERFORM artifact."id"
  FROM "reader_summary_artifacts" AS artifact
  WHERE artifact."tenant_id" = c_tenant_id
    AND artifact."workspace_id" = c_workspace_id
    AND artifact."period_started_at" >=
      TIMESTAMPTZ '2026-07-23T00:00:00Z'
    AND artifact."period_started_at" <
      TIMESTAMPTZ '2026-07-29T00:00:00Z'
  ORDER BY artifact."id"
  FOR UPDATE OF artifact;
  GET DIAGNOSTICS v_artifact_count = ROW_COUNT;

  PERFORM publication."id"
  FROM "reader_summary_publications" AS publication
  WHERE publication."tenant_id" = c_tenant_id
    AND publication."workspace_id" = c_workspace_id
  ORDER BY publication."id"
  FOR UPDATE OF publication;
  GET DIAGNOSTICS v_publication_count = ROW_COUNT;

  PERFORM receipt."publication_id"
  FROM "reader_summary_recovery_receipts" AS receipt
  WHERE receipt."tenant_id" = c_tenant_id
    AND receipt."workspace_id" = c_workspace_id
  ORDER BY receipt."publication_id"
  FOR UPDATE OF receipt;
  GET DIAGNOSTICS v_receipt_count = ROW_COUNT;

  IF v_claim_count <> 10 OR v_job_count <> 10 OR v_artifact_count <> 8
    OR v_publication_count <> 0 OR v_receipt_count <> 0 THEN
    RAISE EXCEPTION 'original-cutoff correction consumed state diverged';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "reader_summary_artifacts" AS artifact
    CROSS JOIN LATERAL jsonb_array_elements(artifact."citations")
      AS citation(entry)
    WHERE artifact."tenant_id" = c_tenant_id
      AND artifact."workspace_id" = c_workspace_id
      AND (
        citation.entry->>'feedItemId' IN (
          '181bf737-196c-4d74-8b06-a6e936e663cc',
          '6be8d0d7-3247-4cb7-8cf6-6e3ee6fa70da',
          'a73b7b1a-a3ba-45c2-a1a4-4ec35201256e',
          '08bac5d2-07e0-49a7-9593-3156869a9829'
        )
        OR citation.entry->>'sourceItemId' IN (
          '7963de93-82e8-4ee4-88ca-2d266bdcfa32',
          '8a32208c-aabf-4662-b590-d326d2f323b7',
          '9b8ee0ae-e035-4ec8-b31e-168d7fd54293',
          '9aa4edc6-682c-4f99-a4de-a9e326ff681c'
        )
      )
  ) THEN
    RAISE EXCEPTION 'original-cutoff removed RSS intersects an artifact';
  END IF;

  v_removed_manifest := '[]'::JSONB;
  FOREACH v_date IN ARRAY ARRAY[DATE '2026-07-23', DATE '2026-07-24']
  LOOP
    SELECT day.* INTO STRICT v_day
    FROM "reader_summary_production_recovery_days" AS day
    WHERE day."recovery_id" = c_recovery_id
      AND day."tenant_id" = c_tenant_id
      AND day."workspace_id" = c_workspace_id
      AND day."requested_utc_date" = v_date;

    IF v_date = DATE '2026-07-23' THEN
      v_expected_evidence_sha :=
        '07c1f33aacfa6a8052aa9bf20846e25328cca011bff073c6229406d84a4f993e';
      v_expected_day_sha :=
        'cbc70702cd295a068de21209b2afb4827cd9f0691b56e1bbbcc65ab67afba1be';
      v_expected_retained_sha :=
        'f3cf702e8087775ab9a7e6dacaf347f434f8f9c4a31db0f4c10e4ab6a062c1c9';
      v_expected_removed_sha :=
        '4271d96e3a4bcb76aeac7dcbba48586181c26bf685a9980d440cd20ea1690dd6';
      IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_day."provider_evidence"->'rss')
          WITH ORDINALITY AS item(entry, ordinal)
        WHERE item.ordinal = 9
          AND item.entry->>'feedItemId' =
            '181bf737-196c-4d74-8b06-a6e936e663cc'
          AND item.entry->>'sourceItemId' =
            '7963de93-82e8-4ee4-88ca-2d266bdcfa32'
          AND item.entry->>'sourceBindingId' =
            '23f1684e-00e0-4cd8-9dcd-59e92f63a660'
          AND item.entry->>'interestId' =
            '4211ea2f-6b41-4a18-a454-b3089add381a'
          AND item.entry->>'providerItemId' =
            'CBMikgFBVV95cUxQWVhNdF9vVVNEUk5pRXdrZkFZNkU2WXA4MDJqSEVUOVhZaFYzZ0dKTUxvWTN5Z21CTzlNYVZXTF9ieTdLQkVWODQtTE51RTFpYzk2TjdoX1QwbUVtVmo3TktjX2pRZURaSVVQdVYyYTJQZk5raHRVOHMwNzMzLUF5dzZSamdxa3kwN3BZTVFSWGJpUQ'
          AND encode(sha256(convert_to(
            item.entry->>'canonicalUrl', 'UTF8'
          )), 'hex') =
            '267d1e1f2727b3491f29857c791812a916d1047d116b1ea73b92e9c2ab839753'
          AND item.entry->>'sourceContentHash' =
            '2235424be2b0c6e1e4c49b419e135556d089bb67f93cedcd7528a8e4742d9516'
          AND item.entry->>'sourceProviderContentHash' =
            'ce18e8d0b45a95dd6037b4825708e282399d18e7ed911307bf881fb6a8bb1ddb'
          AND item.entry->>'publishedAt' = '2026-07-23T19:51:08.000Z'
          AND item.entry->>'observedAt' = '2026-07-24T07:08:05.238Z'
      ) OR NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_day."provider_evidence"->'rss')
          WITH ORDINALITY AS item(entry, ordinal)
        WHERE item.ordinal = 34
          AND item.entry->>'feedItemId' =
            '6be8d0d7-3247-4cb7-8cf6-6e3ee6fa70da'
          AND item.entry->>'sourceItemId' =
            '8a32208c-aabf-4662-b590-d326d2f323b7'
          AND item.entry->>'sourceBindingId' =
            '23f1684e-00e0-4cd8-9dcd-59e92f63a660'
          AND item.entry->>'interestId' =
            '4211ea2f-6b41-4a18-a454-b3089add381a'
          AND item.entry->>'providerItemId' =
            'CBMiWkFVX3lxTE1iWFdWWk1rRjktUk5wZnBrNHBnd0xhU01XRmo1dTV0aHpGWmRDcTJhWndnUzV3R25aT2VjSHZxaWNzUUhWZF9MeVZnSkRZZUlJYXJrc3RBM2Vvdw'
          AND encode(sha256(convert_to(
            item.entry->>'canonicalUrl', 'UTF8'
          )), 'hex') =
            'ab4c49707a3a81152b8089df8c026bca1af0739a0c34c8d4386c08d733f62df5'
          AND item.entry->>'sourceContentHash' =
            '1589fadcd37263f1c16fb02c2775d87360d7f3e67fc5c6effbc846778c109ea2'
          AND item.entry->>'sourceProviderContentHash' =
            'e77e47a12e56f77828e6c8d8beb0818c2a0b978cf77808d41f66d075e99b9b99'
          AND item.entry->>'publishedAt' = '2026-07-23T23:50:38.000Z'
          AND item.entry->>'observedAt' = '2026-07-24T15:08:09.365Z'
      ) OR NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_day."provider_evidence"->'rss')
          WITH ORDINALITY AS item(entry, ordinal)
        WHERE item.ordinal = 57
          AND item.entry->>'feedItemId' =
            'a73b7b1a-a3ba-45c2-a1a4-4ec35201256e'
          AND item.entry->>'sourceItemId' =
            '9b8ee0ae-e035-4ec8-b31e-168d7fd54293'
          AND item.entry->>'sourceBindingId' =
            '23f1684e-00e0-4cd8-9dcd-59e92f63a660'
          AND item.entry->>'interestId' =
            '4211ea2f-6b41-4a18-a454-b3089add381a'
          AND item.entry->>'providerItemId' =
            'CBMiyAFBVV95cUxPTXByQWNwTGpCZU03R3dFRnRIWGRSRl8xYnF5SXhfS0NiQ2NMQVc1cWhkWWlsd1RlQTdTNlRzUW9CUHNGSVRKb1NSUHZUNGV3SWxrM0Q0QkNYVmNKOGZHV2d5WEpJVFpOeE5LeTJuZFRiUWJfcnNNZXIzd3dtVFhTT280RVdKT3hDLS1Oek8wQ24xNUdDamNLOG9hYzVTdTZReWNVSkR6ZnJDdW8tTmIxaEFxNG4zeEVWNklWNDNlS1pLd0JJeXlqMNIBzgFBVV95cUxNY0I4RlR5X3Fuc19oUVdQWGZoVlZ5dDQySXBob1ZDTFJkSlhpemFkdkVwVGxfV3BieFp2ekZ4NXJxNk9Ya2VoOEllZXpMeFlDS1h4Q1I3ZnVZVzZtOGppVWR2aHdUQnhQcUd5U2dLcWZjQmZPeGdDOEpOTncxemJiSXUwWmpvX1QyWFJXQTIwOVZEclEyTTQtMGp0X2stRElNUklLQ1h3dU1CTHVQbThHanl1YXVfZ0tRbk9ob1pJaFdzRWNJMElQdGNSajB0Zw'
          AND encode(sha256(convert_to(
            item.entry->>'canonicalUrl', 'UTF8'
          )), 'hex') =
            'fd96469bdb26102a7f503145cca00a038acae4a3fd92242ac226acfee1d9ed21'
          AND item.entry->>'sourceContentHash' =
            '99999ae5ace077185152e5827af4c910b8b19ed71a65c61cfcce2c8aebf8a661'
          AND item.entry->>'sourceProviderContentHash' =
            '475765b1c1470dde36173ea63dbebf843537f6046951ebc45493fbfbf9395842'
          AND item.entry->>'publishedAt' = '2026-07-23T20:54:00.000Z'
          AND item.entry->>'observedAt' = '2026-07-24T07:08:05.238Z'
      ) THEN
        RAISE EXCEPTION 'original-cutoff Jul23 removed RSS diverged';
      END IF;
      v_corrected_evidence_sha :=
        '4a3389ec7b332d59d6b8885c60b6f4db574db96728260f4ce338ff0ed16ba1d3';
      v_corrected_day_sha :=
        '977c2ec7728ce190dd6239f15fc6da5caaf044e20dd0c6f7be7f3af245766689';
    ELSE
      v_expected_evidence_sha :=
        'e96dab434060d4863b1f5ac21d74791b10140b6e4e8d727638ece17443675230';
      v_expected_day_sha :=
        '84f44f912766a669445cd6f47d24c96c3d03f2e0a13c8b578ae5219d87dffc74';
      v_expected_retained_sha :=
        '69551f0b00b4200d6f1327e3400c2e858c2e766412b61812aa9925671d87a95d';
      v_expected_removed_sha :=
        'd754d13529935eab4ccefb61d2f00c1c203cd0c734c114d2560d66be3ce29ffe';
      v_corrected_evidence_sha :=
        '2b5947fcc89d1efbcd7027d3346fe28679b3ca8f8e6b771c1f1f2cf4ed378791';
      v_corrected_day_sha :=
        'cfa152b72c9971b167cb007a035ba296bfbd226ac93964aeadd366821f98e453';
      IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_day."provider_evidence"->'rss')
          WITH ORDINALITY AS item(entry, ordinal)
        WHERE item.ordinal = 2
          AND item.entry->>'feedItemId' =
            '08bac5d2-07e0-49a7-9593-3156869a9829'
          AND item.entry->>'sourceItemId' =
            '9aa4edc6-682c-4f99-a4de-a9e326ff681c'
          AND item.entry->>'sourceBindingId' =
            '23f1684e-00e0-4cd8-9dcd-59e92f63a660'
          AND item.entry->>'interestId' =
            '4211ea2f-6b41-4a18-a454-b3089add381a'
          AND item.entry->>'providerItemId' =
            'CBMiygFBVV95cUxPUUVwb1hZaVlaYVVZb3ZuVXJqeVFzQXktX1drRk85S0hjajFJaW83M3pmVGItZ2pfbnZEbU9fcE0xQVR6aUdIc1Yzdlh3NW00WVF3ZHg2a1FaeV9Yd2F6aXVla3l2WTdjQVdHNzhvU0tDVjdSTzBSaEl2NUtZbnJneUhFSDZqSW5aQ0x3eUxtMDhzRmRrMjA5SS1xWTdDaHhkTG1qSDF4Z1J6Mmd5LXptcUNBc2o5TWg1a19aVVFhalZJamlxUzZSXzdn'
          AND encode(sha256(convert_to(
            item.entry->>'canonicalUrl', 'UTF8'
          )), 'hex') =
            '4003f1f0984977c116328555e8ab450c4b6d61b161960f0a4f7db9bf0bb32b12'
          AND item.entry->>'sourceContentHash' =
            '1f393b3a6061773b629cd32094e67c6ccd9fb9937e3f9416791996048514b6de'
          AND item.entry->>'sourceProviderContentHash' =
            '45607462314d1059fec06503148789d1771b868166c72c771b6861cb7e9d1745'
          AND item.entry->>'publishedAt' = '2026-07-24T17:00:00.000Z'
          AND item.entry->>'observedAt' = '2026-07-25T03:08:13.334Z'
      ) THEN
        RAISE EXCEPTION 'original-cutoff Jul24 removed RSS diverged';
      END IF;
    END IF;

    IF jsonb_typeof(v_day."provider_evidence") <> 'object'
      OR jsonb_object_length(v_day."provider_evidence") <> 5
      OR jsonb_typeof(v_day."provider_evidence"->'rss') <> 'array'
      OR jsonb_array_length(v_day."provider_evidence"->'rss') <>
        (CASE WHEN v_date = DATE '2026-07-23' THEN 78 ELSE 68 END)
      OR btrim(v_day."provider_evidence_sha256") <>
        v_expected_evidence_sha
      OR btrim(v_day."canonical_sha256") <> v_expected_day_sha
      OR (SELECT (entry->>'count')::INTEGER
        FROM jsonb_array_elements(v_day."provider_counts") AS count(entry)
        WHERE entry->>'providerKey' = 'rss') <>
        (CASE WHEN v_date = DATE '2026-07-23' THEN 78 ELSE 68 END) THEN
      RAISE EXCEPTION 'original-cutoff legacy day authority diverged';
    END IF;

    SELECT
      COALESCE(jsonb_agg(item.entry ORDER BY item.ordinal)
        FILTER (WHERE (
          (v_date = DATE '2026-07-23' AND item.ordinal IN (9, 34, 57))
          OR (v_date = DATE '2026-07-24' AND item.ordinal = 2)
        )), '[]'::JSONB),
      COALESCE(jsonb_agg(item.entry ORDER BY item.ordinal)
        FILTER (WHERE NOT (
          (v_date = DATE '2026-07-23' AND item.ordinal IN (9, 34, 57))
          OR (v_date = DATE '2026-07-24' AND item.ordinal = 2)
        )), '[]'::JSONB),
      COALESCE(jsonb_agg(jsonb_build_object(
        'oldOrdinal', item.ordinal,
        'feedItemId', item.entry->>'feedItemId',
        'sourceItemId', item.entry->>'sourceItemId',
        'sourceBindingId', item.entry->>'sourceBindingId',
        'interestId', item.entry->>'interestId',
        'providerItemId', item.entry->>'providerItemId',
        'canonicalUrlSha256', encode(sha256(convert_to(
          item.entry->>'canonicalUrl', 'UTF8'
        )), 'hex'),
        'sourceContentHash', item.entry->>'sourceContentHash',
        'sourceProviderContentHash',
          item.entry->>'sourceProviderContentHash',
        'publishedAt', item.entry->>'publishedAt',
        'observedAt', item.entry->>'observedAt'
      ) ORDER BY item.ordinal) FILTER (WHERE (
        (v_date = DATE '2026-07-23' AND item.ordinal IN (9, 34, 57))
        OR (v_date = DATE '2026-07-24' AND item.ordinal = 2)
      )), '[]'::JSONB)
    INTO v_removed_evidence, v_retained, v_removed_day_manifest
    FROM jsonb_array_elements(v_day."provider_evidence"->'rss')
      WITH ORDINALITY AS item(entry, ordinal);

    IF encode(sha256(convert_to(
        "reader_summary_production_recovery_canonical_json"(v_retained),
        'UTF8'
      )), 'hex') <> v_expected_retained_sha
      OR encode(sha256(convert_to(
        "reader_summary_production_recovery_canonical_json"(
          v_removed_evidence
        ), 'UTF8'
      )), 'hex') <> v_expected_removed_sha THEN
      RAISE EXCEPTION 'original-cutoff retained or removed RSS seal diverged';
    END IF;

    v_expected_counts := jsonb_set(
      v_day."provider_counts",
      '{3,count}',
      to_jsonb(CASE WHEN v_date = DATE '2026-07-23' THEN 75 ELSE 67 END),
      FALSE
    );
    v_evidence := jsonb_set(
      v_day."provider_evidence", '{rss}', v_retained, FALSE
    );
    v_digests := '[]'::JSONB;
    FOREACH v_provider IN ARRAY ARRAY[
      'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'
    ] LOOP
      SELECT (count.entry->>'count')::INTEGER INTO STRICT v_provider_count
      FROM jsonb_array_elements(v_expected_counts) AS count(entry)
      WHERE count.entry->>'providerKey' = v_provider;
      IF jsonb_array_length(v_evidence->v_provider) <> v_provider_count THEN
        RAISE EXCEPTION 'original-cutoff corrected provider count diverged';
      END IF;
      v_evidence_sha := encode(sha256(convert_to(
        "reader_summary_production_recovery_canonical_json"(
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
      "reader_summary_production_recovery_canonical_json"(v_digests),
      'UTF8'
    )), 'hex');
    IF v_evidence_sha <> v_corrected_evidence_sha THEN
      RAISE EXCEPTION 'original-cutoff corrected evidence seal diverged';
    END IF;

    v_day_record := jsonb_set(jsonb_set(jsonb_set(
      v_day."canonical_record",
      '{providerCounts}', v_expected_counts, FALSE
    ), '{providerEvidenceDigests}', v_digests, FALSE),
      '{providerEvidenceSha256}', to_jsonb(v_evidence_sha), FALSE
    );
    v_day_sha := encode(sha256(convert_to(
      "reader_summary_weekly_canonical_json"(v_day_record), 'UTF8'
    )), 'hex');
    IF v_day_sha <> v_corrected_day_sha THEN
      RAISE EXCEPTION 'original-cutoff corrected day seal diverged';
    END IF;

    v_removed_manifest := v_removed_manifest || jsonb_build_array(
      jsonb_build_object(
        'requestedUtcDate', to_char(v_date, 'YYYY-MM-DD'),
        'legacyRssCount',
          CASE WHEN v_date = DATE '2026-07-23' THEN 78 ELSE 68 END,
        'correctedRssCount',
          CASE WHEN v_date = DATE '2026-07-23' THEN 75 ELSE 67 END,
        'legacyProviderEvidenceSha256', v_expected_evidence_sha,
        'correctedProviderEvidenceSha256', v_corrected_evidence_sha,
        'legacyDayCanonicalSha256', v_expected_day_sha,
        'correctedDayCanonicalSha256', v_corrected_day_sha,
        'retainedRssSha256', v_expected_retained_sha,
        'removedRssSha256', v_expected_removed_sha,
        'removedRss', v_removed_day_manifest
      )
    );
  END LOOP;

  SELECT jsonb_agg(
    CASE plan.entry->>'requestedUtcDate'
      WHEN '2026-07-23' THEN jsonb_build_object(
        'identity', 'reader_summary.production_recovery_day.v2:' ||
          '977c2ec7728ce190dd6239f15fc6da5caaf044e20dd0c6f7be7f3af245766689',
        'requestedUtcDate', '2026-07-23',
        'canonicalSha256',
          '977c2ec7728ce190dd6239f15fc6da5caaf044e20dd0c6f7be7f3af245766689',
        'providerEvidenceSha256',
          '4a3389ec7b332d59d6b8885c60b6f4db574db96728260f4ce338ff0ed16ba1d3',
        'planSha256s', jsonb_build_array(
          '977c2ec7728ce190dd6239f15fc6da5caaf044e20dd0c6f7be7f3af245766689',
          '977c2ec7728ce190dd6239f15fc6da5caaf044e20dd0c6f7be7f3af245766689'
        )
      )
      WHEN '2026-07-24' THEN jsonb_build_object(
        'identity', 'reader_summary.production_recovery_day.v2:' ||
          'cfa152b72c9971b167cb007a035ba296bfbd226ac93964aeadd366821f98e453',
        'requestedUtcDate', '2026-07-24',
        'canonicalSha256',
          'cfa152b72c9971b167cb007a035ba296bfbd226ac93964aeadd366821f98e453',
        'providerEvidenceSha256',
          '2b5947fcc89d1efbcd7027d3346fe28679b3ca8f8e6b771c1f1f2cf4ed378791',
        'planSha256s', jsonb_build_array(
          'cfa152b72c9971b167cb007a035ba296bfbd226ac93964aeadd366821f98e453',
          'cfa152b72c9971b167cb007a035ba296bfbd226ac93964aeadd366821f98e453'
        )
      )
      ELSE plan.entry
    END ORDER BY plan.ordinal
  ) INTO v_plan_days
  FROM jsonb_array_elements(v_lease."canonical_record"->'days')
    WITH ORDINALITY AS plan(entry, ordinal);

  v_authority := jsonb_set(
    v_lease."canonical_record", '{days}', v_plan_days, FALSE
  );
  v_authority_bytes := convert_to(
    "reader_summary_weekly_canonical_json"(v_authority), 'UTF8'
  );
  v_authority_sha := encode(sha256(v_authority_bytes), 'hex');
  IF octet_length(v_authority_bytes) <> 3454
    OR v_authority_sha <> c_corrected_sha THEN
    RAISE EXCEPTION 'original-cutoff corrected authority seal diverged';
  END IF;

  v_manifest := jsonb_build_object(
    'schemaVersion',
      'reader_summary.production_recovery_authority_correction.v1',
    'recoveryId', c_recovery_id::TEXT,
    'tenantId', c_tenant_id::TEXT,
    'workspaceId', c_workspace_id::TEXT,
    'legacyAuthority', jsonb_build_object(
      'canonicalSha256', c_legacy_sha,
      'canonicalByteLength', 3454,
      'issuedAt', '2026-07-29T10:18:11.062Z',
      'state', 'CONSUMED'
    ),
    'correctedAuthority', jsonb_build_object(
      'canonicalSha256', c_corrected_sha,
      'canonicalByteLength', 3454
    ),
    'days', v_removed_manifest,
    'proofInputs', jsonb_build_array(
      jsonb_build_object(
        'kind', 'postgres_backup',
        'requestedUtcDate', '2026-07-23',
        'sha256',
          '03eca4eaba34b6d06164f7ceffca2a9c05bbcadd3b463020b410e737878f2719',
        'byteLength', 43392962,
        'modifiedAt', '2026-07-24T06:00:19.265687774Z'
      ),
      jsonb_build_object(
        'kind', 'artifact',
        'requestedUtcDate', '2026-07-24',
        'sha256',
          '66886091626a12fbbcee415f7b5918d2247feab6e21416cafd163e0af8747bde',
        'byteLength', 9450,
        'modifiedAt', '2026-07-25T00:03:19.355926442Z',
        'cutoffAt', '2026-07-25T00:03:19.187Z'
      )
    )
  );
  v_manifest_bytes := convert_to(
    "reader_summary_production_recovery_canonical_json"(v_manifest),
    'UTF8'
  );
  v_manifest_sha := encode(sha256(v_manifest_bytes), 'hex');

  PERFORM alias."recovery_id"
  FROM "reader_summary_production_recovery_authority_corrections" AS alias
  WHERE alias."recovery_id" = c_recovery_id
  ORDER BY alias."recovery_id"
  FOR UPDATE OF alias;
  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "reader_summary_production_recovery_authority_corrections" AS alias
      WHERE alias."recovery_id" = c_recovery_id
        AND alias."tenant_id" = c_tenant_id
        AND alias."workspace_id" = c_workspace_id
        AND btrim(alias."legacy_canonical_sha256") = c_legacy_sha
        AND alias."corrected_canonical_record" = v_authority
        AND alias."corrected_canonical_bytes" = v_authority_bytes
        AND btrim(alias."corrected_canonical_sha256") = c_corrected_sha
        AND alias."correction_manifest" = v_manifest
        AND alias."correction_manifest_bytes" = v_manifest_bytes
        AND btrim(alias."correction_manifest_sha256") = v_manifest_sha
    ) THEN
      RAISE EXCEPTION 'original-cutoff correction alias diverged';
    END IF;
  ELSE
    INSERT INTO
      "reader_summary_production_recovery_authority_corrections" (
      "recovery_id", "tenant_id", "workspace_id",
      "legacy_canonical_sha256", "corrected_canonical_record",
      "corrected_canonical_bytes", "corrected_canonical_sha256",
      "correction_manifest", "correction_manifest_bytes",
      "correction_manifest_sha256"
    ) VALUES (
      c_recovery_id, c_tenant_id, c_workspace_id,
      c_legacy_sha, v_authority, v_authority_bytes, c_corrected_sha,
      v_manifest, v_manifest_bytes, v_manifest_sha
    );
  END IF;
END;
$original_cutoff_correction$;

CREATE OR REPLACE FUNCTION
public."guard_reader_summary_production_recovery_authority_correction"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION
    'reader summary production recovery authority correction is immutable';
END;
$$;

DO $create_correction_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger
    WHERE trigger.tgrelid =
        'public.reader_summary_production_recovery_authority_corrections'
          ::regclass
      AND trigger.tgname =
        'reader_summary_production_recovery_authority_corrections_immutable'
      AND NOT trigger.tgisinternal
  ) THEN
    EXECUTE $trigger$
      CREATE TRIGGER
        "reader_summary_production_recovery_authority_corrections_immutable"
      BEFORE INSERT OR UPDATE OR DELETE
      ON public."reader_summary_production_recovery_authority_corrections"
      FOR EACH ROW EXECUTE FUNCTION
        public."guard_reader_summary_production_recovery_authority_correction"()
    $trigger$;
  END IF;
END;
$create_correction_guard$;

REVOKE ALL PRIVILEGES ON FUNCTION
  public."guard_reader_summary_production_recovery_authority_correction"()
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
