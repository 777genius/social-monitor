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
    inspect_transient_reset:"plan $TARGET_SHA")
      count=$(grep -cFx "plan $TARGET_SHA" "$FAKE_SSH_LOG")
      if ((count < 3)); then
        exit 255
      fi
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
    maintenance_success:"disk-report $TARGET_SHA"|maintenance_success:"project-disk-cleanup $TARGET_SHA"|maintenance_success:"reader-summary-recover-missing-days $TARGET_SHA"|maintenance_success:"reader-summary-weekly-run $TARGET_SHA"|maintenance_success:"reader-summary-production-history $TARGET_SHA 2026-08-11"|maintenance_success:"reader-summary-daily-terminal-set-receipt-v1 $TARGET_SHA"|maintenance_success:"reader-summary-daily-scan-terminal-preimage-c1 $TARGET_SHA"|maintenance_success:"reader-summary-daily-canonical-recovery-v4 $TARGET_SHA invalid-product-retry-set-v1 $TERMINAL_SET_SHA256"|maintenance_success:"reader-summary-daily-canonical-recovery-v4 $TARGET_SHA reader-summary-daily-canonical-recovery-v4 $MODEL_JOB_IDENTITY $AUTHORITY_SHA256"|maintenance_success:"reader-summary-daily-scan-terminal-repair-c1 $TARGET_SHA reader-summary-daily-scan-terminal-repair-c1 $TERMINAL_SET_SHA256"|maintenance_success:"reader-summary-daily-delivery-c1-run $TARGET_SHA reader-summary-daily-delivery-c1-run 2026-08-10"|maintenance_success:"reader-summary-daily-delivery-c1-contain $TARGET_SHA reader-summary-daily-delivery-c1-contain $TARGET_SHA")
      printf 'maintenance=%s\n' "${command%% *}"
      ;;
    normal_success:"deploy $TARGET_SHA"|normal_success:"deploy 944fdb6da3071f70a69c7048c9fcdf1c2552603e")
      printf 'deployed=%s\n' "$TARGET_SHA"
      ;;
    release_b_replay:"plan $RELEASE_B_REVIEWED_TARGET_SHA")
      print_fake_plan false false false false "$RELEASE_B_REVIEWED_TARGET_SHA" \
        "$RELEASE_B_REVIEWED_TARGET_SHA"
      ;;
    release_b_post_b:"plan $TARGET_SHA")
      print_fake_plan true false false false "$POST_RELEASE_B_SHA" \
        "$POST_RELEASE_B_SHA"
      ;;
    release_b_from_8b:"plan $TARGET_SHA"|release_b_bridge_disconnect:"plan $TARGET_SHA"|release_b_controller_repair:"plan $TARGET_SHA"|release_b_current_main:"plan $TARGET_SHA"|release_b_replay:"plan $TARGET_SHA"|release_b_partial:"plan $TARGET_SHA"|release_b_stale_target:"plan $TARGET_SHA"|release_b_rejected:"plan $TARGET_SHA")
      exit 1
      ;;
    release_b_current_main:"plan $RELEASE_B_REVIEWED_TARGET_SHA")
      if grep -qFx "deploy $RELEASE_B_REVIEWED_TARGET_SHA" "$FAKE_SSH_LOG"; then
        print_fake_plan false false false false "$RELEASE_B_REVIEWED_TARGET_SHA" \
          "$RELEASE_B_CURRENT_MAIN_SHA"
      else
        print_fake_plan false false true false "$RELEASE_B_CURRENT_MAIN_SHA" \
          "$RELEASE_B_CURRENT_MAIN_SHA"
      fi
      ;;
    release_b_current_main:"plan $RELEASE_B_CURRENT_MAIN_SHA")
      print_fake_plan false false false false "$RELEASE_B_CURRENT_MAIN_SHA" \
        "$RELEASE_B_CURRENT_MAIN_SHA"
      ;;
    release_b_stale_target:"plan $RELEASE_B_REVIEWED_TARGET_SHA")
      print_fake_plan false true true false "$RELEASE_B_POOL_MARKER" \
        "$RELEASE_B_BACKEND_MARKER"
      ;;
    release_b_stale_target:"plan $RELEASE_B_CURRENT_MAIN_SHA")
      print_fake_plan false true true false "$RELEASE_B_CONTROLLER_SHA" \
        "$RELEASE_B_CONTROLLER_SHA"
      ;;
    release_b_controller_repair:"plan $RELEASE_B_REVIEWED_TARGET_SHA")
      if grep -qFx "deploy $RELEASE_B_REVIEWED_TARGET_SHA" "$FAKE_SSH_LOG"; then
        print_fake_plan false false false false "$RELEASE_B_CONTROLLER_SHA" \
          "$RELEASE_B_CONTROLLER_SHA"
      elif grep -qFx "deploy $RELEASE_B_CONTROLLER_SHA" "$FAKE_SSH_LOG"; then
        print_fake_plan false true true false "$RELEASE_B_CONTROLLER_SHA" \
          "$RELEASE_B_CONTROLLER_SHA"
      else
        print_fake_plan true true true true "$RELEASE_B_POOL_MARKER" \
          "$RELEASE_B_BACKEND_MARKER"
      fi
      ;;
    release_b_from_8b:"plan $RELEASE_B_REVIEWED_TARGET_SHA"|release_b_bridge_disconnect:"plan $RELEASE_B_REVIEWED_TARGET_SHA")
      if grep -qFx "deploy $RELEASE_B_REVIEWED_TARGET_SHA" "$FAKE_SSH_LOG"; then
        print_fake_plan false false false false "$RELEASE_B_REVIEWED_TARGET_SHA" \
          "$RELEASE_B_CONTROLLER_SHA"
      else
        print_fake_plan false true true false "$RELEASE_B_CONTROLLER_SHA" \
          "$RELEASE_B_CONTROLLER_SHA"
      fi
      ;;
    release_b_controller_repair:"plan $RELEASE_B_CURRENT_MAIN_SHA")
      print_fake_plan true true true true "$RELEASE_B_POOL_MARKER" \
        "$RELEASE_B_BACKEND_MARKER"
      ;;
    release_b_from_8b:"plan $RELEASE_B_CURRENT_MAIN_SHA"|release_b_bridge_disconnect:"plan $RELEASE_B_CURRENT_MAIN_SHA")
      print_fake_plan false true true false "$RELEASE_B_CONTROLLER_SHA" \
        "$RELEASE_B_CONTROLLER_SHA"
      ;;
    release_b_from_8b:"plan $RELEASE_B_BRIDGE_SHA"|release_b_bridge_disconnect:"plan $RELEASE_B_BRIDGE_SHA")
      count=$(grep -cFx "deploy $RELEASE_B_BRIDGE_SHA" "$FAKE_SSH_LOG" || true)
      if ((count == 0)); then
        print_fake_plan false false true false "$RELEASE_B_CONTROLLER_SHA" \
          "$RELEASE_B_CONTROLLER_SHA"
      else
        print_fake_plan false false false false "$RELEASE_B_BRIDGE_SHA" \
          "$RELEASE_B_CONTROLLER_SHA"
      fi
      ;;
    release_b_controller_repair:"plan $RELEASE_B_BRIDGE_SHA")
      if grep -qFx "deploy $RELEASE_B_BRIDGE_SHA" "$FAKE_SSH_LOG"; then
        print_fake_plan false false false false "$RELEASE_B_BRIDGE_SHA" \
          "$RELEASE_B_CONTROLLER_SHA"
      elif grep -qFx "deploy $RELEASE_B_CONTROLLER_SHA" "$FAKE_SSH_LOG"; then
        print_fake_plan false false true false "$RELEASE_B_CONTROLLER_SHA" \
          "$RELEASE_B_CONTROLLER_SHA"
      else
        print_fake_plan false true true false "$RELEASE_B_POOL_MARKER" \
          "$RELEASE_B_BACKEND_MARKER"
      fi
      ;;
    release_b_controller_repair:"plan $RELEASE_B_CONTROLLER_SHA")
      if grep -qFx "deploy $RELEASE_B_CONTROLLER_SHA" "$FAKE_SSH_LOG"; then
        print_fake_plan false false false false "$RELEASE_B_CONTROLLER_SHA" \
          "$RELEASE_B_CONTROLLER_SHA"
      else
        print_fake_plan true true true false "$RELEASE_B_POOL_MARKER" \
          "$RELEASE_B_BACKEND_MARKER"
      fi
      ;;
    release_b_from_8b:"deploy $RELEASE_B_BRIDGE_SHA"|release_b_controller_repair:"deploy $RELEASE_B_BRIDGE_SHA")
      printf 'deployed=%s\n' "$RELEASE_B_BRIDGE_SHA"
      ;;
    release_b_bridge_disconnect:"deploy $RELEASE_B_BRIDGE_SHA") exit 255 ;;
    release_b_from_8b:"deploy $RELEASE_B_REVIEWED_TARGET_SHA"|release_b_bridge_disconnect:"deploy $RELEASE_B_REVIEWED_TARGET_SHA"|release_b_controller_repair:"deploy $RELEASE_B_REVIEWED_TARGET_SHA"|release_b_current_main:"deploy $RELEASE_B_REVIEWED_TARGET_SHA")
      printf 'deployed=%s\n' "$RELEASE_B_REVIEWED_TARGET_SHA"
      ;;
    release_b_controller_repair:"deploy $RELEASE_B_CONTROLLER_SHA")
      printf 'deployed=%s\n' "$RELEASE_B_CONTROLLER_SHA"
      ;;
    release_b_partial:"plan $RELEASE_B_REVIEWED_TARGET_SHA")
      printf 'frontend=false\nbackend=true\n'
      ;;
    release_b_rejected:"plan $RELEASE_B_REVIEWED_TARGET_SHA"|release_b_rejected:"plan $RELEASE_B_CURRENT_MAIN_SHA"|release_b_rejected:"plan $RELEASE_B_BRIDGE_SHA") exit 1 ;;
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
MAINTENANCE_DISPATCH=$SCRIPT_DIR/github-production-maintenance-dispatch.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/github-production-deploy-client-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

