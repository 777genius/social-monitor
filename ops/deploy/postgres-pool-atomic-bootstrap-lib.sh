#!/usr/bin/env bash

# Loaded from the requested commit only after deploy-control-lib.sh validates
# the target blob. This is a one-time repair for the exact legacy state left
# after the PostgreSQL pool adoption and merged PR #67.

POSTGRES_POOL_ADOPTION_BACKEND_SHA=4f47fac7faed7dc24110f4a43e88820d776b8a40
POSTGRES_POOL_ATOMIC_ZERO_SHA=0000000000000000000000000000000000000000

postgres_pool_atomic_repair_paths() {
  cat <<'EOF'
.github/workflows/production-deploy.yml
libs/platform/persistence/src/postgres-runtime-pool-review.spec.ts
ops/deploy/README.md
ops/deploy/deploy-control-lib.sh
ops/deploy/deploy-control-lib.test.sh
ops/deploy/github-production-deploy-client.sh
ops/deploy/github-production-deploy-client.test.sh
ops/deploy/postgres-pool-atomic-bootstrap-lib.sh
ops/deploy/postgres-pool-atomic-bootstrap-lib.test.sh
ops/deploy/postgres-pool-bootstrap-transition.test.sh
ops/deploy/postgres-pool-release-contract.json
ops/deploy/social-monitor-production-deploy.sh
ops/deploy/social-monitor-production-deploy.test.sh
ops/deploy/social-monitor-production-ssh-wrapper.sh
ops/deploy/social-monitor-production-ssh-wrapper.test.sh
ops/deploy/verify-postgres-pool-release-contract.py
ops/deploy/verify-postgres-pool-release-contract.test.sh
EOF
}

postgres_pool_atomic_adoption_backend() {
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
        -n ${POSTGRES_POOL_ADOPTION_BACKEND_OVERRIDE:-} ]]; then
    printf '%s\n' "$POSTGRES_POOL_ADOPTION_BACKEND_OVERRIDE"
  else
    printf '%s\n' "$POSTGRES_POOL_ADOPTION_BACKEND_SHA"
  fi
}

postgres_pool_atomic_file_mode() {
  local sha=$1
  local relative_path=$2
  local tree_entry mode type object tree_path extra

  tree_entry=$(git -C "$REPO" ls-tree "$sha" -- "$relative_path") || \
    fail "atomic PostgreSQL bootstrap target cannot be inspected: $relative_path"
  read -r mode type object tree_path extra <<< "$tree_entry"
  [[ -z ${extra:-} && ($mode == 100644 || $mode == 100755) && \
     $type == blob && $object =~ ^[0-9a-f]+$ && \
     $tree_path == "$relative_path" ]] || \
    fail "atomic PostgreSQL bootstrap target is not a regular blob: $relative_path"
  printf '%s\n' "$mode"
}

postgres_pool_atomic_verify_target() {
  local sha=$1 adoption_backend=$2
  verify_postgres_pool_atomic_repair_target "$sha" "$adoption_backend" || \
    fail 'atomic PostgreSQL bootstrap target violates the exact repair contract'
}

postgres_pool_atomic_plan_value() {
  local plan=$1
  local expected_key=$2
  local key value extra
  local found=false

  while IFS='=' read -r key value extra; do
    [[ -n $key && -n $value && -z ${extra:-} ]] || \
      fail 'ordinary deploy plan is malformed during atomic bootstrap'
    if [[ $key == "$expected_key" ]]; then
      [[ $found == false ]] || \
        fail "ordinary deploy plan repeats $expected_key"
      printf '%s\n' "$value"
      found=true
    fi
  done <<< "$plan"
  [[ $found == true ]] || \
    fail "ordinary deploy plan is missing $expected_key"
}

postgres_pool_atomic_capture_ordinary_plan() {
  local sha=$1
  local expected_bootstrap=$2
  local expected_bootstrap_sha=$3
  local expected_backend=$4
  local adoption_backend=$5
  local plan backend backend_base bootstrap bootstrap_sha

  plan=$(print_plan "$sha") || \
    fail 'ordinary deploy plan could not be captured during atomic bootstrap'
  backend=$(postgres_pool_atomic_plan_value "$plan" backend)
  backend_base=$(postgres_pool_atomic_plan_value "$plan" backend_base)
  bootstrap=$(postgres_pool_atomic_plan_value "$plan" postgres_pool_bootstrap)
  bootstrap_sha=$(
    postgres_pool_atomic_plan_value "$plan" postgres_pool_bootstrap_sha
  )
  [[ $backend == "$expected_backend" ]] || \
    fail 'ordinary deploy plan does not have the backend pending'
  [[ $backend_base == "$adoption_backend" ]] || \
    fail 'ordinary deploy plan durable backend base is not the adoption backend'
  [[ $bootstrap == "$expected_bootstrap" && \
     $bootstrap_sha == "$expected_bootstrap_sha" ]] || \
    fail 'ordinary deploy plan bootstrap state does not match the atomic transition'
}

