#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh after project paths, lock
# paths, and fail() are defined. The entrypoint deliberately sources this file
# before advancing integration so a reviewed bridge release controls the next
# runtime-control activation.

POSTGRES_ADMISSION_MAX_ATTEMPTS=3601
POSTGRES_ADMISSION_RETRY_SLICE_SECONDS=1

deploy_control_file_digest() {
  local path=$1
  sha256sum "$path" | awk '{print $1}'
}

deploy_control_git_blob_digest() {
  local sha=$1
  local path=$2
  git -C "$REPO" show "$sha:$path" | sha256sum | awk '{print $1}'
}

load_target_reader_summary_publication_deploy_library() {
  local sha=$1
  local relative_path=ops/deploy/reader-summary-publication-deploy-lib.sh
  local publication_library=$REPO/$relative_path
  local repository_root publication_real mode reviewed_digest actual_digest
  local target_entry target_mode target_type target_object target_path

  repository_root=$(readlink -f "$REPO") || \
    fail 'integration repository path cannot be resolved'
  [[ -f $publication_library && ! -L $publication_library ]] || \
    fail 'target publication deploy library is not a regular non-symlink file'
  publication_real=$(readlink -f "$publication_library") || \
    fail 'target publication deploy library path cannot be resolved'
  [[ $publication_real == "$repository_root/"* ]] || \
    fail 'target publication deploy library is outside integration'
  [[ -r $publication_real ]] || \
    fail 'target publication deploy library is unreadable'
  mode=$(stat -c '%A' "$publication_real") || \
    fail 'target publication deploy library mode cannot be read'
  [[ ${mode:1:1} == r || ${mode:4:1} == r || ${mode:7:1} == r ]] || \
    fail 'target publication deploy library is unreadable'
  target_entry=$(git -C "$REPO" ls-tree "$sha" -- "$relative_path") || \
    fail 'target commit publication deploy library cannot be inspected'
  read -r target_mode target_type target_object target_path <<< "$target_entry"
  [[ ($target_mode == 100644 || $target_mode == 100755) && \
     $target_type == blob && $target_object =~ ^[0-9a-f]+$ && \
     $target_path == "$relative_path" ]] || \
    fail 'target commit publication deploy library is not a regular blob'
  reviewed_digest=$(
    deploy_control_git_blob_digest "$sha" "$relative_path"
  ) || fail 'target commit is missing the publication deploy library'
  actual_digest=$(deploy_control_file_digest "$publication_real") || \
    fail 'target publication deploy library digest cannot be read'
  [[ $actual_digest == "$reviewed_digest" ]] || \
    fail 'target publication deploy library differs from reviewed target'

  ! declare -F deploy_reader_summary_publication_migrations >/dev/null || \
    fail 'publication migration entrypoint was loaded before target validation'

  # The bridge release deliberately lacks this target-only source file.
  # shellcheck source=/dev/null
  source "$publication_real" || \
    fail 'target publication deploy library could not be loaded'
  declare -F deploy_reader_summary_publication_migrations >/dev/null || \
    fail 'target publication deploy library is missing its migration entrypoint'
}

initialize_deploy_control_bridge() {
  local entrypoint=$REPO/ops/deploy/social-monitor-production-deploy.sh
  local deploy_library=$REPO/ops/deploy/deploy-control-lib.sh
  local postgres_library=$REPO/ops/deploy/postgres-runtime-deploy-lib.sh
  local image_rescue_library=$REPO/ops/deploy/backend-image-rescue-lib.sh
  local x_image_library=$REPO/ops/deploy/x-collector-image-deploy-lib.sh

  [[ -f $entrypoint && -f $deploy_library && -f $postgres_library && \
     -f $image_rescue_library && -f $x_image_library ]] || \
    fail 'current integration is missing deploy control bridge sources'
  DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_DIGEST=$(
    deploy_control_file_digest "$entrypoint"
  )
  DEPLOY_CONTROL_BRIDGE_LIBRARY_DIGEST=$(
    deploy_control_file_digest "$deploy_library"
  )
  DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_DIGEST=$(
    deploy_control_file_digest "$postgres_library"
  )
  DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_DIGEST=$(
    deploy_control_file_digest "$image_rescue_library"
  )
  DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_DIGEST=$(
    deploy_control_file_digest "$x_image_library"
  )
}