TARGET_SHA=$(git -C "$SCRIPT_DIR/../.." rev-parse HEAD)
POST_RELEASE_B_SHA=$(git -C "$SCRIPT_DIR/../.." rev-parse HEAD^)
BACKEND_SHA=4f47fac7faed7dc24110f4a43e88820d776b8a40
CURRENT_BACKEND_SHA=617e284607f3dde74c27164af2b981770b9a62ed
RELEASE_B_CONTROLLER_SHA=8b4aeb31e855ed379349a4e4827600009e174132
RELEASE_B_CURRENT_MAIN_SHA=77313ea03a3bac7d2298f4021d58124c810d291f
RELEASE_B_BRIDGE_SHA=b89950632b0cefa4f7b58b687cdfd6e6cd912a04
RELEASE_B_REVIEWED_TARGET_SHA=05744f99b2d13e47a64a7ff12ea2ab8893f5e88a
RELEASE_B_BACKEND_MARKER=09a79687e042e36d4ec9c1f33f0367527f044181
RELEASE_B_POOL_MARKER=6fefa9da5446d5e467badcc7239fdc5a6170a756
MODEL_JOB_IDENTITY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
AUTHORITY_SHA256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
TERMINAL_SET_SHA256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
TERMINAL_SET_SHA256_UPPER=$(printf '%s' "$TERMINAL_SET_SHA256" | tr '[:lower:]' '[:upper:]')
MODEL_JOB_IDENTITY_UPPER=$(printf '%s' "$MODEL_JOB_IDENTITY" | tr '[:lower:]' '[:upper:]')
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

