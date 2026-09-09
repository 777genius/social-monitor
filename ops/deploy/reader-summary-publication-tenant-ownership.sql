DO $tenant_table_ownership_transfer$
DECLARE
  v_admin_role NAME := current_user;
  v_runtime_role NAME := current_setting(
    'social_monitor.bootstrap_runtime_role'
  )::NAME;
  v_relation RECORD;
  v_type RECORD;
  v_switched_to_runtime BOOLEAN := FALSE;
  v_temporary_owner_membership BOOLEAN := FALSE;
BEGIN
  IF NOT pg_has_role(
    v_admin_role,
    'social_monitor_public_schema_owner',
    'SET'
  ) THEN
    RAISE EXCEPTION 'migration admin cannot assume public schema ownership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles owner ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname NOT IN (
        '_prisma_migrations',
        'reader_summary_artifacts',
        'reader_summary_publications',
        'reader_summary_publication_slots', 'reader_summary_production_recovery_authority_corrections',
        'reader_summary_production_recovery_days',
        'reader_summary_production_recovery_dry_runs',
        'reader_summary_production_recovery_leases',
        'reader_summary_recovery_receipts', 'reader_summary_weekly_certification_seals',
        'reader_summary_daily_canonical_recovery_v4_plans',
        'reader_summary_daily_canonical_recovery_v4_authorities',
        'reader_summary_daily_canonical_recovery_v4_leases',
        'reader_summary_daily_canonical_recovery_v4_ambiguity_retries',
        'reader_summary_daily_canonical_recovery_v4_route_authorities',
        'reader_summary_promotion_v2_rollback_receipts',
        'reader_summary_promotion_v2_canary_publication_receipts',
        'reader_summary_weekly_publication_evidence',
        'reader_summary_weekly_review_manifests'
      )
      AND owner.rolname NOT IN (
        v_admin_role,
        v_runtime_role,
        'social_monitor_public_schema_owner'
      )
  ) THEN
    RAISE EXCEPTION 'ordinary application table has an unexpected owner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles owner ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname NOT IN (
        '_prisma_migrations',
        'reader_summary_artifacts',
        'reader_summary_publications',
        'reader_summary_publication_slots', 'reader_summary_production_recovery_authority_corrections',
        'reader_summary_production_recovery_days',
        'reader_summary_production_recovery_dry_runs',
        'reader_summary_production_recovery_leases',
        'reader_summary_recovery_receipts', 'reader_summary_weekly_certification_seals',
        'reader_summary_promotion_v2_rollback_receipts',
        'reader_summary_promotion_v2_canary_publication_receipts',
        'reader_summary_daily_canonical_recovery_v4_plans',
        'reader_summary_daily_canonical_recovery_v4_authorities',
        'reader_summary_daily_canonical_recovery_v4_leases',
        'reader_summary_daily_canonical_recovery_v4_ambiguity_retries',
        'reader_summary_daily_canonical_recovery_v4_route_authorities',
        'reader_summary_weekly_publication_evidence',
        'reader_summary_weekly_review_manifests'
      )
      AND owner.rolname = v_runtime_role
  ) THEN
    EXECUTE format(
      'GRANT social_monitor_public_schema_owner TO %I WITH ADMIN FALSE',
      v_runtime_role
    );
    EXECUTE format(
      'GRANT social_monitor_public_schema_owner TO %I WITH INHERIT FALSE',
      v_runtime_role
    );
    EXECUTE format(
      'GRANT social_monitor_public_schema_owner TO %I WITH SET TRUE',
      v_runtime_role
    );
    v_temporary_owner_membership := TRUE;
  END IF;

  FOR v_relation IN
    SELECT relation.relname, owner.rolname AS owner_name
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles owner ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname NOT IN (
        '_prisma_migrations',
        'reader_summary_artifacts',
        'reader_summary_publications',
        'reader_summary_publication_slots', 'reader_summary_production_recovery_authority_corrections',
        'reader_summary_production_recovery_days',
        'reader_summary_production_recovery_dry_runs',
        'reader_summary_production_recovery_leases',
        'reader_summary_recovery_receipts', 'reader_summary_weekly_certification_seals',
        'reader_summary_promotion_v2_rollback_receipts',
        'reader_summary_promotion_v2_canary_publication_receipts',
        'reader_summary_daily_canonical_recovery_v4_plans',
        'reader_summary_daily_canonical_recovery_v4_authorities',
        'reader_summary_daily_canonical_recovery_v4_leases',
        'reader_summary_daily_canonical_recovery_v4_ambiguity_retries',
        'reader_summary_daily_canonical_recovery_v4_route_authorities',
        'reader_summary_weekly_publication_evidence',
        'reader_summary_weekly_review_manifests'
      )
      AND owner.rolname IN (v_admin_role, v_runtime_role)
    ORDER BY owner.rolname, relation.relname
  LOOP
    IF v_relation.owner_name = v_runtime_role
      AND NOT v_switched_to_runtime THEN
      EXECUTE format('SET LOCAL ROLE %I', v_runtime_role);
      v_switched_to_runtime := TRUE;
    ELSIF v_relation.owner_name = v_admin_role
      AND v_switched_to_runtime THEN
      EXECUTE 'RESET ROLE';
      v_switched_to_runtime := FALSE;
    END IF;
    EXECUTE format(
      CASE WHEN v_relation.relname IN (
        'reader_summary_new_input_refresh_reconciliations',
        'reader_summary_new_input_refresh_reconciliation_counters'
      ) THEN 'GRANT SELECT, INSERT ON TABLE public.%I TO %I'
      ELSE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO %I' END,
      v_relation.relname,
      v_runtime_role
    );
    EXECUTE format(
      'ALTER TABLE public.%I OWNER TO social_monitor_public_schema_owner',
      v_relation.relname
    );
  END LOOP;

  IF v_switched_to_runtime THEN
    EXECUTE 'RESET ROLE';
    v_switched_to_runtime := FALSE;
  END IF;

  FOR v_type IN
    SELECT type.typname, owner.rolname AS owner_name
    FROM pg_type type
    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
    JOIN pg_roles owner ON owner.oid = type.typowner
    WHERE namespace.nspname = 'public'
      AND type.typtype = 'e'
      AND owner.rolname IN (v_admin_role, v_runtime_role)
    ORDER BY owner.rolname, type.typname
  LOOP
    IF v_type.owner_name = v_runtime_role
      AND NOT v_switched_to_runtime THEN
      EXECUTE format('SET LOCAL ROLE %I', v_runtime_role);
      v_switched_to_runtime := TRUE;
    ELSIF v_type.owner_name = v_admin_role
      AND v_switched_to_runtime THEN
      EXECUTE 'RESET ROLE';
      v_switched_to_runtime := FALSE;
    END IF;
    EXECUTE format(
      'ALTER TYPE public.%I OWNER TO social_monitor_public_schema_owner',
      v_type.typname
    );
  END LOOP;

  IF v_switched_to_runtime THEN
    EXECUTE 'RESET ROLE';
  END IF;
  IF v_temporary_owner_membership THEN
    EXECUTE format(
      'REVOKE social_monitor_public_schema_owner FROM %I',
      v_runtime_role
    );
  END IF;

  EXECUTE 'SET LOCAL ROLE social_monitor_public_schema_owner';
  FOR v_relation IN
    SELECT relation.relname
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname <> '_prisma_migrations'
      AND relation.relname <> 'reader_summary_weekly_certification_seals'
      AND relation.relname <> 'reader_summary_new_input_refresh_reconciliations'
      AND relation.relname <> 'reader_summary_new_input_refresh_reconciliation_counters'
      AND relation.relowner = (
        SELECT oid FROM pg_roles
        WHERE rolname = 'social_monitor_public_schema_owner'
      )
    ORDER BY relation.relname
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO %I',
      v_relation.relname,
      v_runtime_role
    );
  END LOOP;
  EXECUTE 'RESET ROLE';
