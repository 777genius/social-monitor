#!/usr/bin/env bash
set -euo pipefail

fake_ssh() {
  local -a expected=(
    -i "$DEPLOY_SSH_KEY_PATH"
    -o BatchMode=yes
    -o IdentitiesOnly=yes
    -o ConnectTimeout=30
    -o ServerAliveInterval=15
    -o ServerAliveCountMax=40
    -o StrictHostKeyChecking=yes
    -o "UserKnownHostsFile=$DEPLOY_SSH_KNOWN_HOSTS_PATH"
  )
  local value command count
  for value in "${expected[@]}"; do
    [[ ${1:-} == "$value" ]] || {
      printf 'unexpected SSH option: expected %s, received %s\n' \
        "$value" "${1:-missing}" >&2
      exit 97
    }
    shift
  done
  [[ ${1:-} == -- ]] || exit 98
  shift
  [[ ${1:-} == "$DEPLOY_USER@$DEPLOY_HOST" && -n ${2:-} && $# == 2 ]] || exit 98
  command=$2
  printf '%s\n' "$command" >> "$FAKE_SSH_LOG"

  print_fake_plan() {
    local frontend=$1
    local backend=$2
    local control=$3
    local collector=$4
    local marker=${5:-$TARGET_SHA}
    local backend_base=${6:-$TARGET_SHA}
    printf 'frontend=%s\nbackend=%s\nbackend_base=%s\ncontrol=%s\nx_collector=%s\npostgres_pool_bootstrap=postgres-pool-v1\npostgres_pool_bootstrap_sha=%s\n' \
      "$frontend" "$backend" "$backend_base" "$control" "$collector" "$marker"
  }

  print_uninstalled_atomic_plan() {
    printf 'frontend=false\nbackend=true\nbackend_base=%s\ncontrol=true\nx_collector=false\npostgres_pool_bootstrap=uninstalled\npostgres_pool_bootstrap_sha=0000000000000000000000000000000000000000\n' \
      "$BACKEND_SHA"
  }

  case "$FAKE_SSH_SCENARIO:$command" in
    plan_success:"plan $TARGET_SHA"|normal_success:"plan $TARGET_SHA")
      print_fake_plan false false false false
      ;;
    atomic_success:"plan $TARGET_SHA"|atomic_disconnect:"plan $TARGET_SHA"|atomic_wrong_sha:"plan $TARGET_SHA"|atomic_changed_base:"plan $TARGET_SHA"|atomic_not_pending:"plan $TARGET_SHA"|atomic_no_commit:"plan $TARGET_SHA"|atomic_partial_marker:"plan $TARGET_SHA")
      count=$(grep -cFx "plan $TARGET_SHA" "$FAKE_SSH_LOG")
      if ((count == 1)); then
        print_uninstalled_atomic_plan
      else
        case "$FAKE_SSH_SCENARIO" in
          atomic_wrong_sha)
            print_fake_plan false true true false "$BACKEND_SHA" "$BACKEND_SHA"
            ;;
          atomic_changed_base)
            print_fake_plan false true true false "$TARGET_SHA" "$TARGET_SHA"
            ;;
          atomic_not_pending)
            print_fake_plan false false true false "$TARGET_SHA" "$BACKEND_SHA"
            ;;
          atomic_no_commit)
            print_uninstalled_atomic_plan
            ;;
          atomic_partial_marker)
            printf 'frontend=false\nbackend=true\nbackend_base=%s\ncontrol=true\nx_collector=false\npostgres_pool_bootstrap=postgres-pool-v1\n' \
              "$BACKEND_SHA"
            ;;
          *)
            print_fake_plan false true true false "$TARGET_SHA" "$BACKEND_SHA"
            ;;
        esac
      fi
      ;;
    current_backend_missing:"plan $TARGET_SHA")
      count=$(grep -cFx "plan $TARGET_SHA" "$FAKE_SSH_LOG")
      if ((count == 1)); then
        printf 'frontend=false\nbackend=true\nbackend_base=%s\ncontrol=true\nx_collector=false\npostgres_pool_bootstrap=uninstalled\npostgres_pool_bootstrap_sha=0000000000000000000000000000000000000000\n' \
          "$CURRENT_BACKEND_SHA"
      else
        print_fake_plan false true true false "$TARGET_SHA" "$CURRENT_BACKEND_SHA"
      fi
      ;;
    invalid_backend_missing:"plan $TARGET_SHA")
      printf 'frontend=false\nbackend=true\nbackend_base=%s\ncontrol=true\nx_collector=false\npostgres_pool_bootstrap=uninstalled\npostgres_pool_bootstrap_sha=0000000000000000000000000000000000000000\n' \
        "0000000000000000000000000000000000000000"
      ;;
    legacy_plan:"plan $TARGET_SHA")
      printf 'frontend=false\nbackend=false\nbackend_base=%s\ncontrol=true\nx_collector=false\n' \
        "$TARGET_SHA"
      ;;
    upload_success:"upload $TARGET_SHA")
      IFS= read -r value
      printf '%s\n' "$value" > "$FAKE_UPLOAD_PATH"
      ;;
    maintenance_success:"disk-report $TARGET_SHA"|maintenance_success:"project-disk-cleanup $TARGET_SHA"|maintenance_success:"reader-summary-recover-missing-days $TARGET_SHA"|maintenance_success:"reader-summary-weekly-run $TARGET_SHA"|maintenance_success:"reader-summary-daily-terminal-set-receipt-v1 $TARGET_SHA"|maintenance_success:"reader-summary-daily-canonical-recovery-v4 $TARGET_SHA invalid-product-retry-set-v1 $TERMINAL_SET_SHA256"|maintenance_success:"reader-summary-daily-canonical-recovery-v4 $TARGET_SHA reader-summary-daily-canonical-recovery-v4 $MODEL_JOB_IDENTITY $AUTHORITY_SHA256")
      printf 'maintenance=%s\n' "${command%% *}"
      ;;
    normal_success:"deploy $TARGET_SHA")
      printf 'deployed=%s\n' "$TARGET_SHA"
      ;;
    atomic_success:"deploy $TARGET_SHA")
      printf 'postgres-pool-bootstrap=%s replay=false\n' "$TARGET_SHA"
      ;;
    current_backend_missing:"deploy $TARGET_SHA")
      printf 'postgres-pool-bootstrap=%s replay=false\n' "$TARGET_SHA"
      ;;
    atomic_disconnect:"deploy $TARGET_SHA")
      exit 255
      ;;
    atomic_wrong_sha:"deploy $TARGET_SHA"|atomic_changed_base:"deploy $TARGET_SHA"|atomic_not_pending:"deploy $TARGET_SHA"|atomic_partial_marker:"deploy $TARGET_SHA")
      printf 'postgres-pool-bootstrap=%s replay=false\n' "$TARGET_SHA"
      ;;
    atomic_no_commit:"deploy $TARGET_SHA")
      printf 'postgres_pool_repair=true\n'
      ;;
    atomic_action_failure:"plan $TARGET_SHA")
      print_uninstalled_atomic_plan
      ;;
    atomic_action_failure:"deploy $TARGET_SHA")
      exit 42
      ;;
    disconnect_eventual:"deploy $TARGET_SHA"|pending:"deploy $TARGET_SHA"|partial:"deploy $TARGET_SHA"|invalid_marker:"deploy $TARGET_SHA"|reconcile_plan_non_255:"deploy $TARGET_SHA")
      exit 255
      ;;
    malformed:"deploy $TARGET_SHA"|duplicate:"deploy $TARGET_SHA"|missing:"deploy $TARGET_SHA"|final_plan_disconnect:"deploy $TARGET_SHA"|final_plan_pending:"deploy $TARGET_SHA")
      printf 'deployed=%s\n' "$TARGET_SHA"
      ;;
    disconnect_eventual:"plan $TARGET_SHA"|final_plan_disconnect:"plan $TARGET_SHA"|final_plan_pending:"plan $TARGET_SHA")
      count=0
      [[ ! -f $FAKE_SSH_STATE ]] || read -r count < "$FAKE_SSH_STATE"
      count=$((count + 1))
      printf '%s\n' "$count" > "$FAKE_SSH_STATE"
      case "$FAKE_SSH_SCENARIO:$count" in
        final_plan_disconnect:1) exit 255 ;;
        disconnect_eventual:1|final_plan_pending:1) print_fake_plan true true true true ;;
        *) print_fake_plan false false false false ;;
      esac
      ;;
    pending:"plan $TARGET_SHA")
      print_fake_plan true true true true
      ;;
    partial:"plan $TARGET_SHA")
      print_fake_plan false true false false
      ;;
    invalid_marker:"plan $TARGET_SHA")
      print_fake_plan false false false false invalid-marker
      ;;
    malformed:"plan $TARGET_SHA")
      printf 'this-is-not-a-plan\n'
      ;;
    duplicate:"plan $TARGET_SHA")
      print_fake_plan false false false false
      printf 'backend=false\n'
      ;;
    missing:"plan $TARGET_SHA")
      printf 'frontend=false\nbackend=false\nbackend_base=%s\ncontrol=false\npostgres_pool_bootstrap=postgres-pool-v1\npostgres_pool_bootstrap_sha=%s\n' \
        "$TARGET_SHA" "$TARGET_SHA"
      ;;
    reconcile_plan_non_255:"plan $TARGET_SHA")
      exit 23
      ;;
    non_255:"deploy $TARGET_SHA")
      exit 42
      ;;
    *)
      printf 'unexpected fake SSH call for %s: %s\n' \
        "$FAKE_SSH_SCENARIO" "$command" >&2
      exit 96
      ;;
  esac
}

