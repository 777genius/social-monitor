#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SOURCE_REPO=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/deploy-control-bridge-helper-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo

install -d "$REPO/ops/deploy"
bridge_sources=(
  social-monitor-production-deploy.sh
  deploy-control-lib.sh
  deploy-control-bridge-lib.sh
  postgres-runtime-deploy-lib.sh
  postgres-runtime-weekly-timer-state-lib.sh
  postgres-runtime-daily-c1-readiness-lib.sh
  postgres-runtime-activation-boundary-lib.sh
  reader-summary-recovery-maintenance-lib.sh
  backend-image-rescue-lib.sh
  x-collector-image-deploy-lib.sh
)
for source_name in "${bridge_sources[@]}"; do
  cp "$SCRIPT_DIR/$source_name" "$REPO/ops/deploy/$source_name"
done

git -C "$REPO" init -q
git -C "$REPO" config user.email deploy-control-bridge-test@example.invalid
git -C "$REPO" config user.name deploy-control-bridge-test
git -C "$REPO" add ops/deploy
git -C "$REPO" commit -qm 'test: seed reviewed bridge sources'
reviewed_sha=$(git -C "$REPO" rev-parse HEAD)

fail() {
  printf 'test deploy failure: %s\n' "$*" >&2
  exit 1
}

deploy_control_file_digest() {
  sha256sum "$1" | awk '{print $1}'
}

deploy_control_git_blob_digest() {
  git -C "$REPO" show "$1:$2" | sha256sum | awk '{print $1}'
}

# shellcheck source=ops/deploy/deploy-control-bridge-lib.sh
source "$SCRIPT_DIR/deploy-control-bridge-lib.sh"

assert_fails_with() {
  local expected=$1
  shift
  local error status

  set +e
  error=$("$@" 2>&1)
  status=$?
  set -e
  ((status != 0))
  grep -F "$expected" <<< "$error" >/dev/null
}

restore_helper() {
  cp "$SCRIPT_DIR/${1##*/}" "$REPO/$1"
}

initialize_deploy_control_bridge
[[ -n $DEPLOY_CONTROL_BRIDGE_POSTGRES_WEEKLY_TIMER_HELPER_DIGEST ]]
[[ -n $DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_DIGEST ]]
[[ -n $DEPLOY_CONTROL_BRIDGE_POSTGRES_ACTIVATION_BOUNDARY_HELPER_DIGEST ]]
[[ -n $DEPLOY_CONTROL_BRIDGE_RECOVERY_MAINTENANCE_LIBRARY_DIGEST ]]
verify_deploy_control_bridge_compatibility
verify_deploy_control_bridge_target_compatibility "$reviewed_sha"

sealed_dependencies=(
  ops/deploy/postgres-runtime-weekly-timer-state-lib.sh
  ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh
  ops/deploy/postgres-runtime-activation-boundary-lib.sh
  ops/deploy/reader-summary-recovery-maintenance-lib.sh
)
for dependency in "${sealed_dependencies[@]}"; do
  rm "$REPO/$dependency"
  assert_fails_with 'missing deploy control bridge sources' \
    initialize_deploy_control_bridge
  assert_fails_with 'missing deploy control bridge sources' \
    verify_deploy_control_bridge_compatibility
  restore_helper "$dependency"

  mv "$REPO/$dependency" "$FIXTURE/sealed-dependency-source"
  ln -s "$FIXTURE/sealed-dependency-source" "$REPO/$dependency"
  assert_fails_with 'missing deploy control bridge sources' \
    initialize_deploy_control_bridge
  assert_fails_with 'missing deploy control bridge sources' \
    verify_deploy_control_bridge_compatibility
  rm "$REPO/$dependency"
  mv "$FIXTURE/sealed-dependency-source" "$REPO/$dependency"

  printf '# unreviewed sealed dependency mutation\n' >> "$REPO/$dependency"
  assert_fails_with 'deploy the bridge release first' \
    verify_deploy_control_bridge_compatibility
  restore_helper "$dependency"
done

# Existing bridge dependencies stay sealed alongside the new helpers.
printf '# unreviewed PostgreSQL controller mutation\n' >> \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH"
assert_fails_with 'deploy the bridge release first' \
  verify_deploy_control_bridge_compatibility
cp "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH"

commit_target_state() {
  local message=$1
  git -C "$REPO" add -A
  git -C "$REPO" commit -qm "$message"
  git -C "$REPO" rev-parse HEAD
}

