#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd "$SCRIPT_DIR/../.." && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/postgres-runtime-deploy-lib-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
POSTGRES_RUNTIME_RELEASES=$CONTROL/postgres-runtime-releases
POSTGRES_RUNTIME_CURRENT=$CONTROL/postgres-runtime-current
SYSTEMD_UNIT_DIR=$ROOT/systemd
COMPOSE=(docker compose)
SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
FAILED_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
REJECT_DROPIN=false
install -d "$STATE" "$SYSTEMD_UNIT_DIR" "$CONTROL/old-runtime"
printf 'old\n' > "$CONTROL/old-runtime/marker"
printf 'old-daily-runner\n' > "$CONTROL/daily-run.sh"
ln -s "$CONTROL/old-runtime" "$POSTGRES_RUNTIME_CURRENT"

units=(
  social-monitor-prod.service
)
for unit in "${units[@]}"; do
  printf 'old-%s\n' "$unit" > "$SYSTEMD_UNIT_DIR/$unit"
done

fail() {
  printf 'test deploy failure: %s\n' "$*" >&2
  return 1
}

systemctl() {
  if [[ $1 == daemon-reload ]]; then
    return 0
  fi
  if [[ $1 == is-enabled && $2 == --quiet ]]; then
    [[ $3 == social-monitor-daily.timer ]]
    return
  fi
  if [[ $1 == cat ]]; then
    [[ $2 == social-monitor-daily.service ]] || return 1
    printf '[Service]\nExecStart=%s/daily-run.sh --yesterday\n' "$CONTROL"
    return
  fi
  [[ $1 == show && $2 == --property=* && $3 == --value ]] || return 1
  case ${2#--property=} in
    FragmentPath) printf '%s/%s\n' "$SYSTEMD_UNIT_DIR" "$4" ;;
    DropInPaths)
      if [[ $REJECT_DROPIN == false ]]; then
        printf '\n'
      else
        printf '/unreviewed.conf\n'
      fi
      ;;
    *) return 1 ;;
  esac
}

# shellcheck source=ops/deploy/postgres-runtime-deploy-lib.sh
source "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh"

rollback_snapshot=$(snapshot_postgres_runtime_control "$SHA")
activate_postgres_runtime_control "$SHA"

release=$POSTGRES_RUNTIME_RELEASES/$SHA
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$release" ]]
[[ $(cat "$release/READY") == "$SHA" ]]
[[ ${COMPOSE[-1]} == "$POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml" ]]
cmp -s "$release/daily-run.sh" "$CONTROL/daily-run.sh"
for unit in "${units[@]}"; do
  cmp -s "$REPO/ops/deploy/production-runtime/$unit" "$release/$unit"
  cmp -s "$release/$unit" "$SYSTEMD_UNIT_DIR/$unit"
done

restore_postgres_runtime_control "$rollback_snapshot"
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]
for unit in "${units[@]}"; do
  [[ $(cat "$SYSTEMD_UNIT_DIR/$unit") == "old-$unit" ]]
done
[[ $(cat "$CONTROL/daily-run.sh") == old-daily-runner ]]

REJECT_DROPIN=true
set +e
activate_postgres_runtime_control "$FAILED_SHA" >/dev/null 2>&1
failed_status=$?
set -e
((failed_status != 0))
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]
for unit in "${units[@]}"; do
  [[ $(cat "$SYSTEMD_UNIT_DIR/$unit") == "old-$unit" ]]
done

SOAK_CONTAINER=stable-ingestion-container
SOAK_RESTARTS=7
SOAK_LOG=$FIXTURE/soak.log
docker() {
  if [[ $1 == run ]]; then
    while (($# > 0)); do
      if [[ $1 == sh && ${2:-} == -c ]]; then
        /bin/sh -n -c "$3"
        return
      fi
      shift
    done
    return 1
  fi
  if [[ $1 == compose ]]; then
    [[ ${*: -3} == 'ps -q ingestion-worker' ]] || return 1
    printf '%s\n' "$SOAK_CONTAINER"
    return
  fi
  if [[ $1 == inspect ]]; then
    [[ $2 == "$SOAK_CONTAINER" && $3 == --format && $4 == '{{.RestartCount}}' ]] || return 1
    printf '%s\n' "$SOAK_RESTARTS"
    return
  fi
  if [[ $1 == logs ]]; then
    [[ $2 == --since && $4 == "$SOAK_CONTAINER" ]] || return 1
    cat "$SOAK_LOG"
    return
  fi
  return 1
}

probe_env=$FIXTURE/probe.env
printf 'DATABASE_URL=postgresql://fixture.invalid/test\n' > "$probe_env"
probe_postgres_maximum_envelope "$probe_env"

soak_baseline=$FIXTURE/soak-baseline.txt
printf 'ingestion-worker %s %s 2026-07-15T00:00:00.000000000+00:00\n' \
  "$SOAK_CONTAINER" "$SOAK_RESTARTS" > "$soak_baseline"
printf 'scan queue drain loop tick completed failed=0 retry=0\n' > "$SOAK_LOG"
verify_backend_soak_state "$soak_baseline"
verify_backend_soak_logs "$soak_baseline"
verify_ingestion_queue_recovery "$soak_baseline"

for hostile_log in \
  'request handled errorClassification=postgres.too_many_connections' \
  'request handled errorCode=53300' \
  'proxy request handled upstream status=502' \
  'GET /ready HTTP/1.1" 502 157'; do
  printf '%s\n' "$hostile_log" > "$SOAK_LOG"
  verify_backend_soak_state "$soak_baseline"
  if verify_backend_soak_logs "$soak_baseline" >/dev/null 2>&1; then
    echo "handled hostile soak error was accepted: $hostile_log" >&2
    exit 1
  fi
done

echo 'PostgreSQL runtime deploy library tests passed'