postgres_pool_atomic_install() {
  local mode=$1
  local source=$2
  local destination=$3

  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
    install -m "$mode" "$source" "$destination"
  else
    install -m "$mode" -o root -g root "$source" "$destination"
  fi
}

postgres_pool_atomic_stage_target_file() {
  local sha=$1
  local relative_path=$2
  local destination=$3
  local mode git_mode object

  git_mode=$(postgres_pool_atomic_file_mode "$sha" "$relative_path")
  case $git_mode in
    100644) mode=0644 ;;
    100755) mode=0755 ;;
    *) fail "atomic PostgreSQL bootstrap target mode is invalid: $relative_path" ;;
  esac
  object=$(git -C "$REPO" rev-parse "$sha:$relative_path") || \
    fail "atomic PostgreSQL bootstrap target object is unavailable: $relative_path"
  git -C "$REPO" cat-file blob "$object" > "$destination" || \
    fail "atomic PostgreSQL bootstrap target cannot be staged: $relative_path"
  chmod "$mode" "$destination" || \
    fail "atomic PostgreSQL bootstrap staged mode cannot be set: $relative_path"
  verify_postgres_pool_bootstrap_recovery_file \
    "$sha" "$relative_path" "$destination" \
    "atomic PostgreSQL bootstrap staged $relative_path"
}

postgres_pool_atomic_owner_group() {
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
    printf '%s:%s\n' "$(id -u)" "$(id -g)"
  else
    printf '0:0\n'
  fi
}

postgres_pool_atomic_verify_installed() {
  local sha=$1
  local owner_group destination relative_path

  owner_group=$(postgres_pool_atomic_owner_group)
  while IFS='|' read -r relative_path destination; do
    [[ -f $destination && ! -L $destination ]] || \
      fail "atomic PostgreSQL bootstrap installed control is invalid: $relative_path"
    [[ $(stat -c '%u:%g:%a' "$destination") == "$owner_group:755" ]] || \
      fail "atomic PostgreSQL bootstrap installed mode is invalid: $relative_path"
    verify_postgres_pool_bootstrap_recovery_file \
      "$sha" "$relative_path" "$destination" \
      "atomic PostgreSQL bootstrap installed $relative_path"
  done <<EOF
ops/deploy/social-monitor-production-deploy.sh|$CONTROL/github-production-deploy.sh
ops/deploy/social-monitor-production-ssh-wrapper.sh|$CONTROL/github-production-deploy-wrapper.sh
EOF
}

postgres_pool_atomic_clear_stage() {
  local stage=$1

  rm -f -- \
    "$stage/entrypoint.before" "$stage/entrypoint.reviewed" \
    "$stage/wrapper.before" "$stage/wrapper.reviewed"
  rmdir -- "$stage"
}

postgres_pool_atomic_test_hook() {
  local phase=$1
  [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]] || return 0
  [[ ${POSTGRES_POOL_ATOMIC_TEST_PHASE:-} != "$phase" ]] || \
    fail "injected atomic PostgreSQL bootstrap failure: $phase"
}