if [[ ${GITHUB_PRODUCTION_DEPLOY_FAKE_SSH:-} == 1 ]]; then
  fake_ssh "$@"
  exit
fi

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CLIENT=$SCRIPT_DIR/github-production-deploy-client.sh
WORKFLOW=$SCRIPT_DIR/../../.github/workflows/production-deploy.yml
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/github-production-deploy-client-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

TARGET_SHA=1234567890abcdef1234567890abcdef12345678
BACKEND_SHA=4f47fac7faed7dc24110f4a43e88820d776b8a40
CURRENT_BACKEND_SHA=617e284607f3dde74c27164af2b981770b9a62ed
MODEL_JOB_IDENTITY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
AUTHORITY_SHA256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
TERMINAL_SET_SHA256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
FAKE_SSH=$FIXTURE/fake-ssh
FAKE_SSH_LOG=$FIXTURE/ssh.log
FAKE_SSH_STATE=$FIXTURE/ssh.state
FAKE_UPLOAD_PATH=$FIXTURE/upload.payload
GITHUB_OUTPUT=$FIXTURE/github-output
DEPLOY_SSH_DIRECTORY=$FIXTURE/ssh
DEPLOY_SSH_KEY_PATH=$FIXTURE/social-monitor-production
DEPLOY_SSH_KNOWN_HOSTS_PATH=$FIXTURE/ssh/pinned-known-hosts
DEPLOY_HOST=production.example.invalid
DEPLOY_USER=social-monitor-deploy

