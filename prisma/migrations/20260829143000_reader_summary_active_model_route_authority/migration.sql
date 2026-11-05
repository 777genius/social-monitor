-- @social-monitor-forward-migration
-- Preserve the immutable Daily V4 plan as historical authority while a new,
-- append-only overlay independently authorizes the active high/output_text
-- execution route. Existing receipts remain verifiable, but no new completion
-- or weekly-review write may enter through an unversioned/xhigh route.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE TABLE public."reader_summary_daily_canonical_recovery_v4_route_authorities" (
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "legacy_plan_sha256" CHAR(64) NOT NULL,
  "canonical_record" JSONB NOT NULL,
  "canonical_bytes" BYTEA NOT NULL,
  "canonical_sha256" CHAR(64) NOT NULL,
  "adopted_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "rs_daily_v4_route_authorities_pkey"
    PRIMARY KEY ("tenant_id", "workspace_id"),
  CONSTRAINT "rs_daily_v4_route_authorities_scope_check" CHECK (
    "tenant_id" = '00000000-0000-7000-8000-000000000901'::UUID
    AND "workspace_id" = '00000000-0000-7000-8000-000000000902'::UUID
  ),
  CONSTRAINT "rs_daily_v4_route_authorities_sha_check" CHECK (
    "legacy_plan_sha256" ~ '^[0-9a-f]{64}$'
    AND "canonical_sha256" ~ '^[0-9a-f]{64}$'
    AND btrim("canonical_sha256") = encode(sha256("canonical_bytes"), 'hex')
  ),
  CONSTRAINT "rs_daily_v4_route_authorities_bytes_check" CHECK (
    "canonical_bytes" = convert_to(
      public."reader_summary_weekly_canonical_json_unbounded"("canonical_record"),
      'UTF8'
    )
  ),
  CONSTRAINT "rs_daily_v4_route_authorities_record_check" CHECK (
    jsonb_typeof("canonical_record") = 'object'
    AND public.jsonb_object_length("canonical_record") = 7
    AND "canonical_record" ?& ARRAY[
      'schemaVersion', 'tenantId', 'workspaceId', 'legacyPlanIdentity',
      'legacyPlanSha256', 'supersededModelContract', 'modelContract'
    ]
    AND "canonical_record"->>'schemaVersion' =
      'reader_summary.daily_canonical_recovery_route_authority.v2'
    AND "canonical_record"->>'tenantId' = "tenant_id"::TEXT
    AND "canonical_record"->>'workspaceId' = "workspace_id"::TEXT
    AND "canonical_record"->>'legacyPlanSha256' = btrim("legacy_plan_sha256")
    AND "canonical_record"->'supersededModelContract' = jsonb_build_object(
      'purpose', 'social_monitor.reader_summary.weekly.generate',
      'provider', 'codex',
      'model', 'gpt-5.6-sol',
      'reasoningEffort', 'xhigh',
      'runtimeEngine', 'subscription-runtime-cli',
      'selectedOutputKind', 'output_text'
    )
    AND "canonical_record"->'modelContract' = jsonb_build_object(
      'purpose', 'social_monitor.reader_summary.daily.canonical_recovery.v2',
      'provider', 'codex',
      'model', 'gpt-5.6-sol',
      'reasoningEffort', 'high',
      'runtimeEngine', 'subscription-runtime-cli',
      'selectedOutputKind', 'output_text'
    )
  )
);

ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_route_authorities"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_route_authorities"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "rs_daily_v4_route_authorities_owner_only"
  ON public."reader_summary_daily_canonical_recovery_v4_route_authorities"
  FOR ALL TO "social_monitor_reader_summary_publication_owner"
  USING (TRUE) WITH CHECK (TRUE);

CREATE FUNCTION public."reject_rs_daily_v4_route_authority_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
BEGIN
  RAISE EXCEPTION 'daily canonical recovery v4 route authority is immutable';
END;
$function$;

CREATE TRIGGER "rs_daily_v4_route_authorities_immutable"
BEFORE UPDATE OR DELETE
ON public."reader_summary_daily_canonical_recovery_v4_route_authorities"
FOR EACH ROW EXECUTE FUNCTION
  public."reject_rs_daily_v4_route_authority_mutation"();
