-- @social-monitor-forward-migration
-- Consumes the reviewed Jul23/Jul24 immutable correction alias,
-- then makes Daily V4 use it without rewriting legacy evidence.
-- The pre-existing correction alias is append-only evidence: this migration never rewrites it.
-- Lock risk: row locks on one reviewed recovery scope and its bounded V4 rows.
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

CREATE FUNCTION public."reader_summary_daily_canonical_recovery_v4_original_cutoff_projection"(
  require_alias BOOLEAN
) RETURNS JSONB LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_recovery_id CONSTANT UUID := '0b5e172f-743e-52b5-807c-f54631295def';
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_issued_at CONSTANT TIMESTAMPTZ := TIMESTAMPTZ '2026-07-29T10:18:11.062Z';
  c_legacy_sha CONSTANT TEXT :=
    '7fa94c8538f55592349e820685dc4d34d84c4f3a4afe9165e18df6271d7816f3';
  c_corrected_sha CONSTANT TEXT :=
    'c51223e11e4631f3c613aa7708fe92d9c308ce31fd8ee5e626e5cee2972ad3e5';
  c_authority_bytes CONSTANT INTEGER := 3454;
  c_days CONSTANT JSONB := $days$
    [
      {
        "requestedUtcDate":"2026-07-23","legacyTotal":345,"legacyRssCount":78,
        "correctedRssCount":75,
        "legacyProviderEvidenceSha256":"07c1f33aacfa6a8052aa9bf20846e25328cca011bff073c6229406d84a4f993e",
        "correctedProviderEvidenceSha256":"4a3389ec7b332d59d6b8885c60b6f4db574db96728260f4ce338ff0ed16ba1d3",
        "legacyDayCanonicalSha256":"cbc70702cd295a068de21209b2afb4827cd9f0691b56e1bbbcc65ab67afba1be",
        "correctedDayCanonicalSha256":"977c2ec7728ce190dd6239f15fc6da5caaf044e20dd0c6f7be7f3af245766689",
        "retainedRssSha256":"f3cf702e8087775ab9a7e6dacaf347f434f8f9c4a31db0f4c10e4ab6a062c1c9",
        "removedRssSha256":"4271d96e3a4bcb76aeac7dcbba48586181c26bf685a9980d440cd20ea1690dd6"
      },
      {
        "requestedUtcDate":"2026-07-24","legacyTotal":351,"legacyRssCount":68,
        "correctedRssCount":67,
        "legacyProviderEvidenceSha256":"e96dab434060d4863b1f5ac21d74791b10140b6e4e8d727638ece17443675230",
        "correctedProviderEvidenceSha256":"2b5947fcc89d1efbcd7027d3346fe28679b3ca8f8e6b771c1f1f2cf4ed378791",
        "legacyDayCanonicalSha256":"84f44f912766a669445cd6f47d24c96c3d03f2e0a13c8b578ae5219d87dffc74",
        "correctedDayCanonicalSha256":"cfa152b72c9971b167cb007a035ba296bfbd226ac93964aeadd366821f98e453",
        "retainedRssSha256":"69551f0b00b4200d6f1327e3400c2e858c2e766412b61812aa9925671d87a95d",
        "removedRssSha256":"d754d13529935eab4ccefb61d2f00c1c203cd0c734c114d2560d66be3ce29ffe"
      }
    ]
  $days$::JSONB;
  c_removed CONSTANT JSONB := $removed$
    [
      {"requestedUtcDate":"2026-07-23","oldOrdinal":9,"feedItemId":"181bf737-196c-4d74-8b06-a6e936e663cc","sourceItemId":"7963de93-82e8-4ee4-88ca-2d266bdcfa32","sourceBindingId":"23f1684e-00e0-4cd8-9dcd-59e92f63a660","interestId":"4211ea2f-6b41-4a18-a454-b3089add381a","providerItemId":"CBMikgFBVV95cUxQWVhNdF9vVVNEUk5pRXdrZkFZNkU2WXA4MDJqSEVUOVhZaFYzZ0dKTUxvWTN5Z21CTzlNYVZXTF9ieTdLQkVWODQtTE51RTFpYzk2TjdoX1QwbUVtVmo3TktjX2pRZURaSVVQdVYyYTJQZk5raHRVOHMwNzMzLUF5dzZSamdxa3kwN3BZTVFSWGJpUQ","canonicalUrlSha256":"267d1e1f2727b3491f29857c791812a916d1047d116b1ea73b92e9c2ab839753","sourceContentHash":"2235424be2b0c6e1e4c49b419e135556d089bb67f93cedcd7528a8e4742d9516","sourceProviderContentHash":"ce18e8d0b45a95dd6037b4825708e282399d18e7ed911307bf881fb6a8bb1ddb","publishedAt":"2026-07-23T19:51:08.000Z","observedAt":"2026-07-24T07:08:05.238Z"},
      {"requestedUtcDate":"2026-07-23","oldOrdinal":34,"feedItemId":"6be8d0d7-3247-4cb7-8cf6-6e3ee6fa70da","sourceItemId":"8a32208c-aabf-4662-b590-d326d2f323b7","sourceBindingId":"23f1684e-00e0-4cd8-9dcd-59e92f63a660","interestId":"4211ea2f-6b41-4a18-a454-b3089add381a","providerItemId":"CBMiWkFVX3lxTE1iWFdWWk1rRjktUk5wZnBrNHBnd0xhU01XRmo1dTV0aHpGWmRDcTJhWndnUzV3R25aT2VjSHZxaWNzUUhWZF9MeVZnSkRZZUlJYXJrc3RBM2Vvdw","canonicalUrlSha256":"ab4c49707a3a81152b8089df8c026bca1af0739a0c34c8d4386c08d733f62df5","sourceContentHash":"1589fadcd37263f1c16fb02c2775d87360d7f3e67fc5c6effbc846778c109ea2","sourceProviderContentHash":"e77e47a12e56f77828e6c8d8beb0818c2a0b978cf77808d41f66d075e99b9b99","publishedAt":"2026-07-23T23:50:38.000Z","observedAt":"2026-07-24T15:08:09.365Z"},
      {"requestedUtcDate":"2026-07-23","oldOrdinal":57,"feedItemId":"a73b7b1a-a3ba-45c2-a1a4-4ec35201256e","sourceItemId":"9b8ee0ae-e035-4ec8-b31e-168d7fd54293","sourceBindingId":"23f1684e-00e0-4cd8-9dcd-59e92f63a660","interestId":"4211ea2f-6b41-4a18-a454-b3089add381a","providerItemId":"CBMiyAFBVV95cUxPTXByQWNwTGpCZU03R3dFRnRIWGRSRl8xYnF5SXhfS0NiQ2NMQVc1cWhkWWlsd1RlQTdTNlRzUW9CUHNGSVRKb1NSUHZUNGV3SWxrM0Q0QkNYVmNKOGZHV2d5WEpJVFpOeE5LeTJuZFRiUWJfcnNNZXIzd3dtVFhTT280RVdKT3hDLS1Oek8wQ24xNUdDamNLOG9hYzVTdTZReWNVSkR6ZnJDdW8tTmIxaEFxNG4zeEVWNklWNDNlS1pLd0JJeXlqMNIBzgFBVV95cUxNY0I4RlR5X3Fuc19oUVdQWGZoVlZ5dDQySXBob1ZDTFJkSlhpemFkdkVwVGxfV3BieFp2ekZ4NXJxNk9Ya2VoOEllZXpMeFlDS1h4Q1I3ZnVZVzZtOGppVWR2aHdUQnhQcUd5U2dLcWZjQmZPeGdDOEpOTncxemJiSXUwWmpvX1QyWFJXQTIwOVZEclEyTTQtMGp0X2stRElNUklLQ1h3dU1CTHVQbThHanl1YXVfZ0tRbk9ob1pJaFdzRWNJMElQdGNSajB0Zw","canonicalUrlSha256":"fd96469bdb26102a7f503145cca00a038acae4a3fd92242ac226acfee1d9ed21","sourceContentHash":"99999ae5ace077185152e5827af4c910b8b19ed71a65c61cfcce2c8aebf8a661","sourceProviderContentHash":"475765b1c1470dde36173ea63dbebf843537f6046951ebc45493fbfbf9395842","publishedAt":"2026-07-23T20:54:00.000Z","observedAt":"2026-07-24T07:08:05.238Z"},
      {"requestedUtcDate":"2026-07-24","oldOrdinal":2,"feedItemId":"08bac5d2-07e0-49a7-9593-3156869a9829","sourceItemId":"9aa4edc6-682c-4f99-a4de-a9e326ff681c","sourceBindingId":"23f1684e-00e0-4cd8-9dcd-59e92f63a660","interestId":"4211ea2f-6b41-4a18-a454-b3089add381a","providerItemId":"CBMiygFBVV95cUxPUUVwb1hZaVlaYVVZb3ZuVXJqeVFzQXktX1drRk85S0hjajFJaW83M3pmVGItZ2pfbnZEbU9fcE0xQVR6aUdIc1Yzdlh3NW00WVF3ZHg2a1FaeV9Yd2F6aXVla3l2WTdjQVdHNzhvU0tDVjdSTzBSaEl2NUtZbnJneUhFSDZqSW5aQ0x3eUxtMDhzRmRrMjA5SS1xWTdDaHhkTG1qSDF4Z1J6Mmd5LXptcUNBc2o5TWg1a19aVVFhalZJamlxUzZSXzdn","canonicalUrlSha256":"4003f1f0984977c116328555e8ab450c4b6d61b161960f0a4f7db9bf0bb32b12","sourceContentHash":"1f393b3a6061773b629cd32094e67c6ccd9fb9937e3f9416791996048514b6de","sourceProviderContentHash":"45607462314d1059fec06503148789d1771b868166c72c771b6861cb7e9d1745","publishedAt":"2026-07-24T17:00:00.000Z","observedAt":"2026-07-25T03:08:13.334Z"}
    ]
  $removed$::JSONB;
  v_alias public."reader_summary_production_recovery_authority_corrections"%ROWTYPE;
  v_alias_count INTEGER;
  v_artifact_count INTEGER;
  v_authority JSONB;
  v_authority_bytes BYTEA;
  v_claim_count INTEGER;
  v_count INTEGER;
  v_corrected_days JSONB := '[]'::JSONB;
  v_corrected_plan_days JSONB;
  v_date DATE;
  v_day public."reader_summary_production_recovery_days"%ROWTYPE;
  v_day_record JSONB;
  v_day_sha TEXT;
  v_digests JSONB;
  v_dry_count INTEGER;
  v_evidence JSONB;
  v_evidence_sha TEXT;
  v_expected JSONB;
  v_job_count INTEGER;
  v_lease public."reader_summary_production_recovery_leases"%ROWTYPE;
  v_manifest JSONB;
  v_manifest_bytes BYTEA;
  v_manifest_sha TEXT;
  v_provider TEXT;
  v_provider_count INTEGER;
  v_publication_count INTEGER;
  v_removed JSONB;
  v_removed_manifest JSONB := '[]'::JSONB;
  v_removed_manifest_day JSONB;
  v_recovery_alias_count INTEGER;
  v_receipt_count INTEGER;
  v_retained JSONB;
  v_scope_lease_count INTEGER;