export TARGET_SHA BACKEND_SHA CURRENT_BACKEND_SHA MODEL_JOB_IDENTITY AUTHORITY_SHA256 TERMINAL_SET_SHA256
export FAKE_SSH_LOG FAKE_SSH_STATE FAKE_UPLOAD_PATH
export DEPLOY_SSH_DIRECTORY DEPLOY_SSH_KEY_PATH DEPLOY_SSH_KNOWN_HOSTS_PATH
export DEPLOY_HOST DEPLOY_USER GITHUB_OUTPUT
install -m 0700 "$0" "$FAKE_SSH"

(
  unset DEPLOY_RECONCILE_ATTEMPTS DEPLOY_RECONCILE_INTERVAL_SECONDS
  # shellcheck source=/dev/null
  source "$CLIENT"
  ((KNOWN_BACKEND_SOAK_SECONDS == 300))
  ((MINIMUM_RECONCILE_WINDOW_SECONDS >= 600))
  ((DEFAULT_RECONCILE_ATTEMPTS == 45))
  ((DEFAULT_RECONCILE_INTERVAL_SECONDS == 15))
  ((DEFAULT_RECONCILE_WINDOW_SECONDS == 660))
  ((DEFAULT_RECONCILE_WINDOW_SECONDS >= MINIMUM_RECONCILE_WINDOW_SECONDS))
  ((DEFAULT_RECONCILE_WINDOW_SECONDS > KNOWN_BACKEND_SOAK_SECONDS))
)