CREATE TRIGGER "rs_daily_v4_route_authorities_no_truncate"
BEFORE TRUNCATE
ON public."reader_summary_daily_canonical_recovery_v4_route_authorities"
FOR EACH STATEMENT EXECUTE FUNCTION
  public."reject_rs_daily_v4_route_authority_mutation"();

CREATE FUNCTION public."rs_daily_v4_active_route_record"(
  target_tenant_id UUID,
  target_workspace_id UUID
) RETURNS JSONB LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_legacy_contract CONSTANT JSONB := jsonb_build_object(
    'purpose', 'social_monitor.reader_summary.weekly.generate',
    'provider', 'codex', 'model', 'gpt-5.6-sol',
    'reasoningEffort', 'xhigh', 'runtimeEngine', 'subscription-runtime-cli',
    'selectedOutputKind', 'output_text'
  );
  c_active_contract CONSTANT JSONB := jsonb_build_object(
    'purpose', 'social_monitor.reader_summary.daily.canonical_recovery.v2',
    'provider', 'codex', 'model', 'gpt-5.6-sol',
    'reasoningEffort', 'high', 'runtimeEngine', 'subscription-runtime-cli',
    'selectedOutputKind', 'output_text'
  );
  v_first public."reader_summary_daily_canonical_recovery_v4_plans"%ROWTYPE;
  v_second public."reader_summary_daily_canonical_recovery_v4_plans"%ROWTYPE;
BEGIN
  IF target_tenant_id IS DISTINCT FROM c_tenant_id
    OR target_workspace_id IS DISTINCT FROM c_workspace_id THEN
    RAISE EXCEPTION 'daily canonical recovery v4 active route scope is invalid';
  END IF;
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
  SELECT * INTO STRICT v_first
  FROM public."reader_summary_daily_canonical_recovery_v4_plans" AS plan
  WHERE plan."tenant_id" = c_tenant_id
    AND plan."workspace_id" = c_workspace_id
    AND plan."ordinal" = 1
  FOR KEY SHARE;
  SELECT * INTO STRICT v_second
  FROM public."reader_summary_daily_canonical_recovery_v4_plans" AS plan
  WHERE plan."tenant_id" = c_tenant_id
    AND plan."workspace_id" = c_workspace_id
    AND plan."ordinal" = 2
  FOR KEY SHARE;
  IF v_first."canonical_record" IS DISTINCT FROM v_second."canonical_record"
    OR v_first."canonical_bytes" IS DISTINCT FROM v_second."canonical_bytes"
    OR btrim(v_first."canonical_sha256") IS DISTINCT FROM
      btrim(v_second."canonical_sha256")
    OR v_first."canonical_record"->>'schemaVersion' IS DISTINCT FROM
      'reader_summary.daily_canonical_recovery.v4'
    OR v_first."canonical_record"->>'tenantId' IS DISTINCT FROM c_tenant_id::TEXT
    OR v_first."canonical_record"->>'workspaceId' IS DISTINCT FROM
      c_workspace_id::TEXT
    OR COALESCE(v_first."canonical_record"->>'identity', '') = ''
    OR v_first."canonical_record"->'modelContract' IS DISTINCT FROM
      c_legacy_contract
    OR v_first."canonical_bytes" IS DISTINCT FROM convert_to(
      public."reader_summary_weekly_canonical_json_unbounded"(
        v_first."canonical_record"
      ), 'UTF8'
    )
    OR btrim(v_first."canonical_sha256") IS DISTINCT FROM
      encode(sha256(v_first."canonical_bytes"), 'hex') THEN
    RAISE EXCEPTION 'daily canonical recovery v4 legacy plan binding diverged';
  END IF;
  RETURN jsonb_build_object(
    'schemaVersion',
      'reader_summary.daily_canonical_recovery_route_authority.v2',
    'tenantId', c_tenant_id::TEXT,
    'workspaceId', c_workspace_id::TEXT,
    'legacyPlanIdentity', v_first."canonical_record"->>'identity',
    'legacyPlanSha256', btrim(v_first."canonical_sha256"),
    'supersededModelContract', c_legacy_contract,
    'modelContract', c_active_contract
  );
END;
$function$;