for dependency in "${sealed_dependencies[@]}"; do
  rm "$REPO/$dependency"
  missing_sha=$(commit_target_state 'test: remove sealed runtime helper')
  assert_fails_with 'is not a regular blob at reviewed target' \
    verify_deploy_control_bridge_target_compatibility "$missing_sha"
  restore_helper "$dependency"
  commit_target_state 'test: restore sealed runtime helper' >/dev/null

  mv "$REPO/$dependency" "$FIXTURE/sealed-dependency-source"
  ln -s "$FIXTURE/sealed-dependency-source" "$REPO/$dependency"
  symlink_sha=$(commit_target_state 'test: replace sealed runtime helper with symlink')
  assert_fails_with 'is not a regular blob at reviewed target' \
    verify_deploy_control_bridge_target_compatibility "$symlink_sha"
  rm "$REPO/$dependency"
  mv "$FIXTURE/sealed-dependency-source" "$REPO/$dependency"
  commit_target_state 'test: restore regular sealed runtime helper' >/dev/null

  printf '# changed reviewed target dependency\n' >> "$REPO/$dependency"
  changed_sha=$(commit_target_state 'test: change sealed runtime helper')
  assert_fails_with 'deploy the bridge release first' \
    verify_deploy_control_bridge_target_compatibility "$changed_sha"
  restore_helper "$dependency"
  commit_target_state 'test: restore exact sealed runtime helper' >/dev/null
done

printf '# changed reviewed PostgreSQL controller\n' >> \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH"
changed_postgres_sha=$(commit_target_state 'test: change existing sealed dependency')
assert_fails_with 'deploy the bridge release first' \
  verify_deploy_control_bridge_target_compatibility "$changed_postgres_sha"
cp "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH"
commit_target_state 'test: restore existing sealed dependency' >/dev/null

verify_deploy_control_bridge_compatibility
verify_deploy_control_bridge_target_compatibility "$reviewed_sha"

if declare -F deploy_control_is_reviewed_daily_c1_bridge_transition >/dev/null; then
  printf '# reviewed readiness-only transition\n' >> \
    "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH"
  readiness_parent=$(git -C "$REPO" rev-parse HEAD)
  readiness_sha=$(commit_target_state 'test: readiness-only transition')
  git -C "$REPO" checkout -q "$readiness_parent"
  verify_deploy_control_bridge_target_compatibility "$readiness_sha"

  printf '# reviewed exact bridge transition\n' >> \
    "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH"
  printf '# reviewed exact bridge transition\n' >> \
    "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH"
  reviewed_bridge_parent=$(git -C "$REPO" rev-parse HEAD)
  reviewed_bridge_sha=$(commit_target_state 'test: reviewed exact bridge transition')
  git -C "$REPO" checkout -q "$reviewed_bridge_parent"
  deploy_control_is_reviewed_daily_c1_bridge_transition() {
    [[ $1 == "$reviewed_bridge_parent" && $2 == "$reviewed_bridge_sha" ]]
  }
  verify_deploy_control_bridge_target_compatibility "$reviewed_bridge_sha"
fi

printf 'pinned helper test\n' > \
  "$REPO/$DEPLOY_CONTROL_ROLLING_SUMMARY_HELPER_TEST_PATH"
printf 'pinned RabbitMQ test\n' > \
  "$REPO/$DEPLOY_CONTROL_ROLLING_SUMMARY_RABBITMQ_TEST_PATH"
rolling_final_tree=$(commit_target_state 'test: seed rolling final test assets')
DEPLOY_CONTROL_ROLLING_SUMMARY_FINAL_TREE=$rolling_final_tree
printf '# reviewed rolling admission bridge\n' >> \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_SELF_PATH"
printf 'reviewed helper test\n' > \
  "$REPO/$DEPLOY_CONTROL_ROLLING_SUMMARY_HELPER_TEST_PATH"
printf 'reviewed RabbitMQ test\n' > \
  "$REPO/$DEPLOY_CONTROL_ROLLING_SUMMARY_RABBITMQ_TEST_PATH"
rolling_bridge_sha=$(commit_target_state 'test: rolling admission bridge')
git -C "$REPO" commit --allow-empty -qm 'test: rolling final tree'
rolling_target_sha=$(git -C "$REPO" rev-parse HEAD)
deploy_control_is_reviewed_rolling_summary_transition \
  "$rolling_bridge_sha" "$rolling_target_sha"