verify_deploy_control_bridge_compatibility() {
  local entrypoint=$REPO/ops/deploy/social-monitor-production-deploy.sh
  local deploy_library=$REPO/ops/deploy/deploy-control-lib.sh
  local postgres_library=$REPO/ops/deploy/postgres-runtime-deploy-lib.sh
  local image_rescue_library=$REPO/ops/deploy/backend-image-rescue-lib.sh
  local x_image_library=$REPO/ops/deploy/x-collector-image-deploy-lib.sh

  [[ -n ${DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_LIBRARY_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_DIGEST:-} ]] || \
    fail 'deploy control bridge was not initialized before integration advance'
  [[ -f $entrypoint && -f $deploy_library && -f $postgres_library && \
     -f $image_rescue_library && -f $x_image_library ]] || \
    fail 'target integration is missing deploy control bridge sources'
  [[ $(deploy_control_file_digest "$entrypoint") == \
     "$DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_DIGEST" && \
     $(deploy_control_file_digest "$deploy_library") == \
     "$DEPLOY_CONTROL_BRIDGE_LIBRARY_DIGEST" && \
     $(deploy_control_file_digest "$postgres_library") == \
       "$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_DIGEST" && \
     $(deploy_control_file_digest "$image_rescue_library") == \
       "$DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_DIGEST" && \
     $(deploy_control_file_digest "$x_image_library") == \
       "$DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_DIGEST" ]] || \
    fail 'deploy control changed with runtime assets; deploy the bridge release first'
}

verify_deploy_control_bridge_target_compatibility() {
  local sha=$1
  local entrypoint_path=ops/deploy/social-monitor-production-deploy.sh
  local deploy_library_path=ops/deploy/deploy-control-lib.sh
  local postgres_library_path=ops/deploy/postgres-runtime-deploy-lib.sh
  local image_rescue_library_path=ops/deploy/backend-image-rescue-lib.sh
  local x_image_library_path=ops/deploy/x-collector-image-deploy-lib.sh
  local entrypoint_digest deploy_library_digest postgres_library_digest
  local image_rescue_library_digest x_image_library_digest

  [[ -n ${DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_LIBRARY_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_DIGEST:-} ]] || \
    fail 'deploy control bridge was not initialized before target verification'
  entrypoint_digest=$(
    deploy_control_git_blob_digest "$sha" "$entrypoint_path"
  ) || fail 'target integration is missing the deploy entrypoint bridge'
  deploy_library_digest=$(
    deploy_control_git_blob_digest "$sha" "$deploy_library_path"
  ) || fail 'target integration is missing the deploy control bridge library'
  postgres_library_digest=$(
    deploy_control_git_blob_digest "$sha" "$postgres_library_path"
  ) || fail 'target integration is missing the PostgreSQL control bridge library'
  image_rescue_library_digest=$(
    deploy_control_git_blob_digest "$sha" "$image_rescue_library_path"
  ) || fail 'target integration is missing the backend image rescue bridge library'
  x_image_library_digest=$(
    deploy_control_git_blob_digest "$sha" "$x_image_library_path"
  ) || fail 'target integration is missing the X image provenance bridge library'
  [[ $entrypoint_digest == "$DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_DIGEST" && \
     $deploy_library_digest == "$DEPLOY_CONTROL_BRIDGE_LIBRARY_DIGEST" && \
     $postgres_library_digest == \
       "$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_DIGEST" && \
     $image_rescue_library_digest == \
       "$DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_DIGEST" && \
     $x_image_library_digest == \
       "$DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_DIGEST" ]] || \
    fail 'deploy control changed with runtime assets; deploy the bridge release first'
}

probe_daily_singleton_clear() {
  local singleton_fd
  exec {singleton_fd}>"$DAILY_SINGLETON_LOCK" || \
    fail 'cannot open the daily singleton lock'
  if ! flock -n "$singleton_fd"; then
    exec {singleton_fd}>&-
    return 1
  fi
  flock -u "$singleton_fd" || fail 'cannot release the daily singleton probe'
  exec {singleton_fd}>&-
}

# Focused tests override this no-op at the exact probe-release -> admission
# attempt boundary. Production never supplies an executable hook through the
# environment.
postgres_admission_after_singleton_probe() {
  :
}

acquire_postgres_admission_with_daily_priority() {
  local admission_fd=$1
  local attempt

  [[ $POSTGRES_ADMISSION_MAX_ATTEMPTS =~ ^[1-9][0-9]*$ ]] || \
    fail 'PostgreSQL admission attempt bound is invalid'
  [[ $POSTGRES_ADMISSION_RETRY_SLICE_SECONDS =~ \
     ^([0-9]+([.][0-9]+)?|[.][0-9]+)$ ]] || \
    fail 'PostgreSQL admission retry slice is invalid'

  for ((attempt = 1; attempt <= POSTGRES_ADMISSION_MAX_ATTEMPTS; attempt += 1)); do
    probe_daily_singleton_clear || \
      fail 'daily run has PostgreSQL admission priority; retry deploy later'
    postgres_admission_after_singleton_probe "$attempt"
    if flock -n "$admission_fd"; then
      if ! probe_daily_singleton_clear; then
        flock -u "$admission_fd" || \
          fail 'cannot release PostgreSQL admission after daily priority appeared'
        fail 'daily run claimed priority while deploy acquired PostgreSQL admission'
      fi
      return 0
    fi
    if ((attempt == POSTGRES_ADMISSION_MAX_ATTEMPTS)); then
      fail 'timed out waiting for PostgreSQL admission lock'
    fi
    sleep "$POSTGRES_ADMISSION_RETRY_SLICE_SECONDS"
  done
}