run_client() {
  local scenario=$1
  shift
  : > "$FAKE_SSH_LOG"
  rm -f "$FAKE_SSH_STATE"
  FAKE_SSH_SCENARIO=$scenario \
  GITHUB_PRODUCTION_DEPLOY_FAKE_SSH=1 \
  DEPLOY_SSH_BIN=$FAKE_SSH \
  DEPLOY_RECONCILE_ATTEMPTS=3 \
  DEPLOY_RECONCILE_INTERVAL_SECONDS=0 \
    bash "$CLIENT" "$@"
}

assert_fails() {
  local scenario=$1
  shift
  if run_client "$scenario" "$@" >/dev/null 2>&1; then
    printf 'scenario unexpectedly succeeded: %s\n' "$scenario" >&2
    exit 1
  fi
}

assert_call_count() {
  local expected_count=$1
  local command_text=$2
  local actual
  actual=$(grep -cFx "$command_text" "$FAKE_SSH_LOG" || true)
  [[ $actual == "$expected_count" ]] || {
    printf 'expected %s calls to %s, received %s\n' "$expected_count" "$command_text" "$actual" >&2
    exit 1
  }
}

DEPLOY_KEY=fake-private-key KNOWN_HOSTS=fake-known-hosts bash "$CLIENT" configure
[[ $(stat -c '%a' "$DEPLOY_SSH_DIRECTORY") == 700 ]]
[[ $(stat -c '%a' "$DEPLOY_SSH_KEY_PATH") == 600 ]]
[[ $(stat -c '%a' "$DEPLOY_SSH_KNOWN_HOSTS_PATH") == 600 ]]
grep -Fx 'fake-private-key' "$DEPLOY_SSH_KEY_PATH" >/dev/null
grep -Fx 'fake-known-hosts' "$DEPLOY_SSH_KNOWN_HOSTS_PATH" >/dev/null
bash "$CLIENT" cleanup
[[ ! -e $DEPLOY_SSH_KEY_PATH && ! -e $DEPLOY_SSH_KNOWN_HOSTS_PATH ]]

for maintenance_action in \
  disk-report project-disk-cleanup \
  reader-summary-recover-missing-days reader-summary-weekly-run \
  reader-summary-daily-terminal-set-receipt-v1; do
  run_client maintenance_success maintenance \
    "$TARGET_SHA" "$maintenance_action" >/dev/null
  assert_call_count 1 "$maintenance_action $TARGET_SHA"
done
run_client maintenance_success maintenance "$TARGET_SHA" \
  reader-summary-daily-canonical-recovery-v4 \
  invalid-product-retry-set-v1 "$TERMINAL_SET_SHA256" >/dev/null
assert_call_count 1 \
  "reader-summary-daily-canonical-recovery-v4 $TARGET_SHA invalid-product-retry-set-v1 $TERMINAL_SET_SHA256"
run_client maintenance_success maintenance "$TARGET_SHA" \
  reader-summary-daily-canonical-recovery-v4 \
  reader-summary-daily-canonical-recovery-v4 \
  "$MODEL_JOB_IDENTITY" "$AUTHORITY_SHA256" >/dev/null
assert_call_count 1 \
  "reader-summary-daily-canonical-recovery-v4 $TARGET_SHA reader-summary-daily-canonical-recovery-v4 $MODEL_JOB_IDENTITY $AUTHORITY_SHA256"
for retry_set_token in '' wrong-invalid-product-retry-set-v1 \
  "invalid-product-retry-set-v1:$TARGET_SHA"; do
  assert_fails maintenance_success maintenance "$TARGET_SHA" \
    reader-summary-daily-canonical-recovery-v4 "$retry_set_token" "$TERMINAL_SET_SHA256"
  assert_call_count 0 \
    "reader-summary-daily-canonical-recovery-v4 $TARGET_SHA $retry_set_token $TERMINAL_SET_SHA256"
done
assert_fails maintenance_success maintenance "$TARGET_SHA" \
  reader-summary-daily-canonical-recovery-v4
assert_call_count 0 "reader-summary-daily-canonical-recovery-v4 $TARGET_SHA"
assert_fails maintenance_success maintenance "$TARGET_SHA" \
  reader-summary-daily-canonical-recovery-v4 \
  invalid-product-retry-set-v1 "${TERMINAL_SET_SHA256^^}"
assert_call_count 0 \
  "reader-summary-daily-canonical-recovery-v4 $TARGET_SHA invalid-product-retry-set-v1 ${TERMINAL_SET_SHA256^^}"
