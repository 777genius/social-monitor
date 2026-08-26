# shellcheck shell=bash
# shellcheck disable=SC2154 # target_sha is owned by the sourcing parent fixture.
# Sourced by the focused parent contract test; keep scenario state in one shell.
# The exact legacy marker state is target-independent. Once detected, every
# invalid repair must stop in the atomic loader without entering ordinary
# deployment or changing any integration/backend/runtime host surface.
atomic_route_root=$FIXTURE/atomic-route-host
atomic_route_log=$FIXTURE/atomic-route.log
atomic_route_surfaces=(
  "$REPO/atomic-route-integration.state"
  "$atomic_route_root/backend.state"
  "$atomic_route_root/runtime.state"
  "$atomic_route_root/service.state"
  "$atomic_route_root/container.state"
  "$atomic_route_root/image.state"
  "$atomic_route_root/process.state"
)
install -d "$atomic_route_root"

atomic_route_surface_state() {
  local surface
  for surface in "${atomic_route_surfaces[@]}" "$STATE/backend.sha"; do
    stat -c '%n|%d:%i:%f:%s:%y:%z' "$surface"
    sha256sum "$surface"
  done
  if [[ -e $STATE/postgres-pool-bootstrap.sha || \
        -L $STATE/postgres-pool-bootstrap.sha ]]; then
    stat -c '%n|%d:%i:%f:%s:%y:%z' "$STATE/postgres-pool-bootstrap.sha"
    sha256sum "$STATE/postgres-pool-bootstrap.sha"
  fi
}

prepare_atomic_route_case() {
  local mode=$1 surface
  rm -f "$STATE/postgres-pool-bootstrap.sha"
  printf '%s\n' "$POSTGRES_POOL_ATOMIC_REPAIR_BACKEND_SHA" \
    > "$STATE/backend.sha"
  for surface in "${atomic_route_surfaces[@]}"; do
    printf 'preserved:%s\n' "$(basename "$surface")" > "$surface"
  done
  case $mode in
    malformed-backend) printf 'malformed\n' > "$STATE/backend.sha" ;;
    malformed-bootstrap)
      printf 'malformed\n' > "$STATE/postgres-pool-bootstrap.sha"
      ;;
  esac
  : > "$atomic_route_log"
}

invoke_invalid_atomic_route() (
  set -Eeuo pipefail
  local mode=$1 surface

  ordinary_deploy_started() {
    printf 'ordinary\n' >> "$atomic_route_log"
    for surface in "${atomic_route_surfaces[@]}" "$STATE/backend.sha"; do
      printf 'mutated-by-ordinary-deploy\n' > "$surface"
    done
    fail 'ordinary deploy was reached for invalid atomic repair'
  }
  fetch_main() { printf 'fetch\n' >> "$atomic_route_log"; }
  validate_main_commit() {
    [[ $1 == "$target_sha" ]]
    git -C "$REPO" cat-file -e "$1^{commit}"
    printf 'validate\n' >> "$atomic_route_log"
  }
  advance_integration() { ordinary_deploy_started; }
  sync_control_script() { ordinary_deploy_started; }
  deploy_release_runtime_transaction() { ordinary_deploy_started; }
  deploy_frontend() { ordinary_deploy_started; }
  commit_postgres_pool_bootstrap() { ordinary_deploy_started; }
  reconcile_current_postgres_pool_bootstrap() { ordinary_deploy_started; }
  reconcile_completed_backend_image_rescues() { ordinary_deploy_started; }
  verify_postgres_pool_atomic_repair_target() {
    case $mode in
      invalid-target) fail 'atomic repair target is invalid' ;;
      invalid-contract) fail 'atomic repair contract is invalid' ;;
      verifier-failure) return 70 ;;
      missing-blob) return 0 ;;
      *) fail 'atomic repair verifier must not run for malformed markers' ;;
    esac
  }
  postgres_pool_bootstrap_recovery_commit_blob() {
    [[ $mode == missing-blob ]] || \
      fail 'atomic repair blob loader reached an unexpected case'
    fail 'atomic PostgreSQL bootstrap library is missing at reviewed commit'
  }
  deploy_release "$target_sha"
)

assert_invalid_atomic_route() {
  local mode=$1 expected=$2 before output status
  prepare_atomic_route_case "$mode"
  before=$(atomic_route_surface_state)
  set +e
  output=$(invoke_invalid_atomic_route "$mode" 2>&1)
  status=$?
  set -e
  ((status != 0))
  grep -F "$expected" <<< "$output" >/dev/null
  [[ $(<"$atomic_route_log") == $'fetch\nvalidate' ]]
  [[ $(atomic_route_surface_state) == "$before" ]]
  [[ ! -e $STATE/.postgres-pool-atomic-bootstrap-loader-$target_sha && \
     ! -L $STATE/.postgres-pool-atomic-bootstrap-loader-$target_sha ]]
}

assert_invalid_atomic_route malformed-backend 'backend marker is malformed'
assert_invalid_atomic_route malformed-bootstrap \
  'PostgreSQL bootstrap marker is malformed'
assert_invalid_atomic_route invalid-target 'atomic repair target is invalid'
assert_invalid_atomic_route invalid-contract 'atomic repair contract is invalid'
assert_invalid_atomic_route missing-blob \
  'atomic PostgreSQL bootstrap library is missing at reviewed commit'
assert_invalid_atomic_route verifier-failure \
  'atomic PostgreSQL bootstrap target validation failed'

rm -f "$STATE/postgres-pool-bootstrap.sha" "$STATE/backend.sha"
if postgres_pool_atomic_legacy_state; then
  fail 'marker-free non-legacy state entered atomic repair'
fi
printf '%s\n' "$target_sha" > "$STATE/backend.sha"
if postgres_pool_atomic_legacy_state; then
  fail 'non-adoption backend entered atomic repair'
fi
printf '%s\n' "$target_sha" > "$STATE/postgres-pool-bootstrap.sha"
printf '%s\n' "$POSTGRES_POOL_ATOMIC_REPAIR_BACKEND_SHA" > "$STATE/backend.sha"
if postgres_pool_atomic_legacy_state; then
  fail 'installed bootstrap state entered atomic repair'
fi
rm -f "$STATE/postgres-pool-bootstrap.sha" "$STATE/backend.sha"
rm -f "${atomic_route_surfaces[@]}"
rmdir "$atomic_route_root"