reconcile_github_premidnight_capture_runtime_control() {
  local runtime_control=$1
  local mutation_scope
  local source_marker=$REPO/ops/deploy/production-runtime/github-premidnight-capture-v1.activation
  local current_marker=$POSTGRES_RUNTIME_CURRENT/github-premidnight-capture-v1.activation

  [[ $runtime_control =~ ^(true|false)$ ]] || {
    fail 'runtime-control deployment classification is invalid'
    return 1
  }
  if ! declare -F postgres_runtime_control_mutation_scope >/dev/null; then
    if [[ ! -e $source_marker && ! -L $source_marker && \
          ! -e $current_marker && ! -L $current_marker ]]; then
      printf '%s\n' "$runtime_control"
      return
    fi
    fail 'PostgreSQL runtime-control mutation classifier is unavailable'
    return 1
  fi
  mutation_scope=$(postgres_runtime_control_mutation_scope) || return
  case $mutation_scope in
    capture-only) runtime_control=true ;;
    base|full) ;;
    *)
      fail 'PostgreSQL runtime-control mutation scope is invalid'
      return 1
      ;;
  esac
  printf '%s\n' "$runtime_control"
}

reconcile_current_postgres_pool_bootstrap() {
  local expected_current=$1
  local marker=$STATE/postgres-pool-bootstrap.sha
  # CONTROL is provided by the production deploy entrypoint that sources this file.
  # shellcheck disable=SC2153
  local installed=$CONTROL/github-production-deploy.sh
  local current worktree_status

  current=$(git -C "$REPO" rev-parse HEAD) || \
    fail 'current integration commit cannot be inventoried'
  [[ $current == "$expected_current" ]] || \
    fail 'current integration changed during PostgreSQL bootstrap recovery'
  validate_main_commit "$current"
  worktree_status=$(git -C "$REPO" status --porcelain) || \
    fail 'integration worktree cannot be inventoried for PostgreSQL bootstrap recovery'
  [[ -z $worktree_status ]] || \
    fail 'integration worktree is dirty during PostgreSQL bootstrap recovery'
  current=$(git -C "$REPO" rev-parse HEAD) || \
    fail 'current integration commit cannot be re-inventoried'
  [[ $current == "$expected_current" ]] || \
    fail 'current integration changed during PostgreSQL bootstrap validation'

  postgres_pool_bootstrap_installed "$current" && return 0
  [[ ! -e $marker && ! -L $marker ]] || \
    fail 'existing PostgreSQL bootstrap marker is invalid for current integration'
  [[ -f $installed && ! -L $installed ]] || \
    fail 'installed deploy entrypoint is unavailable for PostgreSQL bootstrap recovery'
  cmp -s "$installed" \
    "$REPO/ops/deploy/social-monitor-production-deploy.sh" || \
    fail 'installed deploy entrypoint differs from current integration'
  [[ -f $REPO/ops/deploy/postgres-runtime-deploy-lib.sh && \
     -f $REPO/ops/deploy/verify-postgres-runtime-topology.py && \
     -f $REPO/ops/deploy/production-runtime/compose.postgres-runtime.yml ]] || \
    fail 'current integration is incomplete for PostgreSQL bootstrap recovery'

  commit_postgres_pool_bootstrap "$current" || \
    fail 'PostgreSQL bootstrap recovery could not commit current integration'
  [[ $(git -C "$REPO" rev-parse HEAD) == "$current" ]] || \
    fail 'current integration changed during PostgreSQL bootstrap commit'
  postgres_pool_bootstrap_installed "$current" || \
    fail 'PostgreSQL bootstrap recovery did not install current integration'
}

