-- @social-monitor-forward-migration
-- Canonicalize only the six-day recovery idempotency identity with the
-- recovery-specific structural bounds.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

DO $replace_recovery_identity_canonicalizer$
DECLARE
  v_acl ACLITEM[];
  v_config TEXT[];
  v_definition TEXT;
  v_owner OID;
  v_security_definer BOOLEAN;
  v_recovery_evidence_call CONSTANT TEXT :=
    '"reader_summary_production_recovery_canonical_json"(v_evidence)';
  v_recovery_identity_call CONSTANT TEXT :=
    '"reader_summary_production_recovery_canonical_json"(v_identity_body)';
  v_shared_identity_call CONSTANT TEXT :=
    '"reader_summary_weekly_canonical_json"(v_identity_body)';
BEGIN
  SELECT
    pg_catalog.pg_get_functiondef(authority.oid),
    authority.proacl,
    authority.proconfig,
    authority.proowner,
    authority.prosecdef
  INTO STRICT
    v_definition,
    v_acl,
    v_config,
    v_owner,
    v_security_definer
  FROM pg_catalog.pg_proc AS authority
  WHERE authority.oid =
    'persist_reader_summary_production_recovery_v2(jsonb)'
      ::pg_catalog.regprocedure;

  IF (
      pg_catalog.length(v_definition) -
      pg_catalog.length(
        pg_catalog.replace(v_definition, v_shared_identity_call, '')
      )
    ) / pg_catalog.length(v_shared_identity_call) <> 1
    OR pg_catalog.strpos(v_definition, v_recovery_identity_call) <> 0
    OR (
      pg_catalog.length(v_definition) -
      pg_catalog.length(
        pg_catalog.replace(v_definition, v_recovery_evidence_call, '')
      )
    ) / pg_catalog.length(v_recovery_evidence_call) <> 2
    OR NOT v_security_definer
    OR v_config IS DISTINCT FROM
      ARRAY['search_path=pg_catalog, public, pg_temp']::TEXT[]
    OR pg_catalog.pg_get_userbyid(v_owner) IS DISTINCT FROM current_user
    OR pg_catalog.strpos(
      v_definition,
      'reader_summary.production_recovery_authority.v2'
    ) = 0
    OR pg_catalog.strpos(
      v_definition,
      'jsonb_array_length(binding->''days'') <> 6'
    ) = 0 THEN
    RAISE EXCEPTION
      'production recovery identity canonical predecessor diverged';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition,
    v_shared_identity_call,
    v_recovery_identity_call
  );
  EXECUTE v_definition;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS authority
    WHERE authority.oid =
        'persist_reader_summary_production_recovery_v2(jsonb)'
          ::pg_catalog.regprocedure
      AND (
        authority.proacl IS DISTINCT FROM v_acl
        OR authority.proconfig IS DISTINCT FROM v_config
        OR authority.proowner IS DISTINCT FROM v_owner
        OR authority.prosecdef IS DISTINCT FROM v_security_definer
      )
  ) THEN
    RAISE EXCEPTION
      'production recovery identity canonical security contract diverged';
  END IF;
END;
$replace_recovery_identity_canonicalizer$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
