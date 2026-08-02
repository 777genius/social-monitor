\set ON_ERROR_STOP on

SELECT set_config(
  'social_monitor.bootstrap_runtime_role',
  :'runtime_role',
  false
);
SELECT set_config(
  'social_monitor.bootstrap_system_runtime_role',
  :'system_runtime_role',
  false
);
SELECT set_config(
  'social_monitor.bootstrap_migrator_role',
  current_user,
  false
);

-- The migrator receives CREATE WITH GRANT OPTION only inside the committed pre
-- phase so Prisma can apply the ordered migration. Remove it as the dedicated
-- schema owner before auditing the runtime boundary.
SET ROLE social_monitor_public_schema_owner;
REVOKE CREATE ON SCHEMA public
FROM pg_database_owner,
  PUBLIC,
  social_monitor_reader_summary_publication_owner,
  social_monitor_reader_summary_publication_runtime,
  :"runtime_role"
CASCADE;
DO $revoke_migrator_schema_create$
BEGIN
  EXECUTE format(
    'REVOKE CREATE ON SCHEMA public FROM %I CASCADE',
    current_setting('social_monitor.bootstrap_migrator_role')::NAME
  );
END
$revoke_migrator_schema_create$;
RESET ROLE;

DO $evidence_authority_grants$
BEGIN
  SET LOCAL ROLE social_monitor_public_schema_owner;
  REVOKE UPDATE ON TABLE
    public.source_items,
    public.feed_items
  FROM social_monitor_reader_summary_publication_owner;
  GRANT SELECT ON TABLE
    public.source_items,
    public.feed_items,
    public.scan_jobs,
    public.github_repository_trend_results,
    public.source_bindings,
    public.source_catalog_entries,
    public.interests
  TO social_monitor_reader_summary_publication_owner;
  GRANT UPDATE (id) ON
    public.source_items,
    public.feed_items
  TO social_monitor_reader_summary_publication_owner;
  RESET ROLE;
END
$evidence_authority_grants$;

-- Protected object ACLs can only be repaired as their NOLOGIN owner. The
-- migrator has SET but deliberately does not inherit this role.
SET ROLE social_monitor_reader_summary_publication_owner;
REVOKE ALL PRIVILEGES ON TABLE
  public.reader_summary_publications,
  public.reader_summary_publication_slots,
  public.reader_summary_artifacts,
  public.reader_summary_weekly_publication_evidence
FROM :"runtime_role";
DO $daily_terminal_artifact_acl$
DECLARE
  v_runtime_role NAME := current_setting(
    'social_monitor.bootstrap_runtime_role'
  )::NAME;
  v_system_runtime_role NAME := current_setting(
    'social_monitor.bootstrap_system_runtime_role'
  )::NAME;
  v_terminal RECORD;
