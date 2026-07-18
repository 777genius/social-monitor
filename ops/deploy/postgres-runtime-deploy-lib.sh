#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh after its project paths and
# fail helper are defined. Keeping the transaction here preserves the root
# entrypoint's source-line cap without making this file independently runnable.

activate_postgres_runtime_control() {
  local sha=$1
  local compatible_backend_sha=${2:-$sha}
  activate_postgres_runtime_control_transaction "$sha" "$compatible_backend_sha"
  local activation_status=$?
  ((activation_status == 0)) || return "$activation_status"
  if [[ ${COMPOSE[-1]} != "$POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml" ]]; then
    COMPOSE+=(
      -f "$POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml"
    )
  fi
}

rollback_postgres_runtime_control_activation() {
  local staged_release=$1
  local next_link=$2
  local current_link=$3
  local previous_target=$4
  local backup=$5
  local unit_directory=$6
  local unit
  local -a units=(
    social-monitor-daily.service
    social-monitor-prod.service
  )

  rm -rf "$staged_release"
  rm -f "$next_link" "$current_link"
  if [[ -n $previous_target ]]; then
    ln -s "$previous_target" "$current_link"
  fi
  for unit in "${units[@]}"; do
    if [[ -e $backup/$unit ]]; then
      cp -a "$backup/$unit" "$unit_directory/$unit.restore"
      mv -f "$unit_directory/$unit.restore" "$unit_directory/$unit"
    else
      rm -f "$unit_directory/$unit"
    fi
  done
  if [[ -f $backup/daily-run.sh ]]; then
    cp -a "$backup/daily-run.sh" "$CONTROL/daily-run.sh.restore"
    mv -f "$CONTROL/daily-run.sh.restore" "$CONTROL/daily-run.sh"
  elif [[ -f $backup/daily-run.sh.absent ]]; then
    rm -f "$CONTROL/daily-run.sh"
  fi
  if ((EUID == 0)) && [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    systemctl daemon-reload || true
  fi
  rm -rf "$backup"
}

activate_postgres_runtime_control_transaction() (
  set -euo pipefail
  local sha=$1
  local compatible_backend_sha=${2:-$sha}
  local source=$REPO/ops/deploy/production-runtime
  local release=$POSTGRES_RUNTIME_RELEASES/$sha
  local staged_release=$release.next.$$
  local next_link=$POSTGRES_RUNTIME_CURRENT.next.$$
  local backup=$STATE/postgres-runtime-control-backup.$$
  local previous_target
  local cleanup_command
  local unit
  local -a units=(
    social-monitor-daily.service
    social-monitor-prod.service
  )

  [[ $sha =~ ^[0-9a-f]{40}$ && \
     $compatible_backend_sha =~ ^[0-9a-f]{40}$ ]] || \
    fail 'PostgreSQL runtime control release markers are invalid'

  previous_target=$(readlink "$POSTGRES_RUNTIME_CURRENT" 2>/dev/null || true)
  install -d -m 0700 "$backup"
  for unit in "${units[@]}"; do
    if [[ -e $SYSTEMD_UNIT_DIR/$unit ]]; then
      cp -a "$SYSTEMD_UNIT_DIR/$unit" "$backup/$unit"
    else
      : > "$backup/$unit.absent"
    fi
  done
  if [[ -e $CONTROL/daily-run.sh ]]; then
    cp -a "$CONTROL/daily-run.sh" "$backup/daily-run.sh"
  else
    : > "$backup/daily-run.sh.absent"
  fi
  printf -v cleanup_command \
    'rollback_postgres_runtime_control_activation %q %q %q %q %q %q' \
    "$staged_release" "$next_link" "$POSTGRES_RUNTIME_CURRENT" \
    "$previous_target" "$backup" "$SYSTEMD_UNIT_DIR"
  # Literal, shell-escaped paths must be captured before local scope unwinds.
  # shellcheck disable=SC2064
  trap "$cleanup_command" EXIT

  install -d -m 0755 "$POSTGRES_RUNTIME_RELEASES" "$SYSTEMD_UNIT_DIR"
  if [[ ! -f $release/SOURCE_SHA || $(cat "$release/SOURCE_SHA") != "$sha" || \
        ! -f $release/READY || \
        $(cat "$release/READY") != "$compatible_backend_sha" ]]; then
    [[ ! -e $release ]] || fail 'PostgreSQL runtime control release is incomplete'
    [[ ! -e $staged_release ]] || fail 'PostgreSQL runtime control staging path exists'
    install -d -m 0755 "$staged_release"
    install -m 0644 "$source/compose.postgres-runtime.yml" \
      "$staged_release/compose.postgres-runtime.yml"
    install -m 0755 "$source/daily-run.sh" "$staged_release/daily-run.sh"
    install -m 0644 "$source/social-monitor-daily.service" \
      "$staged_release/social-monitor-daily.service"
    install -m 0644 "$source/social-monitor-prod.service" \
      "$staged_release/social-monitor-prod.service"
    printf '%s\n' "$sha" > "$staged_release/SOURCE_SHA"
    printf '%s\n' "$compatible_backend_sha" > "$staged_release/READY"
    mv "$staged_release" "$release"
  fi

  for unit in "${units[@]}"; do
    install -m 0644 "$release/$unit" "$SYSTEMD_UNIT_DIR/$unit.next"
    mv -f "$SYSTEMD_UNIT_DIR/$unit.next" "$SYSTEMD_UNIT_DIR/$unit"
  done
  install -m 0755 "$release/daily-run.sh" "$CONTROL/daily-run.sh.next"
  mv -f "$CONTROL/daily-run.sh.next" "$CONTROL/daily-run.sh"
  ln -s "$release" "$next_link"
  mv -Tf "$next_link" "$POSTGRES_RUNTIME_CURRENT"
  if ((EUID == 0)) && [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    systemctl daemon-reload
  fi
  verify_installed_postgres_runtime_control "$sha" "$compatible_backend_sha"
  trap - EXIT
  rm -rf "$backup"
)

verify_installed_postgres_runtime_control() {
  local sha=$1
  local compatible_backend_sha=${2:-$sha}
  local source=$REPO/ops/deploy/production-runtime
  local release=$POSTGRES_RUNTIME_RELEASES/$sha
  local unit
  local -a units=(
    social-monitor-daily.service
    social-monitor-prod.service
  )

  [[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$release" ]] || \
    fail 'PostgreSQL runtime control symlink is not on the release'
  [[ -f $release/SOURCE_SHA && $(cat "$release/SOURCE_SHA") == "$sha" ]] || \
    fail 'PostgreSQL runtime control source marker is invalid'
  [[ -f $release/READY && \
     $(cat "$release/READY") == "$compatible_backend_sha" ]] || \
    fail 'PostgreSQL runtime control backend-compatibility marker is invalid'
  cmp -s "$source/compose.postgres-runtime.yml" \
    "$POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml" || \
    fail 'installed PostgreSQL Compose overlay differs from the release'
  cmp -s "$source/daily-run.sh" "$POSTGRES_RUNTIME_CURRENT/daily-run.sh" || \
    fail 'installed daily runner differs from the release'
  cmp -s "$POSTGRES_RUNTIME_CURRENT/daily-run.sh" "$CONTROL/daily-run.sh" || \
    fail 'control-owned daily launcher differs from the PostgreSQL release'
  for unit in "${units[@]}"; do
    cmp -s "$source/$unit" "$release/$unit" || \
      fail "versioned systemd unit differs from the release source: $unit"
    cmp -s "$release/$unit" "$SYSTEMD_UNIT_DIR/$unit" || \
      fail "installed systemd unit differs from the release: $unit"
  done
  if ((EUID == 0)) && [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    for unit in "${units[@]}"; do
      [[ $(systemctl show --property=FragmentPath --value "$unit") == \
        "$SYSTEMD_UNIT_DIR/$unit" ]] || \
        fail "systemd is not using the installed unit: $unit"
      [[ -z $(systemctl show --property=DropInPaths --value "$unit") ]] || \
        fail "systemd unit has an unreviewed drop-in: $unit"
    done
    verify_effective_postgres_daily_topology
  fi
}

snapshot_postgres_runtime_control() {
  local sha=$1
  local backup=$STATE/postgres-runtime-release-rollback-${sha:0:12}.$$
  local target unit
  local -a units=(
    social-monitor-daily.service
    social-monitor-prod.service
  )

  install -d -m 0700 "$backup"
  target=$(readlink "$POSTGRES_RUNTIME_CURRENT" 2>/dev/null || true)
  if [[ -n $target ]]; then
    printf '%s\n' "$target" > "$backup/current-target"
  elif [[ -e $POSTGRES_RUNTIME_CURRENT || -L $POSTGRES_RUNTIME_CURRENT ]]; then
    fail 'PostgreSQL runtime current path is not a symlink'
  else
    : > "$backup/current.absent"
  fi
  for unit in "${units[@]}"; do
    if [[ -e $SYSTEMD_UNIT_DIR/$unit ]]; then
      cp -a "$SYSTEMD_UNIT_DIR/$unit" "$backup/$unit"
    else
      : > "$backup/$unit.absent"
    fi
  done
  if [[ -e $CONTROL/daily-run.sh ]]; then
    cp -a "$CONTROL/daily-run.sh" "$backup/daily-run.sh"
  else
    : > "$backup/daily-run.sh.absent"
  fi
  printf '%s\n' "$backup"
}

restore_postgres_runtime_control() {
  local backup=$1
  local next_link=$POSTGRES_RUNTIME_CURRENT.rollback.$$
  local target unit
  local -a units=(
    social-monitor-daily.service
    social-monitor-prod.service
  )

  [[ -d $backup ]] || return 1
  rm -f "$next_link"
  if [[ -f $backup/current-target ]]; then
    target=$(cat "$backup/current-target")
    [[ -n $target ]] || return 1
    ln -s "$target" "$next_link" || return 1
    mv -Tf "$next_link" "$POSTGRES_RUNTIME_CURRENT" || return 1
  elif [[ -f $backup/current.absent ]]; then
    rm -f "$POSTGRES_RUNTIME_CURRENT" || return 1
  else
    return 1
  fi
  for unit in "${units[@]}"; do
    if [[ -f $backup/$unit ]]; then
      cp -a "$backup/$unit" "$SYSTEMD_UNIT_DIR/$unit.restore" || return 1
      mv -f "$SYSTEMD_UNIT_DIR/$unit.restore" "$SYSTEMD_UNIT_DIR/$unit" || return 1
    elif [[ -f $backup/$unit.absent ]]; then
      rm -f "$SYSTEMD_UNIT_DIR/$unit" || return 1
    else
      return 1
    fi
  done
  if [[ -f $backup/daily-run.sh ]]; then
    cp -a "$backup/daily-run.sh" "$CONTROL/daily-run.sh.restore" || return 1
    mv -f "$CONTROL/daily-run.sh.restore" "$CONTROL/daily-run.sh" || return 1
  elif [[ -f $backup/daily-run.sh.absent ]]; then
    rm -f "$CONTROL/daily-run.sh" || return 1
  else
    return 1
  fi
  if ((EUID == 0)) && [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    systemctl daemon-reload || return 1
  fi
  rm -rf "$backup"
}

verify_effective_postgres_daily_topology() (
  set -euo pipefail
  local legacy_timer=social-monitor-daily.timer
  local legacy_service=social-monitor-daily.service
  local v6_timer=social-monitor-reader-summary-production-day.timer
  local v6_service=social-monitor-reader-summary-production-day.service
  local timer service runner
  local legacy_enabled=false v6_enabled=false
  local effective_service=$STATE/postgres-daily-service.$$.unit
  trap 'rm -f "$effective_service"' EXIT

  systemctl is-enabled --quiet "$legacy_timer" && legacy_enabled=true
  systemctl is-enabled --quiet "$v6_timer" && v6_enabled=true
  if [[ $legacy_enabled == "$v6_enabled" ]]; then
    fail 'exactly one reviewed production daily timer must be enabled'
  fi
  if [[ $v6_enabled == true ]]; then
    timer=$v6_timer
    service=$v6_service
    runner=$CONTROL/run-reader-summary-production-day.sh
  else
    timer=$legacy_timer
    service=$legacy_service
    runner=$CONTROL/daily-run.sh
  fi
  [[ -f $runner ]] || fail 'effective production daily runner is unavailable'
  [[ -z $(systemctl show --property=DropInPaths --value "$timer") ]] || \
    fail "systemd daily timer has an unreviewed drop-in: $timer"
  [[ -z $(systemctl show --property=DropInPaths --value "$service") ]] || \
    fail "systemd daily service has an unreviewed drop-in: $service"
  systemctl cat "$service" > "$effective_service" || \
    fail 'effective production daily service is unavailable'
  python3 "$REPO/ops/deploy/verify-postgres-runtime-topology.py" \
    daily "$effective_service" "$runner"
)

capture_effective_postgres_environment() {
  local output=$1
  local api_id database_url
  api_id=$("${COMPOSE[@]}" --profile app ps -q api)
  [[ -n $api_id ]] || fail 'production API container is unavailable for PostgreSQL discovery'
  database_url=$(docker inspect "$api_id" --format '{{range .Config.Env}}{{println .}}{{end}}' | \
    awk -F= '$1 == "DATABASE_URL" {sub(/^[^=]*=/, ""); print; exit}')
  [[ -n $database_url ]] || fail 'production API has no effective database URL'
  umask 077
  printf 'DATABASE_URL=%s\n' "$database_url" > "$output"
}

capture_live_postgres_capacity() (
  local output=$1
  local env_file=$2
  [[ -s $env_file ]] || fail 'effective PostgreSQL environment is unavailable'
  local postgres_image=postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
  docker run --rm \
    --env-file "$env_file" \
    --env PGAPPNAME=social-monitor/capacity-verifier \
    -v "$ROOT/secrets/db/ca-certificate.crt:/run/social-monitor-db/ca-certificate.crt:ro" \
    "$postgres_image" \
    sh -c 'psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "$1"' _ \
    "SELECT json_build_object(
      'serverMaxConnections', current_setting('max_connections')::integer,
      'superuserReservedConnections', current_setting('superuser_reserved_connections')::integer,
      'reservedConnections', COALESCE(NULLIF(current_setting('reserved_connections', true), ''), '0')::integer,
      'roleConnectionLimit', (SELECT rolconnlimit FROM pg_roles WHERE rolname = current_user),
      'databaseConnectionLimit', (SELECT datconnlimit FROM pg_database WHERE datname = current_database()),
      'totalClientConnectionOccupancy', (
        SELECT count(*) FROM pg_stat_activity
        WHERE backend_type = 'client backend' AND pid <> pg_backend_pid()
      ),
      'managedRuntimeConnectionOccupancy', (
        SELECT count(*) FROM pg_stat_activity
        WHERE backend_type = 'client backend'
          AND pid <> pg_backend_pid()
          AND application_name = ANY (ARRAY[
            'social-monitor/runtime/api-gateway',
            'social-monitor/runtime/ingestion-worker',
            'social-monitor/runtime/intelligence-worker',
            'social-monitor/runtime/delivery-service',
            'social-monitor/runtime/event-relay',
            'social-monitor/runtime/social-research-grpc',
            'social-monitor/runtime/social-research-mcp',
            'social-monitor/runtime/daily-runner',
            'social-monitor/runtime/admin-tool'
          ])
      ),
      'stoppedRuntimeConnectionOccupancy', (
        SELECT count(*) FROM pg_stat_activity
        WHERE backend_type = 'client backend'
          AND pid <> pg_backend_pid()
          AND application_name = ANY (ARRAY[
            'social-monitor/runtime/api-gateway',
            'social-monitor/runtime/ingestion-worker',
            'social-monitor/runtime/intelligence-worker',
            'social-monitor/runtime/delivery-service',
            'social-monitor/runtime/event-relay'
          ])
      ),
      'externalConnectionOccupancy', (
        SELECT count(*) FROM pg_stat_activity
        WHERE backend_type = 'client backend'
          AND pid <> pg_backend_pid()
          AND application_name <> ALL (ARRAY[
            'social-monitor/runtime/api-gateway',
            'social-monitor/runtime/ingestion-worker',
            'social-monitor/runtime/intelligence-worker',
            'social-monitor/runtime/delivery-service',
            'social-monitor/runtime/event-relay',
            'social-monitor/runtime/social-research-grpc',
            'social-monitor/runtime/social-research-mcp',
            'social-monitor/runtime/daily-runner',
            'social-monitor/runtime/admin-tool'
          ])
      ),
      'capturePhase', 'post-old-container-stop-pre-new-start'
    )::text" > "$output"
  [[ -s $output ]] || fail 'live PostgreSQL capacity discovery returned no facts'
)

verify_live_postgres_admission() (
  local env_file=$1
  local rendered=$STATE/postgres-admission-rendered.$$.json
  local capacity=$STATE/postgres-admission-capacity.$$.json
  trap 'rm -f "$rendered" "$capacity"' EXIT
  umask 077
  "${COMPOSE[@]}" --profile app --profile daily config --format json > "$rendered"
  capture_live_postgres_capacity "$capacity" "$env_file"
  python3 "$REPO/ops/deploy/verify-postgres-runtime-topology.py" \
    "$rendered" "$capacity" "$ROOT/secrets/production.env"
)

probe_postgres_maximum_envelope() {
  local env_file=$1
  [[ -s $env_file ]] || fail 'effective PostgreSQL environment is unavailable for envelope probe'
  local postgres_image=postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
  local -a slots=(
    api-1 api-2
    ingestion-1 ingestion-2
    intelligence-1 intelligence-2
    delivery-1 event-relay-1
    daily-1 daily-2 daily-auxiliary-1
    manual-1 manual-2 manual-3
    optional-1
  )
  docker run --rm \
    --env-file "$env_file" \
    -v "$ROOT/secrets/db/ca-certificate.crt:/run/social-monitor-db/ca-certificate.crt:ro" \
    "$postgres_image" \
    sh -c '
      set -eu
      pids=""
      trap '\''for pid in $pids; do kill "$pid" 2>/dev/null || true; done'\'' EXIT
      managed=$(PGAPPNAME=social-monitor/envelope-probe-planner \
        psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc \
        "SELECT count(*) FROM pg_stat_activity WHERE backend_type = '\''client backend'\'' AND application_name = ANY (ARRAY['\''social-monitor/runtime/api-gateway'\'', '\''social-monitor/runtime/ingestion-worker'\'', '\''social-monitor/runtime/intelligence-worker'\'', '\''social-monitor/runtime/delivery-service'\'', '\''social-monitor/runtime/event-relay'\'', '\''social-monitor/runtime/social-research-grpc'\'', '\''social-monitor/runtime/social-research-mcp'\'', '\''social-monitor/runtime/daily-runner'\'', '\''social-monitor/runtime/admin-tool'\''])" \
        2>/dev/null) || exit 69
      [ -n "$managed" ] || exit 69
      case "$managed" in *[!0-9]*) exit 69 ;; esac
      [ "$managed" -le 15 ] || exit 72
      sleepers=$((15 - managed))
      launched=0
      for slot in "$@"; do
        [ "$launched" -lt "$sleepers" ] || break
        PGAPPNAME="social-monitor/envelope-probe/$slot" \
          psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
          -c "BEGIN READ ONLY; SELECT 1; SELECT pg_sleep(12); COMMIT" \
          >/dev/null 2>&1 &
        pids="$pids $!"
        launched=$((launched + 1))
      done
      [ "$launched" -eq "$sleepers" ] || exit 73
      observed=0
      for _attempt in 1 2 3 4 5 6 7 8; do
        observed=$(PGAPPNAME=social-monitor/envelope-probe/optional-2 \
          psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc \
          "SELECT count(*) FROM pg_stat_activity WHERE backend_type = '\''client backend'\'' AND (application_name LIKE '\''social-monitor/envelope-probe/%'\'' OR application_name = ANY (ARRAY['\''social-monitor/runtime/api-gateway'\'', '\''social-monitor/runtime/ingestion-worker'\'', '\''social-monitor/runtime/intelligence-worker'\'', '\''social-monitor/runtime/delivery-service'\'', '\''social-monitor/runtime/event-relay'\'', '\''social-monitor/runtime/social-research-grpc'\'', '\''social-monitor/runtime/social-research-mcp'\'', '\''social-monitor/runtime/daily-runner'\'', '\''social-monitor/runtime/admin-tool'\'']))" \
          2>/dev/null) || exit 70
        [ "$observed" -eq 16 ] && break
        sleep 1
      done
      [ "$observed" -eq 16 ] || exit 71
      for pid in $pids; do wait "$pid"; done
      trap - EXIT
    ' _ "${slots[@]}" >/dev/null 2>&1 || \
    fail 'bounded PostgreSQL maximum-envelope concurrency probe failed'
}

capture_backend_soak_baseline() {
  local output=$1
  shift
  : > "$output"
  local service container restart_count cursor
  local -a container_ids
  for service in "$@"; do
    mapfile -t container_ids < <("${COMPOSE[@]}" --profile app ps -q "$service")
    ((${#container_ids[@]} == 1)) || return 1
    container=${container_ids[0]}
    restart_count=$(docker inspect "$container" --format '{{.RestartCount}}') || return 1
    [[ $restart_count =~ ^[0-9]+$ ]] || return 1
    cursor=$(date --utc --iso-8601=ns) || return 1
    printf '%s %s %s %s\n' \
      "$service" "$container" "$restart_count" "$cursor" >> "$output"
  done
  LC_ALL=C sort -o "$output" "$output"
}

verify_backend_soak_state() {
  local baseline=$1
  local service expected_container expected_restarts cursor actual_restarts
  local -a container_ids
  while read -r service expected_container expected_restarts cursor; do
    mapfile -t container_ids < <("${COMPOSE[@]}" --profile app ps -q "$service")
    ((${#container_ids[@]} == 1)) || return 1
    [[ ${container_ids[0]} == "$expected_container" ]] || return 1
    actual_restarts=$(docker inspect "$expected_container" --format '{{.RestartCount}}') || return 1
    [[ $actual_restarts == "$expected_restarts" ]] || return 1
  done < "$baseline"
}

assert_backend_soak_log_is_clean() {
  local log=$1
  local service=$2
  if grep -Eiq \
    'SQLSTATE[[:space:]_:=.-]*53300|(^|[^0-9])53300([^0-9]|$)|TooManyConnections|too[ _-]*many[ _-]*connections|postgres[.]too_many_connections|upstream[^[:cntrl:]]*502|502[^[:cntrl:]]*upstream|status[[:space:]_:=.-]+502|HTTP/[0-9.]+"[[:space:]]+502' \
    "$log"; then
    printf 'deploy-error: %s emitted a redacted database-capacity or upstream-502 failure during soak\n' \
      "$service" >&2
    return 1
  fi
}

verify_backend_soak_logs() (
  local baseline=$1
  local log=$STATE/backend-soak-log.$$.txt
  local service container _restarts cursor
  trap 'rm -f "$log"' EXIT
  while read -r service container _restarts cursor; do
    docker logs --since "$cursor" "$container" > "$log" 2>&1 || return 1
    assert_backend_soak_log_is_clean "$log" "$service" || return 1
  done < "$baseline"
)

verify_ingestion_queue_recovery() (
  local baseline=$1
  local log=$STATE/backend-soak-ingestion.$$.txt
  local service container _restarts cursor
  trap 'rm -f "$log"' EXIT
  while read -r service container _restarts cursor; do
    [[ $service == ingestion-worker ]] || continue
    docker logs --since "$cursor" "$container" > "$log" 2>&1 || return 1
    grep -E 'scan queue drain loop tick completed.*failed=0' "$log" >/dev/null || {
      printf 'deploy-error: ingestion queue did not prove a failure-free recovery tick during soak\n' >&2
      return 1
    }
    return 0
  done < "$baseline"
  return 1
)

verify_concurrent_backend_readiness() {
  local -a pids=()
  local _attempt pid status=0
  for _attempt in 1 2 3 4; do
    curl -fsS --max-time 15 http://127.0.0.1:13000/ready \
      >/dev/null 2>&1 &
    pids+=("$!")
    curl -fsS --max-time 15 \
      -H 'Host: social-monitor.app' \
      http://127.0.0.1:13080/ready >/dev/null 2>&1 &
    pids+=("$!")
  done
  for pid in "${pids[@]}"; do
    wait "$pid" || status=1
  done
  ((status == 0))
}

verify_frontend_api_proxy() {
  local frontend_id status oom
  frontend_id=$("${COMPOSE[@]}" --profile app ps -q frontend)
  [[ -n $frontend_id ]] || return 1
  status=$(docker inspect "$frontend_id" --format '{{.State.Status}}')
  oom=$(docker inspect "$frontend_id" --format '{{.State.OOMKilled}}')
  [[ $status == running && $oom == false ]] || return 1
  curl -fsS --max-time 15 \
    -H 'Host: social-monitor.app' \
    http://127.0.0.1:13080/auth/session >/dev/null
}

refresh_frontend_api_proxy() {
  "${COMPOSE[@]}" --profile app up -d --no-deps \
    --force-recreate frontend || return 1
  for _ in {1..20}; do
    verify_frontend_api_proxy && return 0
    sleep 3
  done
  return 1
}
