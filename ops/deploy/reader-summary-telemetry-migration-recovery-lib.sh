#!/usr/bin/env bash

# Bounded recovery for one exact telemetry migration failure. Ordinary state
# classification is deliberately separate from irreversible authorization.

READER_SUMMARY_TELEMETRY_MIGRATION=20260824120000_reader_summary_daily_model_job_telemetry
READER_SUMMARY_TELEMETRY_OLD_CHECKSUM=e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad
READER_SUMMARY_TELEMETRY_CORRECTED_CHECKSUM=575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250
READER_SUMMARY_TELEMETRY_STATE_SHA256=a3a299d769f2e53698f8b604122a5b694566ed77891cc925c865440f8c85f9ed
READER_SUMMARY_TELEMETRY_PREFLIGHT_SHA256=411771734a8636499c6f732a552b6a1e79d8030ef234984516901764d8da75f7
READER_SUMMARY_TELEMETRY_POSTFLIGHT_SHA256=7621740debbdc409bc8ea99b4bfa0e88f9bf357441d3eba75edfb96f5da95508
READER_SUMMARY_TELEMETRY_ATTESTATION_AUTHORIZE_SHA256=784809eff72786d0771d6242f2fbf5b8da7a4f3c352f43221f1a52604fae286a
READER_SUMMARY_TELEMETRY_ATTESTATION_COMPLETE_SHA256=cd68864674669042015cee6d1a814129f1cb5773515fd7072a281bd3937ec0c9
READER_SUMMARY_TELEMETRY_ATTESTATION_VERIFY_SHA256=601bcc7c56806d84bace93a6d201edd07031221b19c1504bc5baf1ee2ae5686e
READER_SUMMARY_TELEMETRY_GUARD_CLASSID=1936879981
READER_SUMMARY_TELEMETRY_GUARD_OBJID=1502026082
READER_SUMMARY_TELEMETRY_WATCHDOG_OBJID=1502026083
READER_SUMMARY_TELEMETRY_MUTATION_OBJID=1502026084
READER_SUMMARY_TELEMETRY_GUARD_APPLICATION_PREFIX=social-monitor/telemetry-guard
READER_SUMMARY_TELEMETRY_RESOLVER_APPLICATION_PREFIX=social-monitor/telemetry-resolve
READER_SUMMARY_TELEMETRY_GUARD_PID=''
READER_SUMMARY_TELEMETRY_GUARD_BACKEND_START=''
READER_SUMMARY_TELEMETRY_GUARD_APPLICATION=''
READER_SUMMARY_TELEMETRY_GUARD_NONCE=''
READER_SUMMARY_TELEMETRY_RESOLVER_APPLICATION=''
READER_SUMMARY_TELEMETRY_MUTATION_APPLICATION=''
READER_SUMMARY_TELEMETRY_MUTATION_BACKEND_PID=''
READER_SUMMARY_TELEMETRY_MUTATION_BACKEND_START=''