export TARGET_SHA BACKEND_SHA CURRENT_BACKEND_SHA RELEASE_B_CONTROLLER_SHA
export POST_RELEASE_B_SHA
export RELEASE_B_CURRENT_MAIN_SHA RELEASE_B_BRIDGE_SHA RELEASE_B_REVIEWED_TARGET_SHA
export RELEASE_B_BACKEND_MARKER RELEASE_B_POOL_MARKER
export MODEL_JOB_IDENTITY AUTHORITY_SHA256 TERMINAL_SET_SHA256
export FAKE_SSH_LOG FAKE_SSH_STATE FAKE_UPLOAD_PATH
export DEPLOY_SSH_DIRECTORY DEPLOY_SSH_KEY_PATH DEPLOY_SSH_KNOWN_HOSTS_PATH
export DEPLOY_HOST DEPLOY_USER GITHUB_OUTPUT
install -m 0700 "$0" "$FAKE_SSH"

(
  unset DEPLOY_RECONCILE_ATTEMPTS DEPLOY_RECONCILE_INTERVAL_SECONDS \
    DEPLOY_PLAN_READ_ATTEMPTS DEPLOY_PLAN_READ_INTERVAL_SECONDS
  # shellcheck source=/dev/null
  source "$CLIENT"
  ((KNOWN_BACKEND_SOAK_SECONDS == 300))
  ((MINIMUM_RECONCILE_WINDOW_SECONDS >= 600))
  ((DEFAULT_RECONCILE_ATTEMPTS == 45))
  ((DEFAULT_RECONCILE_INTERVAL_SECONDS == 15))
  ((DEFAULT_RECONCILE_WINDOW_SECONDS == 660))
  ((DEFAULT_PLAN_READ_ATTEMPTS == 4))
  ((DEFAULT_PLAN_READ_INTERVAL_SECONDS == 3))
  ((DEFAULT_RECONCILE_WINDOW_SECONDS >= MINIMUM_RECONCILE_WINDOW_SECONDS))
  ((DEFAULT_RECONCILE_WINDOW_SECONDS > KNOWN_BACKEND_SOAK_SECONDS))
  parse_plan "$(printf 'frontend=false\nbackend=false\nbackend_base=%s\ncontrol=true\nx_collector=false\npostgres_pool_bootstrap=postgres-pool-v1\npostgres_pool_bootstrap_sha=%s\n' \
    "$RELEASE_B_CONTROLLER_SHA" "$RELEASE_B_CONTROLLER_SHA")"
  plan_is_exact_release_b_bridge_transition
  parse_plan "$(printf 'frontend=false\nbackend=false\nbackend_base=%s\ncontrol=true\nx_collector=false\npostgres_pool_bootstrap=postgres-pool-v1\npostgres_pool_bootstrap_sha=%s\n' \
    "$RELEASE_B_CONTROLLER_SHA" "$RELEASE_B_BRIDGE_SHA")"
  plan_is_exact_release_b_bridge_transition && exit 1
  parse_plan "$(printf 'frontend=false\nbackend=true\nbackend_base=%s\ncontrol=true\nx_collector=false\npostgres_pool_bootstrap=postgres-pool-v1\npostgres_pool_bootstrap_sha=%s\n' \
    "$RELEASE_B_CONTROLLER_SHA" "$RELEASE_B_CONTROLLER_SHA")"
  plan_is_exact_release_b_target_transition
  # shellcheck disable=SC2034 # Read by the sourced target-plan predicate.
  PLAN_POSTGRES_POOL_REPAIR=true
  plan_is_exact_release_b_target_transition && exit 1
  # shellcheck disable=SC2034 # Read by the sourced current-main predicate.
  PLAN_POSTGRES_POOL_REPAIR=false
  parse_plan "$(printf 'frontend=false\nbackend=false\nbackend_base=%s\ncontrol=true\nx_collector=false\npostgres_pool_bootstrap=postgres-pool-v1\npostgres_pool_bootstrap_sha=%s\n' \
    "$RELEASE_B_CURRENT_MAIN_SHA" "$RELEASE_B_CURRENT_MAIN_SHA")"
  plan_is_exact_release_b_current_main_target_transition
  parse_plan "$(printf 'frontend=true\nbackend=true\nbackend_base=%s\ncontrol=true\nx_collector=true\npostgres_pool_bootstrap=postgres-pool-v1\npostgres_pool_bootstrap_sha=%s\n' \
    "$RELEASE_B_BACKEND_MARKER" "$RELEASE_B_POOL_MARKER")"
  plan_is_exact_release_b_legacy_transition
  parse_plan "$(printf 'frontend=true\nbackend=true\nbackend_base=%s\ncontrol=true\nx_collector=true\npostgres_pool_bootstrap=postgres-pool-v1\npostgres_pool_bootstrap_sha=%s\n' \
    "$POST_RELEASE_B_SHA" "$POST_RELEASE_B_SHA")"
  plan_is_admitted_post_release_b_forward_state "$TARGET_SHA" && exit 1
  parse_plan "$(printf 'frontend=true\nbackend=false\nbackend_base=%s\ncontrol=false\nx_collector=false\npostgres_pool_bootstrap=postgres-pool-v1\npostgres_pool_bootstrap_sha=%s\n' \
    "$POST_RELEASE_B_SHA" "$POST_RELEASE_B_SHA")"
  plan_is_admitted_post_release_b_forward_state "$TARGET_SHA"
  # shellcheck disable=SC2034 # Read by the sourced post-Release-B predicate.
  PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=$RELEASE_B_CONTROLLER_SHA
  plan_is_admitted_post_release_b_forward_state "$TARGET_SHA" && exit 1
  true
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
  DEPLOY_PLAN_READ_ATTEMPTS=4 \
  DEPLOY_PLAN_READ_INTERVAL_SECONDS=0 \
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

# The workflow's local gate accepts the exact reviewed target and its real
# requested descendant, but rejects current-main before any SSH call is made.
for release_b_requested_target in \
  "$RELEASE_B_REVIEWED_TARGET_SHA" "$TARGET_SHA"; do
  HOME='' DEPLOY_SSH_DIRECTORY='' DEPLOY_HOST='' DEPLOY_USER='' \
    GITHUB_WORKSPACE=$SCRIPT_DIR/../.. run_client release_b_local_identity \
      verify-release-b-target "$release_b_requested_target"
  [[ ! -s $FAKE_SSH_LOG ]]
done
HOME='' DEPLOY_SSH_DIRECTORY='' DEPLOY_HOST='' DEPLOY_USER='' \
  GITHUB_WORKSPACE=$SCRIPT_DIR/../.. assert_fails release_b_local_identity \
    verify-release-b-target "$RELEASE_B_CURRENT_MAIN_SHA"
[[ ! -s $FAKE_SSH_LOG ]]

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
  reader-summary-daily-terminal-set-receipt-v1 \
  reader-summary-daily-scan-terminal-preimage-c1; do
  run_client maintenance_success maintenance \
    "$TARGET_SHA" "$maintenance_action" >/dev/null
  assert_call_count 1 "$maintenance_action $TARGET_SHA"
done
run_client maintenance_success maintenance "$TARGET_SHA" \
  reader-summary-production-history 2026-08-11 >/dev/null
assert_call_count 1 \
  "reader-summary-production-history $TARGET_SHA 2026-08-11"
assert_fails maintenance_success maintenance "$TARGET_SHA" \
  reader-summary-production-history bad-date
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
run_client maintenance_success maintenance "$TARGET_SHA" \
  reader-summary-daily-scan-terminal-repair-c1 \
  reader-summary-daily-scan-terminal-repair-c1 "$TERMINAL_SET_SHA256" >/dev/null
assert_call_count 1 \
  "reader-summary-daily-scan-terminal-repair-c1 $TARGET_SHA reader-summary-daily-scan-terminal-repair-c1 $TERMINAL_SET_SHA256"
run_client maintenance_success maintenance "$TARGET_SHA" \
  reader-summary-daily-delivery-c1-run \
  reader-summary-daily-delivery-c1-run 2026-08-10 >/dev/null
assert_call_count 1 \
  "reader-summary-daily-delivery-c1-run $TARGET_SHA reader-summary-daily-delivery-c1-run 2026-08-10"
run_client maintenance_success maintenance "$TARGET_SHA" \
  reader-summary-daily-delivery-c1-contain \
  reader-summary-daily-delivery-c1-contain "$TARGET_SHA" >/dev/null
assert_call_count 1 \
  "reader-summary-daily-delivery-c1-contain $TARGET_SHA reader-summary-daily-delivery-c1-contain $TARGET_SHA"
assert_fails maintenance_success maintenance "$TARGET_SHA" \
  reader-summary-daily-delivery-c1-run wrong 2026-08-10
assert_fails maintenance_success maintenance "$TARGET_SHA" \
  reader-summary-daily-delivery-c1-run reader-summary-daily-delivery-c1-run bad-date
assert_fails maintenance_success maintenance "$TARGET_SHA" \
  reader-summary-daily-delivery-c1-contain reader-summary-daily-delivery-c1-contain \
  0000000000000000000000000000000000000000
assert_fails maintenance_success maintenance "$TARGET_SHA" \
  reader-summary-daily-scan-terminal-repair-c1 wrong-confirmation "$TERMINAL_SET_SHA256"
assert_fails maintenance_success maintenance "$TARGET_SHA" \
  reader-summary-daily-scan-terminal-repair-c1 \
  reader-summary-daily-scan-terminal-repair-c1 short-digest
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
  invalid-product-retry-set-v1 "$TERMINAL_SET_SHA256_UPPER"
assert_call_count 0 \
  "reader-summary-daily-canonical-recovery-v4 $TARGET_SHA invalid-product-retry-set-v1 $TERMINAL_SET_SHA256_UPPER"
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
  reader-summary-daily-canonical-recovery-v4 "$MODEL_JOB_IDENTITY_UPPER" "$AUTHORITY_SHA256"
assert_call_count 0 \
  "reader-summary-daily-canonical-recovery-v4 $TARGET_SHA reader-summary-daily-canonical-recovery-v4 $MODEL_JOB_IDENTITY_UPPER $AUTHORITY_SHA256"
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

PREIMAGE_ARTIFACT=$FIXTURE/daily-scan-terminal-preimage.json
preimage_targets='[{"target":"hacker_news","jobId":"e630ed7d-42b7-4bf0-a747-f9bdf0f8a9d7","sourceBindingId":"0348ff97-3925-4d04-a192-7e782badbf50","leaseId":"703fd7b5-cf83-4508-a5b1-5a9dfdc4643e","leasePresent":true,"jobStatus":"ENQUEUED","attemptStatus":"RUNNING","attemptNumber":1,"fetched":0,"inserted":0,"skippedDuplicates":0,"projected":0,"failureReasonSha256":null,"schedulerDecisionCount":1,"downstream":{"failureQueue":0,"githubCandidates":0,"githubResults":0,"engagementObservations":0,"sourceItems":0,"feedItems":0,"outbox":0,"inbox":0,"idempotency":0,"cursor":0},"failureMetadataSqlNull":true,"executionMetadataSqlNull":true},{"target":"reddit","jobId":"b9de1ac8-4490-48d6-befa-a25472b5e94a","sourceBindingId":"8e753ea9-fb03-4c05-8288-6e871cb20b27","leaseId":null,"leasePresent":false,"jobStatus":"REQUESTED","attemptStatus":"FAILED","attemptNumber":1,"fetched":0,"inserted":0,"skippedDuplicates":0,"projected":0,"failureReasonSha256":"f6080204874629cf05223f8dc7650330a89106f0e4562a92b4b5310bd9f90ad1","schedulerDecisionCount":1,"downstream":{"failureQueue":0,"githubCandidates":0,"githubResults":0,"engagementObservations":0,"sourceItems":0,"feedItems":0,"outbox":0,"inbox":0,"idempotency":0,"cursor":0},"failureMetadataSqlNull":true,"executionMetadataSqlNull":true}]'
redacted_targets_sha256=$(node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update(process.argv[1],"utf8").digest("hex"))' "$preimage_targets")
preimage_line="{\"schemaVersion\":\"reader_summary.daily_scan_terminal_preimage.c1\",\"confirmation\":\"reader-summary-daily-scan-terminal-repair-c1\",\"capturedAt\":\"2026-08-11T12:00:00.000Z\",\"reviewedPreimageSha256\":\"$TERMINAL_SET_SHA256\",\"targetCount\":2,\"redactedTargetsSha256\":\"$redacted_targets_sha256\",\"targets\":$preimage_targets}"
printf '%s\n' "$preimage_line" > "$PREIMAGE_ARTIFACT"
bash "$CLIENT" validate-daily-scan-terminal-artifact preimage "$PREIMAGE_ARTIFACT"
[[ $(stat -c '%a' "$PREIMAGE_ARTIFACT") == 444 ]]

REPAIR_ARTIFACT=$FIXTURE/daily-scan-terminal-repair.json
repair_line='{"schemaVersion":"reader_summary.daily_scan_terminal_repair.c1","confirmation":"reader-summary-daily-scan-terminal-repair-c1","reviewedPreimageSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","transactionTimestamp":"2026-08-11 12:01:00+00","targetCount":2,"restoreEvidenceSha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","durableReceipt":true}'
printf '%s\n' "$repair_line" > "$REPAIR_ARTIFACT"
bash "$CLIENT" validate-daily-scan-terminal-artifact repair \
  "$REPAIR_ARTIFACT" "$TERMINAL_SET_SHA256"
[[ $(stat -c '%a' "$REPAIR_ARTIFACT") == 444 ]]

assert_invalid_daily_scan_artifact() {
  local kind=$1 path=$2 value=$3 expected_digest=${4:-}
  chmod 0600 "$path"
  printf '%s' "$value" > "$path"
  if bash "$CLIENT" validate-daily-scan-terminal-artifact \
    "$kind" "$path" "$expected_digest" >/dev/null 2>&1; then
    printf 'invalid daily scan terminal artifact accepted: %s\n' "$value" >&2
    exit 1
  fi
  [[ $(stat -c '%a' "$path") == 600 ]]
}

assert_invalid_daily_scan_artifact preimage "$PREIMAGE_ARTIFACT" \
  "${preimage_line/\"targetCount\":2/\"targetCount\":3}"$'\n'
assert_invalid_daily_scan_artifact preimage "$PREIMAGE_ARTIFACT" \
  "${preimage_line/\"schedulerDecisionCount\":1/\"schedulerDecisionCount\":2}"$'\n'
assert_invalid_daily_scan_artifact preimage "$PREIMAGE_ARTIFACT" \
  "${preimage_line/\"jobStatus\":\"ENQUEUED\"/\"providerConfig\":{},\"jobStatus\":\"ENQUEUED\"}"$'\n'
assert_invalid_daily_scan_artifact repair "$REPAIR_ARTIFACT" \
  "${repair_line/\"durableReceipt\":true/\"durableReceipt\":false}"$'\n' \
  "$TERMINAL_SET_SHA256"
assert_invalid_daily_scan_artifact repair "$REPAIR_ARTIFACT" \
  "${repair_line%\}},\"before\":{}}"$'\n' "$TERMINAL_SET_SHA256"

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

# Inspection is deliberately read-only: an uninstalled bootstrap is reported
# without invoking repair and without writing workflow outputs.
: > "$GITHUB_OUTPUT"
inspect_output=$(run_client atomic_success inspect-plan "$TARGET_SHA")
grep -Fx 'postgres_pool_bootstrap=uninstalled' <<< "$inspect_output" >/dev/null
grep -Fx 'postgres_pool_repair=false' <<< "$inspect_output" >/dev/null
[[ ! -s $GITHUB_OUTPUT ]]
assert_call_count 1 "plan $TARGET_SHA"
assert_call_count 0 "deploy $TARGET_SHA"

inspect_output=$(run_client inspect_transient_reset inspect-plan "$TARGET_SHA")
grep -Fx 'backend=false' <<< "$inspect_output" >/dev/null
assert_call_count 3 "plan $TARGET_SHA"
assert_call_count 0 "deploy $TARGET_SHA"

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

# Every bridge/controller mutation follows a plan and is issued at most once.
prepare_args=(prepare-release-b-bridge "$RELEASE_B_CONTROLLER_SHA" \
  "$RELEASE_B_BRIDGE_SHA" "$RELEASE_B_CURRENT_MAIN_SHA" \
  "$RELEASE_B_REVIEWED_TARGET_SHA" "$TARGET_SHA")
run_client release_b_post_b "${prepare_args[@]}" >/dev/null
assert_call_count 1 "plan $TARGET_SHA"
assert_call_count 0 "plan $RELEASE_B_REVIEWED_TARGET_SHA"
assert_call_count 0 "deploy $RELEASE_B_BRIDGE_SHA"
assert_call_count 0 "deploy $RELEASE_B_REVIEWED_TARGET_SHA"
run_client release_b_from_8b "${prepare_args[@]}" >/dev/null
assert_call_count 1 "deploy $RELEASE_B_BRIDGE_SHA"
assert_call_count 2 "plan $RELEASE_B_BRIDGE_SHA"
assert_call_count 1 "deploy $RELEASE_B_REVIEWED_TARGET_SHA"
assert_call_count 0 "deploy $TARGET_SHA"
assert_call_count 0 "deploy $RELEASE_B_CONTROLLER_SHA"
run_client release_b_bridge_disconnect "${prepare_args[@]}" >/dev/null
assert_call_count 1 "deploy $RELEASE_B_BRIDGE_SHA"
assert_call_count 2 "plan $RELEASE_B_BRIDGE_SHA"
assert_call_count 1 "deploy $RELEASE_B_REVIEWED_TARGET_SHA"
assert_call_count 0 "deploy $TARGET_SHA"
run_client release_b_controller_repair "${prepare_args[@]}" >/dev/null
assert_call_count 1 "deploy $RELEASE_B_CONTROLLER_SHA"
assert_call_count 1 "deploy $RELEASE_B_BRIDGE_SHA"
assert_call_count 1 "deploy $RELEASE_B_REVIEWED_TARGET_SHA"
assert_call_count 0 "deploy $TARGET_SHA"
assert_call_count 2 "plan $RELEASE_B_CONTROLLER_SHA"
run_client release_b_current_main "${prepare_args[@]}" >/dev/null
assert_call_count 0 "deploy $RELEASE_B_BRIDGE_SHA"
assert_call_count 1 "deploy $RELEASE_B_REVIEWED_TARGET_SHA"
assert_call_count 0 "deploy $TARGET_SHA"
assert_call_count 1 "plan $RELEASE_B_CURRENT_MAIN_SHA"
run_client release_b_replay "${prepare_args[@]}" >/dev/null
assert_call_count 0 "deploy $RELEASE_B_BRIDGE_SHA"
assert_call_count 0 "deploy $RELEASE_B_REVIEWED_TARGET_SHA"
assert_call_count 0 "deploy $TARGET_SHA"
assert_fails release_b_partial "${prepare_args[@]}"
assert_call_count 0 "deploy $RELEASE_B_BRIDGE_SHA"
assert_fails release_b_stale_target "${prepare_args[@]}"
assert_call_count 0 "plan $RELEASE_B_BRIDGE_SHA"
assert_call_count 0 "deploy $RELEASE_B_BRIDGE_SHA"
assert_fails release_b_rejected "${prepare_args[@]}"
assert_call_count 0 "deploy $RELEASE_B_BRIDGE_SHA"
assert_fails release_b_replay prepare-release-b-bridge "$TARGET_SHA" \
  "$RELEASE_B_BRIDGE_SHA" "$RELEASE_B_CURRENT_MAIN_SHA" \
  "$RELEASE_B_REVIEWED_TARGET_SHA" "$TARGET_SHA"
[[ ! -s $FAKE_SSH_LOG ]]
assert_fails release_b_replay prepare-release-b-bridge \
  "$RELEASE_B_CONTROLLER_SHA" "$RELEASE_B_BRIDGE_SHA" \
  "$RELEASE_B_CURRENT_MAIN_SHA" "$RELEASE_B_REVIEWED_TARGET_SHA" \
  "$RELEASE_B_CURRENT_MAIN_SHA"
[[ ! -s $FAKE_SSH_LOG ]]

run_client normal_success install-daily-c1-bridge-policy \
  944fdb6da3071f70a69c7048c9fcdf1c2552603e >/dev/null
assert_call_count 1 \
  "deploy 944fdb6da3071f70a69c7048c9fcdf1c2552603e"
assert_call_count 0 \
  "plan 944fdb6da3071f70a69c7048c9fcdf1c2552603e"

assert_fails normal_success install-daily-c1-bridge-policy "$TARGET_SHA"
assert_call_count 0 "deploy $TARGET_SHA"

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

# shellcheck disable=SC2016 # Literal GitHub expressions are asserted in workflow text.
grep -F 'postgres_pool_repair: ${{ steps.plan.outputs.postgres_pool_repair }}' \
  "$WORKFLOW" >/dev/null
# PostgreSQL bootstrap repair is now driven by the freshly inspected transition
# state and is restricted to one of the three frozen release anchors.
[[ $(grep -cF \
  "if: needs.plan.outputs.transition_state == 'repair-required'" "$WORKFLOW") == 1 ]]
# shellcheck disable=SC2016
grep -F 'repair_anchor: ${{ steps.plan.outputs.repair_anchor }}' \
  "$WORKFLOW" >/dev/null
# shellcheck disable=SC2016
grep -F 'REPAIR_ANCHOR: ${{ needs.plan.outputs.repair_anchor }}' \
  "$WORKFLOW" >/dev/null
grep -F "prepare-forward-bridge requires its target SHA" "$CLIENT" >/dev/null
if grep -Eq 'PRODUCTION_FORWARD_BRIDGE_(SHA|TREE|BLOB)|prepare-forward-bridge requires bridge' \
    "$CLIENT" "$WORKFLOW"; then
  echo 'production forward client retained a future bridge pin or two-SHA CLI' >&2
  exit 1
fi
grep -F '889d50f50328c89e25b3ef898e552df631b3222f|c64c3b46b6b6ba5c7ac7b04028932e09dae2116a|e3b5b5d89b3586668e36f987f03672415b5a0f37' \
  "$WORKFLOW" >/dev/null
for maintenance_action in \
  disk-report project-disk-cleanup \
  reader-summary-recover-missing-days reader-summary-weekly-run \
  reader-summary-daily-canonical-recovery-v4 \
  reader-summary-daily-scan-terminal-preimage-c1 \
  reader-summary-daily-delivery-c1-run \
  reader-summary-daily-delivery-c1-contain; do
  grep -F "          - $maintenance_action" "$WORKFLOW" >/dev/null
done
grep -F 'daily_canonical_recovery_retry_set_token:' "$WORKFLOW" >/dev/null
grep -F 'daily_canonical_recovery_terminal_set_sha256:' "$WORKFLOW" >/dev/null
grep -F 'daily_canonical_recovery_confirmation:' "$WORKFLOW" >/dev/null
grep -F 'daily_canonical_recovery_model_job_identity:' "$WORKFLOW" >/dev/null
grep -F 'daily_canonical_recovery_authority_sha256:' "$WORKFLOW" >/dev/null
grep -F 'DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN == invalid-product-retry-set-v1' \
  "$MAINTENANCE_DISPATCH" >/dev/null
grep -F 'DAILY_CANONICAL_RECOVERY_CONFIRMATION' "$WORKFLOW" >/dev/null
grep -F 'daily_delivery_c1_confirmation:' "$WORKFLOW" >/dev/null
grep -F 'daily_delivery_c1_recovery_through:' "$WORKFLOW" >/dev/null
grep -F 'daily_delivery_c1_ready_sha:' "$WORKFLOW" >/dev/null
grep -F 'timeout-minutes: 360' "$WORKFLOW" >/dev/null
grep -F 'reader-summary-daily-canonical-recovery-v4' "$WORKFLOW" >/dev/null
grep -F 'npm run check:reader-summary-daily-canonical-recovery-postgres18' "$WORKFLOW" >/dev/null
grep -F 'npm run check:reader-summary-daily-delivery-c1-postgres' "$WORKFLOW" >/dev/null
grep -F 'npm run check:reader-summary-daily-scan-terminal-repair-c1-postgres' "$WORKFLOW" >/dev/null
grep -F 'npm run check:reader-summary-daily-canonical-recovery-production' "$WORKFLOW" >/dev/null
for dependency in plan verify_reader_summary_publication verify_backend build_frontend; do
  grep -F "      - $dependency" "$WORKFLOW" >/dev/null
done

echo 'GitHub production deploy client tests passed'