BEGIN
  IF to_regprocedure(
    'public.claim_reader_summary_daily_terminal(uuid,uuid,uuid,text)'
  ) IS NOT NULL THEN
    SELECT * INTO v_terminal FROM pg_roles
    WHERE rolname = 'social_monitor_reader_summary_daily_terminal';
    IF NOT FOUND OR NOT v_terminal.rolcanlogin OR v_terminal.rolinherit
      OR v_terminal.rolsuper OR v_terminal.rolcreatedb
      OR v_terminal.rolcreaterole OR v_terminal.rolreplication
      OR v_terminal.rolbypassrls
      OR v_terminal.rolconfig IS DISTINCT FROM
        ARRAY['search_path=pg_catalog, public']::TEXT[]
      OR (
        SELECT count(*) > 1 OR count(*) <> count(*) FILTER (
          WHERE member.rolname = session_user
            AND grantor.rolsuper
            AND membership.admin_option
            AND NOT membership.inherit_option
            AND NOT membership.set_option
        )
        FROM pg_auth_members membership
        JOIN pg_roles member ON member.oid = membership.member
        JOIN pg_roles grantor ON grantor.oid = membership.grantor
        WHERE membership.roleid = v_terminal.oid
      ) OR EXISTS (
        SELECT 1 FROM pg_auth_members membership
        WHERE membership.member = v_terminal.oid
      ) OR EXISTS (
        SELECT 1
        FROM unnest(ARRAY[v_runtime_role, v_system_runtime_role]) ordinary(name)
        CROSS JOIN unnest(ARRAY['MEMBER', 'USAGE', 'SET']) capability(name)
        WHERE pg_has_role(ordinary.name, v_terminal.rolname, capability.name)
      ) THEN
      RAISE EXCEPTION 'daily terminal runtime LOGIN is missing or unsafe';
    END IF;
    REVOKE ALL PRIVILEGES ON TABLE
      public.reader_summary_artifacts,
      public.reader_summary_publications,
      public.reader_summary_publication_slots,
      public.reader_summary_weekly_publication_evidence
    FROM social_monitor_reader_summary_publication_runtime;
    REVOKE ALL PRIVILEGES ON TABLE
      public.reader_summary_artifacts,
      public.reader_summary_publications,
      public.reader_summary_publication_slots,
      public.reader_summary_weekly_publication_evidence
    FROM social_monitor_reader_summary_daily_terminal;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      public.reader_summary_artifacts
    TO social_monitor_reader_summary_publication_runtime;
    GRANT SELECT ON TABLE
      public.reader_summary_publications,
      public.reader_summary_publication_slots,
      public.reader_summary_weekly_publication_evidence
    TO social_monitor_reader_summary_publication_runtime;
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE '
        'public.reader_summary_artifacts TO %I',
      v_runtime_role
    );
    GRANT SELECT ON TABLE
      public.reader_summary_artifacts,
      public.reader_summary_publications,
      public.reader_summary_publication_slots,
      public.reader_summary_weekly_publication_evidence
    TO social_monitor_reader_summary_daily_terminal;
    REVOKE ALL PRIVILEGES ON FUNCTION
      public.reader_summary_daily_terminal_authority(UUID, UUID, DATE),
      public.publish_reader_summary(JSONB),
      public.publish_reader_summary_legacy_v1(JSONB),
      public.publish_reader_summary_pre_evidence(JSONB),
      public.record_reader_summary_weekly_publication_evidence(UUID)
    FROM social_monitor_reader_summary_daily_terminal;
    REVOKE ALL PRIVILEGES ON FUNCTION
      public.claim_reader_summary_daily_terminal(UUID, UUID, UUID, TEXT),
      public.finalize_reader_summary_daily_terminal(
        UUID, UUID, DATE, TEXT, TEXT, TEXT, BIGINT
      )
    FROM social_monitor_reader_summary_publication_runtime,
      social_monitor_reader_summary_daily_terminal;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION '
        'public.claim_reader_summary_daily_terminal(UUID,UUID,UUID,TEXT), '
        'public.finalize_reader_summary_daily_terminal('
        'UUID,UUID,DATE,TEXT,TEXT,TEXT,BIGINT) FROM %I',
      v_runtime_role
    );
    GRANT EXECUTE ON FUNCTION
      public.claim_reader_summary_daily_terminal(UUID, UUID, UUID, TEXT),
      public.finalize_reader_summary_daily_terminal(
        UUID, UUID, DATE, TEXT, TEXT, TEXT, BIGINT
      )
    TO social_monitor_reader_summary_daily_terminal;
  END IF;
END
$daily_terminal_artifact_acl$;
REVOKE ALL PRIVILEGES ON FUNCTION
  public.reader_summary_model_authority_rank(text),
  public.publish_reader_summary(jsonb),
  public.publish_reader_summary_legacy_v1(jsonb),
  public.publish_reader_summary_pre_evidence(jsonb),
  public.reader_summary_weekly_utf16_sort_key(text),
  public.reader_summary_weekly_utf16_length(text),
  public.reader_summary_weekly_canonical_number(jsonb),
  public.reader_summary_weekly_canonical_json_unbounded(jsonb),
  public.reader_summary_weekly_canonical_json(jsonb),
  public.record_reader_summary_weekly_publication_evidence(uuid),
  public.guard_reader_summary_weekly_publication_evidence(),
  public.guard_reader_summary_publication_insert(),
  public.reject_reader_summary_publication_mutation(),
  public.guard_published_reader_summary_artifact_update(),
  public.guard_reader_summary_active_slot_update()
FROM :"runtime_role";
RESET ROLE;

DO $daily_terminal_job_acl$
DECLARE
  v_runtime_role NAME := current_setting(
    'social_monitor.bootstrap_runtime_role'
  )::NAME;
BEGIN
  IF to_regprocedure(
    'public.claim_reader_summary_daily_terminal(uuid,uuid,uuid,text)'
  ) IS NOT NULL THEN
    SET LOCAL ROLE social_monitor_public_schema_owner;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.reader_summary_jobs FROM %I',
      v_runtime_role
    );
    REVOKE ALL PRIVILEGES ON TABLE public.reader_summary_jobs
    FROM social_monitor_reader_summary_publication_runtime;
    REVOKE ALL PRIVILEGES ON TABLE public.reader_summary_jobs
    FROM social_monitor_reader_summary_daily_terminal;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reader_summary_jobs
    TO social_monitor_reader_summary_publication_runtime;
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE '
        'public.reader_summary_jobs TO %I',
      v_runtime_role
    );
    GRANT USAGE ON SCHEMA public
    TO social_monitor_reader_summary_daily_terminal;
    REVOKE CREATE ON SCHEMA public
    FROM social_monitor_reader_summary_daily_terminal;
    RESET ROLE;
  END IF;