verify_reader_summary_telemetry_recovery_target() {
  local migration_relative=prisma/migrations/$READER_SUMMARY_TELEMETRY_MIGRATION/migration.sql
  local relative file canonical target_digest actual_digest expected_digest
  local -a reviewed=(
    "$migration_relative"
    ops/deploy/reader-summary-telemetry-migration-state.sql
    ops/deploy/reader-summary-telemetry-failed-migration-preflight.sql
    ops/deploy/reader-summary-telemetry-migration-postflight.sql
    ops/deploy/reader-summary-telemetry-recovery-attestation-authorize.sql
    ops/deploy/reader-summary-telemetry-recovery-attestation-complete.sql
    ops/deploy/reader-summary-telemetry-recovery-attestation-verify.sql
  )

  [[ ${sha:-} =~ ^[0-9a-f]{40}$ ]] ||
    fail 'reader summary telemetry recovery target SHA is invalid'
  [[ $READER_SUMMARY_TELEMETRY_OLD_CHECKSUM =~ ^[0-9a-f]{64}$ ]] ||
    fail 'reader summary telemetry old checksum is invalid'
  for relative in "${reviewed[@]}"; do
    file=$REPO/$relative
    [[ -f $file && ! -L $file ]] ||
      fail 'reader summary telemetry recovery target file is unavailable'
    canonical=$(readlink -f -- "$file") ||
      fail 'reader summary telemetry recovery target file cannot be resolved'
    [[ $canonical == "$REPO/$relative" ]] ||
      fail 'reader summary telemetry recovery target file escapes the repository'
    target_digest=$(deploy_control_git_blob_digest "$sha" "$relative") ||
      fail 'reader summary telemetry recovery target blob is unavailable'
    actual_digest=$(deploy_control_file_digest "$canonical") ||
      fail 'reader summary telemetry recovery target file cannot be authenticated'
    [[ $actual_digest == "$target_digest" ]] ||
      fail 'reader summary telemetry recovery target file differs from target blob'
    case $relative in
      "$migration_relative") expected_digest=$READER_SUMMARY_TELEMETRY_CORRECTED_CHECKSUM ;;
      *-migration-state.sql) expected_digest=$READER_SUMMARY_TELEMETRY_STATE_SHA256 ;;
      *-failed-migration-preflight.sql) expected_digest=$READER_SUMMARY_TELEMETRY_PREFLIGHT_SHA256 ;;
      *-migration-postflight.sql) expected_digest=$READER_SUMMARY_TELEMETRY_POSTFLIGHT_SHA256 ;;
      *-attestation-authorize.sql) expected_digest=$READER_SUMMARY_TELEMETRY_ATTESTATION_AUTHORIZE_SHA256 ;;
      *-attestation-complete.sql) expected_digest=$READER_SUMMARY_TELEMETRY_ATTESTATION_COMPLETE_SHA256 ;;
      *-attestation-verify.sql) expected_digest=$READER_SUMMARY_TELEMETRY_ATTESTATION_VERIFY_SHA256 ;;
      *) return 65 ;;
    esac
    [[ $target_digest == "$expected_digest" ]] ||
      fail 'reader summary telemetry recovery SQL is not the exact reviewed blob'
  done
}

reader_summary_telemetry_query_file() {
  local sql=$1 application=$2 result query
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt

  [[ -f $sql && ! -L $sql ]] || return 64
  query=$(< "$sql") || return
  if [[ -n $READER_SUMMARY_TELEMETRY_GUARD_NONCE ]]; then
    [[ $READER_SUMMARY_TELEMETRY_GUARD_PID =~ ^[1-9][0-9]*$ &&
       $READER_SUMMARY_TELEMETRY_GUARD_NONCE =~ ^[0-9a-f]{24}$ &&
       $READER_SUMMARY_TELEMETRY_GUARD_BACKEND_START =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]][0-9:.+-]+$ &&
       $READER_SUMMARY_TELEMETRY_GUARD_APPLICATION == "$READER_SUMMARY_TELEMETRY_GUARD_APPLICATION_PREFIX/$READER_SUMMARY_TELEMETRY_GUARD_NONCE" ]] || return 65
    query="DO \$telemetry_guard_binding\$ BEGIN
      PERFORM pg_catalog.set_config('social_monitor.telemetry_guard_pid',
        '$READER_SUMMARY_TELEMETRY_GUARD_PID', false);
      PERFORM pg_catalog.set_config(
        'social_monitor.telemetry_guard_backend_start',
        '$READER_SUMMARY_TELEMETRY_GUARD_BACKEND_START', false);
      PERFORM pg_catalog.set_config(
        'social_monitor.telemetry_guard_application',
        '$READER_SUMMARY_TELEMETRY_GUARD_APPLICATION', false);
      PERFORM pg_catalog.set_config('social_monitor.telemetry_guard_nonce',
        '$READER_SUMMARY_TELEMETRY_GUARD_NONCE', false);
    END \$telemetry_guard_binding\$;
    $query"
  fi
  result=$(reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" "$application" catalog \
    "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" "$query") || return
  printf '%s\n' "$result"
}

reader_summary_telemetry_deployment_state() {
  local result
  result=$(reader_summary_telemetry_query_file \
    "$REPO/ops/deploy/reader-summary-telemetry-migration-state.sql" \
    social-monitor/telemetry-migration-state) || return
  case $result in
    recovered)
      [[ $(reader_summary_telemetry_query_file \
        "$REPO/ops/deploy/reader-summary-telemetry-recovery-attestation-verify.sql" \
        social-monitor/telemetry-migration-recovery-attestation-verify) == \
        recovered ]] || return 65
      printf '%s\n' "$result"
      ;;
    clean|recovery-required|corrected) printf '%s\n' "$result" ;;
    *) return 65 ;;
  esac
}