git -C "$REPO" checkout -q "$rolling_bridge_sha"
printf 'mutated helper test\n' > \
  "$REPO/$DEPLOY_CONTROL_ROLLING_SUMMARY_HELPER_TEST_PATH"
rolling_mutated_sha=$(commit_target_state 'test: reject changed admitted asset')
if deploy_control_is_reviewed_rolling_summary_transition \
    "$rolling_bridge_sha" "$rolling_mutated_sha"; then
  fail 'rolling transition accepted a target-mutated admitted asset'
fi
git -C "$REPO" checkout -q "$rolling_bridge_sha"
printf 'unreviewed\n' > "$REPO/unreviewed-target-file"
rolling_invalid_sha=$(commit_target_state 'test: reject rolling target drift')
if deploy_control_is_reviewed_rolling_summary_transition \
    "$rolling_bridge_sha" "$rolling_invalid_sha"; then
  fail 'rolling transition accepted target drift outside the pinned final tree'
fi

PRODUCTION_SOURCE_REPO=$FIXTURE/production-source
git clone -q "$SOURCE_REPO" "$PRODUCTION_SOURCE_REPO"
git -C "$PRODUCTION_SOURCE_REPO" config user.email deploy-control-bridge-test@example.invalid
git -C "$PRODUCTION_SOURCE_REPO" config user.name deploy-control-bridge-test
REPO=$PRODUCTION_SOURCE_REPO
production_index_sequence=0

production_new_index() {
  production_index_sequence=$((production_index_sequence + 1))
  printf '%s/production-index-%s\n' "$FIXTURE" "$production_index_sequence"
}

production_tree_with_preserved_bridge_files() {
  local bridge=$1 index entry mode type object path path_from_tree
  index=$(production_new_index)
  GIT_INDEX_FILE=$index git -C "$REPO" read-tree \
    "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_BASE"
  while IFS= read -r path; do
    entry=$(git -C "$REPO" ls-tree "$bridge" -- "$path")
    read -r mode type object path_from_tree <<< "$entry"
    [[ $type == blob && $path_from_tree == "$path" ]] || \
      fail "production bridge preserved path is not a blob: $path"
    GIT_INDEX_FILE=$index git -C "$REPO" update-index \
      --add --cacheinfo "$mode,$object,$path"
  done < <(deploy_control_production_bridge_preserved_paths)
  GIT_INDEX_FILE=$index git -C "$REPO" write-tree
}

production_tree_with_blob() {
  local source=$1 path=$2 contents=$3 mode=${4:-100644} index object
  index=$(production_new_index)
  GIT_INDEX_FILE=$index git -C "$REPO" read-tree "$source"
  object=$(printf '%s\n' "$contents" | git -C "$REPO" hash-object -w --stdin)
  GIT_INDEX_FILE=$index git -C "$REPO" update-index \
    --add --cacheinfo "$mode,$object,$path"
  GIT_INDEX_FILE=$index git -C "$REPO" write-tree
}

production_tree_with_mode() {
  local source=$1 path=$2 mode=$3 index object
  index=$(production_new_index)
  GIT_INDEX_FILE=$index git -C "$REPO" read-tree "$source"
  object=$(git -C "$REPO" rev-parse "$source:$path")
  GIT_INDEX_FILE=$index git -C "$REPO" update-index \
    --add --cacheinfo "$mode,$object,$path"
  GIT_INDEX_FILE=$index git -C "$REPO" write-tree
}

production_single_parent_commit() {
  local tree=$1 parent=$2 message=$3
  printf '%s\n' "$message" | git -C "$REPO" commit-tree "$tree" -p "$parent"
}

production_merge_commit() {
  local tree=$1 first_parent=$2 second_parent=$3 message=$4
  printf '%s\n' "$message" | git -C "$REPO" commit-tree "$tree" \
    -p "$first_parent" -p "$second_parent"
}

production_target_for_bridge() {
  local bridge=$1 tree
  tree=$(production_tree_with_preserved_bridge_files "$bridge")
  production_single_parent_commit "$tree" "$bridge" \
    'test: synthesize production final reapply'
}

production_assert_rejected() {
  local bridge=$1 target=$2 label=$3
  if deploy_control_is_reviewed_production_bridge_transition \
      "$bridge" "$target"; then
    fail "$label was admitted"
  fi
}