deploy_frontend() {
  local sha=$1
  local staged=$STAGING/$sha/frontend
  local release=$RELEASES/$sha
  local upload_lock=$STAGING/$sha/upload.lock
  local previous_public previous_admin
  previous_public=$(readlink -f "$PUBLIC_LINK" || true)
  previous_admin=$(readlink -f "$ADMIN_LINK" || true)
  [[ -n $previous_public && -n $previous_admin ]] || \
    fail 'frontend rollback links are not initialized'
  exec 7>"$upload_lock"
  flock -w 600 7 || fail 'timed out waiting for frontend upload lock'
  install -d -m 0755 "$RELEASES"
  if [[ -f $release/READY ]] && [[ $(cat "$release/READY") == "$sha" ]]; then
    :
  else
    [[ ! -e $release ]] || \
      fail 'immutable frontend release exists without a valid marker'
    [[ -f $staged/READY ]] || fail 'frontend artifact is not uploaded'
    [[ $(cat "$staged/READY") == "$sha" ]] || \
      fail 'frontend artifact marker mismatch'
    mv "$staged" "$release"
  fi

  switch_link "$PUBLIC_LINK" "$release/public"
  switch_link "$ADMIN_LINK" "$release/admin"
  if ! "${COMPOSE[@]}" --profile app up -d --no-deps \
    --force-recreate frontend; then
    switch_link "$PUBLIC_LINK" "$previous_public"
    switch_link "$ADMIN_LINK" "$previous_admin"
    "${COMPOSE[@]}" --profile app up -d --no-deps --force-recreate frontend
    fail 'frontend recreate failed; previous release restored'
  fi

  local public_code admin_code favicon_code release_sha
  for _ in $(seq 1 20); do
    public_code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
      https://social-monitor.app/ || true)
    admin_code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
      https://admin.social-monitor.app/ || true)
    favicon_code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
      https://social-monitor.app/favicon.svg || true)
    release_sha=$(curl -fsS --max-time 10 \
      "https://social-monitor.app/release-sha.txt?release=$sha" \
      2>/dev/null || true)
    if [[ $public_code == 200 && $admin_code == 401 && \
          $favicon_code == 200 && $release_sha == "$sha" ]]; then
      break
    fi
    sleep 2
  done
  if [[ $public_code != 200 || $admin_code != 401 || \
        $favicon_code != 200 || $release_sha != "$sha" ]]; then
    switch_link "$PUBLIC_LINK" "$previous_public"
    switch_link "$ADMIN_LINK" "$previous_admin"
    "${COMPOSE[@]}" --profile app up -d --no-deps --force-recreate frontend
    fail 'frontend health failed; previous release restored'
  fi
  printf '%s\n' "$sha" > "$STATE/frontend.sha"
}

deploy_release() {
  local sha=$1
  exec 9>"$DEPLOY_LOCK"
  flock -w 3600 9 || fail 'timed out waiting for deployment lock'
  exec 8>"$POSTGRES_ADMISSION_LOCK"
  acquire_postgres_admission_with_daily_priority 8
  fetch_main
  validate_main_commit "$sha"
  install -d -m 0755 "$STATE" "$STAGING" "$RELEASES"
  if declare -F reconcile_completed_backend_image_rescues >/dev/null; then
    reconcile_completed_backend_image_rescues || \
      fail 'completed backend image rescue cleanup could not be reconciled'
  fi

  local current
  current=$(git -C "$REPO" rev-parse HEAD)
  if [[ $sha != "$current" ]] && \
     git -C "$REPO" merge-base --is-ancestor "$sha" "$current"; then
    reconcile_current_postgres_pool_bootstrap "$current"
    printf 'already-deployed-or-newer=%s\n' "$current"
    return 0
  fi

  local frontend=false backend=false control=false runtime_control=false
  local x_image_provenance_release=false
  component_changed frontend "$sha" "${FRONTEND_PATHS[@]}" && frontend=true
  component_changed backend "$sha" "${BACKEND_PATHS[@]}" && backend=true
  component_changed control "$sha" "${CONTROL_PATHS[@]}" && control=true
  component_changed control "$sha" "${RUNTIME_CONTROL_PATHS[@]}" && \
    runtime_control=true
  runtime_control=$(
    reconcile_github_premidnight_capture_runtime_control "$runtime_control"
  ) || fail 'GitHub pre-midnight runtime-control reconciliation failed'
  component_changed backend "$sha" \
    ops/deploy/production-runtime/x-collector.Dockerfile && \
    x_image_provenance_release=true
  if [[ $runtime_control == true || $x_image_provenance_release == true ]]; then
    verify_deploy_control_bridge_target_compatibility "$sha"
  fi
  advance_integration "$sha"
  if [[ $backend == true ]]; then
    load_target_reader_summary_publication_deploy_library "$sha"
  fi
  sync_control_script "$sha"
  deploy_release_runtime_transaction "$sha" "$backend" "$runtime_control"
  [[ $frontend == false ]] || deploy_frontend "$sha"
  commit_postgres_pool_bootstrap "$sha"
  if [[ $control == true ]]; then
    printf '%s\n' "$sha" > "$STATE/control.sha.next"
    mv -f "$STATE/control.sha.next" "$STATE/control.sha"
  fi
  printf 'deployed=%s frontend=%s backend=%s control=%s\n' \
    "$sha" "$frontend" "$backend" "$control"
}