END
$tenant_table_ownership_transfer$;

-- Restore append-only ACLs after ownership/bootstrap replay, including grants
-- inherited by either configured login. This changes no rows or triggers.
DO $refresh_reconciliation_acl$
DECLARE
  relation RECORD;
  recipient RECORD;
  column_grant RECORD;
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (
        'reader_summary_new_input_refresh_reconciliations',
        'reader_summary_new_input_refresh_reconciliation_counters')) NOT IN (0, 2) THEN
    RAISE EXCEPTION 'refresh reconciliation inventory is incomplete';
  END IF;
  SET LOCAL ROLE social_monitor_public_schema_owner;
  FOR relation IN
    SELECT c.oid, c.relname, c.relowner, c.relacl, c.relkind
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN (
      'reader_summary_new_input_refresh_reconciliations',
      'reader_summary_new_input_refresh_reconciliation_counters')
  LOOP
    IF relation.relowner <> 'social_monitor_public_schema_owner'::pg_catalog.regrole
      OR relation.relkind <> 'r' THEN
      RAISE EXCEPTION 'refresh reconciliation owner or kind is unsafe';
    END IF;
    EXECUTE pg_catalog.format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', relation.relname);
    FOR recipient IN
      SELECT DISTINCT acl.grantee FROM pg_catalog.aclexplode(relation.relacl) acl
      WHERE acl.grantee <> 0 AND acl.grantee <> relation.relowner
    LOOP
      EXECUTE pg_catalog.format(
        'REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM %I',
        relation.relname, pg_catalog.pg_get_userbyid(recipient.grantee));
    END LOOP;
    FOR column_grant IN
      SELECT a.attname, acl.grantee FROM pg_catalog.pg_attribute a
      CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
      WHERE a.attrelid = relation.oid AND acl.grantee <> relation.relowner
        AND acl.privilege_type IN ('UPDATE', 'REFERENCES')
    LOOP
      EXECUTE pg_catalog.format(
        'REVOKE UPDATE (%I), REFERENCES (%I) ON TABLE public.%I FROM %s',
        column_grant.attname, column_grant.attname, relation.relname,
        CASE WHEN column_grant.grantee = 0 THEN 'PUBLIC'
          ELSE pg_catalog.quote_ident(pg_catalog.pg_get_userbyid(column_grant.grantee)) END);
    END LOOP;
    EXECUTE pg_catalog.format('GRANT SELECT, INSERT ON TABLE public.%I TO '
      'social_monitor_reader_summary_publication_runtime', relation.relname);
  END LOOP;
  RESET ROLE;
END
$refresh_reconciliation_acl$;
