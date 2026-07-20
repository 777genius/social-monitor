#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export LC_ALL=C

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)

FINAL_SOURCE_SHA=c8e9897b2d6b1f71cc473689b5bbc37edbf69052
REJECTED_REVIEW_SHA=eb9b9899d3db21098f936b843a3ecd18504a9913
BACKEND_MARKER_SHA=c071bcbe2b0ef1ecab48db5bcfab281c4745f778
FRONTEND_MARKER_SHA=a6c4f0019d8a95875837bae251c379c45f40074d
CONTROL_MARKER_SHA=$REJECTED_REVIEW_SHA
LEGACY_DAILY_BLOB=332bf309c612d3dab42e5f1e8122c9d6e8396f07
MANIFEST_PATH=ops/deploy/runtime-control-refresh-bridge.manifest

FRONTEND_PATHS=(
  apps/frontend
  libs/contracts/rest
)

BACKEND_PATHS=(
  Dockerfile
  .dockerignore
  docker-compose.yml
  package.json
  package-lock.json
  tsconfig.json
  tsconfig.build.json
  prisma.config.ts
  prisma
  vendor
  libs
  apps/api-gateway
  apps/agent-runtime
  apps/ingestion-worker
  apps/intelligence-worker
  apps/delivery-service
  apps/event-relay
  apps/x-collector
  apps/social-research-runtime
  apps/social-research-grpc
  apps/social-research-mcp
  scripts
  ops/evals
  ops/deploy/reader-summary-publication-deploy-lib.sh
  ops/deploy/reader-summary-publication-pre-migration.sql
  ops/deploy/reader-summary-publication-post-migration.sql
  test
)

CONTROL_PATHS=(
  .github/workflows/production-deploy.yml
  ops/deploy
  ops/recovery/backup-restore-contract.json
)

RUNTIME_CONTROL_PATHS=(
  ops/deploy/production-runtime/daily-run.sh
  ops/deploy/production-runtime/social-monitor-daily.service
)

CONTROLLER_PATHS=(
  ops/deploy/social-monitor-production-deploy.sh
  ops/deploy/deploy-control-lib.sh
  ops/deploy/postgres-runtime-deploy-lib.sh
  ops/deploy/backend-image-rescue-lib.sh
)

bridge_fail() {
  printf 'runtime-control-refresh-bridge-error: %s\n' "$*" >&2
  exit 1
}

tree_entry() {
  local repository=$1
  local sha=$2
  local path=$3
  git -C "$repository" ls-tree "$sha" -- "$path"
}

assert_same_entry() {
  local repository=$1
  local left=$2
  local right=$3
  local path=$4
  [[ $(tree_entry "$repository" "$left" "$path") == \
     $(tree_entry "$repository" "$right" "$path") ]] || \
    bridge_fail "$path differs between $left and $right"
}

assert_component_plan() {
  local repository=$1
  local marker=$2
  local target=$3
  local expected=$4
  shift 4
  local actual=true
  git -C "$repository" diff --quiet "$marker" "$target" -- "$@" && actual=false
  [[ $actual == "$expected" ]] || \
    bridge_fail "component plan mismatch for $marker..$target: expected $expected, got $actual"
}