postgres_pool_atomic_transaction() (
  set -Eeuo pipefail
  local sha=$1
  local backend_identity=$2
  local control_identity=$3
  local adoption_backend=$4
  local entrypoint=$CONTROL/github-production-deploy.sh
  local wrapper=$CONTROL/github-production-deploy-wrapper.sh
  local marker=$STATE/postgres-pool-bootstrap.sha
  local stage=$STATE/.postgres-pool-atomic-bootstrap-$sha
  local stage_created=false
  local mutation_started=false
  local committed=false

  rollback_postgres_pool_atomic_transaction() {
    local rollback_status=0
    set +e
    rm -f -- "$marker.next"
    if [[ $mutation_started == true ]]; then
      rm -f -- "$marker"
      postgres_pool_atomic_install \
        0755 "$stage/entrypoint.before" "$entrypoint.rollback" &&
        cmp -s "$stage/entrypoint.before" "$entrypoint.rollback" &&
        mv -f -- "$entrypoint.rollback" "$entrypoint" || rollback_status=1
      postgres_pool_atomic_install \
        0755 "$stage/wrapper.before" "$wrapper.rollback" &&
        cmp -s "$stage/wrapper.before" "$wrapper.rollback" &&
        mv -f -- "$wrapper.rollback" "$wrapper" || rollback_status=1
    fi
    rm -f -- \
      "$entrypoint.next" "$entrypoint.rollback" \
      "$wrapper.next" "$wrapper.rollback"
    if ((rollback_status == 0)) && [[ $stage_created == true ]]; then
      postgres_pool_atomic_clear_stage "$stage" || rollback_status=1
    fi
    ((rollback_status == 0)) || \
      printf 'deploy-error: atomic PostgreSQL bootstrap rollback failed\n' >&2
    return "$rollback_status"
  }

  finish_postgres_pool_atomic_transaction() {
    local status=$?
    trap - EXIT HUP INT TERM
    if [[ $committed == true ]]; then
      postgres_pool_atomic_clear_stage "$stage" || status=1
    else
      rollback_postgres_pool_atomic_transaction || status=1
    fi
    exit "$status"
  }

  trap finish_postgres_pool_atomic_transaction EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM

  [[ ! -e $stage && ! -L $stage ]] || \
    fail 'atomic PostgreSQL bootstrap staging path already exists'
  install -d -m 0700 "$stage"
  stage_created=true
  postgres_pool_atomic_install 0755 "$entrypoint" "$stage/entrypoint.before"
  postgres_pool_atomic_install 0755 "$wrapper" "$stage/wrapper.before"
  postgres_pool_atomic_stage_target_file \
    "$sha" ops/deploy/social-monitor-production-deploy.sh \
    "$stage/entrypoint.reviewed"
  postgres_pool_atomic_stage_target_file \
    "$sha" ops/deploy/social-monitor-production-ssh-wrapper.sh \
    "$stage/wrapper.reviewed"

  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
        ${POSTGRES_POOL_ATOMIC_TEST_PHASE:-} == symlink-reviewed ]]; then
    rm -f "$stage/wrapper.reviewed"
    ln -s "$stage/entrypoint.reviewed" "$stage/wrapper.reviewed"
  elif [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
          ${POSTGRES_POOL_ATOMIC_TEST_PHASE:-} == digest-reviewed ]]; then
    printf 'tampered\n' >> "$stage/wrapper.reviewed"
  fi
  verify_postgres_pool_bootstrap_recovery_file \
    "$sha" ops/deploy/social-monitor-production-deploy.sh \
    "$stage/entrypoint.reviewed" 'atomic PostgreSQL bootstrap reviewed entrypoint'
  verify_postgres_pool_bootstrap_recovery_file \
    "$sha" ops/deploy/social-monitor-production-ssh-wrapper.sh \
    "$stage/wrapper.reviewed" 'atomic PostgreSQL bootstrap reviewed wrapper'

  [[ ! -e $marker && ! -L $marker ]] || \
    fail 'PostgreSQL bootstrap marker appeared during atomic staging'
  mutation_started=true
  postgres_pool_atomic_install \
    0755 "$stage/entrypoint.reviewed" "$entrypoint.next"
  verify_postgres_pool_bootstrap_recovery_file \
    "$sha" ops/deploy/social-monitor-production-deploy.sh "$entrypoint.next" \
    'atomic PostgreSQL bootstrap next entrypoint'
  mv -f -- "$entrypoint.next" "$entrypoint"
  postgres_pool_atomic_test_hook after-entrypoint

  postgres_pool_atomic_install 0755 "$stage/wrapper.reviewed" "$wrapper.next"
  verify_postgres_pool_bootstrap_recovery_file \
    "$sha" ops/deploy/social-monitor-production-ssh-wrapper.sh "$wrapper.next" \
    'atomic PostgreSQL bootstrap next wrapper'
  mv -f -- "$wrapper.next" "$wrapper"
  postgres_pool_atomic_verify_installed "$sha"
  postgres_pool_atomic_test_hook after-control

  [[ $(postgres_pool_bootstrap_recovery_file_identity "$STATE/backend.sha") == \
     "$backend_identity" ]] || \
    fail 'durable backend marker changed during atomic PostgreSQL bootstrap'
  [[ $(postgres_pool_bootstrap_recovery_file_identity "$STATE/control.sha") == \
     "$control_identity" ]] || \
    fail 'durable control marker changed during atomic PostgreSQL bootstrap'
  printf '%s\n' "$sha" > "$marker.next"
  [[ -f $marker.next && ! -L $marker.next && \
     $(wc -c < "$marker.next") == 41 ]] || \
    fail 'atomic PostgreSQL bootstrap next marker is invalid'
  mv -f -- "$marker.next" "$marker"
  postgres_pool_atomic_test_hook after-marker

  [[ $(read_postgres_pool_bootstrap_recovery_marker \
    "$marker" 'PostgreSQL bootstrap') == "$sha" ]] || \
    fail 'atomic PostgreSQL bootstrap marker does not bind the target'
  postgres_pool_atomic_verify_installed "$sha"
  [[ $(postgres_pool_bootstrap_recovery_file_identity "$STATE/backend.sha") == \
     "$backend_identity" ]] || \
    fail 'durable backend marker changed while committing atomic bootstrap'
  [[ $(postgres_pool_bootstrap_recovery_file_identity "$STATE/control.sha") == \
     "$control_identity" ]] || \
    fail 'durable control marker changed while committing atomic bootstrap'
  postgres_pool_atomic_capture_ordinary_plan \
    "$sha" postgres-pool-v1 "$sha" true "$adoption_backend"
  # The caller must recapture the ordinary plan; stdout is never a repair
  # attestation and deliberately remains empty on commit.
  committed=true
)