BEGIN
  PERFORM set_config('social_monitor.system_access', 'false', TRUE);
  PERFORM set_config('social_monitor.tenant_id', c_tenant_id::TEXT, TRUE);
  PERFORM set_config('social_monitor.workspace_id', c_workspace_id::TEXT, TRUE);
  SELECT count(*)::INTEGER INTO v_alias_count
  FROM public."reader_summary_production_recovery_authority_corrections" AS alias
  WHERE alias."tenant_id" = c_tenant_id AND alias."workspace_id" = c_workspace_id;
  SELECT count(*)::INTEGER INTO v_recovery_alias_count
  FROM public."reader_summary_production_recovery_authority_corrections" AS alias
  WHERE alias."recovery_id" = c_recovery_id;
  SELECT count(*)::INTEGER INTO v_scope_lease_count
  FROM public."reader_summary_production_recovery_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id AND lease."workspace_id" = c_workspace_id
    AND lease."canonical_record"->>'schemaVersion' =
      'reader_summary.production_recovery_authority.v2';
  IF v_scope_lease_count = 0 THEN
    IF v_alias_count <> 0 OR v_recovery_alias_count <> 0 THEN
      RAISE EXCEPTION 'daily v4 original-cutoff alias has no legacy authority';
    END IF;
    RETURN NULL;
  ELSIF v_scope_lease_count <> 1 OR v_alias_count > 1
    OR v_recovery_alias_count <> v_alias_count THEN
    RAISE EXCEPTION 'daily v4 original-cutoff authority is ambiguous';
  END IF;

  PERFORM tenant."id" FROM public."tenants" AS tenant
  WHERE tenant."id" = c_tenant_id AND tenant."deleted_at" IS NULL
  ORDER BY tenant."id" FOR KEY SHARE OF tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily v4 original-cutoff tenant is absent';
  END IF;
  PERFORM workspace."id" FROM public."workspaces" AS workspace
  WHERE workspace."id" = c_workspace_id AND workspace."tenant_id" = c_tenant_id
    AND workspace."deleted_at" IS NULL
  ORDER BY workspace."id" FOR KEY SHARE OF workspace;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily v4 original-cutoff workspace is absent';
  END IF;

  SELECT lease.* INTO STRICT v_lease
  FROM public."reader_summary_production_recovery_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id AND lease."workspace_id" = c_workspace_id
    AND lease."canonical_record"->>'schemaVersion' =
      'reader_summary.production_recovery_authority.v2'
  FOR UPDATE OF lease;
  IF btrim(v_lease."canonical_sha256") <> c_legacy_sha THEN
    IF v_alias_count <> 0 THEN
      RAISE EXCEPTION 'daily v4 original-cutoff alias has a divergent legacy authority';
    END IF;
    RETURN NULL;
  END IF;
  IF v_lease."id" <> c_recovery_id OR v_lease."state" <> 'CONSUMED'
    OR v_lease."issued_at" IS DISTINCT FROM c_issued_at
    OR v_lease."consumed_at" IS DISTINCT FROM v_lease."issued_at"
    OR octet_length(v_lease."canonical_bytes") <> c_authority_bytes
    OR v_lease."canonical_bytes" IS DISTINCT FROM convert_to(
      public."reader_summary_weekly_canonical_json"(v_lease."canonical_record"), 'UTF8'
    ) OR encode(sha256(v_lease."canonical_bytes"), 'hex') <> c_legacy_sha
    OR public.jsonb_object_length(v_lease."canonical_record") <> 8
    OR v_lease."canonical_record"->>'recoveryId' <> c_recovery_id::TEXT
    OR v_lease."canonical_record"->>'tenantId' <> c_tenant_id::TEXT
    OR v_lease."canonical_record"->>'workspaceId' <> c_workspace_id::TEXT
    OR v_lease."canonical_record"->'requestedUtcDates' IS DISTINCT FROM jsonb_build_array(
      '2026-07-23', '2026-07-24', '2026-07-25',
      '2026-07-26', '2026-07-27', '2026-07-28'
    ) OR v_lease."canonical_record"->'boundaries' IS DISTINCT FROM jsonb_build_object(
      'stage', 'pre_model', 'modelCallPerformed', FALSE,
      'publicationPerformed', FALSE, 'recollectionPerformed', FALSE
    ) THEN
    RAISE EXCEPTION 'daily v4 original-cutoff legacy lease diverged';
  END IF;

  PERFORM day."recovery_id" FROM public."reader_summary_production_recovery_days" AS day
  WHERE day."recovery_id" = c_recovery_id AND day."tenant_id" = c_tenant_id
    AND day."workspace_id" = c_workspace_id
  ORDER BY day."requested_utc_date" FOR UPDATE OF day;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 6 OR EXISTS (
    SELECT 1 FROM public."reader_summary_production_recovery_days" AS day
    WHERE day."recovery_id" = c_recovery_id AND (
      day."tenant_id" <> c_tenant_id OR day."workspace_id" <> c_workspace_id
      OR day."canonical_bytes" IS DISTINCT FROM convert_to(
        public."reader_summary_weekly_canonical_json"(day."canonical_record"), 'UTF8'
      ) OR btrim(day."canonical_sha256") <> encode(sha256(day."canonical_bytes"), 'hex')
    )
  ) OR (
    SELECT jsonb_agg(jsonb_build_object(
      'identity', day."identity", 'requestedUtcDate', to_char(day."requested_utc_date", 'YYYY-MM-DD'),
      'canonicalSha256', btrim(day."canonical_sha256"),
      'providerEvidenceSha256', btrim(day."provider_evidence_sha256"),
      'planSha256s', jsonb_build_array(btrim(day."canonical_sha256"), btrim(day."canonical_sha256"))
    ) ORDER BY day."requested_utc_date")
    FROM public."reader_summary_production_recovery_days" AS day
    WHERE day."recovery_id" = c_recovery_id
  ) IS DISTINCT FROM v_lease."canonical_record"->'days' THEN
    RAISE EXCEPTION 'daily v4 original-cutoff legacy days diverged';
  END IF;

  PERFORM dry."ordinal" FROM public."reader_summary_production_recovery_dry_runs" AS dry
  WHERE dry."recovery_id" = c_recovery_id AND dry."tenant_id" = c_tenant_id
    AND dry."workspace_id" = c_workspace_id ORDER BY dry."ordinal" FOR UPDATE OF dry;
  GET DIAGNOSTICS v_dry_count = ROW_COUNT;
  IF v_dry_count <> 2 OR EXISTS (
    SELECT 1 FROM public."reader_summary_production_recovery_dry_runs" AS dry
    WHERE dry."recovery_id" = c_recovery_id AND (
      dry."tenant_id" <> c_tenant_id OR dry."workspace_id" <> c_workspace_id
      OR dry."ordinal" NOT IN (1, 2) OR dry."captured_at" IS DISTINCT FROM v_lease."issued_at"
      OR dry."canonical_record" IS DISTINCT FROM v_lease."canonical_record"
      OR dry."canonical_bytes" IS DISTINCT FROM v_lease."canonical_bytes"
      OR btrim(dry."canonical_sha256") <> c_legacy_sha
    )
  ) THEN
    RAISE EXCEPTION 'daily v4 original-cutoff legacy dry runs diverged';
  END IF;

  PERFORM claim."id" FROM public."idempotency_keys" AS claim
  WHERE claim."tenant_id" = c_tenant_id AND claim."workspace_id" = c_workspace_id
    AND claim."scope" IN (
      'reader-summary-production-recovery-model-v2',
      'reader-summary-production-recovery-model-retry-v1',
      'reader-summary-production-recovery-model-resume-v1',
      'reader-summary-production-recovery-model-quality-remediation-v1',
      'reader-summary-production-recovery-model-quality-remediation-resume-v1'
    ) ORDER BY claim."id" FOR UPDATE OF claim;
  GET DIAGNOSTICS v_claim_count = ROW_COUNT;
  PERFORM job."id" FROM public."reader_summary_jobs" AS job
  WHERE job."tenant_id" = c_tenant_id AND job."workspace_id" = c_workspace_id
    AND job."period_started_at" >= TIMESTAMPTZ '2026-07-23T00:00:00Z'
    AND job."period_started_at" < TIMESTAMPTZ '2026-07-29T00:00:00Z'
    AND (job."idempotency_key" LIKE 'reader-summary-production-recovery%'
      OR job."idempotency_key" LIKE 'reader_summary.production_recovery.%')
  ORDER BY job."id" FOR UPDATE OF job;
  GET DIAGNOSTICS v_job_count = ROW_COUNT;
  PERFORM artifact."id" FROM public."reader_summary_artifacts" AS artifact
  WHERE artifact."tenant_id" = c_tenant_id AND artifact."workspace_id" = c_workspace_id
    AND artifact."period_started_at" >= TIMESTAMPTZ '2026-07-23T00:00:00Z'
    AND artifact."period_started_at" < TIMESTAMPTZ '2026-07-29T00:00:00Z'
  ORDER BY artifact."id" FOR UPDATE OF artifact;
  GET DIAGNOSTICS v_artifact_count = ROW_COUNT;
  PERFORM publication."id" FROM public."reader_summary_publications" AS publication
  JOIN public."reader_summary_jobs" AS publication_job ON publication_job."id" = publication."reader_summary_job_id"
  WHERE publication."tenant_id" = c_tenant_id AND publication."workspace_id" = c_workspace_id
    AND publication_job."tenant_id" = c_tenant_id AND publication_job."workspace_id" = c_workspace_id
    AND publication_job."period_started_at" >= TIMESTAMPTZ '2026-07-23T00:00:00Z'
    AND publication_job."period_started_at" < TIMESTAMPTZ '2026-07-29T00:00:00Z'
    AND (publication_job."idempotency_key" LIKE 'reader-summary-production-recovery%'
      OR publication_job."idempotency_key" LIKE 'reader_summary.production_recovery.%')
  ORDER BY publication."id" FOR UPDATE OF publication;
  GET DIAGNOSTICS v_publication_count = ROW_COUNT;
  PERFORM receipt."publication_id" FROM public."reader_summary_recovery_receipts" AS receipt
  WHERE receipt."tenant_id" = c_tenant_id AND receipt."workspace_id" = c_workspace_id
  ORDER BY receipt."publication_id" FOR UPDATE OF receipt;
  GET DIAGNOSTICS v_receipt_count = ROW_COUNT;
  IF v_claim_count <> 10 OR v_job_count <> 10 OR v_artifact_count <> 8
    OR v_publication_count <> 0 OR v_receipt_count <> 0 THEN
    RAISE EXCEPTION 'daily v4 original-cutoff consumed state diverged';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."reader_summary_artifacts" AS artifact
    CROSS JOIN LATERAL jsonb_array_elements(artifact."citations") AS citation(entry)
    WHERE artifact."tenant_id" = c_tenant_id AND artifact."workspace_id" = c_workspace_id
      AND (citation.entry->>'feedItemId' IN (
        '181bf737-196c-4d74-8b06-a6e936e663cc', '6be8d0d7-3247-4cb7-8cf6-6e3ee6fa70da',
        'a73b7b1-a3ba-45c2-a1a4-4ec35201256e', '08bac5d2-07e0-49a7-9593-3156869a9829'
      ) OR citation.entry->>'sourceItemId' IN (
        '7963de93-82e8-4ee4-88ca-2d266bdcfa32', '8a32208c-aabf-4662-b590-d326d2f323b7',
        '9b8ee0ae-e035-4ec8-b31e-168d7fd54293', '9aa4edc6-682c-4f99-a4de-a9e326ff681c'
      ))
  ) THEN
    RAISE EXCEPTION 'daily v4 original-cutoff removed RSS intersects an artifact';
  END IF;

  FOREACH v_date IN ARRAY ARRAY[DATE '2026-07-23', DATE '2026-07-24'] LOOP
    SELECT value INTO STRICT v_expected FROM jsonb_array_elements(c_days) AS expected(value)
    WHERE expected.value->>'requestedUtcDate' = to_char(v_date, 'YYYY-MM-DD');
    SELECT day.* INTO STRICT v_day FROM public."reader_summary_production_recovery_days" AS day
    WHERE day."recovery_id" = c_recovery_id AND day."tenant_id" = c_tenant_id
      AND day."workspace_id" = c_workspace_id AND day."requested_utc_date" = v_date;
    IF jsonb_typeof(v_day."provider_evidence") <> 'object'
      OR public.jsonb_object_length(v_day."provider_evidence") <> 5
      OR jsonb_typeof(v_day."provider_evidence"->'rss') <> 'array'
      OR jsonb_array_length(v_day."provider_evidence"->'rss') <> (v_expected->>'legacyRssCount')::INTEGER
      OR btrim(v_day."provider_evidence_sha256") <> v_expected->>'legacyProviderEvidenceSha256'
      OR btrim(v_day."canonical_sha256") <> v_expected->>'legacyDayCanonicalSha256'
      OR (SELECT (entry->>'count')::INTEGER FROM jsonb_array_elements(v_day."provider_counts") AS count(entry)
          WHERE entry->>'providerKey' = 'rss') <> (v_expected->>'legacyRssCount')::INTEGER
      OR (SELECT sum(jsonb_array_length(provider.value)) FROM jsonb_each(v_day."provider_evidence") AS provider(key, value))
        <> (v_expected->>'legacyTotal')::INTEGER THEN
      RAISE EXCEPTION 'daily v4 original-cutoff legacy day authority diverged';
    END IF;
    SELECT COALESCE(jsonb_agg(item.entry ORDER BY item.ordinal) FILTER (WHERE expected.value IS NOT NULL), '[]'::JSONB),
      COALESCE(jsonb_agg(item.entry ORDER BY item.ordinal) FILTER (WHERE expected.value IS NULL), '[]'::JSONB),
      COALESCE(jsonb_agg(jsonb_build_object(
        'oldOrdinal', item.ordinal, 'feedItemId', item.entry->>'feedItemId',
        'sourceItemId', item.entry->>'sourceItemId', 'sourceBindingId', item.entry->>'sourceBindingId',
        'interestId', item.entry->>'interestId', 'providerItemId', item.entry->>'providerItemId',
        'canonicalUrlSha256', encode(sha256(convert_to(item.entry->>'canonicalUrl', 'UTF8')), 'hex'),
        'sourceContentHash', item.entry->>'sourceContentHash',
        'sourceProviderContentHash', item.entry->>'sourceProviderContentHash',
        'publishedAt', item.entry->>'publishedAt', 'observedAt', item.entry->>'observedAt'
      ) ORDER BY item.ordinal) FILTER (WHERE expected.value IS NOT NULL), '[]'::JSONB)
    INTO v_removed, v_retained, v_removed_manifest_day
    FROM jsonb_array_elements(v_day."provider_evidence"->'rss') WITH ORDINALITY AS item(entry, ordinal)
    LEFT JOIN LATERAL (
      SELECT value FROM jsonb_array_elements(c_removed) AS candidate(value)
      WHERE candidate.value->>'requestedUtcDate' = to_char(v_date, 'YYYY-MM-DD')
        AND (candidate.value->>'oldOrdinal')::INTEGER = item.ordinal
    ) AS expected ON TRUE;
    IF v_removed_manifest_day IS DISTINCT FROM (
      SELECT COALESCE(jsonb_agg(value - 'requestedUtcDate' ORDER BY (value->>'oldOrdinal')::INTEGER), '[]'::JSONB)
      FROM jsonb_array_elements(c_removed) AS candidate(value)
      WHERE candidate.value->>'requestedUtcDate' = to_char(v_date, 'YYYY-MM-DD')
    ) OR encode(sha256(convert_to(public."reader_summary_production_recovery_canonical_json"(v_retained), 'UTF8')), 'hex')
        <> v_expected->>'retainedRssSha256'
      OR encode(sha256(convert_to(public."reader_summary_production_recovery_canonical_json"(v_removed), 'UTF8')), 'hex')
        <> v_expected->>'removedRssSha256' THEN
      RAISE EXCEPTION 'daily v4 original-cutoff removed RSS seal diverged';
    END IF;
    v_evidence := jsonb_set(v_day."provider_evidence", '{rss}', v_retained, FALSE);
    v_digests := '[]'::JSONB;
    FOREACH v_provider IN ARRAY ARRAY[
      'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'
    ] LOOP
      SELECT (entry->>'count')::INTEGER INTO STRICT v_provider_count
      FROM jsonb_array_elements(jsonb_set(v_day."provider_counts", '{3,count}',
        to_jsonb(CASE WHEN v_date = DATE '2026-07-23' THEN 75 ELSE 67 END), FALSE)) AS count(entry)
      WHERE entry->>'providerKey' = v_provider;
      IF jsonb_array_length(v_evidence->v_provider) <> v_provider_count THEN
        RAISE EXCEPTION 'daily v4 original-cutoff corrected provider count diverged';
      END IF;
      v_digests := v_digests || jsonb_build_array(jsonb_build_object(
        'providerKey', v_provider, 'count', v_provider_count,
        'sha256', encode(sha256(convert_to(
          public."reader_summary_production_recovery_canonical_json"(v_evidence->v_provider), 'UTF8'
        )), 'hex')
      ));
    END LOOP;
    v_evidence_sha := encode(sha256(convert_to(
      public."reader_summary_production_recovery_canonical_json"(v_digests), 'UTF8'
    )), 'hex');
    IF v_evidence_sha <> v_expected->>'correctedProviderEvidenceSha256' THEN
      RAISE EXCEPTION 'daily v4 original-cutoff corrected evidence seal diverged';
    END IF;
    v_day_record := jsonb_set(jsonb_set(jsonb_set(v_day."canonical_record", '{providerCounts}',
      jsonb_set(v_day."provider_counts", '{3,count}',
        to_jsonb(CASE WHEN v_date = DATE '2026-07-23' THEN 75 ELSE 67 END), FALSE), FALSE),
      '{providerEvidenceDigests}', v_digests, FALSE),
      '{providerEvidenceSha256}', to_jsonb(v_evidence_sha), FALSE);
    v_day_sha := encode(sha256(convert_to(
      public."reader_summary_weekly_canonical_json"(v_day_record), 'UTF8'
    )), 'hex');
    IF v_day_sha <> v_expected->>'correctedDayCanonicalSha256' THEN
      RAISE EXCEPTION 'daily v4 original-cutoff corrected day seal diverged';
    END IF;
    v_corrected_days := v_corrected_days || jsonb_build_array(jsonb_build_object(
      'requestedUtcDate', to_char(v_date, 'YYYY-MM-DD'), 'providerEvidence', v_evidence,
      'providerEvidenceSha256', v_evidence_sha, 'dayCanonicalSha256', v_day_sha
    ));
    v_removed_manifest := v_removed_manifest || jsonb_build_array(
      (v_expected - 'legacyTotal') || jsonb_build_object('removedRss', v_removed_manifest_day)
    );
  END LOOP;

  SELECT jsonb_agg(CASE plan.value->>'requestedUtcDate'
    WHEN '2026-07-23' THEN jsonb_build_object(
      'identity', 'reader_summary.production_recovery_day.v2:977c2ec7728ce190dd6239f15fc6da5caaf044e20dd0c6f7be7f3af245766689',
      'requestedUtcDate', '2026-07-23',
      'canonicalSha256', '977c2ec7728ce190dd6239f15fc6da5caaf044e20dd0c6f7be7f3af245766689',
      'providerEvidenceSha256', '4a3389ec7b332d59d6b8885c60b6f4db574db96728260f4ce338ff0ed16ba1d3',
      'planSha256s', jsonb_build_array('977c2ec7728ce190dd6239f15fc6da5caaf044e20dd0c6f7be7f3af245766689', '977c2ec7728ce190dd6239f15fc6da5caaf044e20dd0c6f7be7f3af245766689')
    ) WHEN '2026-07-24' THEN jsonb_build_object(
      'identity', 'reader_summary.production_recovery_day.v2:cfa152b72c9971b167cb007a035ba296bfbd226ac93964aeadd366821f98e453',
      'requestedUtcDate', '2026-07-24',
      'canonicalSha256', 'cfa152b72c9971b167cb007a035ba296bfbd226ac93964aeadd366821f98e453',
      'providerEvidenceSha256', '2b5947fcc89d1efbcd7027d3346fe28679b3ca8f8e6b771c1f1f2cf4ed378791',
      'planSha256s', jsonb_build_array('cfa152b72c9971b167cb007a035ba296bfbd226ac93964aeadd366821f98e453', 'cfa152b72c9971b167cb007a035ba296bfbd226ac93964aeadd366821f98e453')
    ) ELSE plan.value END ORDER BY plan.ordinal)
  INTO v_corrected_plan_days
  FROM jsonb_array_elements(v_lease."canonical_record"->'days') WITH ORDINALITY AS plan(value, ordinal);
  v_authority := jsonb_set(v_lease."canonical_record", '{days}', v_corrected_plan_days, FALSE);
  v_authority_bytes := convert_to(public."reader_summary_weekly_canonical_json"(v_authority), 'UTF8');
  IF octet_length(v_authority_bytes) <> c_authority_bytes
    OR encode(sha256(v_authority_bytes), 'hex') <> c_corrected_sha THEN
    RAISE EXCEPTION 'daily v4 original-cutoff corrected authority seal diverged';
  END IF;
  v_manifest := jsonb_build_object(
    'schemaVersion', 'reader_summary.production_recovery_authority_correction.v1',
    'recoveryId', c_recovery_id::TEXT, 'tenantId', c_tenant_id::TEXT, 'workspaceId', c_workspace_id::TEXT,
    'legacyAuthority', jsonb_build_object('canonicalSha256', c_legacy_sha,
      'canonicalByteLength', c_authority_bytes, 'issuedAt', '2026-07-29T10:18:11.062Z', 'state', 'CONSUMED'),
    'correctedAuthority', jsonb_build_object('canonicalSha256', c_corrected_sha,
      'canonicalByteLength', c_authority_bytes),
    'days', v_removed_manifest,
    'proofInputs', jsonb_build_array(
      jsonb_build_object('kind', 'postgres_backup', 'requestedUtcDate', '2026-07-23',
        'sha256', '03eca4eaba34b6d06164f7ceffca2a9c05bbcadd3b463020b410e737878f2719',
        'byteLength', 43392962, 'modifiedAt', '2026-07-24T06:00:19.265687774Z'),
      jsonb_build_object('kind', 'artifact', 'requestedUtcDate', '2026-07-24',
        'sha256', '66886091626a12fbbcee415f7b5918d2247feab6e21416cafd163e0af8747bde',
        'byteLength', 9450, 'modifiedAt', '2026-07-25T00:03:19.355926442Z',
        'cutoffAt', '2026-07-25T00:03:19.187Z')
    )
  );
  v_manifest_bytes := convert_to(public."reader_summary_production_recovery_canonical_json"(v_manifest), 'UTF8');
  v_manifest_sha := encode(sha256(v_manifest_bytes), 'hex');
  IF v_alias_count = 1 THEN
    SELECT alias.* INTO STRICT v_alias
    FROM public."reader_summary_production_recovery_authority_corrections" AS alias
    WHERE alias."tenant_id" = c_tenant_id AND alias."workspace_id" = c_workspace_id
    FOR UPDATE OF alias;
    IF v_alias."recovery_id" <> c_recovery_id OR btrim(v_alias."legacy_canonical_sha256") <> c_legacy_sha
      OR v_alias."corrected_canonical_record" IS DISTINCT FROM v_authority
      OR v_alias."corrected_canonical_bytes" IS DISTINCT FROM v_authority_bytes
      OR btrim(v_alias."corrected_canonical_sha256") <> c_corrected_sha
      OR v_alias."correction_manifest" IS DISTINCT FROM v_manifest
      OR v_alias."correction_manifest_bytes" IS DISTINCT FROM v_manifest_bytes
      OR btrim(v_alias."correction_manifest_sha256") <> v_manifest_sha THEN
      RAISE EXCEPTION 'daily v4 original-cutoff correction alias diverged';
    END IF;
  ELSIF require_alias THEN
    RAISE EXCEPTION 'daily v4 original-cutoff correction alias is absent';
  END IF;
  RETURN jsonb_build_object(
    'aliasPresent', v_alias_count = 1, 'legacyAuthoritySha256', c_legacy_sha,
    'correctedAuthority', v_authority, 'correctedAuthoritySha256', c_corrected_sha,
    'correctionManifest', v_manifest, 'correctedDays', v_corrected_days
  );