authorize_reader_summary_telemetry_recovery() {
  [[ $(reader_summary_telemetry_query_file \
    "$REPO/ops/deploy/reader-summary-telemetry-failed-migration-preflight.sql" \
    social-monitor/telemetry-migration-recovery-authorization) == authorized ]] &&
  [[ $(reader_summary_telemetry_query_file \
    "$REPO/ops/deploy/reader-summary-telemetry-recovery-attestation-authorize.sql" \
    social-monitor/telemetry-migration-recovery-attestation-authorize) == \
    authorized ]]
}

verify_reader_summary_telemetry_recovery_postflight() {
  [[ $(reader_summary_telemetry_query_file \
    "$REPO/ops/deploy/reader-summary-telemetry-migration-postflight.sql" \
    social-monitor/telemetry-migration-recovery-postflight) == resolved ]]
}

complete_reader_summary_telemetry_recovery_attestation() {
  [[ $(reader_summary_telemetry_query_file \
    "$REPO/ops/deploy/reader-summary-telemetry-recovery-attestation-complete.sql" \
    social-monitor/telemetry-migration-recovery-attestation-complete) == \
    completed ]] &&
  [[ $(reader_summary_telemetry_query_file \
    "$REPO/ops/deploy/reader-summary-telemetry-recovery-attestation-verify.sql" \
    social-monitor/telemetry-migration-recovery-attestation-verify) == \
    recovered ]]
}

reader_summary_telemetry_hold_database_guard() {
  local query
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  [[ $READER_SUMMARY_TELEMETRY_GUARD_NONCE =~ ^[0-9a-f]{24}$ ]] || return 64
  READER_SUMMARY_TELEMETRY_GUARD_APPLICATION="$READER_SUMMARY_TELEMETRY_GUARD_APPLICATION_PREFIX/$READER_SUMMARY_TELEMETRY_GUARD_NONCE"
  query="DO \$guard\$ BEGIN
    IF NOT pg_catalog.pg_try_advisory_lock(
      $READER_SUMMARY_TELEMETRY_GUARD_CLASSID,
      $READER_SUMMARY_TELEMETRY_GUARD_OBJID
    ) THEN
      RAISE EXCEPTION 'telemetry recovery database guard is already held';
    END IF;
  END \$guard\$;
  SELECT pg_catalog.format('guard-held|%s|%s|$READER_SUMMARY_TELEMETRY_GUARD_NONCE',
    pg_catalog.pg_backend_pid(), activity.backend_start::TEXT)
  FROM pg_catalog.pg_stat_activity AS activity
  WHERE activity.pid = pg_catalog.pg_backend_pid();
  SELECT pg_catalog.pg_sleep(3600);"
  reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" "$READER_SUMMARY_TELEMETRY_GUARD_APPLICATION" \
    catalog "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" "$query"
}

reader_summary_telemetry_release_database_guard() {
  local query result
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  [[ $READER_SUMMARY_TELEMETRY_GUARD_PID =~ ^[1-9][0-9]*$ &&
     $READER_SUMMARY_TELEMETRY_GUARD_NONCE =~ ^[0-9a-f]{24}$ ]] || return 64
  query="SELECT count(*) FROM pg_catalog.pg_stat_activity AS activity
    JOIN pg_catalog.pg_locks AS lock ON lock.pid = activity.pid
    WHERE activity.datname = pg_catalog.current_database()
      AND activity.application_name = '$READER_SUMMARY_TELEMETRY_GUARD_APPLICATION'
      AND activity.pid = $READER_SUMMARY_TELEMETRY_GUARD_PID
      AND activity.backend_start =
        '$READER_SUMMARY_TELEMETRY_GUARD_BACKEND_START'::TIMESTAMPTZ
      AND lock.locktype = 'advisory'
      AND lock.classid = $READER_SUMMARY_TELEMETRY_GUARD_CLASSID::OID
      AND lock.objid = $READER_SUMMARY_TELEMETRY_GUARD_OBJID::OID
      AND lock.objsubid = 2 AND lock.granted
      AND pg_catalog.pg_terminate_backend(activity.pid);"
  result=$(reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" social-monitor/telemetry-migration-guard-release \
    catalog "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" "$query") || return
  [[ $result == 1 ]]
}

reader_summary_telemetry_assert_database_guard() {
  local query result
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  [[ $READER_SUMMARY_TELEMETRY_GUARD_PID =~ ^[1-9][0-9]*$ &&
     $READER_SUMMARY_TELEMETRY_GUARD_NONCE =~ ^[0-9a-f]{24}$ ]] || return 64
  query="SELECT (count(*) = 1 AND (SELECT count(*)
      FROM pg_catalog.pg_locks AS singleton
      WHERE singleton.locktype = 'advisory'
        AND singleton.classid = $READER_SUMMARY_TELEMETRY_GUARD_CLASSID::OID
        AND singleton.objid = $READER_SUMMARY_TELEMETRY_GUARD_OBJID::OID
        AND singleton.objsubid = 2 AND singleton.granted) = 1)::INTEGER
    FROM pg_catalog.pg_stat_activity AS activity
    JOIN pg_catalog.pg_locks AS lock ON lock.pid = activity.pid
    WHERE activity.datname = pg_catalog.current_database()
      AND activity.application_name = '$READER_SUMMARY_TELEMETRY_GUARD_APPLICATION'
      AND activity.pid = $READER_SUMMARY_TELEMETRY_GUARD_PID
      AND activity.backend_start =
        '$READER_SUMMARY_TELEMETRY_GUARD_BACKEND_START'::TIMESTAMPTZ
      AND lock.locktype = 'advisory'
      AND lock.classid = $READER_SUMMARY_TELEMETRY_GUARD_CLASSID::OID
      AND lock.objid = $READER_SUMMARY_TELEMETRY_GUARD_OBJID::OID
      AND lock.objsubid = 2 AND lock.granted;"
  result=$(reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" social-monitor/telemetry-guard-final-check \
    catalog "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" "$query") || return
  [[ $result == 1 ]]
}