for confirmation in '' wrong-reader-summary-daily-canonical-recovery-v4 \
  "reader-summary-daily-canonical-recovery-v4:$TARGET_SHA"; do
  assert_fails maintenance_success maintenance "$TARGET_SHA" \
    reader-summary-daily-canonical-recovery-v4 "$confirmation" \
    "$MODEL_JOB_IDENTITY" "$AUTHORITY_SHA256"
  assert_call_count 0 \
    "reader-summary-daily-canonical-recovery-v4 $TARGET_SHA $confirmation $MODEL_JOB_IDENTITY $AUTHORITY_SHA256"
done
assert_fails maintenance_success maintenance "$TARGET_SHA" \
  reader-summary-daily-canonical-recovery-v4 \
  reader-summary-daily-canonical-recovery-v4 "${MODEL_JOB_IDENTITY^^}" "$AUTHORITY_SHA256"
assert_call_count 0 \
  "reader-summary-daily-canonical-recovery-v4 $TARGET_SHA reader-summary-daily-canonical-recovery-v4 ${MODEL_JOB_IDENTITY^^} $AUTHORITY_SHA256"
assert_fails maintenance_success maintenance "$TARGET_SHA" docker-system-prune
assert_call_count 0 "docker-system-prune $TARGET_SHA"

RECEIPT=$FIXTURE/terminal-set-receipt.json
receipt_line='{"schemaVersion":"reader_summary.daily_terminal_set_receipt.v1","retrySetToken":"invalid-product-retry-set-v1","tenantId":"00000000-0000-7000-8000-000000000901","workspaceId":"00000000-0000-7000-8000-000000000902","requestedUtcDates":["2026-07-25","2026-07-26","2026-07-27","2026-07-28","2026-07-29","2026-07-30"],"terminalCount":6,"terminalSetSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}'
printf '%s\n' "$receipt_line" > "$RECEIPT"
bash "$CLIENT" validate-terminal-set-receipt "$RECEIPT"
[[ $(stat -c '%a' "$RECEIPT") == 444 ]]

assert_invalid_receipt() {
  local label=$1 value=$2
  chmod 0600 "$RECEIPT"
  printf '%s' "$value" > "$RECEIPT"
  if bash "$CLIENT" validate-terminal-set-receipt "$RECEIPT" >/dev/null 2>&1; then
    printf 'invalid terminal-set receipt accepted: %s\n' "$label" >&2
    exit 1
  fi
  [[ $(stat -c '%a' "$RECEIPT") == 600 ]]
}

assert_invalid_receipt duplicate-key \
  "${receipt_line/\{\"schemaVersion\":/\{\"schemaVersion\":\"reader_summary.daily_terminal_set_receipt.v1\",\"schemaVersion\":}"$'\n'
assert_invalid_receipt missing-key \
  "${receipt_line/,\"terminalCount\":6/}"$'\n'
assert_invalid_receipt wrong-date \
  "${receipt_line/2026-07-25/2026-07-24}"$'\n'
assert_invalid_receipt wrong-state \
  "${receipt_line/reader_summary.daily_terminal_set_receipt.v1/reader_summary.daily_terminal_set_receipt.v2}"$'\n'
assert_invalid_receipt wrong-reason \
  "${receipt_line/invalid-product-retry-set-v1/other-retry-set}"$'\n'
assert_invalid_receipt wrong-attempt \
  "${receipt_line/\"terminalCount\":6/\"terminalCount\":7}"$'\n'
assert_invalid_receipt wrong-hash \
  "${receipt_line/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC}"$'\n'
assert_invalid_receipt extra-key "${receipt_line%\}},\"extra\":true}"$'\n'
assert_invalid_receipt extra-output "$receipt_line"$'\nnoise\n'

: > "$GITHUB_OUTPUT"
run_client plan_success plan "$TARGET_SHA" >/dev/null
grep -Fx 'frontend=false' "$GITHUB_OUTPUT" >/dev/null
grep -Fx "backend_base=$TARGET_SHA" "$GITHUB_OUTPUT" >/dev/null
grep -Fx 'postgres_pool_bootstrap=postgres-pool-v1' "$GITHUB_OUTPUT" >/dev/null
grep -Fx 'postgres_pool_repair=false' "$GITHUB_OUTPUT" >/dev/null
assert_call_count 1 "plan $TARGET_SHA"
assert_call_count 0 "deploy $TARGET_SHA"

