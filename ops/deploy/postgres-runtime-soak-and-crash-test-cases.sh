# shellcheck shell=bash
# shellcheck disable=SC2034,SC2154 # Parent fixture owns shared state used by sourced libraries.
# Sourced by the focused parent contract test; keep scenario state in one shell.
reset_daily_reconciliation_fixture
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
proxy_frontend_container=frontend-proxy-container
fake_proxy_compose() {
  [[ $* == '--profile app ps -q frontend' ]] || return 1
  printf '%s\n' "$proxy_frontend_container"
}
COMPOSE=(fake_proxy_compose)
docker() {
  case "$*" in
    "inspect $proxy_frontend_container --format {{.State.Status}}")
      printf 'running\n'
      ;;
    "inspect $proxy_frontend_container --format {{.State.OOMKilled}}")
      printf 'false\n'
      ;;
    *)
      return 1
      ;;
  esac
}
curl() {
  [[ ${*: -1} == http://127.0.0.1:13080/auth/session ]] || return 90
  [[ $* == *'Host: social-monitor.app'* ]] || return 90
  [[ ${PROXY_CURL_TRANSPORT:-0} != 1 ]] || return 7
  printf '%s' "$PROXY_AUTH_BODY"
  printf '\n%s' "$PROXY_AUTH_STATUS"
}
assert_proxy_probe_accepts() {
  PROXY_AUTH_STATUS=$1
  PROXY_AUTH_BODY=${2:-}
  unset PROXY_CURL_TRANSPORT
  verify_frontend_api_proxy || {
    echo "frontend proxy auth probe rejected expected $PROXY_AUTH_STATUS" >&2
    exit 1
  }
}
assert_proxy_probe_rejects() {
  local label=$1
  PROXY_AUTH_STATUS=$2
  PROXY_AUTH_BODY=${3:-}
  unset PROXY_CURL_TRANSPORT
  if verify_frontend_api_proxy >/dev/null 2>&1; then
    echo "frontend proxy auth probe accepted invalid $label" >&2
    exit 1
  fi
}
expected_auth_denial='{"status":403,"code":"authorization.denied","detail":"Bearer JWT workspace membership is missing","details":{}}'
assert_proxy_probe_accepts 200 '{"userId":"fixture-user"}'
assert_proxy_probe_accepts 204 ''
assert_proxy_probe_accepts 403 "$expected_auth_denial"
assert_proxy_probe_rejects http-500 500 "$expected_auth_denial"
assert_proxy_probe_rejects http-404 404 "$expected_auth_denial"
assert_proxy_probe_rejects html-403 403 '<html>denied</html>'
assert_proxy_probe_rejects empty-403 403 ''
assert_proxy_probe_rejects malformed-403 403 '{"status":403'
assert_proxy_probe_rejects wrong-code-403 403 \
  '{"status":403,"code":"internal.unexpected","detail":"Bearer JWT workspace membership is missing"}'
assert_proxy_probe_rejects wrong-detail-403 403 \
  '{"status":403,"code":"authorization.denied","detail":"Bearer JWT user session is required"}'
assert_proxy_probe_rejects wrong-status-json-403 403 \
  '{"status":401,"code":"authorization.denied","detail":"Bearer JWT workspace membership is missing"}'
PROXY_AUTH_STATUS=200
PROXY_AUTH_BODY='{"userId":"fixture-user"}'
PROXY_CURL_TRANSPORT=1
if verify_frontend_api_proxy >/dev/null 2>&1; then
  echo 'frontend proxy auth probe accepted curl transport failure' >&2
  exit 1
fi
unset PROXY_CURL_TRANSPORT
# Simulate SIGKILL after current exposure and durable V6 -> LEGACY commit. No
# EXIT trap or marker propagation runs; restore must derive the fence from the
# owner state captured in the outer backup.
chmod 0644 "$owner_marker"
printf '%s\n' schemaVersion=reader_summary.daily_c1_owner.v1 owner=V6 \
  "releaseSha=$SHA" > "$owner_marker"
chmod 0444 "$owner_marker"
crash_restart_backup=$(snapshot_postgres_runtime_control "$CRASH_RESTART_SHA")
[[ ! -e $crash_restart_backup/$POSTGRES_RUNTIME_FORWARD_ONLY_MARKER ]]
[[ $(postgres_runtime_control_rollback_owner_basis "$crash_restart_backup") == V6 ]]
rm -f "$POSTGRES_RUNTIME_CURRENT"
ln -s "$release" "$POSTGRES_RUNTIME_CURRENT"
chmod 0644 "$owner_marker"
printf '%s\n' schemaVersion=reader_summary.daily_c1_owner.v1 owner=LEGACY \
  "releaseSha=$SHA" > "$owner_marker"
chmod 0444 "$owner_marker"
postgres_runtime_daily_c1_fsync_path_and_parent "$owner_marker"
set +e
restore_postgres_runtime_control "$crash_restart_backup" >/dev/null 2>&1
crash_restart_restore_status=$?
set -e
((crash_restart_restore_status != 0))
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$release" ]]
[[ -d $crash_restart_backup ]]
