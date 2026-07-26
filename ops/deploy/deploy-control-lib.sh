#!/usr/bin/env bash
# Sourced by social-monitor-production-deploy.sh after project paths, lock
# paths, and fail() are defined. The entrypoint deliberately sources this file
# before advancing integration so a reviewed bridge release controls the next
# runtime-control activation.
POSTGRES_ADMISSION_MAX_ATTEMPTS=3601
POSTGRES_ADMISSION_RETRY_SLICE_SECONDS=1
POSTGRES_POOL_ATOMIC_REPAIR_BACKEND_SHA=987ba101d27f1cc3c1308a841f673dda475db933
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

read_postgres_pool_bootstrap_recovery_marker() {
  local marker=$1
  local label=$2
  local marker_size sha identity_before identity_after

  [[ -f $marker && ! -L $marker ]] || \
    fail "$label marker is not a regular non-symlink file"
  identity_before=$(
    postgres_pool_bootstrap_recovery_file_identity "$marker"
  ) || fail "$label marker identity cannot be inventoried"
  marker_size=$(wc -c < "$marker") || \
    fail "$label marker size cannot be inventoried"
  [[ $marker_size == 41 ]] || fail "$label marker is malformed"
  IFS= read -r sha < "$marker" || fail "$label marker cannot be read"
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || fail "$label marker is malformed"
  identity_after=$(
    postgres_pool_bootstrap_recovery_file_identity "$marker"
  ) || fail "$label marker identity cannot be re-inventoried"
  [[ $identity_after == "$identity_before" ]] || \
    fail "$label marker changed while being read"
  printf '%s\n' "$sha"
}

validate_postgres_pool_bootstrap_recovery_marker() {
  local sha=$1
  local current=$2
  local label=$3

  git -C "$REPO" cat-file -e "$sha^{commit}" 2>/dev/null || \
    fail "$label marker commit is unavailable"
  git -C "$REPO" merge-base --is-ancestor "$sha" "$current" || \
    fail "$label marker commit is not an ancestor of current integration"
}

postgres_pool_bootstrap_recovery_file_identity() {
  local marker=$1

  [[ -f $marker && ! -L $marker ]] || return 1
  stat -c '%d:%i:%f:%s:%y:%z' "$marker"
}

