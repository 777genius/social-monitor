#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LIB=$SCRIPT_DIR/postgres-pool-atomic-bootstrap-lib.sh
CONTROL_LIB=$SCRIPT_DIR/deploy-control-lib.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/postgres-pool-atomic-bootstrap.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

REPO=$FIXTURE/repo
ORIGIN=$FIXTURE/origin.git
ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
RUNTIME=$ROOT/runtime
RUNTIME_CALL_LOG=$FIXTURE/runtime-calls.log
DEPLOY_LOCK=$CONTROL/production-deploy.lock
POSTGRES_ADMISSION_LOCK=$CONTROL/daily-run.lock
ENTRYPOINT=$CONTROL/github-production-deploy.sh
WRAPPER=$CONTROL/github-production-deploy-wrapper.sh

git init --bare -q "$ORIGIN"
git init -q -b main "$REPO"
git -C "$REPO" config user.name 'Atomic Bootstrap Contract'
git -C "$REPO" config user.email atomic-bootstrap@example.invalid
git -C "$REPO" remote add origin "$ORIGIN"

# Read the production repair manifest in an isolated shell so the loader test
# can also prove that the target library was not preloaded.
mapfile -t REPAIR_PATHS < <(
  # shellcheck disable=SC2016 # $1 expands inside the isolated child shell.
  bash -c 'source "$1"; postgres_pool_atomic_repair_paths' _ "$LIB"
)
[[ ${#REPAIR_PATHS[@]} == 17 ]]
if grep -E 'SYSTEM_DATABASE_URL|production\.env|docker|systemctl|COMPOSE' \
  "$LIB" >/dev/null; then
  echo 'atomic repair library contains a runtime or secret access surface' >&2
  exit 1
fi

for relative_path in "${REPAIR_PATHS[@]}"; do
  install -d "$REPO/$(dirname "$relative_path")"
  printf 'base bytes for %s\n' "$relative_path" > "$REPO/$relative_path"
  case $relative_path in
    *.sh|*.py) chmod 0755 "$REPO/$relative_path" ;;
  esac
done
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: canonical adoption backend'
ADOPTION_BACKEND=$(git -C "$REPO" rev-parse HEAD)

printf 'repair base\n' > "$REPO/repair-base.txt"
git -C "$REPO" add repair-base.txt
git -C "$REPO" commit -qm 'test: merged PR 67 repair base'
REPAIR_BASE=$(git -C "$REPO" rev-parse HEAD)

for relative_path in "${REPAIR_PATHS[@]}"; do
  if [[ $relative_path == ops/deploy/postgres-pool-atomic-bootstrap-lib.sh ]]; then
    cp "$LIB" "$REPO/$relative_path"
  else
    printf 'reviewed target bytes for %s\n' "$relative_path" \
      > "$REPO/$relative_path"
  fi
done
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: exact atomic repair'
TARGET_SHA=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" push -q -u origin main
[[ $(git -C "$REPO" diff --name-only "$REPAIR_BASE" "$TARGET_SHA" | wc -l) == 17 ]]

install -d "$STATE" "$RUNTIME/postgres-runtime-current"
printf 'legacy installed entrypoint\n' > "$ENTRYPOINT"
printf 'legacy installed wrapper\n' > "$WRAPPER"
chmod 0755 "$ENTRYPOINT" "$WRAPPER"
cp "$ENTRYPOINT" "$FIXTURE/entrypoint.before"
cp "$WRAPPER" "$FIXTURE/wrapper.before"
printf 'runtime marker\n' > "$RUNTIME/backend-runtime.sha"
printf 'service state\n' > "$RUNTIME/service.state"
printf 'container state\n' > "$RUNTIME/container.state"
printf 'image state\n' > "$RUNTIME/image.state"
printf 'running process state\n' > "$RUNTIME/process.state"
cp -R "$RUNTIME" "$FIXTURE/runtime.before"

reset_state() {
  cp "$FIXTURE/entrypoint.before" "$ENTRYPOINT"
  cp "$FIXTURE/wrapper.before" "$WRAPPER"
  chmod 0755 "$ENTRYPOINT" "$WRAPPER"
  printf '%s\n' "$ADOPTION_BACKEND" > "$STATE/backend.sha"
  printf '%s\n' "$REPAIR_BASE" > "$STATE/control.sha"
  rm -f \
    "$STATE/postgres-pool-bootstrap.sha" \
    "$STATE/postgres-pool-bootstrap.sha.next" \
    "$ENTRYPOINT.next" "$ENTRYPOINT.rollback" \
    "$WRAPPER.next" "$WRAPPER.rollback"
  rm -rf "$STATE/.postgres-pool-atomic-bootstrap-$TARGET_SHA"
}

invoke_bootstrap() (
  set -Eeuo pipefail
  export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
  export POSTGRES_POOL_ADOPTION_BACKEND_OVERRIDE=${POSTGRES_POOL_ADOPTION_BACKEND_OVERRIDE:-$ADOPTION_BACKEND}
  export REPO CONTROL STATE DEPLOY_LOCK POSTGRES_ADMISSION_LOCK TARGET_SHA

  fail() {
    printf 'deploy-error: %s\n' "$*" >&2
    exit 1
  }
  fetch_main() { :; }
  validate_sha() {
    [[ ${1:-} =~ ^[0-9a-f]{40}$ ]] || fail 'commit is invalid'
  }
  validate_main_commit() {
    local sha=$1
    validate_sha "$sha"
    git -C "$REPO" cat-file -e "$sha^{commit}" 2>/dev/null || \
      fail 'commit is unavailable'
    git -C "$REPO" merge-base --is-ancestor "$sha" origin/main || \
      fail 'commit is not on origin/main'
  }
  print_plan() {
    local target=$1
    local bootstrap=uninstalled
    local bootstrap_sha=0000000000000000000000000000000000000000
    if [[ -f $STATE/postgres-pool-bootstrap.sha && \
          ! -L $STATE/postgres-pool-bootstrap.sha ]]; then
      bootstrap=postgres-pool-v1
      bootstrap_sha=$(tr -d '\n' < "$STATE/postgres-pool-bootstrap.sha")
    fi
    printf 'frontend=false\nbackend=%s\nbackend_base=%s\ncontrol=true\nx_collector=false\npostgres_pool_bootstrap=%s\npostgres_pool_bootstrap_sha=%s\n' \
      "${ATOMIC_PLAN_BACKEND:-true}" \
      "$(tr -d '\n' < "$STATE/backend.sha")" \
      "$bootstrap" "$bootstrap_sha"
    : "$target"
  }
  # Runtime canaries are invoked only if sourced deploy code reaches a forbidden path.
  # shellcheck disable=SC2317
  docker() { printf 'docker:%s\n' "$*" >> "$RUNTIME_CALL_LOG"; return 97; }
  # shellcheck disable=SC2317
  systemctl() { printf 'systemctl:%s\n' "$*" >> "$RUNTIME_CALL_LOG"; return 98; }
  # shellcheck disable=SC2317
  application_runtime() {
    printf 'application:%s\n' "$*" >> "$RUNTIME_CALL_LOG"
    return 99
  }
  COMPOSE=(docker compose)

  # shellcheck source=ops/deploy/deploy-control-lib.sh
  source "$CONTROL_LIB"
  # Sourced deploy-control paths call these overrides if ordinary runtime flow leaks in.
  # shellcheck disable=SC2317
  verify_compose_scope() { application_runtime compose; }
  # shellcheck disable=SC2317
  deploy_release_runtime_transaction() { application_runtime transaction; }
  acquire_postgres_admission_with_daily_priority() {
    flock -n "$1"
  }
  verify_postgres_pool_atomic_repair_target() {
    local target=$1 backend_base=$2 expected_backend expected actual
    local relative_path mode type object path
    expected_backend=${POSTGRES_POOL_ADOPTION_BACKEND_OVERRIDE:-$ADOPTION_BACKEND}
    [[ $backend_base == "$expected_backend" ]] || \
      fail 'durable backend marker is not the exact adoption backend'
    git -C "$REPO" merge-base --is-ancestor "$REPAIR_BASE" "$target" || \
      fail 'atomic target does not descend from the repair base'
    expected=$(printf '%s\n' "${REPAIR_PATHS[@]}" | LC_ALL=C sort)
    actual=$(git -C "$REPO" diff --name-only "$REPAIR_BASE" "$target" -- | \
      LC_ALL=C sort)
    [[ $actual == "$expected" ]] || fail 'atomic target delta is not exact'
    while IFS= read -r relative_path; do
      read -r mode type object path < <(
        git -C "$REPO" ls-tree "$target" -- "$relative_path"
      )
      [[ ($mode == 100644 || $mode == 100755) && $type == blob && \
         $object =~ ^[0-9a-f]+$ && $path == "$relative_path" ]] || \
        fail "atomic target is not a regular blob: $relative_path"
    done <<< "$expected"
  }
  deploy_postgres_pool_atomic_control_bootstrap "$TARGET_SHA"
)

assert_rejected() {
  local expected=$1
  local output
  shift
  if output=$("$@" 2>&1); then
    printf 'unexpectedly accepted atomic bootstrap case: %s\n' "$expected" >&2
    exit 1
  fi
  grep -F "$expected" <<< "$output" >/dev/null
}

assert_rolled_back() {
  cmp -s "$FIXTURE/entrypoint.before" "$ENTRYPOINT"
  cmp -s "$FIXTURE/wrapper.before" "$WRAPPER"
  [[ ! -e $STATE/postgres-pool-bootstrap.sha ]]
  [[ ! -e $STATE/.postgres-pool-atomic-bootstrap-$TARGET_SHA ]]
  [[ ! -e $ENTRYPOINT.next && ! -e $ENTRYPOINT.rollback ]]
  [[ ! -e $WRAPPER.next && ! -e $WRAPPER.rollback ]]
  diff -r "$FIXTURE/runtime.before" "$RUNTIME" >/dev/null
}

reset_state
printf '%s\n' "$REPAIR_BASE" > "$STATE/backend.sha"
assert_rejected 'durable backend marker is not the exact adoption backend' \
  invoke_bootstrap
assert_rolled_back

reset_state
DIVERGENT_BACKEND=$(
  printf 'test: divergent adoption backend\n' |
    git -C "$REPO" commit-tree "$ADOPTION_BACKEND^{tree}"
)
printf '%s\n' "$DIVERGENT_BACKEND" > "$STATE/backend.sha"
POSTGRES_POOL_ADOPTION_BACKEND_OVERRIDE=$DIVERGENT_BACKEND \
  assert_rejected 'durable adoption backend is not an ancestor of the target' \
  invoke_bootstrap
assert_rolled_back

reset_state
printf '%s\n' "$REPAIR_BASE" > "$STATE/postgres-pool-bootstrap.sha"
assert_rejected 'PostgreSQL bootstrap marker must be absent for atomic repair' \
  invoke_bootstrap
rm -f "$STATE/postgres-pool-bootstrap.sha"
assert_rolled_back

reset_state
ATOMIC_PLAN_BACKEND=false \
  assert_rejected 'ordinary deploy plan does not have the backend pending' \
  invoke_bootstrap
assert_rolled_back

reset_state
rm -f "$ENTRYPOINT"
ln -s "$FIXTURE/entrypoint.before" "$ENTRYPOINT"
assert_rejected 'installed entrypoint is not a regular non-symlink file' \
  invoke_bootstrap
rm -f "$ENTRYPOINT"
cp "$FIXTURE/entrypoint.before" "$ENTRYPOINT"
chmod 0755 "$ENTRYPOINT"
assert_rolled_back

for phase in symlink-reviewed digest-reviewed after-entrypoint after-marker; do
  reset_state
  backend_identity=$(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/backend.sha")
  control_identity=$(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/control.sha")
  POSTGRES_POOL_ATOMIC_TEST_PHASE=$phase \
    assert_rejected 'atomic PostgreSQL bootstrap' invoke_bootstrap
  [[ $(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/backend.sha") == \
    "$backend_identity" ]]
  [[ $(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/control.sha") == \
    "$control_identity" ]]
  assert_rolled_back
done

reset_state
printf 'partial\n' > "$STATE/postgres-pool-bootstrap.sha.next"
assert_rejected 'partial control or marker file' invoke_bootstrap
rm -f "$STATE/postgres-pool-bootstrap.sha.next"
assert_rolled_back

reset_state
backend_identity=$(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/backend.sha")
control_identity=$(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/control.sha")
success_output=$(invoke_bootstrap)
[[ -z $success_output ]]
[[ $(cat "$STATE/postgres-pool-bootstrap.sha") == "$TARGET_SHA" ]]
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/backend.sha") == \
  "$backend_identity" ]]
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/control.sha") == \
  "$control_identity" ]]
git -C "$REPO" show \
  "$TARGET_SHA:ops/deploy/social-monitor-production-deploy.sh" \
  > "$FIXTURE/entrypoint.reviewed"
git -C "$REPO" show \
  "$TARGET_SHA:ops/deploy/social-monitor-production-ssh-wrapper.sh" \
  > "$FIXTURE/wrapper.reviewed"
cmp -s "$FIXTURE/entrypoint.reviewed" "$ENTRYPOINT"
cmp -s "$FIXTURE/wrapper.reviewed" "$WRAPPER"
diff -r "$FIXTURE/runtime.before" "$RUNTIME" >/dev/null
[[ ! -e $STATE/.postgres-pool-atomic-bootstrap-$TARGET_SHA ]]
[[ ! -s $RUNTIME_CALL_LOG ]]

entrypoint_identity=$(stat -c '%d:%i:%f:%s:%y:%z' "$ENTRYPOINT")
wrapper_identity=$(stat -c '%d:%i:%f:%s:%y:%z' "$WRAPPER")
assert_rejected 'PostgreSQL bootstrap marker must be absent for atomic repair' \
  invoke_bootstrap
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$ENTRYPOINT") == \
  "$entrypoint_identity" ]]
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$WRAPPER") == "$wrapper_identity" ]]
[[ $(cat "$STATE/postgres-pool-bootstrap.sha") == "$TARGET_SHA" ]]
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/backend.sha") == \
  "$backend_identity" ]]
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/control.sha") == \
  "$control_identity" ]]
diff -r "$FIXTURE/runtime.before" "$RUNTIME" >/dev/null

echo 'Atomic PostgreSQL pool bootstrap tests passed'