reader_summary_telemetry_hold_mutation_lease() {
  local query
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  [[ $READER_SUMMARY_TELEMETRY_GUARD_NONCE =~ ^[0-9a-f]{24}$ ]] || return 64
  READER_SUMMARY_TELEMETRY_MUTATION_APPLICATION="social-monitor/telemetry-mutation/$READER_SUMMARY_TELEMETRY_GUARD_NONCE"
  query="DO \$mutation_lease\$ BEGIN
    IF NOT pg_catalog.pg_try_advisory_lock(
      $READER_SUMMARY_TELEMETRY_GUARD_CLASSID,
      $READER_SUMMARY_TELEMETRY_MUTATION_OBJID
    ) THEN
      RAISE EXCEPTION 'telemetry recovery mutation lease is already held';
    END IF;
  END \$mutation_lease\$;
  SELECT pg_catalog.format('mutation-held|%s|%s',
    pg_catalog.pg_backend_pid(), activity.backend_start::TEXT)
  FROM pg_catalog.pg_stat_activity AS activity
  WHERE activity.pid = pg_catalog.pg_backend_pid();
  SELECT pg_catalog.pg_sleep(3600);"
  reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" "$READER_SUMMARY_TELEMETRY_MUTATION_APPLICATION" \
    catalog "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" "$query"
}