CREATE FUNCTION public."assert_rs_daily_v4_active_route_authority"(
  target_tenant_id UUID,
  target_workspace_id UUID
) RETURNS VOID LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_expected JSONB;
  v_expected_bytes BYTEA;
  v_expected_sha256 TEXT;
  v_authority
    public."reader_summary_daily_canonical_recovery_v4_route_authorities"%ROWTYPE;
BEGIN
  v_expected := public."rs_daily_v4_active_route_record"(
    target_tenant_id, target_workspace_id
  );
  v_expected_bytes := convert_to(
    public."reader_summary_weekly_canonical_json_unbounded"(v_expected), 'UTF8'
  );
  v_expected_sha256 := encode(sha256(v_expected_bytes), 'hex');
  SELECT * INTO STRICT v_authority
  FROM public."reader_summary_daily_canonical_recovery_v4_route_authorities"
    AS authority
  WHERE authority."tenant_id" = target_tenant_id
    AND authority."workspace_id" = target_workspace_id
  FOR KEY SHARE;
  IF v_authority."canonical_record" IS DISTINCT FROM v_expected
    OR v_authority."canonical_bytes" IS DISTINCT FROM v_expected_bytes
    OR btrim(v_authority."canonical_sha256") IS DISTINCT FROM v_expected_sha256
    OR btrim(v_authority."legacy_plan_sha256") IS DISTINCT FROM
      v_expected->>'legacyPlanSha256' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 active route authority diverged';
  END IF;
END;
$function$;

CREATE FUNCTION public."adopt_rs_daily_v4_active_route_authority"(
  target_tenant_id UUID,
  target_workspace_id UUID
) RETURNS VOID LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_record JSONB;
  v_bytes BYTEA;
  v_sha256 TEXT;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off' THEN
    RAISE EXCEPTION
      'daily canonical recovery v4 active route adoption requires SERIALIZABLE write';
  END IF;
  v_record := public."rs_daily_v4_active_route_record"(
    target_tenant_id, target_workspace_id
  );
  v_bytes := convert_to(
    public."reader_summary_weekly_canonical_json_unbounded"(v_record), 'UTF8'
  );
  v_sha256 := encode(sha256(v_bytes), 'hex');
  INSERT INTO
    public."reader_summary_daily_canonical_recovery_v4_route_authorities" (
      "tenant_id", "workspace_id", "legacy_plan_sha256", "canonical_record",
      "canonical_bytes", "canonical_sha256", "adopted_at"
    ) VALUES (
      target_tenant_id, target_workspace_id, v_record->>'legacyPlanSha256',
      v_record, v_bytes, v_sha256, transaction_timestamp()
    )
  ON CONFLICT ("tenant_id", "workspace_id") DO NOTHING;
  PERFORM public."assert_rs_daily_v4_active_route_authority"(
    target_tenant_id, target_workspace_id
  );
END;
$function$;

-- A plan may be absent in a pristine database until the bounded recovery
-- bootstrap obtains its legacy source authorities. Adopt now when possible;
-- the rewritten claim performs the same exact adoption after later bootstrap.
DO $adopt_existing_daily_v4_active_route$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  v_plan_count INTEGER;
BEGIN
  SELECT count(*)::INTEGER INTO v_plan_count
  FROM public."reader_summary_daily_canonical_recovery_v4_plans" AS plan
  WHERE plan."tenant_id" = c_tenant_id
    AND plan."workspace_id" = c_workspace_id;
  IF v_plan_count = 2 THEN
    PERFORM public."adopt_rs_daily_v4_active_route_authority"(
      c_tenant_id, c_workspace_id
    );
  ELSIF v_plan_count <> 0 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 plan set is partial';
  END IF;
END;
$adopt_existing_daily_v4_active_route$;

-- Require the append-only active route authority before claim can consume a
-- lease. The exact anchor makes an unexpected prior function edit fatal.
DO $bind_daily_v4_claim_to_active_route$
DECLARE
  v_definition TEXT;
  v_anchor CONSTANT TEXT := $anchor$
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();$anchor$;
  v_replacement CONSTANT TEXT := $replacement$
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
  PERFORM public."adopt_rs_daily_v4_active_route_authority"(
    target_tenant_id, target_workspace_id
  );$replacement$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid) INTO STRICT v_definition
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname =
      'claim_reader_summary_daily_canonical_recovery_v4';
  IF pg_catalog.strpos(v_definition, v_anchor) = 0
    OR pg_catalog.strpos(v_definition, v_replacement) <> 0 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 claim route anchor diverged';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_anchor, v_replacement);
  IF pg_catalog.strpos(v_definition, v_anchor) = 0
    OR pg_catalog.strpos(v_definition, v_replacement) = 0 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 claim route rewrite failed';
  END IF;
  EXECUTE v_definition;