verify_bridge_candidate() {
  local repository=$1
  local candidate=$2
  local parent manifest_text actual_paths expected_paths
  local line mode blob path extra entry actual_mode actual_type actual_blob actual_path
  local previous_path=""
  local count=0 rejected_count=0
  local -a manifest_lines=() manifest_paths=()

  git -C "$repository" cat-file -e "$candidate^{commit}" 2>/dev/null || \
    bridge_fail 'candidate commit is unavailable'
  parent=$(git -C "$repository" rev-parse "$candidate^")
  [[ $parent == "$FINAL_SOURCE_SHA" ]] || \
    bridge_fail 'candidate parent is not the exact c8 source commit'

  manifest_text=$(git -C "$repository" show "$candidate:$MANIFEST_PATH") || \
    bridge_fail 'candidate is missing the exact bridge manifest'
  mapfile -t manifest_lines <<< "$manifest_text"
  ((${#manifest_lines[@]} == 191)) || \
    bridge_fail "bridge manifest must admit exactly 191 paths, got ${#manifest_lines[@]}"

  for line in "${manifest_lines[@]}"; do
    read -r mode blob path extra <<< "$line"
    [[ -n $mode && -n $blob && -n $path && -z ${extra:-} ]] || \
      bridge_fail "invalid bridge manifest row: $line"
    [[ $path != /* && $path != *'..'* ]] || \
      bridge_fail "unsafe bridge manifest path: $path"
    [[ -z $previous_path || $previous_path < $path ]] || \
      bridge_fail 'bridge manifest paths must be sorted and unique'
    previous_path=$path
    manifest_paths+=("$path")
    ((count += 1))

    entry=$(tree_entry "$repository" "$candidate" "$path")
    if [[ $mode == 000000 ]]; then
      [[ $blob == - && -z $entry ]] || \
        bridge_fail "deleted bridge path has an object: $path"
    else
      [[ $mode == 100644 || $mode == 100755 ]] || \
        bridge_fail "bridge path has a non-regular mode: $path"
      read -r actual_mode actual_type actual_blob actual_path <<< "$entry"
      [[ $actual_mode == "$mode" && $actual_type == blob && \
         $actual_path == "$path" ]] || \
        bridge_fail "bridge path mode or type mismatch: $path"
      if [[ $blob == SELF ]]; then
        [[ $path == "$MANIFEST_PATH" ]] || \
          bridge_fail 'SELF is allowed only for the manifest blob'
      else
        [[ $blob =~ ^[0-9a-f]{40}$ && $actual_blob == "$blob" ]] || \
          bridge_fail "bridge path blob mismatch: $path"
      fi
    fi

    case $path in
      .github/workflows/production-deploy.yml|\
      ops/deploy/runtime-control-refresh-bridge.manifest|\
      ops/deploy/runtime-control-refresh-bridge-transition.test.sh)
        ;;
      *)
        assert_same_entry "$repository" "$candidate" "$REJECTED_REVIEW_SHA" "$path"
        ((rejected_count += 1))
        ;;
    esac
  done
  ((count == 191 && rejected_count == 188)) || \
    bridge_fail 'bridge manifest partition is not exactly 188 reviewed paths plus 3 gate paths'

  actual_paths=$(git -C "$repository" diff --name-only \
    "$FINAL_SOURCE_SHA" "$candidate" -- | LC_ALL=C sort)
  expected_paths=$(printf '%s\n' "${manifest_paths[@]}")
  [[ $actual_paths == "$expected_paths" ]] || \
    bridge_fail 'candidate changed paths outside the exact 191-path manifest'

  git -C "$repository" diff --quiet "$BACKEND_MARKER_SHA" "$candidate" -- \
    "${BACKEND_PATHS[@]}" || bridge_fail 'candidate backend tree is not exact c071'
  git -C "$repository" diff --quiet "$FRONTEND_MARKER_SHA" "$candidate" -- \
    "${FRONTEND_PATHS[@]}" || bridge_fail 'candidate frontend tree is not exact a6'

  for path in "${CONTROLLER_PATHS[@]}"; do
    assert_same_entry "$repository" "$candidate" "$FINAL_SOURCE_SHA" "$path"
  done
  [[ $(git -C "$repository" rev-parse \
      "$candidate:ops/deploy/production-runtime/daily-run.sh") == \
      "$LEGACY_DAILY_BLOB" ]] || bridge_fail 'candidate daily runner is not the exact legacy blob'
  [[ -z $(tree_entry "$repository" "$candidate" \
      ops/deploy/production-runtime/social-monitor-daily.service) ]] || \
    bridge_fail 'candidate unexpectedly contains the daily service'

  assert_component_plan "$repository" "$FRONTEND_MARKER_SHA" "$candidate" false \
    "${FRONTEND_PATHS[@]}"
  assert_component_plan "$repository" "$BACKEND_MARKER_SHA" "$candidate" false \
    "${BACKEND_PATHS[@]}"
  assert_component_plan "$repository" "$CONTROL_MARKER_SHA" "$candidate" true \
    "${CONTROL_PATHS[@]}"
  assert_component_plan "$repository" "$CONTROL_MARKER_SHA" "$candidate" false \
    "${RUNTIME_CONTROL_PATHS[@]}"
  assert_component_plan "$repository" "$BACKEND_MARKER_SHA" "$candidate" false \
    apps/x-collector
}

create_synthetic_targets() {
  local object_repository=$1
  local manifest=$PROJECT_ROOT/$MANIFEST_PATH
  local synthetic_git=$object_repository/.git
  local bridge_tree candidate_mutation_blob candidate_mutation_tree
  local final_tree mutation_blob mutation_tree
  local mode blob path extra
  local -a bridge_paths=()

  git clone -q --no-checkout "$PROJECT_ROOT" "$object_repository"
  while read -r mode blob path extra; do
    [[ -n $path && -z ${extra:-} ]] || bridge_fail 'working manifest is invalid'
    bridge_paths+=("$path")
  done < "$manifest"
  git --git-dir="$synthetic_git" --work-tree="$PROJECT_ROOT" \
    read-tree "$FINAL_SOURCE_SHA"
  git --git-dir="$synthetic_git" --work-tree="$PROJECT_ROOT" \
    add -A -- "${bridge_paths[@]}"
  bridge_tree=$(git --git-dir="$synthetic_git" write-tree)
  BRIDGE_SHA=$(printf 'synthetic exact runtime-control refresh bridge\n' | \
    GIT_AUTHOR_NAME='Runtime Bridge Test' \
    GIT_AUTHOR_EMAIL=runtime-bridge@example.invalid \
    GIT_COMMITTER_NAME='Runtime Bridge Test' \
    GIT_COMMITTER_EMAIL=runtime-bridge@example.invalid \
      git --git-dir="$synthetic_git" commit-tree "$bridge_tree" -p "$FINAL_SOURCE_SHA")

  git --git-dir="$synthetic_git" show \
    "$BRIDGE_SHA:ops/deploy/production-runtime/daily-run.sh" \
    > "$object_repository/candidate-mutation"
  python3 - "$object_repository/candidate-mutation" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
payload = bytearray(path.read_bytes())
payload[-1] = 35 if payload[-1] != 35 else 10
path.write_bytes(payload)
PY
  candidate_mutation_blob=$(git --git-dir="$synthetic_git" hash-object -w \
    "$object_repository/candidate-mutation")
  GIT_INDEX_FILE=$object_repository/candidate-mutation.index \
    git --git-dir="$synthetic_git" read-tree "$BRIDGE_SHA"
  GIT_INDEX_FILE=$object_repository/candidate-mutation.index \
    git --git-dir="$synthetic_git" update-index --add --cacheinfo \
      "100644,$candidate_mutation_blob,ops/deploy/production-runtime/daily-run.sh"
  candidate_mutation_tree=$(GIT_INDEX_FILE=$object_repository/candidate-mutation.index \
    git --git-dir="$synthetic_git" write-tree)
  MUTATED_BRIDGE_SHA=$(printf 'synthetic one-byte candidate mutation\n' | \
    GIT_AUTHOR_NAME='Runtime Bridge Test' \
    GIT_AUTHOR_EMAIL=runtime-bridge@example.invalid \
    GIT_COMMITTER_NAME='Runtime Bridge Test' \
    GIT_COMMITTER_EMAIL=runtime-bridge@example.invalid \
      git --git-dir="$synthetic_git" commit-tree \
        "$candidate_mutation_tree" -p "$FINAL_SOURCE_SHA")

  final_tree=$(git --git-dir="$synthetic_git" rev-parse "$FINAL_SOURCE_SHA^{tree}")
  FINAL_SHA=$(printf 'synthetic restore of exact c8 tree\n' | \
    GIT_AUTHOR_NAME='Runtime Bridge Test' \
    GIT_AUTHOR_EMAIL=runtime-bridge@example.invalid \
    GIT_COMMITTER_NAME='Runtime Bridge Test' \
    GIT_COMMITTER_EMAIL=runtime-bridge@example.invalid \
      git --git-dir="$synthetic_git" commit-tree "$final_tree" -p "$BRIDGE_SHA")

  cp "$PROJECT_ROOT/ops/deploy/deploy-control-lib.sh" "$object_repository/mutation"
  python3 - "$object_repository/mutation" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
payload = bytearray(path.read_bytes())
payload[-1] = 35 if payload[-1] != 35 else 10
path.write_bytes(payload)
PY
  mutation_blob=$(git --git-dir="$synthetic_git" hash-object -w \
    "$object_repository/mutation")
  GIT_INDEX_FILE=$object_repository/mutation.index \
    git --git-dir="$synthetic_git" read-tree "$FINAL_SOURCE_SHA"
  GIT_INDEX_FILE=$object_repository/mutation.index \
    git --git-dir="$synthetic_git" update-index --add --cacheinfo \
      "100644,$mutation_blob,ops/deploy/deploy-control-lib.sh"
  mutation_tree=$(GIT_INDEX_FILE=$object_repository/mutation.index \
    git --git-dir="$synthetic_git" write-tree)
  MUTATED_FINAL_SHA=$(printf 'synthetic one-byte controller mutation\n' | \
    GIT_AUTHOR_NAME='Runtime Bridge Test' \
    GIT_AUTHOR_EMAIL=runtime-bridge@example.invalid \
    GIT_COMMITTER_NAME='Runtime Bridge Test' \
    GIT_COMMITTER_EMAIL=runtime-bridge@example.invalid \
      git --git-dir="$synthetic_git" commit-tree "$mutation_tree" -p "$BRIDGE_SHA")
  export BRIDGE_SHA MUTATED_BRIDGE_SHA FINAL_SHA MUTATED_FINAL_SHA
}

run_transition_test() {
  local fixture object_repository integration root control state installed
  local runtime_current legacy_runtime systemd_unit_dir entrypoint plan runtime_plan
  local bridge_snapshot mutation_snapshot failure_snapshot controller_path
  local candidate_mutation_status candidate_mutation_output
  local -a environment

  fixture=$(mktemp -d "${TMPDIR:-/tmp}/runtime-control-refresh-bridge.XXXXXX")
  trap 'rm -rf "$fixture"' RETURN
  object_repository=$fixture/objects
  create_synthetic_targets "$object_repository"
  verify_bridge_candidate "$object_repository" "$BRIDGE_SHA"
  set +e
  candidate_mutation_output=$(verify_bridge_candidate \
    "$object_repository" "$MUTATED_BRIDGE_SHA" 2>&1)
  candidate_mutation_status=$?
  set -e
  ((candidate_mutation_status != 0))
  grep -F 'bridge path blob mismatch: ops/deploy/production-runtime/daily-run.sh' \
    <<< "$candidate_mutation_output" >/dev/null
  [[ $(git -C "$object_repository" rev-parse "$FINAL_SHA^{tree}") == \
     $(git -C "$object_repository" rev-parse "$FINAL_SOURCE_SHA^{tree}") ]] || \
    bridge_fail 'synthetic final target does not restore the exact c8 tree'

  integration=$fixture/integration
  git -C "$object_repository" update-ref refs/heads/main "$FINAL_SHA"
  git clone -q "$object_repository" "$integration"
  git -C "$integration" checkout -q --detach "$FINAL_SOURCE_SHA"

  root=$fixture/root
  control=$root/control
  state=$control/deploy-state
  installed=$control/github-production-deploy.sh
  runtime_current=$control/postgres-runtime-current
  legacy_runtime=$control/postgres-runtime-releases/legacy
  systemd_unit_dir=$root/runtime/systemd
  install -d "$state" "$legacy_runtime" "$systemd_unit_dir" "$root/runtime/deploy-staging"
  printf '%s\n' "$BACKEND_MARKER_SHA" > "$state/backend.sha"
  printf '%s\n' "$FRONTEND_MARKER_SHA" > "$state/frontend.sha"
  printf '%s\n' "$CONTROL_MARKER_SHA" > "$state/control.sha"
  printf '%s\n' "$CONTROL_MARKER_SHA" > "$state/postgres-pool-bootstrap.sha"
  printf '%s\n' "$CONTROL_MARKER_SHA" > "$legacy_runtime/SOURCE_SHA"
  printf '%s\n' "$BACKEND_MARKER_SHA" > "$legacy_runtime/READY"
  printf 'legacy-runtime-sentinel\n' > "$legacy_runtime/runtime.sentinel"
  ln -s "$legacy_runtime" "$runtime_current"
  git -C "$integration" show \
    "$FINAL_SOURCE_SHA:ops/deploy/social-monitor-production-deploy.sh" > "$installed"
  chmod 0755 "$installed"

  entrypoint=$fixture/bridge-entrypoint.sh
  git -C "$object_repository" show \
    "$FINAL_SOURCE_SHA:ops/deploy/social-monitor-production-deploy.sh" > "$entrypoint"
  python3 - "$entrypoint" <<'PY'
import os
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
source = path.read_text(encoding="utf-8")
needle = "verify_compose_scope() (\n"
if source.count(needle) != 1:
    raise SystemExit("fixture could not find the Compose verifier")
source = source.replace(
    needle,
    needle + "  [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]] && return 0\n",
    1,
)
source = source.replace(" -o root -g root", "")
ownership_check = (
    "[[ $(stat -c '%U:%G:%a' \"$auth_refresh_destination\") == root:root:700 ]]"
)
if source.count(ownership_check) != 1:
    raise SystemExit("fixture could not find the auth refresh ownership check")
source = source.replace(
    ownership_check,
    "[[ $(stat -c '%u:%g:%a' \"$auth_refresh_destination\") == "
    f"{os.getuid()}:{os.getgid()}:700 ]]",
    1,
)
path.write_text(source, encoding="utf-8")
PY
  chmod 0755 "$entrypoint"

  environment=(
    SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
    SOCIAL_MONITOR_DEPLOY_ROOT="$root"
    SOCIAL_MONITOR_DEPLOY_REPO="$integration"
    SOCIAL_MONITOR_DEPLOY_CONTROL="$control"
    SOCIAL_MONITOR_DEPLOY_STATE="$state"
    SOCIAL_MONITOR_DEPLOY_STAGING="$root/runtime/deploy-staging"
  )

  plan=$(/usr/bin/env "${environment[@]}" bash "$entrypoint" plan "$BRIDGE_SHA")
  grep -Fx 'frontend=false' <<< "$plan" >/dev/null
  grep -Fx 'backend=false' <<< "$plan" >/dev/null
  grep -Fx 'control=true' <<< "$plan" >/dev/null
  grep -Fx 'x_collector=false' <<< "$plan" >/dev/null
  # shellcheck disable=SC2016
  runtime_plan=$(/usr/bin/env "${environment[@]}" BRIDGE_SHA="$BRIDGE_SHA" \
    ENTRYPOINT="$entrypoint" bash -c '
      source "$ENTRYPOINT"
      if component_changed control "$BRIDGE_SHA" "${RUNTIME_CONTROL_PATHS[@]}"; then
        printf "true\n"
      else
        printf "false\n"
      fi
    ')
  [[ $runtime_plan == false ]]

  bridge_snapshot=$fixture/before-bridge
  install -d "$bridge_snapshot"
  cp -a "$state/backend.sha" "$state/frontend.sha" "$state/postgres-pool-bootstrap.sha" \
    "$legacy_runtime/SOURCE_SHA" "$legacy_runtime/READY" "$legacy_runtime/runtime.sentinel" \
    "$bridge_snapshot/"
  readlink "$runtime_current" > "$bridge_snapshot/runtime-link"
  /usr/bin/env "${environment[@]}" bash "$entrypoint" deploy "$BRIDGE_SHA" >/dev/null
  [[ $(git -C "$integration" rev-parse HEAD) == "$BRIDGE_SHA" ]]
  [[ $(< "$state/control.sha") == "$BRIDGE_SHA" ]]
  cmp -s "$bridge_snapshot/backend.sha" "$state/backend.sha"
  cmp -s "$bridge_snapshot/frontend.sha" "$state/frontend.sha"
  cmp -s "$bridge_snapshot/postgres-pool-bootstrap.sha" \
    "$state/postgres-pool-bootstrap.sha"
  cmp -s "$bridge_snapshot/SOURCE_SHA" "$legacy_runtime/SOURCE_SHA"
  cmp -s "$bridge_snapshot/READY" "$legacy_runtime/READY"
  cmp -s "$bridge_snapshot/runtime.sentinel" "$legacy_runtime/runtime.sentinel"
  [[ $(readlink "$runtime_current") == "$(< "$bridge_snapshot/runtime-link")" ]]
  cmp -s "$installed" "$integration/ops/deploy/social-monitor-production-deploy.sh"

  plan=$(/usr/bin/env "${environment[@]}" bash "$installed" plan "$FINAL_SHA")
  grep -Fx 'frontend=true' <<< "$plan" >/dev/null
  grep -Fx 'backend=true' <<< "$plan" >/dev/null
  grep -Fx 'control=true' <<< "$plan" >/dev/null
  grep -Fx 'x_collector=true' <<< "$plan" >/dev/null
  # shellcheck disable=SC2016
  runtime_plan=$(/usr/bin/env "${environment[@]}" FINAL_SHA="$FINAL_SHA" \
    INSTALLED="$installed" bash -c '
      source "$INSTALLED"
      if component_changed control "$FINAL_SHA" "${RUNTIME_CONTROL_PATHS[@]}"; then
        printf "true\n"
      else
        printf "false\n"
      fi
    ')
  [[ $runtime_plan == true ]]
  for controller_path in "${CONTROLLER_PATHS[@]}"; do
    assert_same_entry "$object_repository" "$BRIDGE_SHA" "$FINAL_SHA" "$controller_path"
    assert_same_entry "$object_repository" "$FINAL_SOURCE_SHA" "$FINAL_SHA" "$controller_path"
  done

  mutation_snapshot=$fixture/before-mutation
  install -d "$mutation_snapshot"
  cp -a "$state/backend.sha" "$state/frontend.sha" "$state/control.sha" \
    "$legacy_runtime/SOURCE_SHA" "$legacy_runtime/READY" "$mutation_snapshot/"
  readlink "$runtime_current" > "$mutation_snapshot/runtime-link"
  git -C "$object_repository" update-ref refs/heads/main "$MUTATED_FINAL_SHA"
  set +e
  /usr/bin/env "${environment[@]}" bash "$installed" deploy \
    "$MUTATED_FINAL_SHA" >"$fixture/mutation.out" 2>&1
  mutation_status=$?
  set -e
  ((mutation_status != 0))
  grep -F 'deploy control changed with runtime assets' "$fixture/mutation.out" >/dev/null
  [[ $(git -C "$integration" rev-parse HEAD) == "$BRIDGE_SHA" ]]
  cmp -s "$mutation_snapshot/backend.sha" "$state/backend.sha"
  cmp -s "$mutation_snapshot/frontend.sha" "$state/frontend.sha"
  cmp -s "$mutation_snapshot/control.sha" "$state/control.sha"
  cmp -s "$mutation_snapshot/SOURCE_SHA" "$legacy_runtime/SOURCE_SHA"
  cmp -s "$mutation_snapshot/READY" "$legacy_runtime/READY"
  [[ $(readlink "$runtime_current") == "$(< "$mutation_snapshot/runtime-link")" ]]

  git -C "$object_repository" update-ref refs/heads/main "$FINAL_SHA"
  failure_snapshot=$fixture/before-failure
  install -d "$failure_snapshot"
  cp -a "$state/backend.sha" "$state/frontend.sha" "$state/control.sha" \
    "$legacy_runtime/SOURCE_SHA" "$legacy_runtime/READY" "$failure_snapshot/"
  readlink "$runtime_current" > "$failure_snapshot/runtime-link"
  set +e
  # shellcheck disable=SC2016
  /usr/bin/env "${environment[@]}" INSTALLED="$installed" FINAL_SHA="$FINAL_SHA" \
    INJECT_BACKEND_FAILURE=true bash -c '
      source "$INSTALLED"
      verify_compose_scope() { :; }
      load_target_reader_summary_publication_deploy_library() { :; }
      sync_control_script() { :; }
      commit_postgres_pool_bootstrap() { :; }
      deploy_frontend() { printf "%s\n" "$1" > "$STATE/frontend.sha"; }
      deploy_backend() { [[ $INJECT_BACKEND_FAILURE != true ]]; }
      deploy_release "$FINAL_SHA"
    ' >"$fixture/failure.out" 2>&1
  failure_status=$?
  set -e
  ((failure_status != 0))
  grep -F 'runtime control were restored' "$fixture/failure.out" >/dev/null
  [[ $(git -C "$integration" rev-parse HEAD) == "$FINAL_SHA" ]]
  cmp -s "$failure_snapshot/backend.sha" "$state/backend.sha"
  cmp -s "$failure_snapshot/frontend.sha" "$state/frontend.sha"
  cmp -s "$failure_snapshot/control.sha" "$state/control.sha"
  cmp -s "$failure_snapshot/SOURCE_SHA" "$legacy_runtime/SOURCE_SHA"
  cmp -s "$failure_snapshot/READY" "$legacy_runtime/READY"
  [[ $(readlink "$runtime_current") == "$(< "$failure_snapshot/runtime-link")" ]]

  # shellcheck disable=SC2016
  /usr/bin/env "${environment[@]}" INSTALLED="$installed" FINAL_SHA="$FINAL_SHA" \
    INJECT_BACKEND_FAILURE=false bash -c '
      source "$INSTALLED"
      verify_compose_scope() { :; }
      load_target_reader_summary_publication_deploy_library() { :; }
      sync_control_script() { :; }
      commit_postgres_pool_bootstrap() { :; }
      deploy_frontend() { printf "%s\n" "$1" > "$STATE/frontend.sha"; }
      deploy_backend() { [[ $INJECT_BACKEND_FAILURE != true ]]; }
      deploy_release "$FINAL_SHA"
    ' >/dev/null
  [[ $(< "$state/backend.sha") == "$FINAL_SHA" ]]
  [[ $(< "$state/frontend.sha") == "$FINAL_SHA" ]]
  [[ $(< "$state/control.sha") == "$FINAL_SHA" ]]
  [[ $(< "$runtime_current/SOURCE_SHA") == "$FINAL_SHA" ]]
  [[ $(< "$runtime_current/READY") == "$FINAL_SHA" ]]
  [[ $(readlink -f "$runtime_current") == \
     "$control/postgres-runtime-releases/$FINAL_SHA" ]]
  cmp -s "$installed" "$integration/ops/deploy/social-monitor-production-deploy.sh"

  printf 'Exact c8/eb9 runtime-control refresh B-to-F transition tests passed\n'
}

case ${1:-} in
  --verify-candidate)
    [[ $# == 2 ]] || bridge_fail '--verify-candidate requires one full SHA'
    verify_bridge_candidate "$PROJECT_ROOT" "$2"
    printf 'exact-runtime-control-refresh-bridge=true\n'
    printf 'bridge-plan backend=false frontend=false control=true runtime=false x_collector=false\n'
    ;;
  '')
    [[ $# == 0 ]] || bridge_fail 'unexpected arguments'
    run_transition_test
    ;;
  *) bridge_fail 'allowed arguments: --verify-candidate SHA' ;;
esac
