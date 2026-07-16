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
    printf 'frontend=%s\nbackend=%s\nbackend_base=%s\ncontrol=%s\nx_collector=%s\npostgres_pool_bootstrap=postgres-pool-v1\npostgres_pool_bootstrap_sha=%s\n' \
      "$frontend" "$backend" "$TARGET_SHA" "$control" "$collector" "$marker"
  }

  case "$FAKE_SSH_SCENARIO:$command" in
    plan_success:"plan $TARGET_SHA"|normal_success:"plan $TARGET_SHA"|bootstrap_success:"plan $TARGET_SHA"|bootstrap_exit_91:"plan $TARGET_SHA"|bootstrap_disconnect:"plan $TARGET_SHA")
      print_fake_plan false false false false
      ;;
    legacy_plan:"plan $TARGET_SHA")
      printf 'frontend=false\nbackend=false\nbackend_base=%s\ncontrol=true\nx_collector=false\n' \
        "$TARGET_SHA"
      ;;
    legacy_backend_plan:"plan $TARGET_SHA")
      printf 'frontend=false\nbackend=true\nbackend_base=%s\ncontrol=true\nx_collector=false\n' \
        "$TARGET_SHA"
      ;;
    upload_success:"upload $TARGET_SHA")
      IFS= read -r value
      printf '%s\n' "$value" > "$FAKE_UPLOAD_PATH"
      ;;
    normal_success:"deploy $TARGET_SHA"|bootstrap_success:"deploy $TARGET_SHA")
      printf 'deployed=%s\n' "$TARGET_SHA"
      ;;
    bootstrap_exit_91:"deploy $TARGET_SHA")
      count=$(grep -cFx "deploy $TARGET_SHA" "$FAKE_SSH_LOG")
      if ((count == 1)); then
        exit 91
      fi
      printf 'deployed=%s\n' "$TARGET_SHA"
      ;;
    disconnect_eventual:"deploy $TARGET_SHA"|bootstrap_disconnect:"deploy $TARGET_SHA"|pending:"deploy $TARGET_SHA"|partial:"deploy $TARGET_SHA"|invalid_marker:"deploy $TARGET_SHA"|reconcile_plan_non_255:"deploy $TARGET_SHA")
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
    bootstrap_all_fail:"deploy $TARGET_SHA")
      exit 91
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
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/github-production-deploy-client-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

TARGET_SHA=1234567890abcdef1234567890abcdef12345678
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