reader_summary_telemetry_release_mutation_lease() {
  local query result
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  [[ $READER_SUMMARY_TELEMETRY_MUTATION_BACKEND_PID =~ ^[1-9][0-9]*$ &&
     $READER_SUMMARY_TELEMETRY_MUTATION_BACKEND_START == *[0-9]* &&
     $READER_SUMMARY_TELEMETRY_MUTATION_APPLICATION == \
       "social-monitor/telemetry-mutation/$READER_SUMMARY_TELEMETRY_GUARD_NONCE" ]] || return 64
  query="SELECT count(*) FROM pg_catalog.pg_stat_activity AS activity
    JOIN pg_catalog.pg_locks AS lock ON lock.pid = activity.pid
    WHERE activity.datname = pg_catalog.current_database()
      AND activity.application_name = '$READER_SUMMARY_TELEMETRY_MUTATION_APPLICATION'
      AND activity.pid = $READER_SUMMARY_TELEMETRY_MUTATION_BACKEND_PID
      AND activity.backend_start =
        '$READER_SUMMARY_TELEMETRY_MUTATION_BACKEND_START'::TIMESTAMPTZ
      AND lock.locktype = 'advisory'
      AND lock.classid = $READER_SUMMARY_TELEMETRY_GUARD_CLASSID::OID
      AND lock.objid = $READER_SUMMARY_TELEMETRY_MUTATION_OBJID::OID
      AND lock.objsubid = 2 AND lock.granted
      AND pg_catalog.pg_terminate_backend(activity.pid);"
  result=$(reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" social-monitor/telemetry-mutation-release \
    catalog "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" "$query") || return
  [[ $result == 1 ]]
}

reader_summary_telemetry_watch_database_guard() {
  local query
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  [[ $READER_SUMMARY_TELEMETRY_GUARD_PID =~ ^[1-9][0-9]*$ &&
     $READER_SUMMARY_TELEMETRY_GUARD_NONCE =~ ^[0-9a-f]{24}$ &&
     $READER_SUMMARY_TELEMETRY_MUTATION_BACKEND_PID =~ ^[1-9][0-9]*$ &&
     $READER_SUMMARY_TELEMETRY_MUTATION_BACKEND_START == *[0-9]* &&
     $READER_SUMMARY_TELEMETRY_MUTATION_APPLICATION == \
       "social-monitor/telemetry-mutation/$READER_SUMMARY_TELEMETRY_GUARD_NONCE" &&
     $READER_SUMMARY_TELEMETRY_RESOLVER_APPLICATION == "$READER_SUMMARY_TELEMETRY_RESOLVER_APPLICATION_PREFIX/$READER_SUMMARY_TELEMETRY_GUARD_NONCE" ]] || return 64
  query="BEGIN;
  SELECT pg_catalog.pg_advisory_xact_lock(
    $READER_SUMMARY_TELEMETRY_GUARD_CLASSID,
    $READER_SUMMARY_TELEMETRY_WATCHDOG_OBJID
  );
  SELECT pg_catalog.format('watchdog-held|%s',
    pg_catalog.pg_backend_pid());
  DO \$watchdog\$
  DECLARE
    v_holder_count BIGINT;
    v_mutation_count BIGINT;
    v_recovery_backend_count BIGINT;
    v_resolver_count BIGINT;
    v_resolver_seen BOOLEAN := FALSE;
    v_started_at TIMESTAMPTZ := pg_catalog.clock_timestamp();
  BEGIN
    LOOP
      PERFORM pg_catalog.pg_stat_clear_snapshot();
      SELECT count(*) INTO STRICT v_holder_count
      FROM pg_catalog.pg_locks AS lock
      JOIN pg_catalog.pg_stat_activity AS activity ON activity.pid = lock.pid
      WHERE lock.locktype = 'advisory'
        AND lock.classid = $READER_SUMMARY_TELEMETRY_GUARD_CLASSID::OID
        AND lock.objid = $READER_SUMMARY_TELEMETRY_GUARD_OBJID::OID
        AND lock.objsubid = 2 AND lock.granted
        AND lock.pid = $READER_SUMMARY_TELEMETRY_GUARD_PID
        AND activity.backend_start =
          '$READER_SUMMARY_TELEMETRY_GUARD_BACKEND_START'::TIMESTAMPTZ
        AND activity.application_name =
          '$READER_SUMMARY_TELEMETRY_GUARD_APPLICATION';
      SELECT count(*) INTO STRICT v_resolver_count
      FROM pg_catalog.pg_stat_activity AS activity
      WHERE activity.datname = pg_catalog.current_database()
        AND activity.application_name =
          '$READER_SUMMARY_TELEMETRY_RESOLVER_APPLICATION';
      SELECT count(*) INTO STRICT v_recovery_backend_count
      FROM pg_catalog.pg_stat_activity AS activity
      WHERE activity.datname = pg_catalog.current_database()
        AND activity.application_name LIKE
          'social-monitor/telemetry-resolve/%';
      SELECT count(*) INTO STRICT v_mutation_count
      FROM pg_catalog.pg_locks AS lock
      JOIN pg_catalog.pg_stat_activity AS activity ON activity.pid = lock.pid
      WHERE lock.locktype = 'advisory'
        AND lock.classid = $READER_SUMMARY_TELEMETRY_GUARD_CLASSID::OID
        AND lock.objid = $READER_SUMMARY_TELEMETRY_MUTATION_OBJID::OID
        AND lock.objsubid = 2 AND lock.granted
        AND lock.pid = $READER_SUMMARY_TELEMETRY_MUTATION_BACKEND_PID
        AND activity.backend_start =
          '$READER_SUMMARY_TELEMETRY_MUTATION_BACKEND_START'::TIMESTAMPTZ
        AND activity.application_name =
          '$READER_SUMMARY_TELEMETRY_MUTATION_APPLICATION';
      IF v_holder_count <> 1 OR (SELECT count(*)
        FROM pg_catalog.pg_locks AS lock
        WHERE lock.locktype = 'advisory'
          AND lock.classid = $READER_SUMMARY_TELEMETRY_GUARD_CLASSID::OID
          AND lock.objid = $READER_SUMMARY_TELEMETRY_GUARD_OBJID::OID
          AND lock.objsubid = 2 AND lock.granted) <> 1 THEN
        PERFORM pg_catalog.pg_terminate_backend(activity.pid)
        FROM pg_catalog.pg_stat_activity AS activity
        WHERE activity.datname = pg_catalog.current_database()
          AND activity.application_name =
            '$READER_SUMMARY_TELEMETRY_RESOLVER_APPLICATION';
        RAISE EXCEPTION
          'telemetry recovery guard lost; resolver backends terminated';
      END IF;
      IF v_recovery_backend_count <> v_resolver_count OR v_resolver_count > 1
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity AS activity
          WHERE activity.datname = pg_catalog.current_database()
            AND activity.application_name =
              '$READER_SUMMARY_TELEMETRY_RESOLVER_APPLICATION'
            AND activity.usename IS DISTINCT FROM session_user)
      THEN
        PERFORM pg_catalog.pg_terminate_backend(activity.pid)
        FROM pg_catalog.pg_stat_activity AS activity
        WHERE activity.datname = pg_catalog.current_database()
          AND activity.application_name LIKE
            'social-monitor/telemetry-resolve/%';
        RAISE EXCEPTION
          'telemetry recovery resolver identity or multiplicity changed';
      END IF;
      IF v_resolver_count > 0 THEN
        v_resolver_seen := TRUE;
      ELSIF pg_catalog.clock_timestamp() >
          v_started_at + INTERVAL '10 seconds' THEN
        IF NOT v_resolver_seen THEN
          RAISE EXCEPTION
            'telemetry recovery resolver backend was never observed';
        END IF;
      END IF;
      IF v_mutation_count = 0 THEN
        IF NOT v_resolver_seen OR v_resolver_count <> 0 THEN
          RAISE EXCEPTION
            'telemetry recovery mutation ended with resolver drift';
        END IF;
        RETURN;
      ELSIF v_mutation_count <> 1 OR (SELECT count(*)
        FROM pg_catalog.pg_locks AS lock
        WHERE lock.locktype = 'advisory'
          AND lock.classid = $READER_SUMMARY_TELEMETRY_GUARD_CLASSID::OID
          AND lock.objid = $READER_SUMMARY_TELEMETRY_MUTATION_OBJID::OID
          AND lock.objsubid = 2 AND lock.granted) <> 1 THEN
        RAISE EXCEPTION 'telemetry recovery mutation lease changed';
      END IF;
      PERFORM pg_catalog.pg_sleep(0.001);
    END LOOP;
  END
  \$watchdog\$;
  COMMIT;"
  reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" \
    "social-monitor/telemetry-watchdog/$READER_SUMMARY_TELEMETRY_GUARD_NONCE" \
    catalog "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" "$query"
}

