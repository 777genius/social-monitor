-- Durable one-shot authorization receipt for the exact telemetry recovery.
-- The dedicated NOLOGIN owner retains only its creator's bootstrap-superuser
-- ADMIN lineage; the deployment identity has neither inherited nor SET access
-- and can execute only the guard-bound transition functions.
DO $telemetry_recovery_attestation_bootstrap$
DECLARE
  v_attestor CONSTANT NAME := 'social_monitor_telemetry_recovery_attestor';
  v_migration_owner NAME;
  v_session NAME := session_user;
BEGIN
  IF pg_catalog.to_regrole(v_attestor) IS NOT NULL
    OR pg_catalog.to_regnamespace('social_monitor_telemetry_recovery') IS NOT NULL
    OR pg_catalog.to_regclass(
      'social_monitor_telemetry_recovery.migration_attestations'
    ) IS NOT NULL THEN
    RAISE EXCEPTION 'telemetry recovery attestation bootstrap is not fresh';
  END IF;

  EXECUTE pg_catalog.format(
    'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE '
      'NOINHERIT NOREPLICATION NOBYPASSRLS',
    v_attestor
  );
  EXECUTE pg_catalog.format(
    'GRANT %I TO %I WITH ADMIN FALSE, INHERIT FALSE, SET TRUE '
      'GRANTED BY CURRENT_USER',
    v_attestor, v_session
  );
  EXECUTE pg_catalog.format(
    'GRANT CREATE ON DATABASE %I TO %I',
    pg_catalog.current_database(), v_attestor
  );
  EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_attestor);
  CREATE SCHEMA social_monitor_telemetry_recovery
    AUTHORIZATION social_monitor_telemetry_recovery_attestor;
  CREATE TABLE social_monitor_telemetry_recovery.migration_attestations (
    migration_name TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    database_oid OID NOT NULL,
    database_name NAME NOT NULL,
    authorized_role_oid OID NOT NULL,
    authorized_role_name NAME NOT NULL,
    old_migration_id TEXT NOT NULL,
    old_checksum CHAR(64) NOT NULL,
    corrected_checksum CHAR(64) NOT NULL,
    recovery_nonce CHAR(24) NOT NULL UNIQUE,
    guard_backend_pid INTEGER NOT NULL,
    guard_backend_start TIMESTAMPTZ NOT NULL,
    guard_application TEXT NOT NULL,
    authorized_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    corrected_migration_id TEXT,
    corrected_started_at TIMESTAMPTZ,
    corrected_finished_at TIMESTAMPTZ,
    receipt JSONB NOT NULL,
    receipt_sha256 CHAR(64) NOT NULL,
    CONSTRAINT telemetry_recovery_attestation_name_check CHECK (
      migration_name =
        '20260824120000_reader_summary_daily_model_job_telemetry'
    ),
    CONSTRAINT telemetry_recovery_attestation_checksum_check CHECK (
      old_checksum =
        'e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad'
      AND corrected_checksum =
        '575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250'
      AND recovery_nonce ~ '^[0-9a-f]{24}$'
      AND receipt_sha256 ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT telemetry_recovery_attestation_state_check CHECK (
      (state = 'AUTHORIZED' AND resolved_at IS NULL
        AND completed_at IS NULL AND corrected_migration_id IS NULL
        AND corrected_started_at IS NULL AND corrected_finished_at IS NULL)
      OR (state = 'RESOLVED' AND resolved_at IS NOT NULL
        AND completed_at IS NULL AND corrected_migration_id IS NULL
        AND corrected_started_at IS NULL AND corrected_finished_at IS NULL)
      OR (state = 'COMPLETED' AND resolved_at IS NOT NULL
        AND completed_at IS NOT NULL AND corrected_migration_id IS NOT NULL
        AND corrected_started_at IS NOT NULL
        AND corrected_finished_at IS NOT NULL)
    )
  );
  REVOKE ALL ON TABLE
    social_monitor_telemetry_recovery.migration_attestations FROM PUBLIC;
  GRANT ALL PRIVILEGES ON TABLE
    social_monitor_telemetry_recovery.migration_attestations
    TO social_monitor_telemetry_recovery_attestor;

  CREATE FUNCTION social_monitor_telemetry_recovery.record_attestation(
    requested_transition TEXT
  ) RETURNS TEXT
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog
  AS $attestation_function$
  DECLARE
    v_name CONSTANT TEXT :=
      '20260824120000_reader_summary_daily_model_job_telemetry';
    v_old_checksum CONSTANT TEXT :=
      'e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad';
    v_corrected_checksum CONSTANT TEXT :=
      '575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250';
    v_guard_pid TEXT := pg_catalog.current_setting(
      'social_monitor.telemetry_guard_pid', TRUE
    );
    v_guard_start TEXT := pg_catalog.current_setting(
      'social_monitor.telemetry_guard_backend_start', TRUE
    );
    v_guard_application TEXT := pg_catalog.current_setting(
      'social_monitor.telemetry_guard_application', TRUE
    );
    v_nonce TEXT := pg_catalog.current_setting(
      'social_monitor.telemetry_guard_nonce', TRUE
    );
    v_now TIMESTAMPTZ := pg_catalog.transaction_timestamp();
    v_row social_monitor_telemetry_recovery.migration_attestations%ROWTYPE;
    v_receipt JSONB;
    v_old_id TEXT;
    v_corrected_id TEXT;
    v_corrected_started TIMESTAMPTZ;
    v_corrected_finished TIMESTAMPTZ;
    v_changed BIGINT;
  BEGIN
    IF requested_transition NOT IN ('AUTHORIZE', 'RESOLVE', 'COMPLETE')
      OR v_guard_pid !~ '^[1-9][0-9]*$'
      OR v_guard_start IS NULL
      OR v_nonce !~ '^[0-9a-f]{24}$'
      OR v_guard_application IS DISTINCT FROM
        'social-monitor/telemetry-guard/' || v_nonce
      OR (SELECT count(*) FROM pg_catalog.pg_locks AS lock
          JOIN pg_catalog.pg_stat_activity AS activity
            ON activity.pid = lock.pid
          WHERE lock.locktype = 'advisory'
            AND lock.classid = 1936879981::OID
            AND lock.objid = 1502026082::OID AND lock.objsubid = 2
            AND lock.granted AND lock.pid = v_guard_pid::INTEGER
            AND activity.backend_start = v_guard_start::TIMESTAMPTZ
            AND activity.datname = pg_catalog.current_database()
            AND activity.usename = session_user
            AND activity.application_name = v_guard_application) <> 1
      OR (SELECT count(*) FROM pg_catalog.pg_locks AS lock
          WHERE lock.locktype = 'advisory'
            AND lock.classid = 1936879981::OID
            AND lock.objid = 1502026082::OID AND lock.objsubid = 2
            AND lock.granted) <> 1 THEN
      RAISE EXCEPTION 'telemetry recovery attestation guard is invalid';
    END IF;

    IF requested_transition = 'AUTHORIZE' THEN
      IF (SELECT count(*) FROM
          social_monitor_telemetry_recovery.migration_attestations) <> 0 THEN
        RAISE EXCEPTION 'telemetry recovery attestation already exists';
      END IF;
      SELECT migration.id INTO STRICT v_old_id
      FROM public."_prisma_migrations" AS migration
      WHERE migration.migration_name = v_name
        AND migration.checksum = v_old_checksum
        AND migration.applied_steps_count = 0
        AND migration.finished_at IS NULL
        AND migration.rolled_back_at IS NULL;
      v_receipt := pg_catalog.jsonb_build_object(
        'authorizedAt', pg_catalog.to_char(v_now AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'authorizedRoleName', session_user,
        'authorizedRoleOid', session_user::REGROLE::OID,
        'completedAt', NULL, 'correctedChecksum', v_corrected_checksum,
        'correctedFinishedAt', NULL, 'correctedMigrationId', NULL,
        'correctedStartedAt', NULL,
        'databaseName', pg_catalog.current_database(),
        'databaseOid', (SELECT database.oid FROM pg_catalog.pg_database AS database
          WHERE database.datname = pg_catalog.current_database()),
        'guardApplication', v_guard_application,
        'guardBackendPid', v_guard_pid::INTEGER,
        'guardBackendStart', pg_catalog.to_char(
          v_guard_start::TIMESTAMPTZ AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'migrationName', v_name, 'oldChecksum', v_old_checksum,
        'oldMigrationId', v_old_id, 'recoveryNonce', v_nonce,
        'resolvedAt', NULL,
        'schemaVersion', 'reader_summary.telemetry_recovery.v1',
        'state', 'AUTHORIZED'
      );
      INSERT INTO social_monitor_telemetry_recovery.migration_attestations (
        migration_name, state, database_oid, database_name,
        authorized_role_oid, authorized_role_name, old_migration_id,
        old_checksum, corrected_checksum, recovery_nonce, guard_backend_pid,
        guard_backend_start, guard_application, authorized_at, receipt,
        receipt_sha256
      ) VALUES (
        v_name, 'AUTHORIZED',
        (SELECT database.oid FROM pg_catalog.pg_database AS database
          WHERE database.datname = pg_catalog.current_database()),
        pg_catalog.current_database(), session_user::REGROLE::OID,
        session_user, v_old_id, v_old_checksum,
        v_corrected_checksum, v_nonce, v_guard_pid::INTEGER,
        v_guard_start::TIMESTAMPTZ, v_guard_application, v_now, v_receipt,
        pg_catalog.encode(pg_catalog.sha256(
          pg_catalog.convert_to(v_receipt::TEXT, 'UTF8')), 'hex')
      );
      RETURN 'authorized';
    END IF;

    SELECT * INTO STRICT v_row
    FROM social_monitor_telemetry_recovery.migration_attestations
    WHERE migration_name = v_name FOR UPDATE;
    IF v_row.database_oid IS DISTINCT FROM
        (SELECT database.oid FROM pg_catalog.pg_database AS database
          WHERE database.datname = pg_catalog.current_database())
      OR v_row.database_name IS DISTINCT FROM pg_catalog.current_database()
      OR v_row.authorized_role_oid IS DISTINCT FROM
        session_user::REGROLE::OID
      OR v_row.authorized_role_name IS DISTINCT FROM session_user
      OR pg_catalog.btrim(v_row.old_checksum) IS DISTINCT FROM v_old_checksum
      OR pg_catalog.btrim(v_row.corrected_checksum)
        IS DISTINCT FROM v_corrected_checksum
      OR pg_catalog.btrim(v_row.recovery_nonce) IS DISTINCT FROM v_nonce
      OR v_row.guard_backend_pid IS DISTINCT FROM v_guard_pid::INTEGER
      OR v_row.guard_backend_start IS DISTINCT FROM v_guard_start::TIMESTAMPTZ
      OR v_row.guard_application IS DISTINCT FROM v_guard_application
      OR v_row.receipt_sha256 IS DISTINCT FROM pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(v_row.receipt::TEXT, 'UTF8')),
        'hex'
      ) THEN
      RAISE EXCEPTION 'telemetry recovery attestation binding is invalid';
    END IF;

    IF requested_transition = 'RESOLVE' THEN
      IF v_row.state <> 'AUTHORIZED'
        OR (SELECT count(*) FROM public."_prisma_migrations" AS migration
          WHERE migration.migration_name = v_name
            AND migration.id = v_row.old_migration_id
            AND migration.checksum = v_old_checksum
            AND migration.applied_steps_count = 0
            AND migration.finished_at IS NULL
            AND migration.rolled_back_at IS NOT NULL
            AND migration.started_at <= migration.rolled_back_at) <> 1 THEN
        RAISE EXCEPTION 'telemetry recovery resolve transition is invalid';
      END IF;
      v_receipt := v_row.receipt || pg_catalog.jsonb_build_object(
        'resolvedAt', pg_catalog.to_char(v_now AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'state', 'RESOLVED'
      );
      UPDATE social_monitor_telemetry_recovery.migration_attestations
      SET state = 'RESOLVED', resolved_at = v_now, receipt = v_receipt,
        receipt_sha256 = pg_catalog.encode(pg_catalog.sha256(
          pg_catalog.convert_to(v_receipt::TEXT, 'UTF8')), 'hex')
      WHERE migration_name = v_name AND state = 'AUTHORIZED';
    ELSE
      SELECT migration.id, migration.started_at, migration.finished_at
      INTO STRICT v_corrected_id, v_corrected_started, v_corrected_finished
      FROM public."_prisma_migrations" AS migration
      WHERE migration.migration_name = v_name
        AND migration.checksum = v_corrected_checksum
        AND migration.applied_steps_count = 1 AND migration.logs IS NULL
        AND migration.finished_at IS NOT NULL
        AND migration.rolled_back_at IS NULL
        AND migration.started_at <= migration.finished_at;
      IF v_row.state <> 'RESOLVED'
        OR (SELECT count(*) FROM public."_prisma_migrations"
            WHERE migration_name = v_name) <> 2
        OR v_row.resolved_at > v_corrected_started THEN
        RAISE EXCEPTION 'telemetry recovery completion transition is invalid';
      END IF;
      v_receipt := v_row.receipt || pg_catalog.jsonb_build_object(
        'completedAt', pg_catalog.to_char(v_now AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'correctedFinishedAt', pg_catalog.to_char(
          v_corrected_finished AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'correctedMigrationId', v_corrected_id,
        'correctedStartedAt', pg_catalog.to_char(
          v_corrected_started AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'state', 'COMPLETED'
      );
      UPDATE social_monitor_telemetry_recovery.migration_attestations
      SET state = 'COMPLETED', completed_at = v_now,
        corrected_migration_id = v_corrected_id,
        corrected_started_at = v_corrected_started,
        corrected_finished_at = v_corrected_finished,
        receipt = v_receipt,
        receipt_sha256 = pg_catalog.encode(pg_catalog.sha256(
          pg_catalog.convert_to(v_receipt::TEXT, 'UTF8')), 'hex')
      WHERE migration_name = v_name AND state = 'RESOLVED';
    END IF;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    IF v_changed <> 1 THEN
      RAISE EXCEPTION 'telemetry recovery attestation transition was not unique';
    END IF;
    RETURN pg_catalog.lower(requested_transition) || 'd';
  END
  $attestation_function$;
  REVOKE ALL ON FUNCTION
    social_monitor_telemetry_recovery.record_attestation(TEXT) FROM PUBLIC;
  CREATE FUNCTION social_monitor_telemetry_recovery.assert_guard()
  RETURNS VOID
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = pg_catalog
  AS $assert_guard_function$
  DECLARE
    v_guard_pid TEXT := pg_catalog.current_setting(
      'social_monitor.telemetry_guard_pid', TRUE
    );
    v_guard_start TEXT := pg_catalog.current_setting(
      'social_monitor.telemetry_guard_backend_start', TRUE
    );
    v_guard_application TEXT := pg_catalog.current_setting(
      'social_monitor.telemetry_guard_application', TRUE
    );
    v_nonce TEXT := pg_catalog.current_setting(
      'social_monitor.telemetry_guard_nonce', TRUE
    );
  BEGIN
    IF v_guard_pid !~ '^[1-9][0-9]*$'
      OR v_guard_start IS NULL
      OR v_nonce !~ '^[0-9a-f]{24}$'
      OR v_guard_application IS DISTINCT FROM
        'social-monitor/telemetry-guard/' || v_nonce
      OR (SELECT count(*) FROM pg_catalog.pg_locks AS lock
          JOIN pg_catalog.pg_stat_activity AS activity
            ON activity.pid = lock.pid
          WHERE lock.locktype = 'advisory'
            AND lock.classid = 1936879981::OID
            AND lock.objid = 1502026082::OID AND lock.objsubid = 2
            AND lock.granted AND lock.pid = v_guard_pid::INTEGER
            AND activity.backend_start = v_guard_start::TIMESTAMPTZ
            AND activity.datname = pg_catalog.current_database()
            AND activity.usename = session_user
            AND activity.application_name = v_guard_application) <> 1
      OR (SELECT count(*) FROM pg_catalog.pg_locks AS lock
          WHERE lock.locktype = 'advisory'
            AND lock.classid = 1936879981::OID
            AND lock.objid = 1502026082::OID AND lock.objsubid = 2
            AND lock.granted) <> 1 THEN
      RAISE EXCEPTION 'telemetry recovery attestation guard is invalid';
    END IF;
  END
  $assert_guard_function$;
  REVOKE ALL ON FUNCTION
    social_monitor_telemetry_recovery.assert_guard() FROM PUBLIC;
  CREATE FUNCTION social_monitor_telemetry_recovery.read_attestation()
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog
  AS $read_attestation_function$
  DECLARE
    v_result JSONB;
  BEGIN
    SELECT pg_catalog.to_jsonb(attestation) INTO STRICT v_result
    FROM social_monitor_telemetry_recovery.migration_attestations AS attestation;
    RETURN v_result;
  END
  $read_attestation_function$;
  REVOKE ALL ON FUNCTION
    social_monitor_telemetry_recovery.read_attestation() FROM PUBLIC;
  EXECUTE pg_catalog.format(
    'GRANT USAGE ON SCHEMA social_monitor_telemetry_recovery TO %I',
    v_session
  );
  EXECUTE pg_catalog.format(
    'GRANT EXECUTE ON FUNCTION '
      'social_monitor_telemetry_recovery.record_attestation(TEXT) TO %I',
    v_session
  );
  EXECUTE pg_catalog.format(
    'GRANT EXECUTE ON FUNCTION '
      'social_monitor_telemetry_recovery.assert_guard() TO %I',
    v_session
  );
  EXECUTE pg_catalog.format(
    'GRANT EXECUTE ON FUNCTION '
      'social_monitor_telemetry_recovery.read_attestation() TO %I',
    v_session
  );
  RESET ROLE;
  SET LOCAL ROLE social_monitor_public_schema_owner;
  GRANT USAGE ON SCHEMA public
    TO social_monitor_telemetry_recovery_attestor;
  RESET ROLE;
  SELECT pg_catalog.pg_get_userbyid(relation.relowner)
  INTO STRICT v_migration_owner
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = 'public._prisma_migrations'::REGCLASS;
  IF v_migration_owner <> v_session THEN
    EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_migration_owner);
  END IF;
  GRANT SELECT ON TABLE public."_prisma_migrations"
    TO social_monitor_telemetry_recovery_attestor;
  RESET ROLE;
  EXECUTE pg_catalog.format(
    'REVOKE CREATE ON DATABASE %I FROM %I',
    pg_catalog.current_database(), v_attestor
  );
  EXECUTE pg_catalog.format(
    'REVOKE %I FROM %I GRANTED BY CURRENT_USER', v_attestor, v_session
  );
END
$telemetry_recovery_attestation_bootstrap$;

SELECT social_monitor_telemetry_recovery.assert_guard();
SELECT social_monitor_telemetry_recovery.record_attestation('AUTHORIZE') AS case;
