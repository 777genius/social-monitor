#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/postgres-runtime-boundary-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
POSTGRES_RUNTIME_CURRENT=$CONTROL/postgres-runtime-current
POSTGRES_RUNTIME_DAILY_C1_MARKER=reader-summary-daily-c1.readiness
POSTGRES_RUNTIME_DAILY_C1_RUNTIME=daily-c1-runtime.sh
POSTGRES_RUNTIME_DAILY_TIMER=social-monitor-daily.timer
SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
EVENT_LOG=$FIXTURE/events
export EVENT_LOG
install -d "$STATE" "$CONTROL/current"
ln -s "$CONTROL/current" "$POSTGRES_RUNTIME_CURRENT"

fail() {
  printf 'test deploy failure: %s\n' "$*" >&2
  return 1
}

postgres_runtime_daily_c1_fsync_path_and_parent() { :; }
postgres_runtime_daily_c1_fsync_parent() { :; }
postgres_runtime_daily_c1_readiness_state() {
  grep -Fx 'state=READY' "$1" >/dev/null && printf 'READY\n' || printf 'BLOCKED\n'
}
persist_postgres_runtime_daily_c1_v6_owner() {
  printf 'persist-owner:%s\n' "$1" >> "$EVENT_LOG"
}
OWNER_STATE=absent
OWNER_SHA=$SHA
postgres_runtime_daily_c1_owner_state() { printf '%s\n' "$OWNER_STATE"; }
postgres_runtime_daily_c1_owner_record() {
  printf '%s\t%s\n' "$OWNER_STATE" "$OWNER_SHA"
}
prove_postgres_runtime_daily_c1_flip_idle() {
  printf 'prove-idle\n' >> "$EVENT_LOG"
}
systemctl() {
  [[ $* == "stop $POSTGRES_RUNTIME_DAILY_TIMER" ]] || return 1
  printf 'stop-timer\n' >> "$EVENT_LOG"
}

# shellcheck source=ops/deploy/postgres-runtime-activation-boundary-lib.sh
source "$SCRIPT_DIR/postgres-runtime-activation-boundary-lib.sh"

printf '%s\n' \
  schemaVersion=reader_summary.daily_delivery_readiness.c1 \
  state=READY \
  requires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN \
  activation=reviewed > "$CONTROL/current/$POSTGRES_RUNTIME_DAILY_C1_MARKER"
runtime=$CONTROL/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME
# Literal variables belong to the generated fixture script.
# shellcheck disable=SC2016
printf '%s\n' '#!/usr/bin/env bash' \
  'printf "runtime-check:%s\n" "$1" >> "$EVENT_LOG"' \
  '[[ ${RUNTIME_CHECK_FAIL:-0} == 0 ]]' > "$runtime"
chmod 0755 "$runtime"

: > "$EVENT_LOG"
prepare_postgres_runtime_daily_c1_ready_reexposure READY
[[ $(<"$EVENT_LOG") == $'stop-timer\nruntime-check:--check-no-unresolved\nprove-idle' ]]

: > "$EVENT_LOG"
export RUNTIME_CHECK_FAIL=1
if prepare_postgres_runtime_daily_c1_ready_reexposure READY >/dev/null 2>&1; then
  echo 'READY re-exposure accepted a failed unresolved-journal check' >&2
  exit 1
fi
unset RUNTIME_CHECK_FAIL
[[ $(<"$EVENT_LOG") == $'stop-timer\nruntime-check:--check-no-unresolved' ]]

: > "$EVENT_LOG"
POSTGRES_RUNTIME_ACTIVATION_FAILPOINT=after-ready-journal-check-before-exposure
if prepare_postgres_runtime_daily_c1_ready_reexposure READY >/dev/null 2>&1; then
  echo 'READY re-exposure failpoint was ignored' >&2
  exit 1
fi
unset POSTGRES_RUNTIME_ACTIVATION_FAILPOINT
[[ $(<"$EVENT_LOG") == $'stop-timer\nruntime-check:--check-no-unresolved\nprove-idle' ]]

: > "$EVENT_LOG"
prepare_postgres_runtime_daily_c1_ready_reexposure BLOCKED
[[ ! -s $EVENT_LOG ]]

: > "$EVENT_LOG"
POSTGRES_RUNTIME_ACTIVATION_FAILPOINT=after-v6-owner-before-exposure
if prepare_postgres_runtime_daily_c1_owner_before_exposure "$SHA" >/dev/null 2>&1; then
  echo 'V6 owner persistence failpoint was ignored' >&2
  exit 1
fi
unset POSTGRES_RUNTIME_ACTIVATION_FAILPOINT
[[ $(<"$EVENT_LOG") == "persist-owner:$SHA" ]]