production_checkout_release_tip() {
  local head=${1:-}
  local -a ancestry=()
  if [[ -z $head ]]; then
    head=$(git -C "$REPO" rev-parse HEAD)
  fi
  read -r -a ancestry <<< "$(git -C "$REPO" rev-list --parents -n 1 "$head")"
  case ${#ancestry[@]} in
    2) printf '%s\n' "$head" ;;
    3) printf '%s\n' "${ancestry[2]}" ;;
    *) return 1 ;;
  esac
}

production_locate_release_pair() {
  local release_tip=$1
  local -a lineage=()

  mapfile -t lineage < <(git -C "$REPO" rev-list --first-parent --reverse \
    "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_BASE..$release_tip")
  ((${#lineage[@]} > 0)) || return 1
  production_bridge=${lineage[0]}
  deploy_control_is_exact_production_bridge "$production_bridge" || return 1
  if ((${#lineage[@]} == 1)); then
    production_target=$(production_target_for_bridge "$production_bridge")
  else
    production_target=${lineage[1]}
    deploy_control_is_reviewed_production_bridge_transition \
      "$production_bridge" "$production_target" || return 1
  fi
}

release_tip=$(production_checkout_release_tip) || \
  fail 'checkout is neither a direct release commit nor a two-parent PR merge'
production_locate_release_pair "$release_tip" || \
  fail 'release lineage does not begin with the exact bridge and final pair'

deploy_control_is_reviewed_production_bridge_transition \
  "$production_bridge" "$production_target" || \
  fail 'valid production bridge and direct-child final were rejected'
deploy_control_reviewed_transition_matches \
  "$production_bridge" "$production_target" || \
  fail 'production bridge transition is not wired into admission'
production_valid_bridge=$production_bridge
production_valid_target=$production_target

production_pr_merge=$(production_merge_commit \
  "$(git -C "$REPO" rev-parse "$production_valid_bridge^{tree}")" \
  "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_BASE" "$production_valid_bridge" \
  'test: synthesize production bridge PR merge')
production_pr_head=$(production_checkout_release_tip "$production_pr_merge") || \
  fail 'synthetic production PR merge did not expose its PR head'
[[ $production_pr_head == "$production_valid_bridge" ]] || \
  fail 'synthetic production PR merge selected the integration parent'
production_locate_release_pair "$production_pr_head" || \
  fail 'synthetic production PR head did not use release lineage detection'
production_bridge=$production_valid_bridge
production_target=$production_valid_target

production_expected_delta=$(deploy_control_production_bridge_preserved_paths | \
  LC_ALL=C sort)
production_actual_delta=$(git -C "$REPO" diff --name-only --no-renames \
  "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_BASE" "$production_target" -- | \
  LC_ALL=C sort)
[[ $production_actual_delta == "$production_expected_delta" ]] || \
  fail 'production final differs from desired base beyond the two preserved files'
while IFS= read -r path; do
  [[ $(git -C "$REPO" ls-tree "$production_bridge" -- "$path") == \
     $(git -C "$REPO" ls-tree "$production_target" -- "$path") ]] || \
    fail "production final drifted preserved bridge file: $path"
done <<< "$production_expected_delta"

production_classification=$(deploy_control_production_bridge_classification \
  "$production_bridge")
production_expected_classification=$(printf '%s\n' \
  'frontend=false' \
  'backend=false' \
  'x_collector=false' \
  'runtime_control=false' \
  'control=true')
[[ $production_classification == "$production_expected_classification" ]] || \
  fail "unexpected production bridge classification: $production_classification"

production_preflight_repo=$FIXTURE/production-preflight-repo
production_preflight_state=$FIXTURE/production-preflight-state
production_preflight_control=$FIXTURE/production-preflight-control
production_preflight_side_effect=$FIXTURE/production-preflight-side-effect
git clone -q --no-checkout "$PRODUCTION_SOURCE_REPO" "$production_preflight_repo"
git -C "$production_preflight_repo" checkout -q \
  "$DEPLOY_CONTROL_PRODUCTION_INTEGRATION_HEAD"
install -d "$production_preflight_state" "$production_preflight_control"
git -C "$production_preflight_repo" show \
  "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER:ops/deploy/social-monitor-production-deploy.sh" \
  > "$production_preflight_control/github-production-deploy.sh"
git -C "$production_preflight_repo" show \
  "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER:ops/deploy/social-monitor-production-ssh-wrapper.sh" \
  > "$production_preflight_control/github-production-deploy-wrapper.sh"

production_reset_preflight_state() {
  rm -f "$production_preflight_state"/*.sha "$production_preflight_side_effect"
  printf '%s\n' "$DEPLOY_CONTROL_PRODUCTION_FRONTEND_MARKER" > \
    "$production_preflight_state/frontend.sha"
  printf '%s\n' "$DEPLOY_CONTROL_PRODUCTION_BACKEND_MARKER" > \
    "$production_preflight_state/backend.sha"
  printf '%s\n' "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER" > \
    "$production_preflight_state/control.sha"
  printf '%s\n' "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER" > \
    "$production_preflight_state/postgres-pool-bootstrap.sha"
}

postgres_pool_bootstrap_installed() {
  local expected=$1 marker_sha installed_sha wrapper_sha required_path
  [[ -s $STATE/postgres-pool-bootstrap.sha && \
     ! -L $STATE/postgres-pool-bootstrap.sha && \
     -f $CONTROL/github-production-deploy.sh && \
     ! -L $CONTROL/github-production-deploy.sh && \
     -f $CONTROL/github-production-deploy-wrapper.sh && \
     ! -L $CONTROL/github-production-deploy-wrapper.sh ]] || return 1
  marker_sha=$(tr -d '\n' < "$STATE/postgres-pool-bootstrap.sha") || return 1
  [[ $expected == "$DEPLOY_CONTROL_PRODUCTION_INTEGRATION_HEAD" && \
     $marker_sha == "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER" ]] || \
    return 1
  installed_sha=$(git -C "$REPO" hash-object --no-filters \
    "$CONTROL/github-production-deploy.sh") || return 1
  wrapper_sha=$(git -C "$REPO" hash-object --no-filters \
    "$CONTROL/github-production-deploy-wrapper.sh") || return 1
  [[ $installed_sha == \
     $(git -C "$REPO" rev-parse "$marker_sha:ops/deploy/social-monitor-production-deploy.sh") && \
     $wrapper_sha == \
     $(git -C "$REPO" rev-parse "$marker_sha:ops/deploy/social-monitor-production-ssh-wrapper.sh") ]] || \
    return 1
  for required_path in ops/deploy/postgres-runtime-deploy-lib.sh \
    ops/deploy/verify-postgres-runtime-topology.py \
    ops/deploy/production-runtime/compose.postgres-runtime.yml; do
    git -C "$REPO" cat-file -e "$marker_sha:$required_path" 2>/dev/null || \
      return 1
  done
}

# The exact production tree matcher is exercised above. An ordinary deploy is
# forbidden until the reviewed one-shot has committed its journal and receipt;
# the dedicated preinstall fixture below owns the bootstrap and resume matrix.
deploy_control_is_exact_production_bridge() {
  [[ $1 == "$production_valid_bridge" ]]
}

production_run_preflight_lifecycle() {
  verify_production_control_bridge_pre_mutation_state "$production_valid_bridge"
  : > "$production_preflight_side_effect"
}

REPO=$production_preflight_repo
STATE=$production_preflight_state
CONTROL=$production_preflight_control
production_reset_preflight_state
if (production_run_preflight_lifecycle) >/dev/null 2>&1; then
  fail 'ordinary bridge deploy bypassed the reviewed one-shot journal'
fi
[[ ! -e $production_preflight_side_effect && \
   $(git -C "$production_preflight_repo" rev-parse HEAD) == \
   "$DEPLOY_CONTROL_PRODUCTION_INTEGRATION_HEAD" ]] || \
  fail 'ordinary bridge deploy mutated before one-shot completion'

production_assert_preflight_stops_mutation() {
  local label=$1
  rm -f "$production_preflight_side_effect"
  if (trap - EXIT; production_run_preflight_lifecycle) >/dev/null 2>&1; then
    fail "$label production bridge preflight was admitted"
  fi
  [[ ! -e $production_preflight_side_effect ]] || \
    fail "$label production bridge preflight mutated lifecycle state"
}

for production_marker in frontend backend control; do
  production_reset_preflight_state
  rm "$STATE/$production_marker.sha"
  production_assert_preflight_stops_mutation "missing $production_marker marker"

  production_reset_preflight_state
  printf 'malformed\n' > "$STATE/$production_marker.sha"
  production_assert_preflight_stops_mutation "malformed $production_marker marker"

  production_reset_preflight_state
  mv "$STATE/$production_marker.sha" "$STATE/$production_marker.sha.source"
  ln -s "$STATE/$production_marker.sha.source" "$STATE/$production_marker.sha"
  production_assert_preflight_stops_mutation "symlinked $production_marker marker"
  rm "$STATE/$production_marker.sha"
  mv "$STATE/$production_marker.sha.source" "$STATE/$production_marker.sha"

  production_reset_preflight_state
  printf '%s\n' "$DEPLOY_CONTROL_PRODUCTION_INTEGRATION_HEAD" > \
    "$STATE/$production_marker.sha"
  production_assert_preflight_stops_mutation "divergent $production_marker marker"
done

production_reset_preflight_state
printf '%s\n' "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER" > \
  "$STATE/postgres-pool-bootstrap.sha"
production_assert_preflight_stops_mutation 'merely repairable bootstrap marker'

production_reset_preflight_state
rm "$STATE/postgres-pool-bootstrap.sha"
production_assert_preflight_stops_mutation 'missing bootstrap marker'

production_reset_preflight_state
printf 'malformed\n' > "$STATE/postgres-pool-bootstrap.sha"
production_assert_preflight_stops_mutation 'malformed bootstrap marker'

production_reset_preflight_state
mv "$STATE/postgres-pool-bootstrap.sha" \
  "$STATE/postgres-pool-bootstrap.sha.source"
ln -s "$STATE/postgres-pool-bootstrap.sha.source" \
  "$STATE/postgres-pool-bootstrap.sha"
production_assert_preflight_stops_mutation 'symlinked bootstrap marker'
rm "$STATE/postgres-pool-bootstrap.sha"
mv "$STATE/postgres-pool-bootstrap.sha.source" \
  "$STATE/postgres-pool-bootstrap.sha"

production_reset_preflight_state
printf 'drift\n' >> "$CONTROL/github-production-deploy.sh"
production_assert_preflight_stops_mutation 'divergent installed control'
git -C "$REPO" show \
  "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER:ops/deploy/social-monitor-production-deploy.sh" \
  > "$CONTROL/github-production-deploy.sh"

production_reset_preflight_state
rm "$CONTROL/github-production-deploy.sh"
production_assert_preflight_stops_mutation 'missing installed control'
git -C "$REPO" show \
  "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER:ops/deploy/social-monitor-production-deploy.sh" \
  > "$CONTROL/github-production-deploy.sh"

production_reset_preflight_state
mv "$CONTROL/github-production-deploy.sh" \
  "$CONTROL/github-production-deploy.sh.source"
ln -s "$CONTROL/github-production-deploy.sh.source" \
  "$CONTROL/github-production-deploy.sh"
production_assert_preflight_stops_mutation 'symlinked installed control'
rm "$CONTROL/github-production-deploy.sh"
mv "$CONTROL/github-production-deploy.sh.source" \
  "$CONTROL/github-production-deploy.sh"

production_reset_preflight_state
printf 'drift\n' >> "$CONTROL/github-production-deploy-wrapper.sh"
production_assert_preflight_stops_mutation 'divergent installed wrapper'
git -C "$REPO" show \
  "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER:ops/deploy/social-monitor-production-ssh-wrapper.sh" \
  > "$CONTROL/github-production-deploy-wrapper.sh"

production_reset_preflight_state
rm "$CONTROL/github-production-deploy-wrapper.sh"
production_assert_preflight_stops_mutation 'missing installed wrapper'
git -C "$REPO" show \
  "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER:ops/deploy/social-monitor-production-ssh-wrapper.sh" \
  > "$CONTROL/github-production-deploy-wrapper.sh"

production_reset_preflight_state
mv "$CONTROL/github-production-deploy-wrapper.sh" \
  "$CONTROL/github-production-deploy-wrapper.sh.source"
ln -s "$CONTROL/github-production-deploy-wrapper.sh.source" \
  "$CONTROL/github-production-deploy-wrapper.sh"
production_assert_preflight_stops_mutation 'symlinked installed wrapper'
rm "$CONTROL/github-production-deploy-wrapper.sh"
mv "$CONTROL/github-production-deploy-wrapper.sh.source" \
  "$CONTROL/github-production-deploy-wrapper.sh"

production_reset_preflight_state
git -C "$REPO" checkout -q "$DEPLOY_CONTROL_PRODUCTION_INTEGRATION_HEAD^"
production_assert_preflight_stops_mutation 'divergent integration HEAD'
git -C "$REPO" checkout -q "$DEPLOY_CONTROL_PRODUCTION_INTEGRATION_HEAD"

production_reset_preflight_state
unavailable_marker=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
printf '%s\n' "$unavailable_marker" > "$STATE/frontend.sha"
if (trap - EXIT; deploy_control_production_bridge_exact_marker \
    "$STATE/frontend.sha" "$unavailable_marker" frontend) >/dev/null 2>&1; then
  fail 'unavailable production marker commit was admitted'
fi
[[ ! -e $production_preflight_side_effect ]] || \
  fail 'unavailable production marker test mutated lifecycle state'

production_reset_preflight_state
if (trap - EXIT
    deploy_control_is_exact_production_bridge() { return 1; }
    production_run_preflight_lifecycle) >/dev/null 2>&1; then
  fail 'unavailable production bridge authentication was admitted'
fi
[[ ! -e $production_preflight_side_effect ]] || \
  fail 'unavailable bridge authentication mutated lifecycle state'

production_reset_preflight_state
printf 'malformed\n' > "$STATE/backend.sha"
production_lifecycle_side_effect=$FIXTURE/production-lifecycle-side-effect
rm -f "$production_lifecycle_side_effect"
if (trap - EXIT
    DEPLOY_LOCK=$FIXTURE/production-deploy.lock
    POSTGRES_ADMISSION_LOCK=$FIXTURE/postgres-admission.lock
    source "$SCRIPT_DIR/deploy-control-lib.sh"
    load_deploy_control_bridge_library() { :; }
    acquire_postgres_admission_with_daily_priority() { :; }
    fetch_main() { :; }
    validate_main_commit() { :; }
    postgres_pool_atomic_legacy_state() {
      : > "$production_lifecycle_side_effect"
      return 0
    }
    deploy_release "$production_valid_bridge") >/dev/null 2>&1; then
  fail 'deploy lifecycle admitted malformed production bridge pre-state'
fi
[[ ! -e $production_lifecycle_side_effect ]] || \
  fail 'deploy lifecycle reached repair before production bridge preflight'

REPO=$PRODUCTION_SOURCE_REPO

production_extra_tree=$(production_tree_with_blob "$production_target" \
  extra-target 'extra target delta')
production_extra_target=$(production_single_parent_commit \
  "$production_extra_tree" "$production_bridge" 'test: add extra target delta')
production_assert_rejected "$production_bridge" "$production_extra_target" \
  'extra production target delta'

for drift_path in \
  "$DEPLOY_CONTROL_BRIDGE_SELF_PATH" \
  "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_TEST_PATH"; do
  production_drift_tree=$(production_tree_with_blob "$production_target" \
    "$drift_path" 'target bridge-file drift')
  production_drift_target=$(production_single_parent_commit \
    "$production_drift_tree" "$production_bridge" \
    'test: drift production bridge file in target')
  production_assert_rejected "$production_bridge" "$production_drift_target" \
    "target bridge-file drift: $drift_path"
done

production_test_mode=$(git -C "$REPO" ls-tree "$production_target" -- \
  "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_TEST_PATH")
production_test_mode=${production_test_mode%% *}
case $production_test_mode in
  100644) production_drift_mode=100755 ;;
  100755) production_drift_mode=100644 ;;
  *) fail "production bridge test has invalid mode: $production_test_mode" ;;
esac
production_mode_tree=$(production_tree_with_mode "$production_target" \
  "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_TEST_PATH" "$production_drift_mode")
production_mode_target=$(production_single_parent_commit \
  "$production_mode_tree" "$production_bridge" \
  'test: drift production bridge test mode')
production_assert_rejected "$production_bridge" "$production_mode_target" \
  'target bridge test mode drift'

production_wrong_target=$(production_single_parent_commit \
  "$(git -C "$REPO" rev-parse "$production_target^{tree}")" \
  "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_BASE" 'test: use wrong production target parent')
production_assert_rejected "$production_bridge" "$production_wrong_target" \
  'wrong production target parent'

production_merge_target=$(production_merge_commit \
  "$(git -C "$REPO" rev-parse "$production_target^{tree}")" \
  "$production_bridge" "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_BASE" \
  'test: merge production final target')
production_assert_rejected "$production_bridge" "$production_merge_target" \
  'merge production target'

production_wrong_bridge=$(production_single_parent_commit \
  "$(git -C "$REPO" rev-parse "$production_bridge^{tree}")" \
  "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_BASE^" 'test: use wrong production bridge parent')
production_assert_rejected "$production_wrong_bridge" \
  "$(production_target_for_bridge "$production_wrong_bridge")" \
  'wrong production bridge parent'

production_merge_bridge=$(production_merge_commit \
  "$(git -C "$REPO" rev-parse "$production_bridge^{tree}")" \
  "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_BASE" \
  "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_BASE^" 'test: merge production bridge')
production_assert_rejected "$production_merge_bridge" \
  "$(production_target_for_bridge "$production_merge_bridge")" \
  'merge production bridge'

production_future=$(production_single_parent_commit \
  "$(git -C "$REPO" rev-parse "$production_valid_target^{tree}")" \
  "$production_valid_target" 'test: future production descendant')
production_locate_release_pair "$production_future" || \
  fail 'future production descendant did not retain the historical bridge pair'
[[ $production_bridge == "$production_valid_bridge" && \
   $production_target == "$production_valid_target" ]] || \
  fail 'future production descendant resolved the wrong historical bridge pair'

production_pre_bridge_intervening=$(production_single_parent_commit \
  "$(git -C "$REPO" rev-parse \
    "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_BASE^{tree}")" \
  "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_BASE" \
  'test: intervene before production bridge')
production_after_intervening_bridge=$(production_single_parent_commit \
  "$(git -C "$REPO" rev-parse "$production_valid_bridge^{tree}")" \
  "$production_pre_bridge_intervening" \
  'test: production bridge after intervening commit')
production_after_intervening_target=$(production_target_for_bridge \
  "$production_after_intervening_bridge")
if production_locate_release_pair "$production_after_intervening_target"; then
  fail 'intervening commit between production base and bridge was admitted'
fi

production_post_bridge_intervening=$(production_single_parent_commit \
  "$(git -C "$REPO" rev-parse "$production_valid_bridge^{tree}")" \
  "$production_valid_bridge" 'test: intervene before production final')
production_after_final_intervening=$(production_single_parent_commit \
  "$(git -C "$REPO" rev-parse "$production_valid_target^{tree}")" \
  "$production_post_bridge_intervening" \
  'test: production final after intervening commit')
if production_locate_release_pair "$production_after_final_intervening"; then
  fail 'intervening commit between production bridge and final was admitted'
fi
production_bridge=$production_valid_bridge
production_target=$production_valid_target

for production_drift_case in \
  'ops/deploy/deploy-control-lib.sh:helper' \
  'ops/deploy/production-runtime/daily-run.sh:runtime' \
  'ops/deploy/social-monitor-production-deploy.sh:unrelated-sealed'; do
  production_drift_path=${production_drift_case%:*}
  production_drift_label=${production_drift_case##*:}
  production_drift_tree=$(production_tree_with_blob "$production_bridge" \
    "$production_drift_path" \
    "$production_drift_label drift beyond the exact expected bridge tree")
  production_drift_bridge=$(production_single_parent_commit \
    "$production_drift_tree" "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_BASE" \
    "test: reject production $production_drift_label bridge drift")
  production_drift_target=$(production_target_for_bridge \
    "$production_drift_bridge")
  production_assert_rejected "$production_drift_bridge" \
    "$production_drift_target" \
    "$production_drift_label production bridge drift"
done

production_deploy_library_mode=$(git -C "$REPO" ls-tree \
  "$production_bridge" -- "$DEPLOY_CONTROL_BRIDGE_LIBRARY_PATH")
production_deploy_library_mode=${production_deploy_library_mode%% *}
[[ $production_deploy_library_mode == 100644 ]] || \
  fail 'production bridge deploy library does not have its reviewed mode'
production_drift_tree=$(production_tree_with_mode "$production_bridge" \
  "$DEPLOY_CONTROL_BRIDGE_LIBRARY_PATH" 100755)
production_drift_bridge=$(production_single_parent_commit \
  "$production_drift_tree" "$DEPLOY_CONTROL_PRODUCTION_BRIDGE_BASE" \
  'test: reject production deploy library mode drift')
production_drift_target=$(production_target_for_bridge \
  "$production_drift_bridge")
production_assert_rejected "$production_drift_bridge" \
  "$production_drift_target" 'deploy library mode production bridge drift'

printf '%s\n' \
  "$production_classification" \
  'final_tree=desired_base_plus_two_preserved_files'
if [[ -x $SCRIPT_DIR/production-control-bridge-preinstall.test.sh ]]; then
  bash "$SCRIPT_DIR/production-control-bridge-preinstall.test.sh"
fi
printf 'deploy control bridge runtime helper tests passed\n'