: > "$GITHUB_OUTPUT"
run_client legacy_plan plan "$TARGET_SHA" >/dev/null
grep -Fx 'postgres_pool_bootstrap=uninstalled' "$GITHUB_OUTPUT" >/dev/null
grep -Fx 'postgres_pool_bootstrap_sha=0000000000000000000000000000000000000000' \
  "$GITHUB_OUTPUT" >/dev/null
grep -Fx 'postgres_pool_repair=false' "$GITHUB_OUTPUT" >/dev/null
assert_call_count 1 "plan $TARGET_SHA"

: > "$GITHUB_OUTPUT"
run_client atomic_success plan "$TARGET_SHA" >/dev/null
grep -Fx "backend_base=$BACKEND_SHA" "$GITHUB_OUTPUT" >/dev/null
grep -Fx 'backend=true' "$GITHUB_OUTPUT" >/dev/null
grep -Fx 'postgres_pool_bootstrap=postgres-pool-v1' "$GITHUB_OUTPUT" >/dev/null
grep -Fx "postgres_pool_bootstrap_sha=$TARGET_SHA" "$GITHUB_OUTPUT" >/dev/null
grep -Fx 'postgres_pool_repair=true' "$GITHUB_OUTPUT" >/dev/null
assert_call_count 2 "plan $TARGET_SHA"
assert_call_count 1 "deploy $TARGET_SHA"

: > "$GITHUB_OUTPUT"
run_client current_backend_missing plan "$TARGET_SHA" >/dev/null
grep -Fx "backend_base=$CURRENT_BACKEND_SHA" "$GITHUB_OUTPUT" >/dev/null
grep -Fx 'backend=true' "$GITHUB_OUTPUT" >/dev/null
grep -Fx 'postgres_pool_repair=true' "$GITHUB_OUTPUT" >/dev/null
assert_call_count 2 "plan $TARGET_SHA"
assert_call_count 1 "deploy $TARGET_SHA"

# A fresh workflow replay sees the recaptured durable state and performs no
# repair action; its ordinary deploy remains owned by the gated deploy job.
: > "$GITHUB_OUTPUT"
run_client plan_success plan "$TARGET_SHA" >/dev/null
grep -Fx 'postgres_pool_repair=false' "$GITHUB_OUTPUT" >/dev/null
assert_call_count 1 "plan $TARGET_SHA"
assert_call_count 0 "deploy $TARGET_SHA"

: > "$GITHUB_OUTPUT"
run_client atomic_disconnect plan "$TARGET_SHA" >/dev/null
grep -Fx "backend_base=$BACKEND_SHA" "$GITHUB_OUTPUT" >/dev/null
assert_call_count 2 "plan $TARGET_SHA"
assert_call_count 1 "deploy $TARGET_SHA"

for scenario in \
  atomic_wrong_sha atomic_changed_base atomic_not_pending atomic_no_commit \
  atomic_partial_marker; do
  : > "$GITHUB_OUTPUT"
  assert_fails "$scenario" plan "$TARGET_SHA"
  [[ ! -s $GITHUB_OUTPUT ]]
  assert_call_count 2 "plan $TARGET_SHA"
  assert_call_count 1 "deploy $TARGET_SHA"
done

: > "$GITHUB_OUTPUT"
assert_fails atomic_action_failure plan "$TARGET_SHA"
[[ ! -s $GITHUB_OUTPUT ]]
assert_call_count 1 "plan $TARGET_SHA"
assert_call_count 1 "deploy $TARGET_SHA"

: > "$GITHUB_OUTPUT"
assert_fails invalid_backend_missing plan "$TARGET_SHA"
[[ ! -s $GITHUB_OUTPUT ]]
assert_call_count 1 "plan $TARGET_SHA"
assert_call_count 0 "deploy $TARGET_SHA"

printf 'immutable-frontend-archive\n' > "$FIXTURE/frontend.tgz"
run_client upload_success upload "$TARGET_SHA" "$FIXTURE/frontend.tgz" >/dev/null
grep -Fx 'immutable-frontend-archive' "$FAKE_UPLOAD_PATH" >/dev/null
assert_call_count 1 "upload $TARGET_SHA"