verify_postgres_pool_bootstrap_recovery_file() {
  local sha=$1
  local relative_path=$2
  local actual_path=$3
  local label=$4
  local tree_entry mode type object tree_path reviewed_digest actual_digest
  local actual_identity_before actual_identity_after

  [[ -f $actual_path && ! -L $actual_path ]] || \
    fail "$label is not a regular non-symlink file"
  actual_identity_before=$(
    postgres_pool_bootstrap_recovery_file_identity "$actual_path"
  ) || fail "$label identity cannot be inventoried"
  tree_entry=$(git -C "$REPO" ls-tree "$sha" -- "$relative_path") || \
    fail "$label cannot be inspected at reviewed commit"
  read -r mode type object tree_path <<< "$tree_entry"
  [[ ($mode == 100644 || $mode == 100755) && $type == blob && \
     $object =~ ^[0-9a-f]+$ && $tree_path == "$relative_path" ]] || \
    fail "$label is not a regular blob at reviewed commit"
  reviewed_digest=$(
    deploy_control_git_blob_digest "$sha" "$relative_path"
  ) || fail "$label digest cannot be read at reviewed commit"
  actual_digest=$(deploy_control_file_digest "$actual_path") || \
    fail "$label digest cannot be read"
  actual_identity_after=$(
    postgres_pool_bootstrap_recovery_file_identity "$actual_path"
  ) || fail "$label identity cannot be re-inventoried"
  [[ $actual_identity_after == "$actual_identity_before" ]] || \
    fail "$label changed while being verified"
  [[ $actual_digest == "$reviewed_digest" ]] || \
    fail "$label differs from reviewed commit"
}
verify_postgres_pool_atomic_repair_target() {
  python3 "$REPO/ops/deploy/verify-postgres-pool-release-contract.py" atomic-repair --target "$1" --backend-base "$2"
}
postgres_pool_atomic_legacy_state() {
  local marker=$STATE/postgres-pool-bootstrap.sha backend_marker=$STATE/backend.sha
  local backend_sha marker_present=false backend_present=false
  if [[ -e $marker || -L $marker ]]; then
    (read_postgres_pool_bootstrap_recovery_marker \
      "$marker" 'PostgreSQL bootstrap' >/dev/null) || return 2
    marker_present=true
  fi
  if [[ -e $backend_marker || -L $backend_marker ]]; then
    backend_sha=$(read_postgres_pool_bootstrap_recovery_marker \
      "$backend_marker" backend) || return 2
    backend_present=true
  fi
  [[ $marker_present == false && $backend_present == true && \
     $backend_sha == "$POSTGRES_POOL_ATOMIC_REPAIR_BACKEND_SHA" ]]
}
deploy_postgres_pool_atomic_control_bootstrap() (
  set -Eeuo pipefail
  local sha=$1 relative_path=ops/deploy/postgres-pool-atomic-bootstrap-lib.sh
  local loader=$STATE/.postgres-pool-atomic-bootstrap-loader-$sha library object backend_sha
  library=$loader/library.sh
  backend_sha=$(read_postgres_pool_bootstrap_recovery_marker \
    "$STATE/backend.sha" backend)
  verify_postgres_pool_atomic_repair_target "$sha" "$backend_sha" || \
    fail 'atomic PostgreSQL bootstrap target validation failed'
  [[ ! -e $loader && ! -L $loader ]] || \
    fail 'atomic PostgreSQL bootstrap loader staging already exists'
  install -d -m 0700 "$loader"
  trap 'status=$?; trap - EXIT; rm -f -- "$library"; rmdir -- "$loader" || status=1; exit "$status"' EXIT
  object=$(postgres_pool_bootstrap_recovery_commit_blob \
    "$sha" "$relative_path" 'atomic PostgreSQL bootstrap library')
  git -C "$REPO" cat-file blob "$object" > "$library" || \
    fail 'atomic PostgreSQL bootstrap library cannot be staged'
  chmod 0600 "$library"
  verify_postgres_pool_bootstrap_recovery_file \
    "$sha" "$relative_path" "$library" 'atomic PostgreSQL bootstrap library'
  ! declare -F postgres_pool_atomic_control_bootstrap >/dev/null || \
    fail 'atomic PostgreSQL bootstrap entrypoint was preloaded'
  # shellcheck source=ops/deploy/postgres-pool-atomic-bootstrap-lib.sh
  source "$library" || fail 'atomic PostgreSQL bootstrap library could not be loaded'
  declare -F postgres_pool_atomic_control_bootstrap >/dev/null || \
    fail 'atomic PostgreSQL bootstrap library is missing its entrypoint'
  postgres_pool_atomic_control_bootstrap "$sha"
)
postgres_pool_bootstrap_recovery_commit_blob() {
  local sha=$1
  local relative_path=$2
  local label=$3
  local tree_entry mode type object tree_path
  tree_entry=$(git -C "$REPO" ls-tree "$sha" -- "$relative_path") || \
    fail "$label cannot be inspected at reviewed commit"
  read -r mode type object tree_path <<< "$tree_entry"
  [[ ($mode == 100644 || $mode == 100755) && $type == blob && \
     $object =~ ^[0-9a-f]+$ && $tree_path == "$relative_path" ]] || \
    fail "$label is not a regular blob at reviewed commit"
  printf '%s\n' "$object"
}
postgres_pool_bootstrap_recovery_tree_blob() {
  local sha=$1
  local relative_path=$2
  local label=$3
  local tree_entry mode type object tree_path
  tree_entry=$(git -C "$REPO" ls-tree "$sha" -- "$relative_path") || \
    fail "$label cannot be inspected"
  [[ -n $tree_entry ]] || return 0
  read -r mode type object tree_path <<< "$tree_entry"
  [[ $mode =~ ^[0-9]+$ && $object =~ ^[0-9a-f]+$ && \
     $tree_path == "$relative_path" ]] || \
    fail "$label tree entry is malformed"
  if [[ $type == blob ]]; then
    printf '%s\n' "$object"
  fi
}
postgres_pool_bootstrap_recovery_path_matches_roots() {
  local path=$1
  shift
  local root
  for root in "$@"; do
    if [[ $path == "$root" || $path == "$root/"* ]]; then
      return 0
    fi
  done
  return 1
}
postgres_pool_bootstrap_recovery_canonical_tip() {
  local canonical_tip
  canonical_tip=$(
    git -C "$REPO" rev-parse --verify \
      'refs/remotes/origin/main^{commit}'
  ) || fail 'canonical main cannot be inventoried'
  [[ $canonical_tip =~ ^[0-9a-f]{40}$ ]] || \
    fail 'canonical main identity is malformed'
  printf '%s\n' "$canonical_tip"
}
verify_postgres_pool_bootstrap_recovery_canonical_tip() {
  local expected=$1
  local actual
  actual=$(postgres_pool_bootstrap_recovery_canonical_tip)
  [[ $actual == "$expected" ]] || \
    fail 'canonical main changed during partial control reconciliation'
}
find_postgres_pool_bootstrap_installed_control_commit() {
  local backend_sha=$1
  local current=$2
  local installed=$3
  local relative_path=ops/deploy/social-monitor-production-deploy.sh
  local installed_identity installed_blob first_parent_history
  local sha candidate_blob parent parent_blob parent_line
  local reached_backend=false
  local -a parent_fields candidates=()

  [[ -f $installed && ! -L $installed ]] || \
    fail 'installed deploy entrypoint is not a regular non-symlink file'
  installed_identity=$(
    postgres_pool_bootstrap_recovery_file_identity "$installed"
  ) || fail 'installed deploy entrypoint identity cannot be inventoried'
  installed_blob=$(git -C "$REPO" hash-object --no-filters "$installed") || \
    fail 'installed deploy entrypoint blob identity cannot be computed'
  [[ $installed_blob =~ ^[0-9a-f]+$ ]] || \
    fail 'installed deploy entrypoint blob identity is malformed'
  first_parent_history=$(
    git -C "$REPO" rev-list --first-parent "$current"
  ) || fail 'current first-parent ancestry cannot be inventoried'
  while IFS= read -r sha; do
    if [[ $sha == "$backend_sha" ]]; then
      reached_backend=true
      break
    fi
    candidate_blob=$(
      postgres_pool_bootstrap_recovery_tree_blob \
        "$sha" "$relative_path" 'canonical deploy entrypoint'
    )
    [[ $candidate_blob == "$installed_blob" ]] || continue
    parent_line=$(git -C "$REPO" rev-list --parents -n 1 "$sha") || \
      fail 'deploy entrypoint candidate parents cannot be inventoried'
    read -r -a parent_fields <<< "$parent_line"
    parent=${parent_fields[1]:-}
    [[ -n $parent ]] || \
      fail 'deploy entrypoint candidate has no parent'
    parent_blob=$(
      postgres_pool_bootstrap_recovery_tree_blob \
        "$parent" "$relative_path" 'candidate parent deploy entrypoint'
    )
    [[ $parent_blob != "$installed_blob" ]] || continue
    candidates+=("$sha")
  done <<< "$first_parent_history"
  [[ $reached_backend == true ]] || \
    fail 'backend marker is not on current canonical first-parent ancestry'
  ((${#candidates[@]} > 0)) || \
    fail 'installed deploy entrypoint blob has no introducing commit after backend marker'
  ((${#candidates[@]} == 1)) || \
    fail 'installed deploy entrypoint blob has ambiguous introducing commits'
  validate_main_commit "${candidates[0]}"
  verify_postgres_pool_bootstrap_recovery_file \
    "${candidates[0]}" "$relative_path" "$installed" \
    'installed deploy entrypoint'
  [[ $(postgres_pool_bootstrap_recovery_file_identity "$installed") == \
     "$installed_identity" ]] || \
    fail 'installed deploy entrypoint changed during provenance validation'
  printf '%s\n' "${candidates[0]}"
}

validate_postgres_pool_bootstrap_control_only_candidate() {
  local candidate=$1
  local relative_path=ops/deploy/social-monitor-production-deploy.sh
  local parent_line changed_paths path
  local candidate_blob parent_blob
  local saw_entrypoint=false
  local -a parent_fields

  parent_line=$(git -C "$REPO" rev-list --parents -n 1 "$candidate") || \
    fail 'installed deploy entrypoint introduction parents cannot be inspected'
  read -r -a parent_fields <<< "$parent_line"
  ((${#parent_fields[@]} == 2)) || \
    fail 'installed deploy entrypoint introduction commit is a merge'
  changed_paths=$(
    git -C "$REPO" diff --name-only --no-renames \
      "${parent_fields[1]}" "$candidate" --
  ) || fail 'installed deploy entrypoint introduction delta cannot be inspected'
  while IFS= read -r path; do
    [[ -z $path ]] && continue
    if postgres_pool_bootstrap_recovery_path_matches_roots \
      "$path" "${BACKEND_PATHS[@]}"; then
      fail 'installed deploy entrypoint introduction contains backend-classified paths'
    fi
    postgres_pool_bootstrap_recovery_path_matches_roots \
      "$path" "${CONTROL_PATHS[@]}" || \
      fail 'installed deploy entrypoint introduction contains non-control paths'
    [[ $path != "$relative_path" ]] || saw_entrypoint=true
  done <<< "$changed_paths"
  [[ $saw_entrypoint == true ]] || \
    fail 'installed deploy entrypoint introduction does not change the deploy entrypoint'
  candidate_blob=$(
    postgres_pool_bootstrap_recovery_commit_blob \
      "$candidate" "$relative_path" 'installed deploy entrypoint introduction'
  )
  parent_blob=$(
    postgres_pool_bootstrap_recovery_tree_blob \
      "${parent_fields[1]}" "$relative_path" \
      'introduction parent deploy entrypoint'
  )
  [[ $candidate_blob != "$parent_blob" ]] || \
    fail 'installed deploy entrypoint introduction inherited the same blob'
}

verify_postgres_pool_bootstrap_recovery_marker_snapshot() {
  local marker=$1
  local label=$2
  local expected_sha=$3
  local expected_identity=$4
  local actual_sha actual_identity

  actual_sha=$(read_postgres_pool_bootstrap_recovery_marker "$marker" "$label")
  actual_identity=$(
    postgres_pool_bootstrap_recovery_file_identity "$marker"
  ) || fail "$label marker identity cannot be re-inventoried"
  [[ $actual_sha == "$expected_sha" && \
     $actual_identity == "$expected_identity" ]] || \
    fail "$label marker changed during partial control reconciliation"
}

verify_postgres_pool_bootstrap_partial_control_state() {
  local current=$1
  local canonical_tip=$2
  local backend_marker_sha=$3
  local backend_marker_identity=$4
  local control_marker_sha=$5
  local control_marker_identity=$6
  local pool_marker_state=$7
  local pool_marker_sha=$8
  local pool_marker_identity=$9
  local marker=$STATE/postgres-pool-bootstrap.sha

  verify_postgres_pool_bootstrap_recovery_canonical_tip "$canonical_tip"
  validate_current_postgres_pool_bootstrap_recovery "$current"
  verify_postgres_pool_bootstrap_recovery_marker_snapshot \
    "$STATE/backend.sha" 'backend' \
    "$backend_marker_sha" "$backend_marker_identity"
  verify_postgres_pool_bootstrap_recovery_marker_snapshot \
    "$STATE/control.sha" 'control' \
    "$control_marker_sha" "$control_marker_identity"
  if [[ $pool_marker_state == present ]]; then
    verify_postgres_pool_bootstrap_recovery_marker_snapshot \
      "$marker" 'PostgreSQL bootstrap' \
      "$pool_marker_sha" "$pool_marker_identity"
  else
    [[ ! -e $marker && ! -L $marker ]] || \
      fail 'PostgreSQL bootstrap marker changed during partial control reconciliation'
  fi
}

recover_partial_current_postgres_pool_bootstrap_control() {
  local current=$1
  local installed=$2
  local pool_marker_state=$3
  local pool_marker_sha=$4
  local pool_marker_identity=$5
  local control_marker_sha=$6
  local control_marker_identity=$7
  local backend_marker=$STATE/backend.sha
  local control_marker=$STATE/control.sha
  local backend_marker_sha backend_marker_identity candidate
  local candidate_blob control_marker_blob canonical_tip

  backend_marker_sha=$(
    read_postgres_pool_bootstrap_recovery_marker "$backend_marker" 'backend'
  )
  backend_marker_identity=$(
    postgres_pool_bootstrap_recovery_file_identity "$backend_marker"
  ) || fail 'backend marker identity cannot be inventoried'
  validate_postgres_pool_bootstrap_recovery_marker \
    "$backend_marker_sha" "$current" 'backend'
  validate_postgres_pool_bootstrap_recovery_marker \
    "$control_marker_sha" "$current" 'control'
  canonical_tip=$(postgres_pool_bootstrap_recovery_canonical_tip)
  candidate=$(
    find_postgres_pool_bootstrap_installed_control_commit \
      "$backend_marker_sha" "$current" "$installed"
  )
  if [[ $candidate == "$control_marker_sha" ]] || \
     ! git -C "$REPO" merge-base --is-ancestor \
       "$control_marker_sha" "$candidate"; then
    fail 'installed deploy entrypoint candidate is not after the control marker'
  fi
  validate_postgres_pool_bootstrap_control_only_candidate "$candidate"
  candidate_blob=$(
    postgres_pool_bootstrap_recovery_commit_blob \
      "$candidate" ops/deploy/social-monitor-production-deploy.sh \
      'installed deploy entrypoint candidate'
  )
  control_marker_blob=$(
    postgres_pool_bootstrap_recovery_commit_blob \
      "$control_marker_sha" ops/deploy/social-monitor-production-deploy.sh \
      'control marker deploy entrypoint'
  )
  [[ $candidate_blob != "$control_marker_blob" ]] || \
    fail 'installed deploy entrypoint candidate does not differ from the control marker'

  verify_postgres_pool_bootstrap_partial_control_state \
    "$current" "$canonical_tip" \
    "$backend_marker_sha" "$backend_marker_identity" \
    "$control_marker_sha" "$control_marker_identity" \
    "$pool_marker_state" "$pool_marker_sha" "$pool_marker_identity"
  verify_postgres_pool_bootstrap_recovery_file \
    "$candidate" ops/deploy/social-monitor-production-deploy.sh "$installed" \
    'installed deploy entrypoint'

  sync_postgres_pool_bootstrap_recovery_control_entrypoint "$current" || \
    fail 'PostgreSQL bootstrap recovery could not sync current control'
  verify_postgres_pool_bootstrap_partial_control_state \
    "$current" "$canonical_tip" \
    "$backend_marker_sha" "$backend_marker_identity" \
    "$control_marker_sha" "$control_marker_identity" \
    "$pool_marker_state" "$pool_marker_sha" "$pool_marker_identity"
  verify_postgres_pool_bootstrap_recovery_file \
    "$current" ops/deploy/social-monitor-production-deploy.sh "$installed" \
    'installed deploy entrypoint'
}

verify_current_postgres_pool_bootstrap_recovery_sources() {
  local current=$1
  local relative_path
  local -a required_paths=(
    ops/deploy/social-monitor-production-deploy.sh
    ops/deploy/postgres-runtime-deploy-lib.sh
    ops/deploy/verify-postgres-runtime-topology.py
    ops/deploy/production-runtime/compose.postgres-runtime.yml
  )

  for relative_path in "${required_paths[@]}"; do
    verify_postgres_pool_bootstrap_recovery_file \
      "$current" "$relative_path" "$REPO/$relative_path" \
      "current PostgreSQL bootstrap source $relative_path"
  done
}

validate_current_postgres_pool_bootstrap_recovery() {
  local expected_current=$1
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
  verify_current_postgres_pool_bootstrap_recovery_sources "$current"
}

sync_postgres_pool_bootstrap_recovery_control_entrypoint_fallback() {
  local current=$1
  local relative_path=ops/deploy/social-monitor-production-deploy.sh
  local source=$REPO/$relative_path
  # CONTROL is supplied by the host-owned production deploy entrypoint.
  # shellcheck disable=SC2153
  local destination=$CONTROL/github-production-deploy.sh
  local temporary=$destination.next
  local control_real source_identity destination_identity
  local expected_digest temporary_digest installed_digest
  local control_device destination_device

  [[ -d $CONTROL && ! -L $CONTROL ]] || \
    fail 'control root is not a regular non-symlink directory'
  control_real=$(readlink -f "$CONTROL") || \
    fail 'control root path cannot be resolved'
  [[ $control_real == "$CONTROL" ]] || \
    fail 'control root is not the canonical destination'
  [[ -f $source && ! -L $source ]] || \
    fail 'current deploy entrypoint source is not a regular non-symlink file'
  [[ -f $destination && ! -L $destination ]] || \
    fail 'installed deploy entrypoint destination is not a regular non-symlink file'
  [[ ! -e $temporary && ! -L $temporary ]] || \
    fail 'installed deploy entrypoint temporary path is invalid'
  [[ $(stat -c '%u:%g:%a' "$destination") == 0:0:755 ]] || \
    fail 'installed deploy entrypoint destination ownership or mode is invalid'

  verify_postgres_pool_bootstrap_recovery_file \
    "$current" "$relative_path" "$source" \
    'current PostgreSQL bootstrap deploy entrypoint source'
  expected_digest=$(
    deploy_control_git_blob_digest "$current" "$relative_path"
  ) || fail 'current deploy entrypoint source digest cannot be read'
  source_identity=$(
    postgres_pool_bootstrap_recovery_file_identity "$source"
  ) || fail 'current deploy entrypoint source identity cannot be inventoried'
  destination_identity=$(
    postgres_pool_bootstrap_recovery_file_identity "$destination"
  ) || fail 'installed deploy entrypoint destination identity cannot be inventoried'
  control_device=$(stat -c '%d' "$CONTROL") || \
    fail 'control root filesystem cannot be inventoried'
  destination_device=$(stat -c '%d' "$destination") || \
    fail 'installed deploy entrypoint filesystem cannot be inventoried'
  [[ $destination_device == "$control_device" ]] || \
    fail 'installed deploy entrypoint is not on the control filesystem'

  install -m 0755 -o root -g root "$source" "$temporary" || \
    fail 'current deploy entrypoint temporary install failed'
  [[ -f $temporary && ! -L $temporary ]] || \
    fail 'installed deploy entrypoint temporary file is invalid'
  [[ $(stat -c '%d' "$temporary") == "$control_device" ]] || \
    fail 'installed deploy entrypoint temporary file is not on the control filesystem'
  [[ $(stat -c '%u:%g:%a' "$temporary") == 0:0:755 ]] || \
    fail 'installed deploy entrypoint temporary ownership or mode is invalid'
  temporary_digest=$(deploy_control_file_digest "$temporary") || \
    fail 'installed deploy entrypoint temporary digest cannot be read'
  [[ $temporary_digest == "$expected_digest" ]] || \
    fail 'installed deploy entrypoint temporary bytes differ from reviewed source'
  [[ $(postgres_pool_bootstrap_recovery_file_identity "$source") == \
     "$source_identity" ]] || \
    fail 'current deploy entrypoint source changed during fallback sync'
  [[ $(postgres_pool_bootstrap_recovery_file_identity "$destination") == \
     "$destination_identity" ]] || \
    fail 'installed deploy entrypoint destination changed during fallback sync'

  mv -f "$temporary" "$destination" || \
    fail 'current deploy entrypoint atomic replacement failed'
  [[ -f $destination && ! -L $destination ]] || \
    fail 'installed deploy entrypoint is invalid after fallback sync'
  [[ $(stat -c '%u:%g:%a' "$destination") == 0:0:755 ]] || \
    fail 'installed deploy entrypoint ownership or mode is invalid after fallback sync'
  installed_digest=$(deploy_control_file_digest "$destination") || \
    fail 'installed deploy entrypoint digest cannot be read after fallback sync'
  [[ $installed_digest == "$expected_digest" ]] || \
    fail 'installed deploy entrypoint differs from reviewed source after fallback sync'
}

sync_postgres_pool_bootstrap_recovery_control_entrypoint() {
  local current=$1

  if declare -F sync_control_entrypoint >/dev/null; then
    sync_control_entrypoint
    return
  fi
  sync_postgres_pool_bootstrap_recovery_control_entrypoint_fallback "$current"
}

reconcile_current_postgres_pool_bootstrap() {
  local expected_current=$1
  local marker=$STATE/postgres-pool-bootstrap.sha
  local control_marker=$STATE/control.sha
  # CONTROL is provided by the production deploy entrypoint that sources this file.
  # shellcheck disable=SC2153
  local installed=$CONTROL/github-production-deploy.sh
  local current=$expected_current
  local pool_marker_sha control_marker_sha
  local pool_marker_identity control_marker_identity
  local revalidated_pool_marker_sha revalidated_control_marker_sha
  local revalidated_pool_marker_identity revalidated_control_marker_identity
  local control_marker_digest installed_digest
  local commit_mode=normal
  local force_advance=false

  validate_current_postgres_pool_bootstrap_recovery "$current"
  postgres_pool_bootstrap_installed "$current" && return 0
  [[ -f $installed && ! -L $installed ]] || \
    fail 'installed deploy entrypoint is not a regular non-symlink file'

  if [[ ! -e $marker && ! -L $marker ]]; then
    if cmp -s \
      "$installed" "$REPO/ops/deploy/social-monitor-production-deploy.sh"; then
      verify_postgres_pool_bootstrap_recovery_file \
        "$current" ops/deploy/social-monitor-production-deploy.sh "$installed" \
        'installed deploy entrypoint'
      validate_current_postgres_pool_bootstrap_recovery "$current"
      verify_postgres_pool_bootstrap_recovery_file \
        "$current" ops/deploy/social-monitor-production-deploy.sh "$installed" \
        'installed deploy entrypoint'
    else
      control_marker_sha=$(
        read_postgres_pool_bootstrap_recovery_marker \
          "$control_marker" 'control'
      )
      control_marker_identity=$(
        postgres_pool_bootstrap_recovery_file_identity "$control_marker"
      ) || fail 'control marker identity cannot be inventoried'
      recover_partial_current_postgres_pool_bootstrap_control \
        "$current" "$installed" absent '' '' \
        "$control_marker_sha" "$control_marker_identity"
      force_advance=true
    fi
  else
    pool_marker_sha=$(
      read_postgres_pool_bootstrap_recovery_marker \
        "$marker" 'PostgreSQL bootstrap'
    )
    control_marker_sha=$(
      read_postgres_pool_bootstrap_recovery_marker \
        "$control_marker" 'control'
    )
    [[ $pool_marker_sha != "$current" ]] || \
      fail 'current PostgreSQL bootstrap marker has mismatched installed control'
    validate_postgres_pool_bootstrap_recovery_marker \
      "$pool_marker_sha" "$current" 'PostgreSQL bootstrap'
    validate_postgres_pool_bootstrap_recovery_marker \
      "$control_marker_sha" "$current" 'control'
    pool_marker_identity=$(
      postgres_pool_bootstrap_recovery_file_identity "$marker"
    ) || fail 'PostgreSQL bootstrap marker identity cannot be inventoried'
    control_marker_identity=$(
      postgres_pool_bootstrap_recovery_file_identity "$control_marker"
    ) || fail 'control marker identity cannot be inventoried'
    control_marker_digest=$(
      deploy_control_git_blob_digest \
        "$control_marker_sha" ops/deploy/social-monitor-production-deploy.sh
    ) || fail 'control marker deploy entrypoint digest cannot be read'
    installed_digest=$(deploy_control_file_digest "$installed") || \
      fail 'installed deploy entrypoint digest cannot be read'
    if [[ $installed_digest == "$control_marker_digest" ]]; then
      verify_postgres_pool_bootstrap_recovery_file \
        "$control_marker_sha" ops/deploy/social-monitor-production-deploy.sh \
        "$installed" 'installed deploy entrypoint'
      sync_postgres_pool_bootstrap_recovery_control_entrypoint "$current" || \
        fail 'PostgreSQL bootstrap recovery could not sync current control'
      validate_current_postgres_pool_bootstrap_recovery "$current"
      verify_postgres_pool_bootstrap_recovery_file \
        "$current" ops/deploy/social-monitor-production-deploy.sh "$installed" \
        'installed deploy entrypoint'
      revalidated_pool_marker_sha=$(
        read_postgres_pool_bootstrap_recovery_marker \
          "$marker" 'PostgreSQL bootstrap'
      )
      revalidated_control_marker_sha=$(
        read_postgres_pool_bootstrap_recovery_marker \
          "$control_marker" 'control'
      )
      revalidated_pool_marker_identity=$(
        postgres_pool_bootstrap_recovery_file_identity "$marker"
      ) || fail 'PostgreSQL bootstrap marker identity cannot be re-inventoried'
      revalidated_control_marker_identity=$(
        postgres_pool_bootstrap_recovery_file_identity "$control_marker"
      ) || fail 'control marker identity cannot be re-inventoried'
      [[ $revalidated_pool_marker_sha == "$pool_marker_sha" && \
         $revalidated_pool_marker_identity == "$pool_marker_identity" ]] || \
        fail 'PostgreSQL bootstrap marker changed during control reconciliation'
      [[ $revalidated_control_marker_sha == "$control_marker_sha" && \
         $revalidated_control_marker_identity == "$control_marker_identity" ]] || \
        fail 'control marker changed during PostgreSQL bootstrap reconciliation'
    else
      recover_partial_current_postgres_pool_bootstrap_control \
        "$current" "$installed" present \
        "$pool_marker_sha" "$pool_marker_identity" \
        "$control_marker_sha" "$control_marker_identity"
    fi
    force_advance=true
  fi

  [[ $force_advance == false ]] || commit_mode=force-advance
  commit_postgres_pool_bootstrap "$current" "$commit_mode" || \
    fail 'PostgreSQL bootstrap recovery could not commit current integration'
  validate_current_postgres_pool_bootstrap_recovery "$current"
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
  local sha=$1 atomic_state
  if postgres_pool_atomic_legacy_state; then
    deploy_postgres_pool_atomic_control_bootstrap "$sha" || \
      fail 'atomic PostgreSQL bootstrap loader failed'
    return
  else
    atomic_state=$?
    ((atomic_state == 1)) || \
      fail 'PostgreSQL atomic repair marker state is invalid'
  fi
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
