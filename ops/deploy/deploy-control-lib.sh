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

initialize_deploy_control_bridge() {
  local entrypoint=$REPO/ops/deploy/social-monitor-production-deploy.sh
  local deploy_library=$REPO/ops/deploy/deploy-control-lib.sh
  local postgres_library=$REPO/ops/deploy/postgres-runtime-deploy-lib.sh

  [[ -f $entrypoint && -f $deploy_library && -f $postgres_library ]] || \
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
}

verify_deploy_control_bridge_compatibility() {
  local entrypoint=$REPO/ops/deploy/social-monitor-production-deploy.sh
  local deploy_library=$REPO/ops/deploy/deploy-control-lib.sh
  local postgres_library=$REPO/ops/deploy/postgres-runtime-deploy-lib.sh

  [[ -n ${DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_LIBRARY_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_DIGEST:-} ]] || \
    fail 'deploy control bridge was not initialized before integration advance'
  [[ -f $entrypoint && -f $deploy_library && -f $postgres_library ]] || \
    fail 'target integration is missing deploy control bridge sources'
  [[ $(deploy_control_file_digest "$entrypoint") == \
     "$DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_DIGEST" && \
     $(deploy_control_file_digest "$deploy_library") == \
     "$DEPLOY_CONTROL_BRIDGE_LIBRARY_DIGEST" && \
     $(deploy_control_file_digest "$postgres_library") == \
     "$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_DIGEST" ]] || \
    fail 'deploy control changed with runtime assets; deploy the bridge release first'
}

verify_deploy_control_bridge_target_compatibility() {
  local sha=$1
  local entrypoint_path=ops/deploy/social-monitor-production-deploy.sh
  local deploy_library_path=ops/deploy/deploy-control-lib.sh
  local postgres_library_path=ops/deploy/postgres-runtime-deploy-lib.sh
  local entrypoint_digest deploy_library_digest postgres_library_digest

  [[ -n ${DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_LIBRARY_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_DIGEST:-} ]] || \
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
  [[ $entrypoint_digest == "$DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_DIGEST" && \
     $deploy_library_digest == "$DEPLOY_CONTROL_BRIDGE_LIBRARY_DIGEST" && \
     $postgres_library_digest == \
       "$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_DIGEST" ]] || \
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

  local current
  current=$(git -C "$REPO" rev-parse HEAD)
  if [[ $sha != "$current" ]] && \
     git -C "$REPO" merge-base --is-ancestor "$sha" "$current"; then
    printf 'already-deployed-or-newer=%s\n' "$current"
    return 0
  fi

  local frontend=false backend=false control=false runtime_control=false
  component_changed frontend "$sha" "${FRONTEND_PATHS[@]}" && frontend=true
  component_changed backend "$sha" "${BACKEND_PATHS[@]}" && backend=true
  component_changed control "$sha" "${CONTROL_PATHS[@]}" && control=true
  component_changed control "$sha" "${RUNTIME_CONTROL_PATHS[@]}" && \
    runtime_control=true
  if [[ $runtime_control == true ]]; then
    verify_deploy_control_bridge_target_compatibility "$sha"
  fi
  advance_integration "$sha"
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