inner=$STATE/postgres-runtime-control-backup.test
outer=$STATE/postgres-runtime-release-rollback-${SHA:0:12}.test
initialize_postgres_runtime_control_rollback_basis "$inner"
initialize_postgres_runtime_control_rollback_basis "$outer"
: > "$inner/$POSTGRES_RUNTIME_FORWARD_ONLY_MARKER"
propagate_postgres_runtime_control_forward_only_boundary "$inner" "$outer"
[[ -f $outer/$POSTGRES_RUNTIME_FORWARD_ONLY_MARKER ]]
[[ ! -s $outer/$POSTGRES_RUNTIME_FORWARD_ONLY_MARKER ]]
mode=$(stat -c '%a' "$outer/$POSTGRES_RUNTIME_FORWARD_ONLY_MARKER" 2>/dev/null || \
  stat -f '%Lp' "$outer/$POSTGRES_RUNTIME_FORWARD_ONLY_MARKER")
[[ $mode == 444 ]]
if require_postgres_runtime_control_rollback_allowed "$outer" >/dev/null 2>&1; then
  echo 'outer rollback accepted a crossed daily C1 boundary' >&2
  exit 1
fi

ROLLBACK_LOG=$FIXTURE/rollback
rollback_backend_and_runtime_control() { printf 'combined-rollback\n' >> "$ROLLBACK_LOG"; }
rollback_backend_images() {
  printf 'backend-rollback:%s\n' "$(<"$1")" >> "$ROLLBACK_LOG"
  printf 'rollback-complete\n' > "$1"
}
rescue=$FIXTURE/backend-rescue.phase
printf 'replacement-started\n' > "$rescue"
if rollback_backend_and_runtime_control_forward_only_safe false fixture "$outer" >/dev/null 2>&1; then
  echo 'combined rollback crossed a daily C1 boundary' >&2
  exit 1
fi
rollback_backend_and_runtime_control_forward_only_safe true "$rescue" "$outer" \
  >/dev/null 2>&1 || crossed_status=$?
[[ ${crossed_status:-0} == 1 ]]
[[ $(<"$rescue") == rollback-complete ]]
[[ $(<"$ROLLBACK_LOG") == backend-rollback:replacement-started ]]
reversible=$STATE/postgres-runtime-release-rollback-bbbbbbbbbbbb.test
initialize_postgres_runtime_control_rollback_basis "$reversible"
rollback_backend_and_runtime_control_forward_only_safe true fixture "$reversible"
[[ $(tail -n 1 "$ROLLBACK_LOG") == combined-rollback ]]

# A SIGKILL after the durable owner flip cannot run either propagation path.
# The owner snapshot still makes the outer backup forward-only after restart.
crash_backup=$STATE/postgres-runtime-release-rollback-cccccccccccc.crash
OWNER_STATE=V6
initialize_postgres_runtime_control_rollback_basis "$crash_backup"
OWNER_STATE=LEGACY
if require_postgres_runtime_control_rollback_allowed "$crash_backup" \
  >/dev/null 2>&1; then
  echo 'crash-restart rollback ignored the durable owner transition' >&2
  exit 1
fi
[[ ! -e $crash_backup/$POSTGRES_RUNTIME_FORWARD_ONLY_MARKER ]]

broken=$STATE/postgres-runtime-release-rollback-dddddddddddd.test
install -d "$broken"
ln -s /dev/null "$broken/$POSTGRES_RUNTIME_FORWARD_ONLY_MARKER"
if require_postgres_runtime_control_rollback_allowed "$broken" >/dev/null 2>&1; then
  echo 'outer rollback accepted a malformed forward-only boundary' >&2
  exit 1
fi

python3 - "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" \
  "$SCRIPT_DIR/social-monitor-production-deploy.sh" <<'PY'
import pathlib, sys
deploy = pathlib.Path(sys.argv[1]).read_text()
entry = pathlib.Path(sys.argv[2]).read_text()
transaction = deploy[deploy.index("activate_postgres_runtime_control_transaction() ("):deploy.index("\nverify_installed_postgres_runtime_control()")]
cleanup = deploy[deploy.index("rollback_postgres_runtime_control_activation() {"):deploy.index("\nactivate_postgres_runtime_control_transaction()")]
assert transaction.index("prepare_postgres_runtime_daily_c1_ready_reexposure") < transaction.index("prepare_postgres_runtime_daily_c1_baseline")
assert transaction.index("prepare_postgres_runtime_daily_c1_owner_before_exposure") < transaction.index("install_postgres_runtime_daily_c1_bridge_assets")
assert transaction.index("prepare_postgres_runtime_daily_c1_owner_before_exposure") < transaction.index('mv -Tf "$next_link" "$POSTGRES_RUNTIME_CURRENT"')
assert transaction.index("after-legacy-owner-before-boundary-propagation") < transaction.rindex("propagate_postgres_runtime_control_forward_only_boundary")
assert cleanup.index("propagate_postgres_runtime_control_forward_only_boundary") < cleanup.index("require_postgres_runtime_control_rollback_allowed")
assert 'activate_postgres_runtime_control "$sha" "$compatible_backend_sha" "$runtime_control_backup"' in entry
assert "rollback_backend_and_runtime_control_forward_only_safe" in entry
assert "ops/deploy/postgres-runtime-activation-boundary-lib.sh" in entry
assert "ops/deploy/reader-summary-publication-system-runtime-deploy-lib.sh" in entry
PY

echo 'PostgreSQL runtime activation boundary tests passed'