END;
$bind_daily_v4_claim_to_active_route$;

-- New completions accept only the dedicated active purpose and high effort.
-- Existing persisted legacy receipts are not rewritten or deleted.
DO $cut_daily_v4_completion_to_active_route$
DECLARE
  v_definition TEXT;
  v_old_purpose CONSTANT TEXT :=
    'social_monitor.reader_summary.weekly.generate';
  v_new_purpose CONSTANT TEXT :=
    'social_monitor.reader_summary.daily.canonical_recovery.v2';
  v_anchor CONSTANT TEXT := $anchor$
  END IF;
  v_attempt := public."lock_reader_summary_daily_canonical_recovery_v4_effective_attempt"($anchor$;
  v_replacement CONSTANT TEXT := $replacement$
  END IF;
  PERFORM public."assert_rs_daily_v4_active_route_authority"(
    target_tenant_id, target_workspace_id
  );
  v_attempt := public."lock_reader_summary_daily_canonical_recovery_v4_effective_attempt"($replacement$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid) INTO STRICT v_definition
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname =
      'complete_reader_summary_daily_canonical_recovery_v4';
  IF pg_catalog.strpos(v_definition, v_old_purpose) = 0
    OR pg_catalog.strpos(v_definition, v_new_purpose) <> 0
    OR pg_catalog.strpos(v_definition,
      'v_attestation->>''reasoningEffort'' IS DISTINCT FROM ''xhigh''') = 0
    OR pg_catalog.strpos(v_definition, v_anchor) = 0
    OR pg_catalog.strpos(v_definition, v_replacement) <> 0 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 completion preimage diverged';
  END IF;
  v_definition := pg_catalog.replace(
    v_definition, v_old_purpose, v_new_purpose
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'v_attestation->>''reasoningEffort'' IS DISTINCT FROM ''xhigh''',
    'v_attestation->>''reasoningEffort'' IS DISTINCT FROM ''high'''
  );
  v_definition := pg_catalog.replace(v_definition, v_anchor, v_replacement);
  IF pg_catalog.strpos(v_definition, v_old_purpose) <> 0
    OR pg_catalog.strpos(v_definition,
      'v_attestation->>''reasoningEffort'' IS DISTINCT FROM ''xhigh''') <> 0
    OR pg_catalog.strpos(v_definition, v_new_purpose) = 0
    OR pg_catalog.strpos(v_definition,
      'v_attestation->>''reasoningEffort'' IS DISTINCT FROM ''high''') = 0
    OR pg_catalog.strpos(v_definition, v_replacement) = 0 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 completion route rewrite failed';
  END IF;
  EXECUTE v_definition;
END;
$cut_daily_v4_completion_to_active_route$;

-- V3 evidence may already contain the frozen legacy/xhigh attestation. Extend
-- verification with an exact paired identity; crossed purpose/effort pairs are
-- rejected. This does not create a legacy execution admission.
DO $extend_daily_v4_v3_historical_receipt_verification$
DECLARE
  v_name TEXT;
  v_definition TEXT;
  v_purpose_anchor CONSTANT TEXT := $anchor$
    OR v_receipt->'attestation'->>'purpose' IS DISTINCT FROM
      'social_monitor.reader_summary.weekly.generate'$anchor$;
  v_effort_anchor CONSTANT TEXT := $anchor$
    OR v_receipt->'attestation'->>'reasoningEffort' IS DISTINCT FROM 'xhigh'$anchor$;
  v_pair CONSTANT TEXT := $replacement$
    OR NOT (
      (v_receipt->'attestation'->>'purpose' IS NOT DISTINCT FROM
        'social_monitor.reader_summary.weekly.generate'
       AND v_receipt->'attestation'->>'reasoningEffort' IS NOT DISTINCT FROM
        'xhigh')
      OR
      (v_receipt->'attestation'->>'purpose' IS NOT DISTINCT FROM
        'social_monitor.reader_summary.daily.canonical_recovery.v2'
       AND v_receipt->'attestation'->>'reasoningEffort' IS NOT DISTINCT FROM
        'high')
    )$replacement$;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'verify_reader_summary_daily_canonical_recovery_v4_provenance_v3',
    'record_reader_summary_daily_canonical_recovery_v4_evidence_v3'
  ] LOOP
    SELECT pg_catalog.pg_get_functiondef(procedure.oid) INTO STRICT v_definition
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = v_name;
    IF pg_catalog.strpos(v_definition, v_purpose_anchor) = 0
      OR pg_catalog.strpos(v_definition, v_effort_anchor) = 0
      OR pg_catalog.strpos(v_definition, v_pair) <> 0 THEN
      RAISE EXCEPTION 'daily V4 V3 receipt verifier % preimage diverged', v_name;
    END IF;
    v_definition := pg_catalog.replace(
      v_definition, v_purpose_anchor, v_pair
    );
    v_definition := pg_catalog.replace(v_definition, v_effort_anchor, '');
    IF pg_catalog.strpos(v_definition, v_purpose_anchor) <> 0
      OR pg_catalog.strpos(v_definition, v_effort_anchor) <> 0
      OR pg_catalog.strpos(v_definition, v_pair) = 0 THEN
      RAISE EXCEPTION 'daily V4 V3 receipt verifier % rewrite failed', v_name;
    END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$extend_daily_v4_v3_historical_receipt_verification$;