export TARGET_SHA FAKE_SSH_LOG FAKE_SSH_STATE FAKE_UPLOAD_PATH
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
  local expected=$1
  local command=$2
  local actual
  actual=$(grep -cFx "$command" "$FAKE_SSH_LOG" || true)
  [[ $actual == "$expected" ]] || {
    printf 'expected %s calls to %s, received %s\n' "$expected" "$command" "$actual" >&2
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

: > "$GITHUB_OUTPUT"
run_client plan_success plan "$TARGET_SHA" >/dev/null
grep -Fx 'frontend=false' "$GITHUB_OUTPUT" >/dev/null
grep -Fx "backend_base=$TARGET_SHA" "$GITHUB_OUTPUT" >/dev/null
grep -Fx 'postgres_pool_bootstrap=postgres-pool-v1' "$GITHUB_OUTPUT" >/dev/null
assert_call_count 1 "plan $TARGET_SHA"

: > "$GITHUB_OUTPUT"
run_client legacy_plan plan "$TARGET_SHA" >/dev/null
grep -Fx 'postgres_pool_bootstrap=uninstalled' "$GITHUB_OUTPUT" >/dev/null
grep -Fx 'postgres_pool_bootstrap_sha=0000000000000000000000000000000000000000' \
  "$GITHUB_OUTPUT" >/dev/null
assert_call_count 1 "plan $TARGET_SHA"

: > "$GITHUB_OUTPUT"
assert_fails legacy_backend_plan plan "$TARGET_SHA"
[[ ! -s $GITHUB_OUTPUT ]]
assert_call_count 1 "plan $TARGET_SHA"

printf 'immutable-frontend-archive\n' > "$FIXTURE/frontend.tgz"
run_client upload_success upload "$TARGET_SHA" "$FIXTURE/frontend.tgz" >/dev/null
grep -Fx 'immutable-frontend-archive' "$FAKE_UPLOAD_PATH" >/dev/null
assert_call_count 1 "upload $TARGET_SHA"

run_client normal_success deploy "$TARGET_SHA" false postgres-pool-v1 >/dev/null
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 1 "plan $TARGET_SHA"

run_client disconnect_eventual deploy "$TARGET_SHA" false postgres-pool-v1 >/dev/null
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 2 "plan $TARGET_SHA"

run_client final_plan_disconnect deploy "$TARGET_SHA" false postgres-pool-v1 >/dev/null
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 2 "plan $TARGET_SHA"

run_client final_plan_pending deploy "$TARGET_SHA" false postgres-pool-v1 >/dev/null
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 2 "plan $TARGET_SHA"

assert_fails pending deploy "$TARGET_SHA" false postgres-pool-v1
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 3 "plan $TARGET_SHA"

assert_fails partial deploy "$TARGET_SHA" false postgres-pool-v1
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 3 "plan $TARGET_SHA"

assert_fails invalid_marker deploy "$TARGET_SHA" false postgres-pool-v1
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 1 "plan $TARGET_SHA"

assert_fails malformed deploy "$TARGET_SHA" false postgres-pool-v1
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 1 "plan $TARGET_SHA"

assert_fails duplicate deploy "$TARGET_SHA" false postgres-pool-v1
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 1 "plan $TARGET_SHA"

assert_fails missing deploy "$TARGET_SHA" false postgres-pool-v1
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 1 "plan $TARGET_SHA"

assert_fails reconcile_plan_non_255 deploy "$TARGET_SHA" false postgres-pool-v1
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 1 "plan $TARGET_SHA"

assert_fails non_255 deploy "$TARGET_SHA" false postgres-pool-v1
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 0 "plan $TARGET_SHA"

run_client bootstrap_success deploy "$TARGET_SHA" true uninstalled >/dev/null
assert_call_count 3 "deploy $TARGET_SHA"
assert_call_count 1 "plan $TARGET_SHA"

run_client bootstrap_exit_91 deploy "$TARGET_SHA" true uninstalled >/dev/null
assert_call_count 3 "deploy $TARGET_SHA"
assert_call_count 1 "plan $TARGET_SHA"

run_client bootstrap_disconnect deploy "$TARGET_SHA" true uninstalled >/dev/null
assert_call_count 1 "deploy $TARGET_SHA"
assert_call_count 1 "plan $TARGET_SHA"

assert_fails bootstrap_all_fail deploy "$TARGET_SHA" true uninstalled
assert_call_count 3 "deploy $TARGET_SHA"
assert_call_count 0 "plan $TARGET_SHA"

if DEPLOY_HOST=-oProxyCommand=bad run_client normal_success deploy "$TARGET_SHA" false postgres-pool-v1 >/dev/null 2>&1; then
  echo 'leading-option host unexpectedly accepted' >&2
  exit 1
fi
assert_call_count 0 "deploy $TARGET_SHA"

if DEPLOY_USER='bad user' run_client normal_success deploy "$TARGET_SHA" false postgres-pool-v1 >/dev/null 2>&1; then
  echo 'invalid user unexpectedly accepted' >&2
  exit 1
fi
assert_call_count 0 "deploy $TARGET_SHA"

if DEPLOY_HOST=bad.-label run_client normal_success deploy "$TARGET_SHA" false postgres-pool-v1 >/dev/null 2>&1; then
  echo 'invalid hostname unexpectedly accepted' >&2
  exit 1
fi
assert_call_count 0 "deploy $TARGET_SHA"

echo 'GitHub production deploy client tests passed'