run_client normal_success deploy "$TARGET_SHA" >/dev/null
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 1 "plan $TARGET_SHA"

run_client disconnect_eventual deploy "$TARGET_SHA" >/dev/null
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 2 "plan $TARGET_SHA"

run_client final_plan_disconnect deploy "$TARGET_SHA" >/dev/null
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 2 "plan $TARGET_SHA"

run_client final_plan_pending deploy "$TARGET_SHA" >/dev/null
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 2 "plan $TARGET_SHA"

assert_fails pending deploy "$TARGET_SHA"
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 3 "plan $TARGET_SHA"

assert_fails partial deploy "$TARGET_SHA"
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 3 "plan $TARGET_SHA"

assert_fails invalid_marker deploy "$TARGET_SHA"
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 1 "plan $TARGET_SHA"

assert_fails malformed deploy "$TARGET_SHA"
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 1 "plan $TARGET_SHA"

assert_fails duplicate deploy "$TARGET_SHA"
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 1 "plan $TARGET_SHA"

assert_fails missing deploy "$TARGET_SHA"
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 1 "plan $TARGET_SHA"

assert_fails reconcile_plan_non_255 deploy "$TARGET_SHA"
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 1 "plan $TARGET_SHA"

assert_fails non_255 deploy "$TARGET_SHA"
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 0 "plan $TARGET_SHA"

if DEPLOY_HOST=-oProxyCommand=bad run_client normal_success deploy "$TARGET_SHA" >/dev/null 2>&1; then
  echo 'leading-option host unexpectedly accepted' >&2
  exit 1
fi
assert_call_count 0 "deploy $TARGET_SHA"

if DEPLOY_USER='bad user' run_client normal_success deploy "$TARGET_SHA" >/dev/null 2>&1; then
  echo 'invalid user unexpectedly accepted' >&2
  exit 1
fi
assert_call_count 0 "deploy $TARGET_SHA"

if DEPLOY_HOST=bad.-label run_client normal_success deploy "$TARGET_SHA" >/dev/null 2>&1; then
  echo 'invalid hostname unexpectedly accepted' >&2
  exit 1
fi
assert_call_count 0 "deploy $TARGET_SHA"

# shellcheck disable=SC2016 # Literal GitHub expression is asserted in workflow text.
grep -F 'postgres_pool_repair: ${{ steps.plan.outputs.postgres_pool_repair }}' \
  "$WORKFLOW" >/dev/null
[[ $(grep -cF \
  "if: needs.plan.outputs.postgres_pool_repair != 'true'" "$WORKFLOW") == 1 ]]
for maintenance_action in \
  disk-report project-disk-cleanup \
  reader-summary-recover-missing-days reader-summary-weekly-run \
  reader-summary-daily-canonical-recovery-v4; do
  grep -F "          - $maintenance_action" "$WORKFLOW" >/dev/null
done
grep -F 'daily_canonical_recovery_retry_set_token:' "$WORKFLOW" >/dev/null
grep -F 'daily_canonical_recovery_terminal_set_sha256:' "$WORKFLOW" >/dev/null
grep -F 'daily_canonical_recovery_confirmation:' "$WORKFLOW" >/dev/null
grep -F 'daily_canonical_recovery_model_job_identity:' "$WORKFLOW" >/dev/null
grep -F 'daily_canonical_recovery_authority_sha256:' "$WORKFLOW" >/dev/null
grep -F 'DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN == invalid-product-retry-set-v1' \
  "$WORKFLOW" >/dev/null
grep -F 'DAILY_CANONICAL_RECOVERY_CONFIRMATION' "$WORKFLOW" >/dev/null
grep -F 'timeout-minutes: 360' "$WORKFLOW" >/dev/null
grep -F 'reader-summary-daily-canonical-recovery-v4' "$WORKFLOW" >/dev/null
grep -F 'npm run check:reader-summary-daily-canonical-recovery-postgres18' "$WORKFLOW" >/dev/null
grep -F 'npm run check:reader-summary-daily-canonical-recovery-production' "$WORKFLOW" >/dev/null
for dependency in plan verify_reader_summary_publication verify_backend build_frontend; do
  grep -F "      - $dependency" "$WORKFLOW" >/dev/null
done

echo 'GitHub production deploy client tests passed'