-- The active weekly producer already emits review.v2/high. Admit only that
-- identity for new append-only rows; existing rows are neither read nor
-- modified by this definition rewrite.
DO $cut_weekly_review_new_writes_to_active_route$
DECLARE
  v_definition TEXT;
  v_old_purpose_predicate CONSTANT TEXT :=
    'v_attestation->>''purpose'' <> '
      '''social_monitor.reader_summary.weekly.review''';
  v_new_purpose_predicate CONSTANT TEXT :=
    'v_attestation->>''purpose'' <> '
      '''social_monitor.reader_summary.weekly.review.v2''';
  v_old_effort_predicate CONSTANT TEXT :=
    'v_attestation->>''reasoningEffort'' <> ''xhigh''';
  v_new_effort_predicate CONSTANT TEXT :=
    'v_attestation->>''reasoningEffort'' <> ''high''';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid) INTO STRICT v_definition
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'persist_reader_summary_weekly_review_manifest';
  IF pg_catalog.strpos(v_definition, v_old_purpose_predicate) = 0
    OR pg_catalog.strpos(v_definition, v_old_effort_predicate) = 0
    OR pg_catalog.strpos(v_definition, v_new_purpose_predicate) <> 0
    OR pg_catalog.strpos(v_definition, v_new_effort_predicate) <> 0 THEN
    RAISE EXCEPTION 'weekly review manifest active route preimage diverged';
  END IF;
  v_definition := pg_catalog.replace(
    v_definition, v_old_purpose_predicate, v_new_purpose_predicate
  );
  v_definition := pg_catalog.replace(
    v_definition, v_old_effort_predicate, v_new_effort_predicate
  );
  IF pg_catalog.strpos(v_definition, v_old_purpose_predicate) <> 0
    OR pg_catalog.strpos(v_definition, v_old_effort_predicate) <> 0
    OR pg_catalog.strpos(v_definition, v_new_purpose_predicate) = 0
    OR pg_catalog.strpos(v_definition, v_new_effort_predicate) = 0 THEN
    RAISE EXCEPTION 'weekly review manifest active route rewrite failed';
  END IF;
  EXECUTE v_definition;
END;
$cut_weekly_review_new_writes_to_active_route$;

REVOKE ALL ON TABLE
  public."reader_summary_daily_canonical_recovery_v4_route_authorities"
FROM PUBLIC,
  "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
REVOKE ALL ON FUNCTION
  public."reject_rs_daily_v4_route_authority_mutation"(),
  public."rs_daily_v4_active_route_record"(UUID, UUID),
  public."assert_rs_daily_v4_active_route_authority"(UUID, UUID),
  public."adopt_rs_daily_v4_active_route_authority"(UUID, UUID)
FROM PUBLIC,
  "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";

SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
