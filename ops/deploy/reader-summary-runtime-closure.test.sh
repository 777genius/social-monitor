#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
RUNTIME=$SCRIPT_DIR/production-runtime
FIXTURE=$(mktemp -d /tmp/reader-summary-runtime-closure.XXXXXX)
trap '/bin/rm -rf "$FIXTURE"' EXIT

fail() { printf 'test failure: %s\n' "$*" >&2; return 1; }
require_postgres_runtime_regular_source() {
  [[ -f $1 && ! -L $1 && $(stat -c '%a' "$1") == "$2" ]]
}
require_postgres_runtime_regular_release_file() {
  [[ -f $1 && ! -L $1 && $(stat -c '%a' "$1") == "$2" ]]
}
# shellcheck source=ops/deploy/postgres-runtime-asset-lib.sh
source "$SCRIPT_DIR/postgres-runtime-asset-lib.sh"

mapfile -t inventory < <(postgres_runtime_reader_summary_asset_specs)
[[ ${#inventory[@]} == 11 ]]
[[ ${inventory[*]} == *'755 reader-summary-one-shot.sh'* ]]
[[ ${inventory[*]} == *'755 reader-summary-control-action.sh'* ]]
[[ ${inventory[*]} == *'755 rolling-containerd-fallback.sh'* ]]
postgres_runtime_require_reader_summary_source_assets "$RUNTIME"
grep -Fx '      AGENT_RUNTIME_MODEL: gpt-5.6-sol' \
  "$RUNTIME/compose.agent-runtime-model.yml" >/dev/null
grep -Fx '      AGENT_RUNTIME_REASONING_EFFORT: high' \
  "$RUNTIME/compose.agent-runtime-model.yml" >/dev/null
grep -Fx '      AGENT_RUNTIME_READER_SUMMARY_MODEL: gpt-5.6-sol' \
  "$RUNTIME/compose.agent-runtime-model.yml" >/dev/null
grep -Fx '      AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT: high' \
  "$RUNTIME/compose.agent-runtime-model.yml" >/dev/null
! grep -F 'xhigh' "$RUNTIME/compose.agent-runtime-model.yml"
grep -F '$POSTGRES_RUNTIME_CURRENT/compose.agent-runtime-model.yml' \
  "$SCRIPT_DIR/social-monitor-production-deploy.sh" >/dev/null

incomplete=$FIXTURE/incomplete
mkdir -p "$incomplete"
while read -r mode asset; do
  [[ $asset == reader-summary-scheduler-hold-restore.sh ]] && continue
  install -m "0$mode" "$RUNTIME/$asset" "$incomplete/$asset"
done < <(postgres_runtime_reader_summary_asset_specs)
if postgres_runtime_require_reader_summary_source_assets "$incomplete" 2>/dev/null; then
  echo 'incomplete reader-summary runtime inventory was accepted' >&2
  exit 1
fi

ROOT=$FIXTURE/root
mkdir -p "$ROOT/control/postgres-runtime-current" \
  "$ROOT/control/deploy-state"
cp "$RUNTIME"/reader-summary-{one-shot,scheduler-hold-common,scheduler-hold-status,scheduler-hold-prepare}.sh \
  "$ROOT/control/postgres-runtime-current/"
dispatch_log=$FIXTURE/dispatch.log
cat > "$ROOT/control/daily-run.sh" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> '$dispatch_log'
EOF
chmod 0755 "$ROOT/control/daily-run.sh"
target=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
hold_env=(
  SOCIAL_MONITOR_READER_SUMMARY_HOLD_TEST_MODE=1
  SOCIAL_MONITOR_READER_SUMMARY_HOLD_TEST_ROOT="$ROOT"
)
env "${hold_env[@]}" \
  "$ROOT/control/postgres-runtime-current/reader-summary-one-shot.sh" daily
[[ $(<"$dispatch_log") == --yesterday ]]
cat > "$ROOT/control/daily-run.sh" <<EOF
#!/usr/bin/env bash
"$ROOT/control/postgres-runtime-current/reader-summary-scheduler-hold-prepare.sh" \
  "$target"
EOF
chmod 0755 "$ROOT/control/daily-run.sh"
timeout 5 env "${hold_env[@]}" \
  "$ROOT/control/postgres-runtime-current/reader-summary-one-shot.sh" daily \
  > "$FIXTURE/inherited-prepare.out"
[[ $(<"$FIXTURE/inherited-prepare.out") == "held target=$target" ]]
set +e
env "${hold_env[@]}" SOCIAL_MONITOR_READER_SUMMARY_DISPATCH_LOCK_FD=99 \
  "$ROOT/control/postgres-runtime-current/reader-summary-scheduler-hold-prepare.sh" \
  "$target" > /dev/null 2> "$FIXTURE/invalid-inherited-lock.err"
invalid_inherited_status=$?
set -e
[[ $invalid_inherited_status == 76 ]]
grep -Fx 'reader-summary inherited scheduler dispatch lock is unsafe' \
  "$FIXTURE/invalid-inherited-lock.err" >/dev/null
env "${hold_env[@]}" \
  "$ROOT/control/postgres-runtime-current/reader-summary-scheduler-hold-prepare.sh" \
  "$target" >/dev/null
hold_identity=$(stat -c '%d:%i:%f:%s:%Y:%Z' \
  "$ROOT/control/deploy-state/reader-summary-scheduler-hold.v1")
env "${hold_env[@]}" \
  "$ROOT/control/postgres-runtime-current/reader-summary-scheduler-hold-prepare.sh" \
  "$target" >/dev/null
[[ $(stat -c '%d:%i:%f:%s:%Y:%Z' \
  "$ROOT/control/deploy-state/reader-summary-scheduler-hold.v1") == \
  "$hold_identity" ]]
set +e
env "${hold_env[@]}" \
  "$ROOT/control/postgres-runtime-current/reader-summary-one-shot.sh" daily \
  >"$FIXTURE/held.out" 2>"$FIXTURE/held.err"
held_status=$?
set -e
[[ $held_status == 75 && $(wc -l < "$dispatch_log") == 1 ]]

export SOCIAL_MONITOR_READER_SUMMARY_HOLD_TEST_MODE=1
export SOCIAL_MONITOR_READER_SUMMARY_HOLD_TEST_ROOT=$ROOT
# shellcheck source=ops/deploy/production-runtime/reader-summary-scheduler-hold-common.sh
source "$RUNTIME/reader-summary-scheduler-hold-common.sh"
# shellcheck source=ops/deploy/production-runtime/reader-summary-scheduler-hold-restore.sh
source "$RUNTIME/reader-summary-scheduler-hold-restore.sh"
printf '%s\n' "$target" > "$ROOT/control/deploy-state/backend.sha"
printf '%s\n' "$target" > "$ROOT/control/postgres-runtime-current/SOURCE_SHA"
printf '%s\n' "$target" > "$ROOT/control/postgres-runtime-current/READY"
printf '%s\n' "$target" > \
  "$ROOT/control/deploy-state/production-transition-activated.sha"
printf '%s\n' \
  'version=social-monitor-production-transition-review-consumption-v2' \
  'status=complete' \
  'command-scope=deploy-transition' \
  "t=$target" \
  'receipt=terminal' > \
  "$ROOT/control/deploy-state/production-transition-review-consumption.v2"

MODEL_JSON=$FIXTURE/model.json
cat > "$MODEL_JSON" <<'JSON'
{"services":{"agent-runtime":{"environment":{"AGENT_RUNTIME_PROVIDER":"codex","AGENT_RUNTIME_MODEL":"gpt-5.6-sol","AGENT_RUNTIME_REASONING_EFFORT":"high"}},"daily-runner":{"environment":{"READER_SUMMARY_MODEL_PROVIDER":"agent-runtime","AGENT_RUNTIME_READER_SUMMARY_MODEL":"gpt-5.6-sol","AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT":"high"}}}}
JSON
fake_compose() { cat "$MODEL_JSON"; }
# Consumed dynamically by the sourced scheduler restore contract.
# shellcheck disable=SC2034
COMPOSE=(fake_compose)
events=$FIXTURE/events
reader_summary_hold_gate_event() { printf '%s\n' "$1" >> "$events"; }
verify_backend_with_retry() { [[ $* == 'api agent-runtime ingestion-worker intelligence-worker delivery-service event-relay' ]]; }
daily_state=$FIXTURE/daily-active
weekly_state=$FIXTURE/weekly-active
rolling_state=$FIXTURE/rolling-active
verify_effective_postgres_daily_topology() {
  [[ -e $daily_state ]] || { printf 'timer:daily\n' >> "$events"; : > "$daily_state"; }
}
reconcile_postgres_runtime_weekly_timer() {
  [[ -e $weekly_state ]] || { printf 'timer:weekly\n' >> "$events"; : > "$weekly_state"; }
}
reconcile_postgres_runtime_rolling_timer() {
  [[ -e $rolling_state ]] || { printf 'timer:rolling\n' >> "$events"; : > "$rolling_state"; }
}

production_transition_resume_runtime_schedulers "$target"
[[ $(<"$events") == $'migrations\nhealth\nmodel\nreceipts\ntimer:daily\ntimer:weekly\ntimer:rolling\nrelease' ]]
[[ ! -e $ROOT/control/deploy-state/reader-summary-scheduler-hold.v1 ]]
: > "$events"
production_transition_resume_runtime_schedulers "$target"
[[ $(<"$events") == $'migrations\nhealth\nmodel\nreceipts\nrelease' ]]

env "${hold_env[@]}" \
  "$ROOT/control/postgres-runtime-current/reader-summary-scheduler-hold-prepare.sh" \
  "$target" >/dev/null
sed 's/"high"/"xhigh"/' "$MODEL_JSON" > "$MODEL_JSON.invalid"
MODEL_JSON=$MODEL_JSON.invalid
: > "$events"
if production_transition_resume_runtime_schedulers "$target" 2>/dev/null; then
  echo 'wrong production reasoning effort released the scheduler hold' >&2
  exit 1
fi
[[ -e $ROOT/control/deploy-state/reader-summary-scheduler-hold.v1 ]]
[[ $(<"$events") == $'migrations\nhealth' ]]

echo 'reader-summary runtime closure tests passed'