END;
$function$;

CREATE FUNCTION public."reader_summary_daily_canonical_recovery_v4_corrected_plan_day"(
  target_date DATE
) RETURNS JSONB LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  v_day RECORD;
  v_effective_evidence JSONB;
  v_effective_day_sha TEXT;
  v_effective_authority_sha TEXT;
  v_digests JSONB;
  v_dry_count INTEGER;
  v_evidence_sha TEXT;
  v_expected_dates JSONB;
  v_expected_schema TEXT;
  v_expected_day_schema TEXT;
  v_projection JSONB;
  v_source JSONB;
BEGIN
  IF target_date NOT BETWEEN DATE '2026-07-23' AND DATE '2026-07-30' THEN
    RAISE EXCEPTION 'daily v4 corrected plan date is outside the reviewed recovery';
  END IF;
  v_projection := public."reader_summary_daily_canonical_recovery_v4_original_cutoff_projection"(TRUE);
  v_expected_schema := CASE WHEN target_date <= DATE '2026-07-28'
    THEN 'reader_summary.production_recovery_authority.v2'
    ELSE 'reader_summary.production_recovery_gap_authority.v3' END;
  SELECT day.*, lease."id" AS legacy_recovery_id, lease."state" AS lease_state,
    lease."issued_at" AS lease_issued_at, lease."consumed_at" AS lease_consumed_at,
    lease."canonical_record" AS lease_record, lease."canonical_bytes" AS lease_bytes,
    btrim(lease."canonical_sha256") AS lease_sha,
    lease."canonical_record"->>'schemaVersion' AS recovery_schema,
    btrim(lease."canonical_sha256") AS recovery_sha,
    CASE lease."canonical_record"->>'schemaVersion'
      WHEN 'reader_summary.production_recovery_authority.v2' THEN lease."issued_at"
      ELSE (lease."canonical_record"->'boundaries'->>'authorityCutoffAt')::TIMESTAMPTZ END AS cutoff
  INTO STRICT v_day
  FROM public."reader_summary_production_recovery_days" AS day
  JOIN public."reader_summary_production_recovery_leases" AS lease ON lease."id" = day."recovery_id"
  WHERE day."tenant_id" = c_tenant_id AND day."workspace_id" = c_workspace_id
    AND day."requested_utc_date" = target_date
    AND lease."canonical_record"->>'schemaVersion' = v_expected_schema;
  v_expected_dates := CASE WHEN v_expected_schema = 'reader_summary.production_recovery_authority.v2'
    THEN jsonb_build_array('2026-07-23', '2026-07-24', '2026-07-25',
      '2026-07-26', '2026-07-27', '2026-07-28')
    ELSE jsonb_build_array('2026-07-29', '2026-07-30', '2026-07-31') END;
  v_expected_day_schema := CASE WHEN v_expected_schema = 'reader_summary.production_recovery_authority.v2'
    THEN 'reader_summary.production_recovery_day.v2'
    ELSE 'reader_summary.production_recovery_gap_day.v3' END;
  IF v_day.lease_state <> 'CONSUMED'
    OR v_day.lease_consumed_at IS DISTINCT FROM v_day.lease_issued_at
    OR v_day.lease_bytes IS DISTINCT FROM convert_to(CASE v_expected_day_schema
        WHEN 'reader_summary.production_recovery_day.v2' THEN
          public."reader_summary_weekly_canonical_json"(v_day.lease_record)
        ELSE public."reader_summary_production_recovery_canonical_json"(v_day.lease_record) END, 'UTF8')
    OR v_day.lease_sha IS DISTINCT FROM encode(sha256(v_day.lease_bytes), 'hex')
    OR v_day.lease_record->>'tenantId' IS DISTINCT FROM c_tenant_id::TEXT
    OR v_day.lease_record->>'workspaceId' IS DISTINCT FROM c_workspace_id::TEXT
    OR v_day.lease_record->'requestedUtcDates' IS DISTINCT FROM v_expected_dates
    OR v_day.lease_record->'boundaries'->>'stage' IS DISTINCT FROM 'pre_model'
    OR (v_day.lease_record->'boundaries'->>'modelCallPerformed')::BOOLEAN IS NOT FALSE
    OR (v_day.lease_record->'boundaries'->>'publicationPerformed')::BOOLEAN IS NOT FALSE
    OR (v_day.lease_record->'boundaries'->>'recollectionPerformed')::BOOLEAN IS NOT FALSE THEN
    RAISE EXCEPTION 'daily v4 corrected plan legacy lease diverged';
  END IF;
  SELECT count(*)::INTEGER INTO v_dry_count
  FROM public."reader_summary_production_recovery_dry_runs" AS dry
  WHERE dry."recovery_id" = v_day.legacy_recovery_id
    AND dry."tenant_id" = c_tenant_id AND dry."workspace_id" = c_workspace_id
    AND dry."ordinal" IN (1, 2) AND dry."canonical_record" = v_day.lease_record
    AND dry."canonical_bytes" = v_day.lease_bytes
    AND btrim(dry."canonical_sha256") = v_day.lease_sha
    AND dry."captured_at" = v_day.lease_issued_at;
  IF v_dry_count <> 2 THEN
    RAISE EXCEPTION 'daily v4 corrected plan legacy dry runs diverged';
  END IF;
  v_digests := CASE v_expected_day_schema
    WHEN 'reader_summary.production_recovery_day.v2' THEN (
      SELECT jsonb_agg(jsonb_build_object('providerKey', provider.key,
        'count', jsonb_array_length(v_day."provider_evidence"->provider.key),
        'sha256', encode(sha256(convert_to(
          public."reader_summary_production_recovery_canonical_json"(
            v_day."provider_evidence"->provider.key), 'UTF8')), 'hex')) ORDER BY provider.ordinal)
      FROM unnest(ARRAY['github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'])
        WITH ORDINALITY AS provider(key, ordinal)
    ) ELSE (
      SELECT jsonb_agg(jsonb_build_object('providerKey', coverage.value->>'providerKey',
        'count', (coverage.value->>'count')::INTEGER, 'sha256', encode(sha256(convert_to(
          public."reader_summary_production_recovery_canonical_json"(
            v_day."provider_evidence"->(coverage.value->>'providerKey')), 'UTF8')), 'hex'))
        ORDER BY coverage.ordinal)
      FROM jsonb_array_elements(v_day."canonical_record"->'providerCoverage')
        WITH ORDINALITY AS coverage(value, ordinal)
    ) END;
  v_evidence_sha := encode(sha256(convert_to(
    public."reader_summary_production_recovery_canonical_json"(v_digests), 'UTF8')), 'hex');
  IF v_day.recovery_schema = 'reader_summary.production_recovery_authority.v2' THEN
    IF v_day."canonical_record"->>'schemaVersion' <> 'reader_summary.production_recovery_day.v2'
      OR v_day."canonical_record"->>'requestedUtcDate' <> to_char(target_date, 'YYYY-MM-DD')
      OR v_day."canonical_record"->'providerEvidenceSha256' IS DISTINCT FROM
        to_jsonb(btrim(v_day."provider_evidence_sha256"))
      OR btrim(v_day."provider_evidence_sha256") IS DISTINCT FROM v_evidence_sha
      OR v_day."canonical_record"->'providerCounts' IS DISTINCT FROM v_day."provider_counts"
      OR v_day."canonical_record"->'providerEvidenceDigests' IS DISTINCT FROM v_digests
      OR v_day."canonical_bytes" IS DISTINCT FROM convert_to(
        public."reader_summary_weekly_canonical_json"(v_day."canonical_record"), 'UTF8')
      OR btrim(v_day."canonical_sha256") <> encode(sha256(v_day."canonical_bytes"), 'hex') THEN
      RAISE EXCEPTION 'daily v4 corrected plan v2 day seal diverged';
    END IF;
  ELSIF v_day."canonical_record"->>'schemaVersion' <> 'reader_summary.production_recovery_gap_day.v3'
    OR v_day."canonical_record"->>'requestedUtcDate' <> to_char(target_date, 'YYYY-MM-DD')
    OR v_day."canonical_record"->'providerEvidenceSha256' IS DISTINCT FROM
      to_jsonb(btrim(v_day."provider_evidence_sha256"))
    OR btrim(v_day."provider_evidence_sha256") IS DISTINCT FROM v_evidence_sha
    OR v_day."canonical_record"->'providerCoverage' IS DISTINCT FROM v_day."provider_counts"
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_day."canonical_record"->'providerCoverage')
        WITH ORDINALITY AS coverage(value, ordinal)
      WHERE coverage.value->>'evidenceSha256' IS DISTINCT FROM
        v_digests->((coverage.ordinal - 1)::INTEGER)->>'sha256'
    )
    OR v_day."canonical_bytes" IS DISTINCT FROM convert_to(
      public."reader_summary_production_recovery_canonical_json"(v_day."canonical_record"), 'UTF8')
    OR btrim(v_day."canonical_sha256") <> encode(sha256(v_day."canonical_bytes"), 'hex') THEN
    RAISE EXCEPTION 'daily v4 corrected plan v3 day seal diverged';
  END IF;
  v_effective_evidence := v_day."provider_evidence";
  v_effective_day_sha := btrim(v_day."canonical_sha256");
  v_effective_authority_sha := btrim(v_day.recovery_sha);
  IF v_projection IS NOT NULL AND target_date IN (DATE '2026-07-23', DATE '2026-07-24') THEN
    SELECT value INTO STRICT v_source
    FROM jsonb_array_elements(v_projection->'correctedDays') AS corrected(value)
    WHERE corrected.value->>'requestedUtcDate' = to_char(target_date, 'YYYY-MM-DD');
    v_effective_evidence := v_source->'providerEvidence';
    v_effective_day_sha := v_source->>'dayCanonicalSha256';
  END IF;
  IF v_projection IS NOT NULL AND target_date <= DATE '2026-07-28' THEN
    v_effective_authority_sha := v_projection->>'correctedAuthoritySha256';
  END IF;
  v_source := public."reader_summary_daily_canonical_recovery_v4_source_authority"(
    c_tenant_id, c_workspace_id, target_date, v_day.cutoff,
    v_effective_evidence, v_day."github_evidence"
  );
  IF (target_date = DATE '2026-07-23' AND (
      jsonb_array_length(v_effective_evidence->'github-trending-page') <> 0
      OR jsonb_array_length(v_effective_evidence->'hacker-news') <> 100
      OR jsonb_array_length(v_effective_evidence->'reddit') <> 100
      OR jsonb_array_length(v_effective_evidence->'rss') <> 75
      OR jsonb_array_length(v_effective_evidence->'x-twitter') <> 67))
    OR (target_date = DATE '2026-07-24' AND (
      jsonb_array_length(v_effective_evidence->'github-trending-page') <> 10
      OR jsonb_array_length(v_effective_evidence->'hacker-news') <> 100
      OR jsonb_array_length(v_effective_evidence->'reddit') <> 100
      OR jsonb_array_length(v_effective_evidence->'rss') <> 67
      OR jsonb_array_length(v_effective_evidence->'x-twitter') <> 73))
    OR (target_date = DATE '2026-07-28' AND (
      jsonb_array_length(v_effective_evidence->'github-trending-page') <> 0
      OR jsonb_array_length(v_effective_evidence->'hacker-news') <> 0
      OR jsonb_array_length(v_effective_evidence->'reddit') <> 0
      OR jsonb_array_length(v_effective_evidence->'rss') <> 31
      OR jsonb_array_length(v_effective_evidence->'x-twitter') <> 107))
    OR (target_date = DATE '2026-07-30' AND (
      jsonb_array_length(v_effective_evidence->'github-trending-page') <> 0
      OR jsonb_array_length(v_effective_evidence->'hacker-news') <> 0
      OR jsonb_array_length(v_effective_evidence->'reddit') <> 0
      OR jsonb_array_length(v_effective_evidence->'rss') <> 34
      OR jsonb_array_length(v_effective_evidence->'x-twitter') <> 64)) THEN
    RAISE EXCEPTION 'daily v4 corrected plan evidence counts diverged';
  END IF;
  RETURN jsonb_build_object(
    'requestedUtcDate', to_char(target_date, 'YYYY-MM-DD'),
    'legacy', jsonb_build_object('schemaVersion', v_day.recovery_schema,
      'recoveryId', v_day.legacy_recovery_id::TEXT, 'authoritySha256', v_effective_authority_sha,
      'dayCanonicalSha256', v_effective_day_sha),
    'sourceAuthority', v_source,
    'sourceAuthoritySha256', encode(sha256(convert_to(
      public."reader_summary_weekly_canonical_json_unbounded"(v_source), 'UTF8'
    )), 'hex')
  );