postgres_pool_atomic_control_bootstrap() {
  local sha=$1
  local adoption_backend backend_sha marker_sha
  local backend_identity control_identity
  local marker=$STATE/postgres-pool-bootstrap.sha
  local stage=$STATE/.postgres-pool-atomic-bootstrap-$sha

  exec 9>"$DEPLOY_LOCK"
  flock -w 3600 9 || fail 'timed out waiting for deployment lock'
  exec 8>"$POSTGRES_ADMISSION_LOCK"
  acquire_postgres_admission_with_daily_priority 8
  fetch_main
  validate_main_commit "$sha"

  adoption_backend=$(postgres_pool_atomic_adoption_backend)
  postgres_pool_atomic_verify_target "$sha" "$adoption_backend"
  backend_sha=$(
    read_postgres_pool_bootstrap_recovery_marker "$STATE/backend.sha" backend
  )
  [[ $backend_sha == "$adoption_backend" ]] || \
    fail 'durable backend marker is not the exact adoption backend'
  git -C "$REPO" merge-base --is-ancestor "$backend_sha" "$sha" || \
    fail 'durable adoption backend is not an ancestor of the target'
  backend_identity=$(
    postgres_pool_bootstrap_recovery_file_identity "$STATE/backend.sha"
  ) || fail 'durable backend marker identity cannot be inventoried'
  control_identity=$(
    postgres_pool_bootstrap_recovery_file_identity "$STATE/control.sha"
  ) || fail 'durable control marker identity cannot be inventoried'
  [[ ! -e $stage && ! -L $stage ]] || \
    fail 'atomic PostgreSQL bootstrap has partial staging'
  for marker_sha in \
    "$CONTROL/github-production-deploy.sh.next" \
    "$CONTROL/github-production-deploy.sh.rollback" \
    "$CONTROL/github-production-deploy-wrapper.sh.next" \
    "$CONTROL/github-production-deploy-wrapper.sh.rollback" \
    "$marker.next"; do
    [[ ! -e $marker_sha && ! -L $marker_sha ]] || \
      fail 'atomic PostgreSQL bootstrap has a partial control or marker file'
  done

  [[ ! -e $marker && ! -L $marker ]] || \
    fail 'PostgreSQL bootstrap marker must be absent for atomic repair'

  [[ -f $CONTROL/github-production-deploy.sh && \
     ! -L $CONTROL/github-production-deploy.sh ]] || \
    fail 'installed entrypoint is not a regular non-symlink file'
  [[ -f $CONTROL/github-production-deploy-wrapper.sh && \
     ! -L $CONTROL/github-production-deploy-wrapper.sh ]] || \
    fail 'installed wrapper is not a regular non-symlink file'
  postgres_pool_atomic_capture_ordinary_plan \
    "$sha" uninstalled "$POSTGRES_POOL_ATOMIC_ZERO_SHA" true "$adoption_backend"
  postgres_pool_atomic_transaction \
    "$sha" "$backend_identity" "$control_identity" "$adoption_backend" || \
    fail 'atomic PostgreSQL bootstrap failed and was rolled back'
}