with_reader_summary_telemetry_database_guard() (
  local output watcher_output mutation_lease_output
  local guard_line watchdog_line mutation_line
  local guard_pid='' watcher_pid='' mutation_pid='' mutation_group=''
  local mutation_lease_pid=''
  local ready=false watcher_ready=false mutation_lease_ready=false
  local attempt status=0 watcher_status=0
  local release_status=0
  umask 077
  output=$(mktemp "${TMPDIR:-/tmp}/reader-summary-telemetry-guard.XXXXXX") || return
  watcher_output=$(mktemp \
    "${TMPDIR:-/tmp}/reader-summary-telemetry-watchdog.XXXXXX") || return
  mutation_lease_output=$(mktemp \
    "${TMPDIR:-/tmp}/reader-summary-telemetry-mutation.XXXXXX") || return
  terminate_reader_summary_telemetry_mutation() {
    local target=${mutation_group:-$mutation_pid}
    [[ -n $target ]] || return 0
    kill -TERM -- "-$target" 2>/dev/null ||
      kill -TERM "$target" 2>/dev/null || true
    sleep 0.1
    kill -KILL -- "-$target" 2>/dev/null || true
    if [[ -n $mutation_pid ]]; then
      wait "$mutation_pid" 2>/dev/null || true
    fi
    mutation_pid=''
    mutation_group=''
  }
  cleanup_reader_summary_telemetry_guard() {
    terminate_reader_summary_telemetry_mutation
    if [[ $mutation_lease_ready == true ]]; then
      if ! reader_summary_telemetry_release_mutation_lease >/dev/null 2>&1; then
        kill "$mutation_lease_pid" 2>/dev/null || true
      fi
      mutation_lease_ready=false
    elif [[ -n $mutation_lease_pid ]]; then
      kill "$mutation_lease_pid" 2>/dev/null || true
    fi
    if [[ $ready == true ]]; then
      if ! reader_summary_telemetry_release_database_guard >/dev/null 2>&1; then
        kill "$guard_pid" 2>/dev/null || true
      fi
      ready=false
    elif [[ -n $guard_pid ]]; then
      kill "$guard_pid" 2>/dev/null || true
    fi
    if [[ -n $watcher_pid ]]; then
      wait "$watcher_pid" 2>/dev/null || true
    fi
    if [[ -n $mutation_lease_pid ]]; then
      wait "$mutation_lease_pid" 2>/dev/null || true
    fi
    if [[ -n $guard_pid ]]; then
      wait "$guard_pid" 2>/dev/null || true
    fi
    rm -f -- "$output" "$watcher_output" "$mutation_lease_output"
  }
  trap cleanup_reader_summary_telemetry_guard EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  READER_SUMMARY_TELEMETRY_GUARD_NONCE=$(od -An -N12 -tx1 /dev/urandom | \
    tr -d ' \n') || return
  [[ $READER_SUMMARY_TELEMETRY_GUARD_NONCE =~ ^[0-9a-f]{24}$ ]] || return 65
  READER_SUMMARY_TELEMETRY_GUARD_APPLICATION="$READER_SUMMARY_TELEMETRY_GUARD_APPLICATION_PREFIX/$READER_SUMMARY_TELEMETRY_GUARD_NONCE"
  READER_SUMMARY_TELEMETRY_RESOLVER_APPLICATION="$READER_SUMMARY_TELEMETRY_RESOLVER_APPLICATION_PREFIX/$READER_SUMMARY_TELEMETRY_GUARD_NONCE"
  reader_summary_telemetry_hold_database_guard >"$output" 2>&1 &
  guard_pid=$!
  for ((attempt = 0; attempt < 150; attempt++)); do
    guard_line=$(grep -E \
      '^guard-held\|[1-9][0-9]*\|[^|]+\|[0-9a-f]{24}$' "$output" | \
      tail -1 || true)
    if [[ -n $guard_line ]]; then
      IFS='|' read -r _ READER_SUMMARY_TELEMETRY_GUARD_PID \
        READER_SUMMARY_TELEMETRY_GUARD_BACKEND_START \
        READER_SUMMARY_TELEMETRY_GUARD_NONCE <<< "$guard_line"
      [[ $READER_SUMMARY_TELEMETRY_GUARD_APPLICATION == "$READER_SUMMARY_TELEMETRY_GUARD_APPLICATION_PREFIX/$READER_SUMMARY_TELEMETRY_GUARD_NONCE" ]] || return 65
      ready=true
      break
    fi
    kill -0 "$guard_pid" 2>/dev/null || return 65
    sleep 0.1
  done
  [[ $ready == true ]] || return 75
  authorize_reader_summary_telemetry_recovery || return
  reader_summary_telemetry_hold_mutation_lease >"$mutation_lease_output" 2>&1 &
  mutation_lease_pid=$!
  for ((attempt = 0; attempt < 150; attempt++)); do
    mutation_line=$(grep -E '^mutation-held\|[1-9][0-9]*\|[^|]+$' \
      "$mutation_lease_output" | tail -1 || true)
    if [[ -n $mutation_line ]]; then
      IFS='|' read -r _ READER_SUMMARY_TELEMETRY_MUTATION_BACKEND_PID \
        READER_SUMMARY_TELEMETRY_MUTATION_BACKEND_START <<< "$mutation_line"
      mutation_lease_ready=true
      break
    fi
    kill -0 "$mutation_lease_pid" 2>/dev/null || return 65
    sleep 0.1
  done
  [[ $mutation_lease_ready == true ]] || return 75
  reader_summary_telemetry_watch_database_guard >"$watcher_output" 2>&1 &
  watcher_pid=$!
  for ((attempt = 0; attempt < 150; attempt++)); do
    watchdog_line=$(grep -E '^watchdog-held\|[1-9][0-9]*$' \
      "$watcher_output" | tail -1 || true)
    if [[ -n $watchdog_line ]]; then watcher_ready=true; break; fi
    kill -0 "$watcher_pid" 2>/dev/null || return 65
    sleep 0.1
  done
  [[ $watcher_ready == true ]] || return 75
  set -m
  mark_exact_reader_summary_telemetry_migration_rolled_back &
  mutation_pid=$!
  mutation_group=$mutation_pid
  set +m
  while kill -0 "$mutation_pid" 2>/dev/null; do
    if ! kill -0 "$guard_pid" 2>/dev/null; then
      terminate_reader_summary_telemetry_mutation
      return 65
    fi
    if ! kill -0 "$watcher_pid" 2>/dev/null; then
      wait "$watcher_pid" || watcher_status=$?
      watcher_pid=''
      terminate_reader_summary_telemetry_mutation
      return 65
    fi
    sleep 0.02
  done
  wait "$mutation_pid" || status=$?
  mutation_pid=''
  while kill -0 -- "-$mutation_group" 2>/dev/null; do
    kill -0 "$guard_pid" 2>/dev/null || return 65
    if ! kill -0 "$watcher_pid" 2>/dev/null; then
      wait "$watcher_pid" 2>/dev/null || true
      watcher_pid=''
      return 65
    fi
    sleep 0.01
  done
  mutation_group=''
  if ((status == 0)); then
    reader_summary_telemetry_release_mutation_lease >/dev/null 2>&1 || return 65
    mutation_lease_ready=false
    wait "$mutation_lease_pid" 2>/dev/null || true
    mutation_lease_pid=''
    wait "$watcher_pid" || watcher_status=$?
  else
    kill "$watcher_pid" 2>/dev/null || true
    wait "$watcher_pid" 2>/dev/null || true
  fi
  watcher_pid=''
  ((status == 0)) || return "$status"
  ((watcher_status == 0)) || return 65
  kill -0 "$guard_pid" 2>/dev/null || return 65
  reader_summary_telemetry_assert_database_guard || return 65
  verify_reader_summary_telemetry_recovery_postflight || return
  "$@" || return
  complete_reader_summary_telemetry_recovery_attestation || return
  reader_summary_telemetry_release_database_guard >/dev/null 2>&1 || release_status=$?
  ready=false
  if ((release_status != 0)); then
    kill "$guard_pid" 2>/dev/null || true
  fi
  wait "$guard_pid" 2>/dev/null || true
  rm -f -- "$output" "$watcher_output" "$mutation_lease_output"
  trap - EXIT HUP INT TERM
  ((release_status == 0)) || return 65
  return "$status"
)