END;
$function$;

ALTER FUNCTION public."assert_reader_summary_daily_canonical_recovery_v4_legacy"()
  RENAME TO "assert_reader_summary_daily_canonical_recovery_v4_legacy_base";

CREATE FUNCTION public."assert_reader_summary_daily_canonical_recovery_v4_legacy"()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_date DATE;
  v_projection JSONB;
BEGIN
  v_projection := public."reader_summary_daily_canonical_recovery_v4_original_cutoff_projection"(TRUE);
  IF v_projection IS NULL THEN
    PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_legacy_base"();
    RETURN;
  END IF;
  FOREACH v_date IN ARRAY ARRAY[
    DATE '2026-07-23', DATE '2026-07-24', DATE '2026-07-25', DATE '2026-07-26',
    DATE '2026-07-27', DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
  ] LOOP
    PERFORM public."reader_summary_daily_canonical_recovery_v4_corrected_plan_day"(v_date);
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public."reader_summary_daily_canonical_recovery_v4_plan_ordered"()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  v_days JSONB;
  v_identity TEXT;
BEGIN
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_legacy"();
  SELECT jsonb_agg(public."reader_summary_daily_canonical_recovery_v4_corrected_plan_day"(date)
    ORDER BY date) INTO v_days
  FROM unnest(ARRAY[
    DATE '2026-07-23', DATE '2026-07-24', DATE '2026-07-25', DATE '2026-07-26',
    DATE '2026-07-27', DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
  ]) AS requested(date);
  v_identity := 'reader_summary.daily_canonical_recovery.v4:' || encode(sha256(convert_to(
    c_tenant_id::TEXT || ':' || c_workspace_id::TEXT ||
      ':2026-07-23,2026-07-24,2026-07-25,2026-07-26,2026-07-27,2026-07-28,2026-07-29,2026-07-30',
    'UTF8')), 'hex');
  RETURN jsonb_build_object(
    'schemaVersion', 'reader_summary.daily_canonical_recovery.v4', 'identity', v_identity,
    'tenantId', c_tenant_id::TEXT, 'workspaceId', c_workspace_id::TEXT,
    'requestedUtcDates', jsonb_build_array('2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26',
      '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30'),
    'boundaries', jsonb_build_object('stage', 'pre_model', 'recollectionPerformed', FALSE,
      'backdatingPerformed', FALSE, 'providerWritePerformed', FALSE, 'legacyAdoptionOnly', TRUE),
    'modelContract', jsonb_build_object('purpose', 'social_monitor.reader_summary.weekly.generate',
      'provider', 'codex', 'model', 'gpt-5.6-sol', 'reasoningEffort', 'xhigh',
      'runtimeEngine', 'subscription-runtime-cli', 'selectedOutputKind', 'output_text'),
    'days', v_days
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public."reader_summary_daily_canonical_recovery_v4_plan_grouped"()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  v_date DATE;
  v_days JSONB := '[]'::JSONB;
  v_identity TEXT;
BEGIN
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_legacy"();
  FOR v_date IN SELECT unnest(ARRAY[
    DATE '2026-07-23', DATE '2026-07-24', DATE '2026-07-25', DATE '2026-07-26',
    DATE '2026-07-27', DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
  ]) LOOP
    v_days := v_days || jsonb_build_array(
      public."reader_summary_daily_canonical_recovery_v4_corrected_plan_day"(v_date)
    );
  END LOOP;
  v_identity := 'reader_summary.daily_canonical_recovery.v4:' || encode(sha256(convert_to(
    c_tenant_id::TEXT || ':' || c_workspace_id::TEXT ||
      ':2026-07-23,2026-07-24,2026-07-25,2026-07-26,2026-07-27,2026-07-28,2026-07-29,2026-07-30',
    'UTF8')), 'hex');
  RETURN jsonb_build_object(
    'schemaVersion', 'reader_summary.daily_canonical_recovery.v4', 'identity', v_identity,
    'tenantId', c_tenant_id::TEXT, 'workspaceId', c_workspace_id::TEXT,
    'requestedUtcDates', jsonb_build_array('2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26',
      '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30'),
    'boundaries', jsonb_build_object('stage', 'pre_model', 'recollectionPerformed', FALSE,
      'backdatingPerformed', FALSE, 'providerWritePerformed', FALSE, 'legacyAdoptionOnly', TRUE),
    'modelContract', jsonb_build_object('purpose', 'social_monitor.reader_summary.weekly.generate',
      'provider', 'codex', 'model', 'gpt-5.6-sol', 'reasoningEffort', 'xhigh',
      'runtimeEngine', 'subscription-runtime-cli', 'selectedOutputKind', 'output_text'),
    'days', v_days
  );
END;
$function$;

ALTER FUNCTION public."assert_reader_summary_daily_canonical_recovery_v4_binding"()
  RENAME TO "assert_reader_summary_daily_canonical_recovery_v4_binding_base";

CREATE FUNCTION public."assert_reader_summary_daily_canonical_recovery_v4_binding"()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
BEGIN
  -- Bootstrap already compared ordered/grouped reconstructions before immutable stored rows became runtime authority.
  -- Runtime revalidates immutable legacy plus persisted V4 binding.
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_legacy"();
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding_base"();
END;
$function$;

CREATE OR REPLACE FUNCTION public."bootstrap_reader_summary_daily_canonical_recovery_v4"()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_legacy_sha CONSTANT TEXT := '7fa94c8538f55592349e820685dc4d34d84c4f3a4afe9165e18df6271d7816f3';
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  v_authorities INTEGER; v_before JSONB; v_enabled INTEGER; v_existing JSONB;
  v_first JSONB; v_first_bytes BYTEA; v_first_sha TEXT; v_leases INTEGER;
  v_legacy_before JSONB; v_matching_legacy INTEGER; v_plans INTEGER; v_second JSONB;
  v_updates INTEGER;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 bootstrap requires SERIALIZABLE writable transaction';
  END IF;
  -- Block every claim path before taking V4 row locks or changing immutable triggers.
  LOCK TABLE public."reader_summary_daily_canonical_recovery_v4_plans",
    public."reader_summary_daily_canonical_recovery_v4_authorities"
    IN ACCESS EXCLUSIVE MODE;
  -- Lock the complete mutable V4 scope in a stable order before its post-lock recount.
  PERFORM plan."ordinal" FROM public."reader_summary_daily_canonical_recovery_v4_plans" AS plan
  WHERE plan."tenant_id" = c_tenant_id AND plan."workspace_id" = c_workspace_id
  ORDER BY plan."ordinal" FOR UPDATE OF plan;
  PERFORM authority."requested_utc_date" FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
  WHERE authority."tenant_id" = c_tenant_id AND authority."workspace_id" = c_workspace_id
  ORDER BY authority."requested_utc_date" FOR UPDATE OF authority;
  PERFORM lease."requested_utc_date" FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id AND lease."workspace_id" = c_workspace_id
  ORDER BY lease."requested_utc_date" FOR UPDATE OF lease;
  SELECT count(*)::INTEGER INTO v_plans FROM public."reader_summary_daily_canonical_recovery_v4_plans"
  WHERE "tenant_id" = c_tenant_id AND "workspace_id" = c_workspace_id;
  SELECT count(*)::INTEGER INTO v_authorities FROM public."reader_summary_daily_canonical_recovery_v4_authorities"
  WHERE "tenant_id" = c_tenant_id AND "workspace_id" = c_workspace_id;
  SELECT count(*)::INTEGER INTO v_leases FROM public."reader_summary_daily_canonical_recovery_v4_leases"
  WHERE "tenant_id" = c_tenant_id AND "workspace_id" = c_workspace_id;
  IF v_plans = 2 AND v_authorities = 8 AND v_leases = 8 THEN
    IF EXISTS (SELECT 1 FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
      WHERE lease."tenant_id" = c_tenant_id AND lease."workspace_id" = c_workspace_id
        AND (lease."state" <> 'READY' OR lease."fencing_token" <> 0
          OR lease."pre_model_consumed_at" IS NOT NULL OR lease."lease_owner" IS NOT NULL
          OR lease."leased_at" IS NOT NULL OR lease."lease_expires_at" IS NOT NULL
          OR lease."absolute_expires_at" IS NOT NULL OR lease."running_at" IS NOT NULL
          OR lease."completed_at" IS NOT NULL OR lease."failed_ambiguous_at" IS NOT NULL
          OR lease."response_bytes" IS NOT NULL OR lease."response_sha256" IS NOT NULL
          OR lease."attestation" IS NOT NULL OR lease."attestation_bytes" IS NOT NULL
          OR lease."attestation_sha256" IS NOT NULL OR lease."receipt_bytes" IS NOT NULL
          OR lease."receipt_sha256" IS NOT NULL OR lease."reader_summary_job_id" IS NOT NULL
          OR lease."reader_summary_artifact_id" IS NOT NULL OR lease."publication_id" IS NOT NULL
          OR lease."publication_report_sha256" IS NOT NULL OR lease."publication_proof_sha256" IS NOT NULL
          OR lease."weekly_evidence_sha256" IS NOT NULL OR lease."public_evidence_sha256" IS NOT NULL
          OR lease."public_frontend_sha256" IS NOT NULL OR lease."publication_prepared_at" IS NOT NULL
          OR lease."finalized_at" IS NOT NULL)) THEN
      RAISE EXCEPTION 'daily v4 bootstrap refuses consumed, modeled, or published state';
    END IF;
    PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding_base"();
    SELECT "canonical_record" INTO STRICT v_existing
    FROM public."reader_summary_daily_canonical_recovery_v4_plans"
    WHERE "tenant_id" = c_tenant_id AND "workspace_id" = c_workspace_id AND "ordinal" = 1;
    v_first := public."reader_summary_daily_canonical_recovery_v4_plan_ordered"();
    v_second := public."reader_summary_daily_canonical_recovery_v4_plan_grouped"();
    v_first_bytes := convert_to(public."reader_summary_weekly_canonical_json_unbounded"(v_first), 'UTF8');
    v_first_sha := encode(sha256(v_first_bytes), 'hex');
    IF v_first IS DISTINCT FROM v_second OR v_first_bytes IS DISTINCT FROM convert_to(
        public."reader_summary_weekly_canonical_json_unbounded"(v_second), 'UTF8') THEN
      RAISE EXCEPTION 'daily v4 plans are not independently byte-identical';
    END IF;
    IF v_existing IS NOT DISTINCT FROM v_first THEN
      PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
      RETURN;
    END IF;
    -- The 20260801130000 correction is append-only: V4 reads its exact alias and never rewrites it.
    PERFORM public."reader_summary_daily_canonical_recovery_v4_original_cutoff_projection"(TRUE);
    IF jsonb_array_length(COALESCE(v_existing->'days', '[]'::JSONB)) <> 8
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_existing->'days') AS planned(value)
      WHERE planned.value->>'requestedUtcDate' <= '2026-07-28'
        AND planned.value->'legacy'->>'authoritySha256' IS DISTINCT FROM c_legacy_sha)
      OR EXISTS (SELECT 1 FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
        LEFT JOIN public."reader_summary_production_recovery_days" AS day
          ON day."tenant_id" = authority."tenant_id" AND day."workspace_id" = authority."workspace_id"
            AND day."requested_utc_date" = authority."requested_utc_date"
        LEFT JOIN public."reader_summary_production_recovery_leases" AS legacy
          ON legacy."id" = day."recovery_id" AND legacy."tenant_id" = day."tenant_id"
            AND legacy."workspace_id" = day."workspace_id"
        LEFT JOIN LATERAL (SELECT public."reader_summary_daily_canonical_recovery_v4_source_authority"(
          c_tenant_id, c_workspace_id, authority."requested_utc_date",
          CASE legacy."canonical_record"->>'schemaVersion'
            WHEN 'reader_summary.production_recovery_authority.v2' THEN legacy."issued_at"
            ELSE (legacy."canonical_record"->'boundaries'->>'authorityCutoffAt')::TIMESTAMPTZ END,
          day."provider_evidence", day."github_evidence") AS record) AS expected ON TRUE
        WHERE authority."tenant_id" = c_tenant_id AND authority."workspace_id" = c_workspace_id
          AND (day."recovery_id" IS NULL OR legacy."id" IS NULL
            OR authority."legacy_recovery_id" IS DISTINCT FROM legacy."id"
            OR btrim(authority."legacy_day_canonical_sha256") IS DISTINCT FROM btrim(day."canonical_sha256")
            OR authority."source_authority_record" IS DISTINCT FROM expected.record
            OR authority."source_authority_bytes" IS DISTINCT FROM convert_to(
              public."reader_summary_weekly_canonical_json_unbounded"(expected.record), 'UTF8')
            OR btrim(authority."source_authority_sha256") IS DISTINCT FROM
              encode(sha256(authority."source_authority_bytes"), 'hex')
            OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_existing->'days') AS planned(value)
              WHERE planned.value->>'requestedUtcDate' = to_char(authority."requested_utc_date", 'YYYY-MM-DD')
                AND planned.value->'legacy'->>'recoveryId' = legacy."id"::TEXT
                AND planned.value->'legacy'->>'authoritySha256' = btrim(legacy."canonical_sha256")
                AND planned.value->'legacy'->>'dayCanonicalSha256' = btrim(day."canonical_sha256")
                AND planned.value->>'sourceAuthoritySha256' = btrim(authority."source_authority_sha256")))) THEN
      RAISE EXCEPTION 'daily v4 bootstrap old READY binding diverged';
    END IF;
    SELECT jsonb_build_object('alias', (SELECT to_jsonb(alias) FROM public."reader_summary_production_recovery_authority_corrections" AS alias
        WHERE alias."recovery_id" = '0b5e172f-743e-52b5-807c-f54631295def'),
      'lease', (SELECT jsonb_agg(to_jsonb(legacy) ORDER BY legacy."id") FROM public."reader_summary_production_recovery_leases" AS legacy
        WHERE legacy."tenant_id" = c_tenant_id AND legacy."workspace_id" = c_workspace_id AND legacy."canonical_record"->>'schemaVersion' IN ('reader_summary.production_recovery_authority.v2', 'reader_summary.production_recovery_gap_authority.v3')),
      'days', (SELECT jsonb_agg(to_jsonb(day) ORDER BY day."requested_utc_date") FROM public."reader_summary_production_recovery_days" AS day JOIN public."reader_summary_production_recovery_leases" AS legacy ON legacy."id" = day."recovery_id"
        WHERE legacy."tenant_id" = c_tenant_id AND legacy."workspace_id" = c_workspace_id AND legacy."canonical_record"->>'schemaVersion' IN ('reader_summary.production_recovery_authority.v2', 'reader_summary.production_recovery_gap_authority.v3')),
      'dryRuns', (SELECT jsonb_agg(to_jsonb(dry) ORDER BY dry."recovery_id", dry."ordinal") FROM public."reader_summary_production_recovery_dry_runs" AS dry JOIN public."reader_summary_production_recovery_leases" AS legacy ON legacy."id" = dry."recovery_id"
        WHERE legacy."tenant_id" = c_tenant_id AND legacy."workspace_id" = c_workspace_id AND legacy."canonical_record"->>'schemaVersion' IN ('reader_summary.production_recovery_authority.v2', 'reader_summary.production_recovery_gap_authority.v3'))) INTO v_legacy_before;
    SELECT jsonb_build_object('stable', jsonb_build_object(
      'plans', (SELECT jsonb_agg(to_jsonb(plan) - ARRAY['canonical_record','canonical_bytes','canonical_sha256']::TEXT[] ORDER BY plan."ordinal") FROM public."reader_summary_daily_canonical_recovery_v4_plans" AS plan WHERE plan."tenant_id" = c_tenant_id AND plan."workspace_id" = c_workspace_id),
      'authorities', (SELECT jsonb_agg(to_jsonb(authority) - ARRAY['source_authority_record','source_authority_bytes','source_authority_sha256']::TEXT[] ORDER BY authority."requested_utc_date") FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority WHERE authority."tenant_id" = c_tenant_id AND authority."workspace_id" = c_workspace_id),
      'leases', (SELECT jsonb_agg(to_jsonb(lease) - ARRAY['source_authority_sha256','model_job_identity']::TEXT[] ORDER BY lease."requested_utc_date") FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease WHERE lease."tenant_id" = c_tenant_id AND lease."workspace_id" = c_workspace_id)),
      'untouched', jsonb_build_object('authorities', (SELECT jsonb_agg(to_jsonb(authority) ORDER BY authority."requested_utc_date") FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority WHERE authority."tenant_id" = c_tenant_id AND authority."workspace_id" = c_workspace_id AND authority."requested_utc_date" NOT IN (DATE '2026-07-23', DATE '2026-07-24')),
        'leases', (SELECT jsonb_agg(to_jsonb(lease) ORDER BY lease."requested_utc_date") FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease WHERE lease."tenant_id" = c_tenant_id AND lease."workspace_id" = c_workspace_id AND lease."requested_utc_date" NOT IN (DATE '2026-07-23', DATE '2026-07-24')))) INTO v_before;
    ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_plans" DISABLE TRIGGER "reader_summary_daily_canonical_recovery_v4_plans_immutable";
    ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_authorities" DISABLE TRIGGER "rs_daily_recovery_v4_authorities_immutable";
    UPDATE public."reader_summary_daily_canonical_recovery_v4_plans" SET "canonical_record" = v_first,
      "canonical_bytes" = v_first_bytes, "canonical_sha256" = v_first_sha
    WHERE "tenant_id" = c_tenant_id AND "workspace_id" = c_workspace_id;
    GET DIAGNOSTICS v_updates = ROW_COUNT;
    IF v_updates <> 2 THEN RAISE EXCEPTION 'daily v4 corrected plan transition was partial'; END IF;
    UPDATE public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
    SET "source_authority_record" = planned.value->'sourceAuthority',
      "source_authority_bytes" = convert_to(public."reader_summary_weekly_canonical_json_unbounded"(planned.value->'sourceAuthority'), 'UTF8'),
      "source_authority_sha256" = planned.value->>'sourceAuthoritySha256'
    FROM jsonb_array_elements(v_first->'days') AS planned(value)
    WHERE authority."tenant_id" = c_tenant_id AND authority."workspace_id" = c_workspace_id
      AND authority."requested_utc_date" = (planned.value->>'requestedUtcDate')::DATE
      AND authority."requested_utc_date" IN (DATE '2026-07-23', DATE '2026-07-24');
    GET DIAGNOSTICS v_updates = ROW_COUNT;
    IF v_updates <> 2 THEN RAISE EXCEPTION 'daily v4 corrected authority transition was partial'; END IF;
    UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    SET "source_authority_sha256" = planned.value->>'sourceAuthoritySha256',
      "model_job_identity" = public."reader_summary_daily_canonical_recovery_v4_model_identity"(
        lease."tenant_id", lease."workspace_id", lease."requested_utc_date", planned.value->>'sourceAuthoritySha256')
    FROM jsonb_array_elements(v_first->'days') AS planned(value)
    WHERE lease."tenant_id" = c_tenant_id AND lease."workspace_id" = c_workspace_id
      AND lease."requested_utc_date" = (planned.value->>'requestedUtcDate')::DATE
      AND lease."requested_utc_date" IN (DATE '2026-07-23', DATE '2026-07-24');
    GET DIAGNOSTICS v_updates = ROW_COUNT;
    IF v_updates <> 2 THEN RAISE EXCEPTION 'daily v4 corrected lease transition was partial'; END IF;
    ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_authorities" ENABLE TRIGGER "rs_daily_recovery_v4_authorities_immutable";
    ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_plans" ENABLE TRIGGER "reader_summary_daily_canonical_recovery_v4_plans_immutable";
    SELECT count(*)::INTEGER INTO v_enabled FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgrelid IN ('public.reader_summary_daily_canonical_recovery_v4_plans'::regclass,
        'public.reader_summary_daily_canonical_recovery_v4_authorities'::regclass)
      AND trigger.tgname IN ('reader_summary_daily_canonical_recovery_v4_plans_immutable', 'rs_daily_recovery_v4_authorities_immutable')
      AND trigger.tgenabled = 'O' AND NOT trigger.tgisinternal;
    IF v_enabled <> 2 THEN RAISE EXCEPTION 'daily v4 corrected transition left an immutable trigger disabled'; END IF;
    PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
    SELECT count(*)::INTEGER INTO v_plans FROM public."reader_summary_daily_canonical_recovery_v4_plans" WHERE "tenant_id" = c_tenant_id AND "workspace_id" = c_workspace_id;
    SELECT count(*)::INTEGER INTO v_authorities FROM public."reader_summary_daily_canonical_recovery_v4_authorities" WHERE "tenant_id" = c_tenant_id AND "workspace_id" = c_workspace_id;
    SELECT count(*)::INTEGER INTO v_leases FROM public."reader_summary_daily_canonical_recovery_v4_leases" WHERE "tenant_id" = c_tenant_id AND "workspace_id" = c_workspace_id;
    IF v_plans <> 2 OR v_authorities <> 8 OR v_leases <> 8 OR v_before IS DISTINCT FROM jsonb_build_object('stable', jsonb_build_object(
      'plans', (SELECT jsonb_agg(to_jsonb(plan) - ARRAY['canonical_record','canonical_bytes','canonical_sha256']::TEXT[] ORDER BY plan."ordinal") FROM public."reader_summary_daily_canonical_recovery_v4_plans" AS plan WHERE plan."tenant_id" = c_tenant_id AND plan."workspace_id" = c_workspace_id),
      'authorities', (SELECT jsonb_agg(to_jsonb(authority) - ARRAY['source_authority_record','source_authority_bytes','source_authority_sha256']::TEXT[] ORDER BY authority."requested_utc_date") FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority WHERE authority."tenant_id" = c_tenant_id AND authority."workspace_id" = c_workspace_id),
      'leases', (SELECT jsonb_agg(to_jsonb(lease) - ARRAY['source_authority_sha256','model_job_identity']::TEXT[] ORDER BY lease."requested_utc_date") FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease WHERE lease."tenant_id" = c_tenant_id AND lease."workspace_id" = c_workspace_id)),
      'untouched', jsonb_build_object('authorities', (SELECT jsonb_agg(to_jsonb(authority) ORDER BY authority."requested_utc_date") FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority WHERE authority."tenant_id" = c_tenant_id AND authority."workspace_id" = c_workspace_id AND authority."requested_utc_date" NOT IN (DATE '2026-07-23', DATE '2026-07-24')),
        'leases', (SELECT jsonb_agg(to_jsonb(lease) ORDER BY lease."requested_utc_date") FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease WHERE lease."tenant_id" = c_tenant_id AND lease."workspace_id" = c_workspace_id AND lease."requested_utc_date" NOT IN (DATE '2026-07-23', DATE '2026-07-24'))))
      OR v_legacy_before IS DISTINCT FROM jsonb_build_object('alias', (SELECT to_jsonb(alias) FROM public."reader_summary_production_recovery_authority_corrections" AS alias WHERE alias."recovery_id" = '0b5e172f-743e-52b5-807c-f54631295def'),
        'lease', (SELECT jsonb_agg(to_jsonb(legacy) ORDER BY legacy."id") FROM public."reader_summary_production_recovery_leases" AS legacy WHERE legacy."tenant_id" = c_tenant_id AND legacy."workspace_id" = c_workspace_id AND legacy."canonical_record"->>'schemaVersion' IN ('reader_summary.production_recovery_authority.v2', 'reader_summary.production_recovery_gap_authority.v3')),
        'days', (SELECT jsonb_agg(to_jsonb(day) ORDER BY day."requested_utc_date") FROM public."reader_summary_production_recovery_days" AS day JOIN public."reader_summary_production_recovery_leases" AS legacy ON legacy."id" = day."recovery_id" WHERE legacy."tenant_id" = c_tenant_id AND legacy."workspace_id" = c_workspace_id AND legacy."canonical_record"->>'schemaVersion' IN ('reader_summary.production_recovery_authority.v2', 'reader_summary.production_recovery_gap_authority.v3')),
        'dryRuns', (SELECT jsonb_agg(to_jsonb(dry) ORDER BY dry."recovery_id", dry."ordinal") FROM public."reader_summary_production_recovery_dry_runs" AS dry JOIN public."reader_summary_production_recovery_leases" AS legacy ON legacy."id" = dry."recovery_id" WHERE legacy."tenant_id" = c_tenant_id AND legacy."workspace_id" = c_workspace_id AND legacy."canonical_record"->>'schemaVersion' IN ('reader_summary.production_recovery_authority.v2', 'reader_summary.production_recovery_gap_authority.v3'))) THEN
      RAISE EXCEPTION 'daily v4 corrected transition altered immutable or unchanged evidence';
    END IF;
    IF EXISTS (SELECT 1 FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
      WHERE authority."tenant_id" = c_tenant_id AND authority."workspace_id" = c_workspace_id AND ((authority."requested_utc_date" = DATE '2026-07-23' AND (jsonb_array_length(authority."source_authority_record"->'items') <> 342 OR (SELECT count(*) FROM jsonb_array_elements(authority."source_authority_record"->'items') AS item(value) WHERE item.value->>'providerKey' = 'rss') <> 75))
         OR (authority."requested_utc_date" = DATE '2026-07-24' AND (jsonb_array_length(authority."source_authority_record"->'items') <> 350 OR (SELECT count(*) FROM jsonb_array_elements(authority."source_authority_record"->'items') AS item(value) WHERE item.value->>'providerKey' = 'rss') <> 67)))) THEN
      RAISE EXCEPTION 'daily v4 corrected authority totals diverged';
    END IF;
    RETURN;
  ELSIF v_plans <> 0 OR v_authorities <> 0 OR v_leases <> 0 THEN
    RAISE EXCEPTION 'daily v4 bootstrap requires empty or exact READY authority state';
  END IF;
  SELECT count(*)::INTEGER INTO v_matching_legacy FROM public."reader_summary_production_recovery_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id AND lease."workspace_id" = c_workspace_id AND ((lease."canonical_record"->>'schemaVersion' = 'reader_summary.production_recovery_authority.v2' AND lease."canonical_record"->'requestedUtcDates' = jsonb_build_array('2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27', '2026-07-28')) OR (lease."canonical_record"->>'schemaVersion' = 'reader_summary.production_recovery_gap_authority.v3' AND lease."canonical_record"->'requestedUtcDates' = jsonb_build_array('2026-07-29', '2026-07-30', '2026-07-31')));
  IF v_matching_legacy < 2 THEN RETURN; END IF;
  IF v_matching_legacy <> 2 THEN RAISE EXCEPTION 'daily v4 bootstrap legacy authority set is ambiguous'; END IF;
  v_first := public."reader_summary_daily_canonical_recovery_v4_plan_ordered"();
  v_second := public."reader_summary_daily_canonical_recovery_v4_plan_grouped"();
  v_first_bytes := convert_to(public."reader_summary_weekly_canonical_json_unbounded"(v_first), 'UTF8');
  v_first_sha := encode(sha256(v_first_bytes), 'hex');
  IF v_first IS DISTINCT FROM v_second OR v_first_bytes IS DISTINCT FROM convert_to(public."reader_summary_weekly_canonical_json_unbounded"(v_second), 'UTF8') THEN RAISE EXCEPTION 'daily v4 plans are not independently byte-identical'; END IF;
  INSERT INTO public."reader_summary_daily_canonical_recovery_v4_plans" ("tenant_id", "workspace_id", "ordinal", "canonical_record", "canonical_bytes", "canonical_sha256", "adopted_at") VALUES (c_tenant_id, c_workspace_id, 1, v_first, v_first_bytes, v_first_sha, transaction_timestamp()), (c_tenant_id, c_workspace_id, 2, v_second, v_first_bytes, v_first_sha, transaction_timestamp());
  INSERT INTO public."reader_summary_daily_canonical_recovery_v4_authorities" ("tenant_id", "workspace_id", "requested_utc_date", "legacy_recovery_id", "legacy_day_canonical_sha256", "source_authority_record", "source_authority_bytes", "source_authority_sha256", "adopted_at") SELECT c_tenant_id, c_workspace_id, (day.value->>'requestedUtcDate')::DATE, (day.value->'legacy'->>'recoveryId')::UUID, day.value->'legacy'->>'dayCanonicalSha256', day.value->'sourceAuthority', convert_to(public."reader_summary_weekly_canonical_json_unbounded"(day.value->'sourceAuthority'), 'UTF8'), day.value->>'sourceAuthoritySha256', transaction_timestamp() FROM jsonb_array_elements(v_first->'days') AS day(value);
  INSERT INTO public."reader_summary_daily_canonical_recovery_v4_leases" ("tenant_id", "workspace_id", "requested_utc_date", "source_authority_sha256", "model_job_identity", "state") SELECT c_tenant_id, c_workspace_id, (day.value->>'requestedUtcDate')::DATE, day.value->>'sourceAuthoritySha256', public."reader_summary_daily_canonical_recovery_v4_model_identity"(c_tenant_id, c_workspace_id, (day.value->>'requestedUtcDate')::DATE, day.value->>'sourceAuthoritySha256'), 'READY' FROM jsonb_array_elements(v_first->'days') AS day(value);
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
END;
$function$;