END
$daily_terminal_job_acl$;

DO $bootstrap$
DECLARE
  v_runtime_role NAME := current_setting(
    'social_monitor.bootstrap_runtime_role'
  )::NAME;
  v_constraint_count INTEGER;
  v_owner_count INTEGER;
  v_trigger_count INTEGER;
  v_function RECORD;
  v_role RECORD;
  v_unsafe_authority TEXT;
BEGIN
  -- Remove any direct authority retained from an older runtime-owned schema.
  -- The application receives only the audited capability-role grants.
  EXECUTE format(
    'GRANT social_monitor_reader_summary_publication_runtime TO %I '
      'WITH ADMIN FALSE GRANTED BY CURRENT_USER',
    v_runtime_role
  );
  EXECUTE format(
    'GRANT social_monitor_reader_summary_publication_runtime TO %I '
      'WITH INHERIT TRUE GRANTED BY CURRENT_USER',
    v_runtime_role
  );
  EXECUTE format(
    'GRANT social_monitor_reader_summary_publication_runtime TO %I '
      'WITH SET FALSE GRANTED BY CURRENT_USER',
    v_runtime_role
  );

  SELECT * INTO v_role FROM pg_roles
  WHERE rolname = 'social_monitor_public_schema_owner';
  IF NOT FOUND OR v_role.rolcanlogin OR v_role.rolsuper
    OR v_role.rolcreatedb OR v_role.rolcreaterole OR v_role.rolinherit
    OR v_role.rolreplication OR v_role.rolbypassrls THEN
    RAISE EXCEPTION 'public schema owner role is unsafe';
  END IF;
  IF (
    SELECT pg_get_userbyid(namespace.nspowner)
    FROM pg_namespace namespace
    WHERE namespace.nspname = 'public'
  ) <> 'social_monitor_public_schema_owner' THEN
    RAISE EXCEPTION 'public schema has an unsafe owner';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_namespace namespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(
        namespace.nspacl,
        acldefault('n', namespace.nspowner)
      )
    ) privilege
    LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee
    WHERE namespace.nspname = 'public'
      AND privilege.privilege_type = 'CREATE'
      AND (
        privilege.grantee = 0
        OR grantee.rolname <> 'social_monitor_public_schema_owner'
      )
  ) THEN
    RAISE EXCEPTION 'public schema retains an unreviewed CREATE grant';
  END IF;

  SELECT count(*) INTO v_owner_count
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  JOIN pg_roles owner ON owner.oid = relation.relowner
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (
      'reader_summary_artifacts',
      'reader_summary_publications',
      'reader_summary_publication_slots',
      'reader_summary_weekly_publication_evidence'
    )
    AND owner.rolname =
      'social_monitor_reader_summary_publication_owner';
  IF v_owner_count <> 4 THEN
    RAISE EXCEPTION 'protected reader summary tables have unsafe owners';
  END IF;

  SELECT count(*) INTO v_owner_count
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  JOIN pg_roles owner ON owner.oid = procedure.proowner
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'reader_summary_model_authority_rank',
      'publish_reader_summary',
      'guard_reader_summary_publication_insert',
      'reject_reader_summary_publication_mutation',
      'guard_published_reader_summary_artifact_update',
      'guard_reader_summary_active_slot_update'
    )
    AND owner.rolname =
      'social_monitor_reader_summary_publication_owner';
  IF v_owner_count <> 6 THEN
    RAISE EXCEPTION 'reader summary publication functions have unsafe owners';
  END IF;

  SELECT count(*) INTO v_owner_count
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  JOIN pg_roles owner ON owner.oid = procedure.proowner
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'publish_reader_summary_legacy_v1',
      'publish_reader_summary_pre_evidence',
      'reader_summary_weekly_utf16_sort_key',
      'reader_summary_weekly_utf16_length',
      'reader_summary_weekly_canonical_number',
      'reader_summary_weekly_canonical_json_unbounded',
      'reader_summary_weekly_canonical_json',
      'record_reader_summary_weekly_publication_evidence',
      'guard_reader_summary_weekly_publication_evidence'
    )
    AND owner.rolname =
      'social_monitor_reader_summary_publication_owner';
  IF v_owner_count <> 9 THEN
    RAISE EXCEPTION 'weekly publication evidence functions have unsafe owners';
  END IF;

  SELECT procedure.prosecdef, procedure.proconfig INTO v_function
  FROM pg_proc procedure
  WHERE procedure.oid = 'public.publish_reader_summary(jsonb)'::REGPROCEDURE;
  IF NOT v_function.prosecdef
    OR v_function.proconfig IS NULL
    OR v_function.proconfig <>
      ARRAY['search_path=pg_catalog, public, pg_temp']::TEXT[] THEN
    RAISE EXCEPTION 'publication function SECURITY DEFINER path is unsafe';
  END IF;

  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger trigger
  JOIN pg_class relation ON relation.oid = trigger.tgrelid
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (
      'reader_summary_artifacts',
      'reader_summary_publications',
      'reader_summary_publication_slots',
      'reader_summary_weekly_publication_evidence'
    )
    AND trigger.tgname IN (
      'reader_summary_artifacts_published_immutable',
      'reader_summary_publications_insert_guarded',
      'reader_summary_publications_immutable',
      'reader_summary_publication_slots_guarded',
      'reader_summary_weekly_publication_evidence_guarded'
    )
    -- ROW | BEFORE | INSERT | UPDATE. Exact equality excludes the DELETE,
    -- TRUNCATE, and INSTEAD OF bits from the artifact guard.
    AND (
      trigger.tgname <> 'reader_summary_artifacts_published_immutable'
      OR (
        relation.relname = 'reader_summary_artifacts'
        AND trigger.tgtype = 23
        AND trigger.tgfoid =
          'public.guard_published_reader_summary_artifact_update()'::REGPROCEDURE
      )
    )
    AND trigger.tgenabled = 'O';
  IF v_trigger_count <> 5 THEN
    RAISE EXCEPTION 'reader summary publication triggers are not enforced';
  END IF;
  SELECT count(*) INTO v_constraint_count
  FROM pg_constraint constraint_row
  WHERE constraint_row.conrelid =
      'public.reader_summary_weekly_publication_evidence'::REGCLASS
    AND constraint_row.conname =
      'reader_summary_weekly_publication_evidence_semantics_check'
    AND constraint_row.contype = 'c'
    AND constraint_row.convalidated;
  IF v_constraint_count <> 1 THEN
    RAISE EXCEPTION 'publication evidence semantics are not enforced';
  END IF;
  SELECT string_agg(
    format(
      '%s(select=%s,write=%s)',
      authority_table.name,
      has_table_privilege(
        'social_monitor_reader_summary_publication_owner',
        'public.' || authority_table.name,
        'SELECT'
      ),
      has_table_privilege(
        'social_monitor_reader_summary_publication_owner',
        'public.' || authority_table.name,
        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      )
    ),
    ', ' ORDER BY authority_table.name
  ) INTO v_unsafe_authority
  FROM unnest(ARRAY[
    'source_items', 'feed_items', 'scan_jobs',
    'github_repository_trend_results', 'source_bindings',
    'source_catalog_entries', 'interests'
  ]) AS authority_table(name)
  WHERE NOT has_table_privilege(
    'social_monitor_reader_summary_publication_owner',
    'public.' || authority_table.name,
    'SELECT'
  )
    OR has_table_privilege(
      'social_monitor_reader_summary_publication_owner',
      'public.' || authority_table.name,
      'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    );
  IF v_unsafe_authority IS NOT NULL THEN
    RAISE EXCEPTION
      'publication evidence source authority is unsafe: %',
      v_unsafe_authority;
  END IF;
  IF NOT has_column_privilege(
    'social_monitor_reader_summary_publication_owner',
    'public.source_items',
    'id',
    'UPDATE'
  ) OR NOT has_column_privilege(
    'social_monitor_reader_summary_publication_owner',
    'public.feed_items',
    'id',
    'UPDATE'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute attribute
    JOIN pg_catalog.pg_class relation
      ON relation.oid = attribute.attrelid
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('source_items', 'feed_items')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.attname <> 'id'
      AND has_column_privilege(
        'social_monitor_reader_summary_publication_owner',
        relation.oid,
        attribute.attnum,
        'UPDATE'
      )
  ) THEN
    RAISE EXCEPTION 'publication evidence row-lock authority is unsafe';
  END IF;

  IF pg_has_role(
    v_runtime_role,
    'social_monitor_reader_summary_publication_owner',
    'MEMBER'
  ) OR pg_has_role(
    v_runtime_role,
    'social_monitor_public_schema_owner',
    'MEMBER'
  ) OR NOT pg_has_role(
    v_runtime_role,
    'social_monitor_reader_summary_publication_runtime',
    'MEMBER'
  ) OR pg_has_role(
    'social_monitor_reader_summary_publication_runtime',
    'social_monitor_reader_summary_publication_owner',
    'MEMBER'
  ) OR EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE granted.rolname =
      'social_monitor_reader_summary_publication_runtime'
      AND member.rolname NOT IN (v_runtime_role, current_user)
  ) OR has_schema_privilege(v_runtime_role, 'public', 'CREATE')
    OR has_schema_privilege(
      'social_monitor_reader_summary_publication_owner',
      'public',
      'CREATE'
  ) THEN
    RAISE EXCEPTION 'runtime role can bypass publication ownership';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE granted.rolname = 'social_monitor_public_schema_owner'
      AND member.rolname <> current_user
  ) THEN
    RAISE EXCEPTION 'public schema owner has an unreviewed member';
  END IF;
  IF (
    SELECT count(*) <> 2
      OR count(*) FILTER (
        WHERE membership.admin_option
          AND NOT membership.inherit_option
          AND NOT membership.set_option
          AND grantor.rolsuper
      ) <> 1
      OR count(*) FILTER (
        WHERE NOT membership.admin_option
          AND NOT membership.inherit_option
          AND membership.set_option
          AND grantor.rolname = current_user
      ) <> 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    JOIN pg_roles grantor ON grantor.oid = membership.grantor
    WHERE granted.rolname = 'social_monitor_public_schema_owner'
      AND member.rolname = current_user
  ) THEN
    RAISE EXCEPTION 'public schema owner membership is unsafe';
  END IF;
  IF (
    SELECT count(*) <> 2
      OR count(*) FILTER (
        WHERE membership.admin_option
          AND NOT membership.inherit_option
          AND NOT membership.set_option
          AND grantor.rolsuper
      ) <> 1
      OR count(*) FILTER (
        WHERE NOT membership.admin_option
          AND NOT membership.inherit_option
          AND membership.set_option
          AND grantor.rolname = current_user
      ) <> 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    JOIN pg_roles grantor ON grantor.oid = membership.grantor
    WHERE granted.rolname =
      'social_monitor_reader_summary_publication_owner'
      AND member.rolname = current_user
  ) THEN
    RAISE EXCEPTION 'publication owner membership is unsafe';
  END IF;
  IF (
    SELECT count(*) <> 1 OR NOT bool_and(
      membership.admin_option
      AND NOT membership.inherit_option
      AND NOT membership.set_option
      AND grantor.rolsuper
    )
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    JOIN pg_roles grantor ON grantor.oid = membership.grantor
    WHERE granted.rolname =
      'social_monitor_reader_summary_publication_runtime'
      AND member.rolname = current_user
  ) THEN
    RAISE EXCEPTION 'publication capability admin membership is unsafe';
  END IF;
  IF (
    SELECT count(*) <> 1 OR NOT bool_and(
      NOT membership.admin_option
      AND membership.inherit_option
      AND NOT membership.set_option
      AND grantor.rolname = current_user
    )
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    JOIN pg_roles grantor ON grantor.oid = membership.grantor
    WHERE granted.rolname =
      'social_monitor_reader_summary_publication_runtime'
      AND member.rolname = v_runtime_role
  ) THEN
    RAISE EXCEPTION 'publication capability runtime membership is unsafe';
  END IF;
  IF (
    SELECT count(*) <> 1 OR NOT bool_and(
      membership.admin_option
      AND NOT membership.inherit_option
      AND membership.set_option
      AND (
        grantor.rolsuper OR (
          grantor.rolcreaterole
          AND grantor.rolname NOT IN (
            current_user,
            v_runtime_role,
            'social_monitor_public_schema_owner',
            'social_monitor_reader_summary_publication_owner',
            'social_monitor_reader_summary_publication_runtime'
          )
          AND EXISTS (
            SELECT 1
            FROM pg_auth_members provisioner_membership
            JOIN pg_roles root_grantor
              ON root_grantor.oid = provisioner_membership.grantor
            WHERE provisioner_membership.roleid = membership.roleid
              AND provisioner_membership.member = membership.grantor
              AND provisioner_membership.admin_option
              AND root_grantor.rolsuper
          )
        )
      )
    )
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    JOIN pg_roles grantor ON grantor.oid = membership.grantor
    WHERE granted.rolname = v_runtime_role
      AND member.rolname = current_user
  ) THEN
    RAISE EXCEPTION 'runtime admin membership grantor is unsafe';
  END IF;

  IF NOT has_table_privilege(
    v_runtime_role, 'public.reader_summary_publications', 'SELECT'
  ) OR NOT has_table_privilege(
    v_runtime_role, 'public.reader_summary_publication_slots', 'SELECT'
  ) OR has_table_privilege(
    v_runtime_role, 'public.reader_summary_publications',
    'INSERT,UPDATE,DELETE,TRUNCATE'
  ) OR has_table_privilege(
    v_runtime_role, 'public.reader_summary_publication_slots',
    'INSERT,UPDATE,DELETE,TRUNCATE'
  ) THEN
    RAISE EXCEPTION 'runtime publication-table privileges are unsafe';
  END IF;

  IF NOT has_table_privilege(
    v_runtime_role,
    'public.reader_summary_weekly_publication_evidence',
    'SELECT'
  ) OR has_table_privilege(
    v_runtime_role,
    'public.reader_summary_weekly_publication_evidence',
    'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) THEN
    RAISE EXCEPTION 'runtime publication-evidence privileges are unsafe';
  END IF;

  IF to_regprocedure(
    'public.claim_reader_summary_daily_terminal(uuid,uuid,uuid,text)'
  ) IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'social_monitor_reader_summary_publication_runtime'::NAME,
        v_runtime_role
      ]) AS artifact_role(name)
      WHERE NOT has_table_privilege(
        artifact_role.name, 'public.reader_summary_artifacts', 'SELECT'
      ) OR NOT has_table_privilege(
        artifact_role.name, 'public.reader_summary_artifacts', 'INSERT'
      ) OR NOT has_table_privilege(
        artifact_role.name, 'public.reader_summary_artifacts', 'UPDATE'
      ) OR has_table_privilege(
        artifact_role.name, 'public.reader_summary_artifacts',
        'DELETE,TRUNCATE,REFERENCES,TRIGGER'
      )
    ) THEN
      RAISE EXCEPTION 'legacy artifact continuity grants are unsafe';
    END IF;
  ELSIF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'social_monitor_reader_summary_publication_runtime'::NAME,
      v_runtime_role
    ]) ordinary_role(name)
    CROSS JOIN unnest(ARRAY[
      'reader_summary_jobs', 'reader_summary_artifacts'
    ]) ordinary_table(name)
    WHERE NOT has_table_privilege(
      ordinary_role.name,
      'public.' || ordinary_table.name,
      'SELECT,INSERT,UPDATE,DELETE'
    ) OR has_table_privilege(
      ordinary_role.name,
      'public.' || ordinary_table.name,
      'TRUNCATE,REFERENCES,TRIGGER'
    )
  ) THEN
    RAISE EXCEPTION 'daily ordinary runtime CRUD authority is unsafe';
  ELSIF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'reader_summary_publications',
      'reader_summary_publication_slots',
      'reader_summary_weekly_publication_evidence'
    ]) ordinary_evidence_table(name)
    WHERE NOT has_table_privilege(
      'social_monitor_reader_summary_publication_runtime',
      'public.' || ordinary_evidence_table.name,
      'SELECT'
    ) OR has_table_privilege(
      'social_monitor_reader_summary_publication_runtime',
      'public.' || ordinary_evidence_table.name,
      'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )
  ) THEN
    RAISE EXCEPTION 'daily ordinary runtime evidence reads are unsafe';
  ELSIF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'reader_summary_artifacts', 'reader_summary_publications',
      'reader_summary_publication_slots',
      'reader_summary_weekly_publication_evidence'
    ]) evidence_table(name)
    WHERE NOT has_table_privilege(
      'social_monitor_reader_summary_daily_terminal',
      'public.' || evidence_table.name,
      'SELECT'
    ) OR has_table_privilege(
      'social_monitor_reader_summary_daily_terminal',
      'public.' || evidence_table.name,
      'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )
  ) OR EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'reader_summary_jobs', 'reader_summary_production_recovery_leases',
      'reader_summary_production_recovery_days',
      'reader_summary_production_recovery_dry_runs',
      'reader_summary_recovery_receipts',
      'reader_summary_weekly_certification_seals'
    ]) protected_table(name)
    WHERE has_table_privilege(
      'social_monitor_reader_summary_daily_terminal',
      'public.' || protected_table.name,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )
  ) THEN
    RAISE EXCEPTION 'daily terminal evidence authority is unsafe';
  ELSIF has_function_privilege(
    'social_monitor_reader_summary_publication_runtime',
    'public.claim_reader_summary_daily_terminal(uuid,uuid,uuid,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.claim_reader_summary_daily_terminal(uuid,uuid,uuid,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'social_monitor_reader_summary_daily_terminal',
    'public.claim_reader_summary_daily_terminal(uuid,uuid,uuid,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'social_monitor_reader_summary_daily_terminal',
    'public.finalize_reader_summary_daily_terminal(uuid,uuid,date,text,text,text,bigint)',
    'EXECUTE'
  ) OR has_function_privilege(
    'social_monitor_reader_summary_daily_terminal',
    'public.reader_summary_daily_terminal_authority(uuid,uuid,date)',
    'EXECUTE'
  ) OR has_function_privilege(
    'social_monitor_reader_summary_daily_terminal',
    'public.publish_reader_summary(jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'daily terminal function authority is unsafe';
  END IF;

  IF NOT has_table_privilege(
    'social_monitor_reader_summary_publication_owner',
    'public.reader_summary_jobs',
    'SELECT'
  ) OR NOT has_table_privilege(
    'social_monitor_reader_summary_publication_owner',
    'public.reader_summary_jobs',
    'UPDATE'
  ) OR NOT has_table_privilege(
    'social_monitor_reader_summary_publication_owner',
    'public.outbox_events',
    'SELECT'
  ) OR NOT has_table_privilege(
    'social_monitor_reader_summary_publication_owner',
    'public.outbox_events',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'publication owner base-table grants are incomplete';
  END IF;

  IF NOT has_table_privilege(
    'social_monitor_reader_summary_publication_owner',
    'public.source_items',
    'SELECT'
  ) OR NOT has_table_privilege(
    'social_monitor_reader_summary_publication_owner',
    'public.feed_items',
    'SELECT'
  ) OR NOT has_table_privilege(
    'social_monitor_reader_summary_publication_owner',
    'public.scan_jobs',
    'SELECT'
  ) OR NOT has_table_privilege(
    'social_monitor_reader_summary_publication_owner',
    'public.github_repository_trend_results',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'publication evidence authority grants are incomplete';
  END IF;

  IF NOT has_function_privilege(
    v_runtime_role, 'public.publish_reader_summary(jsonb)', 'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.publish_reader_summary_legacy_v1(jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.publish_reader_summary_pre_evidence(jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.reader_summary_weekly_canonical_json(jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.record_reader_summary_weekly_publication_evidence(uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.guard_reader_summary_weekly_publication_evidence()',
    'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.guard_reader_summary_active_slot_update()',
    'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.guard_published_reader_summary_artifact_update()',
    'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.reader_summary_model_authority_rank(text)',
    'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.guard_reader_summary_publication_insert()',
    'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.reject_reader_summary_publication_mutation()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'runtime publication-function privileges are unsafe';
  END IF;
END
$bootstrap$;

-- Ownership/bootstrap replay can replace direct table ACLs after the forward
-- activation migration. Reissue the legacy SECURITY DEFINER body grants only
-- after those owners are final, and only as the relations' current owner.
DO $grant_legacy_daily_function_owner_acl$
DECLARE
  v_function_owner_oids OID[];
  v_function_count BIGINT;
  v_legacy_function_owner NAME;
  v_daily_relation_owner_oids OID[];
  v_daily_relation_count BIGINT;
  v_daily_relation_owner NAME;
BEGIN
  SELECT ARRAY_AGG(DISTINCT proc.proowner), COUNT(*)
  INTO STRICT v_function_owner_oids, v_function_count
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid = ANY (ARRAY[
    'public.claim_reader_summary_daily_execution(uuid,uuid,text,date,timestamptz)'::REGPROCEDURE,
    'public.renew_reader_summary_daily_execution_lease(uuid,uuid,date,text,bigint,timestamptz)'::REGPROCEDURE,
    'public.mark_reader_summary_daily_model_job_running(uuid,uuid,date,text,bigint,timestamptz)'::REGPROCEDURE
  ]::OID[]);
  IF v_function_count <> 3
    OR pg_catalog.cardinality(v_function_owner_oids) <> 1 THEN
    RAISE EXCEPTION
      'legacy daily claim, renew, and running functions lack one common owner';
  END IF;
  v_legacy_function_owner := pg_catalog.pg_get_userbyid(
    v_function_owner_oids[1]
  );
  IF v_legacy_function_owner IN (
    'social_monitor_reader_summary_daily_terminal',
    'social_monitor_reader_summary_publication_runtime',
    'social_monitor_tenant_system_runtime',
    'social_monitor_reader_summary_daily_publication_definer'
  ) THEN
    RAISE EXCEPTION
      'legacy daily function owner is a terminal, capability, or definer role';
  END IF;
  SELECT ARRAY_AGG(DISTINCT relation.relowner), COUNT(*)
  INTO STRICT v_daily_relation_owner_oids, v_daily_relation_count
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = ANY (ARRAY[
    'public.reader_summary_daily_execution_cursors'::REGCLASS,
    'public.reader_summary_daily_model_jobs'::REGCLASS,
    'public.reader_summary_daily_source_authorities'::REGCLASS
  ]::OID[]);
  IF v_daily_relation_count <> 3
    OR pg_catalog.cardinality(v_daily_relation_owner_oids) <> 1 THEN
    RAISE EXCEPTION
      'daily cursor, model, and source authority relations lack one common owner';
  END IF;
  v_daily_relation_owner := pg_catalog.pg_get_userbyid(
    v_daily_relation_owner_oids[1]
  );
  IF NOT pg_catalog.pg_has_role(
    session_user, v_daily_relation_owner, 'SET'
  ) THEN
    RAISE EXCEPTION 'migration admin cannot SET the daily relation owner';
  END IF;
  EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_daily_relation_owner);
  EXECUTE pg_catalog.format(
    'GRANT SELECT, INSERT, UPDATE ON TABLE '
      'public."reader_summary_daily_execution_cursors", '
      'public."reader_summary_daily_model_jobs" TO %I',
    v_legacy_function_owner
  );
  EXECUTE pg_catalog.format(
    'GRANT SELECT, INSERT ON TABLE '
      'public."reader_summary_daily_source_authorities" TO %I',
    v_legacy_function_owner
  );
  EXECUTE 'RESET ROLE';
  IF NOT pg_catalog.pg_has_role(
    session_user, 'social_monitor_public_schema_owner', 'SET'
  ) THEN
    RAISE EXCEPTION 'migration admin cannot SET the public schema owner';
  END IF;
  EXECUTE 'SET LOCAL ROLE social_monitor_public_schema_owner';
  EXECUTE pg_catalog.format(
    'GRANT SELECT ON TABLE public."feed_items", public."source_items" TO %I',
    v_legacy_function_owner
  );
  EXECUTE 'RESET ROLE';
END
$grant_legacy_daily_function_owner_acl$;

-- PG18 invariant: bootstrap leaves exactly one upstream-superuser creator-admin
-- edge for this migrator (ADMIN, NOINHERIT, NOSET). ACL migrations may create
-- and revoke a self SET edge; GRANTED BY CURRENT_USER cannot remove the
-- upstream edge, and no runtime, outgoing, or extra incoming edge may exist.
DO $daily_activation_definer_audit$
DECLARE
  v_definer pg_catalog.pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO v_definer FROM pg_catalog.pg_roles
  WHERE rolname = 'social_monitor_reader_summary_daily_publication_definer';
  IF NOT FOUND OR v_definer.rolcanlogin OR v_definer.rolsuper
    OR v_definer.rolcreatedb OR v_definer.rolcreaterole
    OR v_definer.rolinherit OR v_definer.rolreplication
    OR v_definer.rolbypassrls OR v_definer.rolconfig IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members AS membership
      WHERE membership.member = v_definer.oid)
    OR (SELECT count(*) <> 1 OR count(*) FILTER (WHERE member.rolname = session_user
      AND grantor.rolsuper AND membership.admin_option
      AND NOT membership.inherit_option AND NOT membership.set_option) <> 1
      FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
      JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
      WHERE membership.roleid = v_definer.oid)
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(ARRAY[
        current_setting('social_monitor.bootstrap_runtime_role')::NAME,
        current_setting('social_monitor.bootstrap_system_runtime_role')::NAME,
        'social_monitor_reader_summary_publication_runtime'::NAME,
        'social_monitor_tenant_system_runtime'::NAME,
        'social_monitor_reader_summary_daily_terminal'::NAME
      ]) AS ordinary(role_name)
      CROSS JOIN pg_catalog.unnest(ARRAY['MEMBER', 'USAGE', 'SET']) AS capability(option_name)
      WHERE pg_catalog.pg_has_role(
        ordinary.role_name, v_definer.rolname, capability.option_name
      )
    ) THEN
    RAISE EXCEPTION 'daily publication definer PG18 bootstrap membership is unsafe';
  END IF;
END
$daily_activation_definer_audit$;