mark_exact_reader_summary_telemetry_migration_rolled_back() {
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt

  # shellcheck disable=SC2016 # Expansion occurs in the child shell.
  "${COMPOSE[@]}" --profile app run -T --rm --no-deps \
    --user 0:0 \
    -e "READER_SUMMARY_TELEMETRY_RESOLVER_APPLICATION=$READER_SUMMARY_TELEMETRY_RESOLVER_APPLICATION" \
    -v "$secret:/run/secrets/reader-summary-publication-admin-url:ro" \
    -v "$ca_certificate:/run/social-monitor-db/ca-certificate.crt:ro" \
    migrate sh -c '
      set -eu
      set +x
      migration=20260824120000_reader_summary_daily_model_job_telemetry
      DATABASE_URL=$(cat /run/secrets/reader-summary-publication-admin-url)
      case "$READER_SUMMARY_TELEMETRY_RESOLVER_APPLICATION" in
        social-monitor/telemetry-resolve/[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
        *) exit 65 ;;
      esac
      case "$DATABASE_URL" in
        *\?*) DATABASE_URL="$DATABASE_URL&application_name=$READER_SUMMARY_TELEMETRY_RESOLVER_APPLICATION" ;;
        *) DATABASE_URL="$DATABASE_URL?application_name=$READER_SUMMARY_TELEMETRY_RESOLVER_APPLICATION" ;;
      esac
      export DATABASE_URL
      exec npx prisma migrate resolve --rolled-back "$migration" \
        --schema prisma/schema.prisma
    '
}

resolve_reader_summary_telemetry_migration_failure() {
  local state
  (($# > 0)) || return 64
  verify_reader_summary_telemetry_recovery_target || return
  state=$(reader_summary_telemetry_deployment_state) || return
  case $state in
    clean|corrected|recovered) "$@" ;;
    recovery-required)
      with_reader_summary_telemetry_database_guard "$@"
      ;;
    *) return 65 ;;
  esac
}