DO $bootstrap_daily_v4_original_cutoff_forward$
BEGIN
  PERFORM public."bootstrap_reader_summary_daily_canonical_recovery_v4"();
END;
$bootstrap_daily_v4_original_cutoff_forward$;

REVOKE ALL ON FUNCTION public."reader_summary_daily_canonical_recovery_v4_original_cutoff_projection"(BOOLEAN),
  public."reader_summary_daily_canonical_recovery_v4_corrected_plan_day"(DATE),
  public."assert_reader_summary_daily_canonical_recovery_v4_legacy"(),
  public."assert_reader_summary_daily_canonical_recovery_v4_legacy_base"(),
  public."reader_summary_daily_canonical_recovery_v4_plan_ordered"(),
  public."reader_summary_daily_canonical_recovery_v4_plan_grouped"(),
  public."assert_reader_summary_daily_canonical_recovery_v4_binding"(),
  public."assert_reader_summary_daily_canonical_recovery_v4_binding_base"(),
  public."bootstrap_reader_summary_daily_canonical_recovery_v4"()
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";

DO $validate_daily_v4_forward_security$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*)::INTEGER INTO v_count
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  JOIN pg_catalog.pg_roles AS owner ON owner.oid = procedure.proowner
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'reader_summary_daily_canonical_recovery_v4_original_cutoff_projection',
      'reader_summary_daily_canonical_recovery_v4_corrected_plan_day',
      'assert_reader_summary_daily_canonical_recovery_v4_legacy',
      'assert_reader_summary_daily_canonical_recovery_v4_legacy_base',
      'reader_summary_daily_canonical_recovery_v4_plan_ordered',
      'reader_summary_daily_canonical_recovery_v4_plan_grouped',
      'assert_reader_summary_daily_canonical_recovery_v4_binding',
      'assert_reader_summary_daily_canonical_recovery_v4_binding_base',
      'bootstrap_reader_summary_daily_canonical_recovery_v4'
    ) AND owner.rolname = 'social_monitor_reader_summary_publication_owner'
      AND procedure.prosecdef
      AND procedure.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
      AND NOT has_function_privilege('public', procedure.oid, 'EXECUTE')
      AND NOT has_function_privilege(
        'social_monitor_reader_summary_daily_terminal', procedure.oid, 'EXECUTE'
      );
  IF v_count <> 9 THEN
    RAISE EXCEPTION 'daily v4 forward function owner, ACL, or search_path diverged';
  END IF;
END;
$validate_daily_v4_forward_security$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
