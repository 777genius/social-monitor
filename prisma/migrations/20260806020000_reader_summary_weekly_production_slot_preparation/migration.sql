-- @social-monitor-forward-migration
-- Atomically seal one completed Monday-Sunday authority and prepare the one
-- canonical weekly publication slot consumed by certified persistence.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";

GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";

RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE FUNCTION "prepare_reader_summary_weekly_production_slot"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_scope_type TEXT,
  target_scope_key TEXT,
  target_week_started_on DATE
)
RETURNS TABLE (
  outcome TEXT,
  seal_id TEXT,
  seal_sha256 TEXT,
  week_started_on DATE,
  week_ended_on DATE,
  period_started_at TIMESTAMPTZ,
  period_ended_at TIMESTAMPTZ,
  period_timezone TEXT,
  current_publication_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_created INTEGER;
  v_period_ended_at TIMESTAMPTZ;
  v_period_started_at TIMESTAMPTZ;
  v_publication "reader_summary_publications"%ROWTYPE;
  v_seal_outcome TEXT;
  v_seal_id TEXT;
  v_seal_record JSONB;
  v_seal_sha256 TEXT;
  v_slot "reader_summary_publication_slots"%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off'
    OR current_setting('social_monitor.system_access', TRUE)
      IS DISTINCT FROM 'false'
    OR NOT pg_has_role(
      session_user,
      'social_monitor_reader_summary_publication_runtime',
      'USAGE'
    )
  THEN
    RAISE EXCEPTION
      'weekly production slot preparation requires a writable SERIALIZABLE tenant session';
  END IF;

  SELECT sealed.outcome, sealed.seal_id, btrim(sealed.seal_sha256),
         sealed.canonical_record
  INTO STRICT v_seal_outcome, v_seal_id, v_seal_sha256, v_seal_record
  FROM "seal_reader_summary_weekly_certification"(
    target_tenant_id,
    target_workspace_id,
    target_scope_type,
    target_scope_key,
    target_week_started_on
  ) AS sealed;

  IF v_seal_outcome NOT IN ('sealed', 'replayed')
    OR v_seal_record->>'sealId' IS DISTINCT FROM v_seal_id
    OR v_seal_record->>'sealSha' IS DISTINCT FROM v_seal_sha256
    OR v_seal_record->>'weekStartedOn'
      IS DISTINCT FROM to_char(target_week_started_on, 'YYYY-MM-DD')
    OR v_seal_record->>'weekEndedOn'
      IS DISTINCT FROM to_char(target_week_started_on + 6, 'YYYY-MM-DD')
  THEN
    RAISE EXCEPTION 'weekly production certification seal result diverged';
  END IF;

  v_period_started_at :=
    target_week_started_on::TIMESTAMP AT TIME ZONE 'UTC';
  v_period_ended_at :=
    (target_week_started_on + 7)::TIMESTAMP AT TIME ZONE 'UTC';

  INSERT INTO "reader_summary_publication_slots" (
    "tenant_id", "workspace_id", "scope_type", "scope_key", "cadence",
    "period_started_at", "period_ended_at", "period_timezone",
    "current_publication_id", "updated_at"
  ) VALUES (
    target_tenant_id, target_workspace_id, target_scope_type,
    target_scope_key, 'weekly', v_period_started_at, v_period_ended_at,
    'UTC', NULL, transaction_timestamp()
  ) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  SELECT slot.*
  INTO STRICT v_slot
  FROM "reader_summary_publication_slots" AS slot
  WHERE slot."tenant_id" = target_tenant_id
    AND slot."workspace_id" = target_workspace_id
    AND slot."scope_type" = target_scope_type
    AND slot."scope_key" = target_scope_key
    AND slot."cadence" = 'weekly'
    AND slot."period_started_at" = v_period_started_at
    AND slot."period_ended_at" = v_period_ended_at
    AND slot."period_timezone" = 'UTC'
  FOR UPDATE;

  IF v_slot."current_publication_id" IS NOT NULL THEN
    SELECT publication.*
    INTO v_publication
    FROM "reader_summary_publications" AS publication
    WHERE publication."id" = v_slot."current_publication_id"
    FOR KEY SHARE;

    IF NOT FOUND
      OR v_publication."tenant_id" <> target_tenant_id
      OR v_publication."workspace_id" <> target_workspace_id
      OR v_publication."scope_type" <> target_scope_type
      OR v_publication."scope_key" <> target_scope_key
      OR v_publication."cadence" <> 'weekly'
      OR v_publication."period_started_at" <> v_period_started_at
      OR v_publication."period_ended_at" <> v_period_ended_at
      OR v_publication."period_timezone" <> 'UTC'
      OR v_publication."requested_utc_date" <> target_week_started_on
      OR v_publication."publication_kind" <> 'WEEKLY_CERTIFIED'
      OR v_publication."semantic_status" <> 'COMPLETED'
      OR v_publication."exact_proof"->>'manifestSealId'
        IS DISTINCT FROM v_seal_id
      OR v_publication."exact_proof"->>'manifestSealSha256'
        IS DISTINCT FROM v_seal_sha256
      OR v_publication."exact_proof"->>'weekStartedOn'
        IS DISTINCT FROM to_char(target_week_started_on, 'YYYY-MM-DD')
      OR v_publication."exact_proof"->>'weekEndedOn'
        IS DISTINCT FROM to_char(target_week_started_on + 6, 'YYYY-MM-DD')
    THEN
      RAISE EXCEPTION
        'weekly production canonical slot replay diverged from immutable seal, dates, or publication';
    END IF;
  END IF;

  RETURN QUERY SELECT
    CASE
      WHEN v_seal_outcome = 'sealed' OR v_created = 1 THEN 'prepared'::TEXT
      ELSE 'replayed'::TEXT
    END,
    v_seal_id,
    v_seal_sha256,
    target_week_started_on,
    target_week_started_on + 6,
    v_period_started_at,
    v_period_ended_at,
    'UTC'::TEXT,
    v_slot."current_publication_id";
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  "prepare_reader_summary_weekly_production_slot"(
    UUID, UUID, TEXT, TEXT, DATE
  )
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";

DO $grant_weekly_production_slot_runtime_execute$
DECLARE
  v_runtime_name NAME;
BEGIN
  SELECT member.rolname
  INTO STRICT v_runtime_name
  FROM pg_auth_members AS membership
  JOIN pg_roles AS granted ON granted.oid = membership.roleid
  JOIN pg_roles AS member ON member.oid = membership.member
  WHERE granted.rolname =
      'social_monitor_reader_summary_publication_runtime'
    AND NOT membership.admin_option
    AND membership.inherit_option
    AND NOT membership.set_option;

  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON FUNCTION public.prepare_reader_summary_weekly_production_slot(UUID, UUID, TEXT, TEXT, DATE) FROM %I',
    v_runtime_name
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.prepare_reader_summary_weekly_production_slot(UUID, UUID, TEXT, TEXT, DATE) TO %I',
    v_runtime_name
  );
END
$grant_weekly_production_slot_runtime_execute$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";

REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";

RESET ROLE;
COMMIT;
