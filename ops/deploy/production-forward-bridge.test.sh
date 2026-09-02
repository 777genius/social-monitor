#!/usr/bin/env bash
set -Eeuo pipefail
((BASH_VERSINFO[0] >= 4)) || { printf 'Bash 4+ is required\n' >&2; exit 1; }

PATH=/usr/local/bin:/usr/bin:/bin
export GIT_AUTHOR_NAME=forward-bridge-test
export GIT_AUTHOR_EMAIL=forward-bridge-test@example.invalid
export GIT_COMMITTER_NAME=$GIT_AUTHOR_NAME
export GIT_COMMITTER_EMAIL=$GIT_AUTHOR_EMAIL
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
P=7c4070f0b9ef1aac130284bcffac50551e20a4dd
M=c5dc5abb12aa1ac84ddbd12f141c6d4d8aca4de2
fixture=$(mktemp -d)
cleanup() { local rc=$?; trap - EXIT; find "$fixture" -depth -delete || :; exit "$rc"; }
trap cleanup EXIT
trap 'printf "forward-bridge-test: failed at line %s\n" "$LINENO" >&2' ERR
repo=$fixture/repo
git -c gc.autoDetach=false clone -q --shared "$PROJECT_ROOT" "$repo"

fail() { printf 'forward-bridge-test: %s\n' "$*" >&2; exit 1; }
expect_failure() {
  local label=$1; shift
  if ("$@") >/dev/null 2>&1; then
    fail "admitted $label"
  fi
}
expect_sigkill() {
  local label=$1 status; shift
  if ("$@") >/dev/null 2>&1; then status=0; else status=$?; fi
  [[ $status == 137 ]] || fail "$label exited with status $status instead of 137"
}
blob_for_source() { git -C "$repo" hash-object -w "$PROJECT_ROOT/$1"; }
entry_mode() {
  local mode
  mode=$(git -C "$PROJECT_ROOT" ls-files -s -- "$1" | awk '{print $1}')
  [[ -n $mode ]] || { [[ -x $PROJECT_ROOT/$1 ]] && mode=100755 || mode=100644; }
  printf '%s\n' "$mode"
}
index_update_source() {
  local index=$1 path=$2 mode blob
  mode=$(entry_mode "$path"); blob=$(blob_for_source "$path")
  GIT_INDEX_FILE=$index git -C "$repo" update-index --add --cacheinfo "$mode,$blob,$path"
}
commit_index() {
  local index=$1 message=$2; shift 2
  local tree args=() parent
  tree=$(GIT_INDEX_FILE=$index git -C "$repo" write-tree)
  for parent in "$@"; do args+=(-p "$parent"); done
  printf '%s\n' "$message" | git -C "$repo" commit-tree "$tree" "${args[@]}"
}

b_paths=(
  ops/deploy/deploy-control-bridge-lib.sh
  ops/deploy/production-forward-bridge-host-lib.sh
  ops/deploy/production-forward-bridge.blobs
  ops/deploy/production-transition-b0-host-control.sh
  ops/deploy/production-transition-marker-lib.sh
)
h_paths=(
  .github/workflows/production-deploy.yml
  package-lock.json
  package.json
  ops/deploy/github-production-deploy-client.sh
  ops/deploy/github-production-deploy-client.test.sh
  ops/deploy/github-production-forward-bridge-client-lib.sh
  ops/deploy/deploy-control-bridge-runtime-helper.test.sh
  ops/deploy/production-forward-bridge-authority.blobs
  ops/deploy/production-forward-bootstrap-marker-resume.test.sh
  ops/deploy/production-forward-bridge.test.sh
  ops/deploy/production-release-b-bridge-order.test.sh
  ops/deploy/production-transition-b0-host-control.test.sh
  ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh
  ops/deploy/social-monitor-production-deploy.test.sh
  ops/deploy/x-collector-image-deploy-lib.test.sh
  scripts/check-review-ci.mjs
)
w_paths=(
  ops/deploy/social-monitor-production-deploy.sh
)

# Reconstruct the immutable topology from source blobs, exactly as the release
# writer does. The checked-in manifest must already commit these final bytes.
b_index=$fixture/b.index
GIT_INDEX_FILE=$b_index git -C "$repo" read-tree "$P"
for path in "${b_paths[@]}"; do index_update_source "$b_index" "$path"; done
B=$(commit_index "$b_index" 'test: immutable predecessor bridge' "$P")
r_index=$fixture/r.index
GIT_INDEX_FILE=$r_index git -C "$repo" read-tree "$M"
for path in "${b_paths[@]}"; do
  read -r mode blob <<< "$(GIT_INDEX_FILE=$b_index git -C "$repo" ls-files -s -- "$path" | awk '{print $1, $2}')"
  GIT_INDEX_FILE=$r_index git -C "$repo" update-index --add --cacheinfo "$mode,$blob,$path"
done
R=$(commit_index "$r_index" 'test: ordered immutable join' "$M" "$B")
w_index=$fixture/w.index
GIT_INDEX_FILE=$w_index git -C "$repo" read-tree "$R"
for path in "${w_paths[@]}"; do index_update_source "$w_index" "$path"; done
W=$(commit_index "$w_index" 'test: reviewed rolling entrypoint bridge' "$R")
h_index=$fixture/h.index
GIT_INDEX_FILE=$h_index git -C "$repo" read-tree "$W"
for path in "${h_paths[@]}"; do index_update_source "$h_index" "$path"; done
H=$(commit_index "$h_index" 'test: reviewed forward payload' "$W")
F=$(printf '%s\n' 'test: synthetic protected-main merge' | \
  git -C "$repo" commit-tree "$H^{tree}" -p "$M" -p "$H")
D1=$(printf '%s\n' 'test: descendant one' | git -C "$repo" commit-tree "$F^{tree}" -p "$F")
D2=$(printf '%s\n' 'test: descendant two' | git -C "$repo" commit-tree "$D1^{tree}" -p "$D1")

GITHUB_WORKSPACE=$repo
# shellcheck disable=SC2034 # Consumed by the dynamically sourced deploy client.
DEPLOY_SSH_DIRECTORY=$fixture/ssh
# shellcheck source=ops/deploy/github-production-deploy-client.sh
source "$SCRIPT_DIR/github-production-deploy-client.sh"
verify_production_forward_target_identity "$F"
verify_production_forward_target_identity "$H"
verify_production_forward_target_identity "$D1"
verify_production_forward_target_identity "$D2"
[[ $(production_forward_anchor_for_target "$D2") == "$F" ]]
REPO=$repo
# shellcheck source=ops/deploy/production-forward-bridge-host-lib.sh
source "$SCRIPT_DIR/production-forward-bridge-host-lib.sh"
production_forward_verify_target_graph "$B" "$F"
production_forward_verify_target_graph "$B" "$H"
printf 'forward-bridge-test: exact topology accepted\n'

target_diagnostic=$( (
  capture_plan() { return 23; }
  prepare_production_forward_bridge "$F"
) 2>&1) && fail 'client accepted failed target capture_plan'
[[ $target_diagnostic == *'target plan failed with status 23'* ]] || \
  fail "client lost target capture_plan status: $target_diagnostic"
bridge_diagnostic=$( (
  capture_calls=0
  capture_plan() {
    ((capture_calls += 1))
    if ((capture_calls == 2)); then return 23; fi
    PLAN_FRONTEND=true PLAN_BACKEND=true PLAN_CONTROL=true PLAN_X_COLLECTOR=false
    PLAN_BACKEND_BASE=$P PLAN_POSTGRES_POOL_BOOTSTRAP=postgres-pool-v1
    PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=$PRODUCTION_FORWARD_POOL_SHA
    PLAN_POSTGRES_POOL_REPAIR=false
  }
  print_plan() { :; }
  prepare_production_forward_bridge "$F"
) 2>&1) && fail 'client accepted failed bridge capture_plan'
[[ $bridge_diagnostic == *'bridge plan failed with status 23'* ]] || \
  fail "client lost bridge capture_plan status: $bridge_diagnostic"
printf 'forward-bridge-test: capture_plan statuses preserved\n'

# Manifest-owned H commitments reject same-mode substitution at both
# boundaries. The executing client is deliberately outside the B manifest to
# avoid manifest -> client -> seal -> manifest circular pinning; protected H
# review owns that byte. The seal itself is pinned directly by the client.
for path in "${h_paths[@]}"; do
  [[ $path != ops/deploy/github-production-forward-bridge-client-lib.sh ]] || continue
  bad_index=$fixture/bad-h.index
  GIT_INDEX_FILE=$bad_index git -C "$repo" read-tree "$H"
  bad_blob=$(printf 'same-mode substitution for %s\n' "$path" | git -C "$repo" hash-object -w --stdin)
  mode=$(entry_mode "$path")
  GIT_INDEX_FILE=$bad_index git -C "$repo" update-index --cacheinfo "$mode,$bad_blob,$path"
  BAD_H=$(commit_index "$bad_index" 'test: substituted H blob' "$W")
  BAD_F=$(printf '%s\n' 'test: substituted F' | git -C "$repo" commit-tree "$BAD_H^{tree}" -p "$M" -p "$BAD_H")
  expect_failure "client same-mode substitution: $path" verify_production_forward_target_identity "$BAD_F"
  if [[ $path != ops/deploy/production-forward-bridge-authority.blobs ]]; then
    expect_failure "host same-mode substitution: $path" \
      production_forward_verify_target_graph "$B" "$BAD_F"
  fi
done
printf 'forward-bridge-test: H substitutions rejected\n'

# Added, deleted, renamed, symlinked, and mode-drifted H entries fail closed.
mutate_h_and_reject() {
  local label=$1 mode=$2 blob=$3 path=$4 remove=${5:-}
  local index=$fixture/mutate.index bad_h bad_f
  GIT_INDEX_FILE=$index git -C "$repo" read-tree "$H"
  if [[ $remove == remove ]]; then
    GIT_INDEX_FILE=$index git -C "$repo" update-index --force-remove "$path"
  else
    GIT_INDEX_FILE=$index git -C "$repo" update-index --add --cacheinfo "$mode,$blob,$path"
  fi
  bad_h=$(commit_index "$index" "test: $label" "$W")
  bad_f=$(printf '%s\n' "test: $label F" | git -C "$repo" commit-tree "$bad_h^{tree}" -p "$M" -p "$bad_h")
  expect_failure "$label client" verify_production_forward_target_identity "$bad_f"
  expect_failure "$label host" production_forward_verify_target_graph "$B" "$bad_f"
}
payload=$(printf 'payload\n' | git -C "$repo" hash-object -w --stdin)
mutate_h_and_reject added 100644 "$payload" ops/deploy/forward-extra
mutate_h_and_reject deleted 100644 "$payload" "${h_paths[0]}" remove
mutate_h_and_reject renamed 100644 "$payload" ops/deploy/renamed-forward-client
mutate_h_and_reject symlinked 120000 "$payload" "${h_paths[1]}"
printf 'forward-bridge-test: H shape drift rejected\n'

# Even if a malformed seal blob were reviewed and pinned, its parser must
# reject every path-set, ordering, mode, and object-identity ambiguity. Keep
# these graphs for the fresh installed-B0 checks below as well.
mapfile -t seal_lines < "$PROJECT_ROOT/ops/deploy/production-forward-bridge-authority.blobs"
bad_seal_fs=()
bad_seal_labels=()
build_bad_seal_graph() {
  local label=$1 tree_mode=$2 object=$3 index=$fixture/bad-seal.index bad_h bad_f
  GIT_INDEX_FILE=$index git -C "$repo" read-tree "$H"
  GIT_INDEX_FILE=$index git -C "$repo" update-index --cacheinfo \
    "$tree_mode,$object,ops/deploy/production-forward-bridge-authority.blobs"
  bad_h=$(commit_index "$index" "test: malformed seal $label" "$W")
  bad_f=$(printf '%s\n' "test: malformed seal F $label" | \
    git -C "$repo" commit-tree "$bad_h^{tree}" -p "$M" -p "$bad_h")
  expect_failure "malformed authority seal: $label" env GITHUB_WORKSPACE="$repo" \
    bash -Eeuo pipefail -c '
      fail() { exit 1; }
      source "$0/github-production-forward-bridge-client-lib.sh"
      PRODUCTION_FORWARD_AUTHORITY_SEAL_BLOB=$1
      verify_production_forward_target_identity "$2"
    ' "$SCRIPT_DIR" "$object" "$bad_f"
  bad_seal_labels+=("$label"); bad_seal_fs+=("$bad_f")
}
seal_blob_from_text() { printf '%s' "$1" | git -C "$repo" hash-object -w --stdin; }
printf -v valid_seal '%s\n' "${seal_lines[@]}"
printf -v missing_seal '%s\n' "${seal_lines[@]:0:4}"
extra_seal=$valid_seal$'100644 0000000000000000000000000000000000000000 ops/deploy/z-extra\n'
printf -v duplicate_seal '%s\n' "${seal_lines[0]}" "${seal_lines[0]}" \
  "${seal_lines[@]:1}"
printf -v unsorted_seal '%s\n' "${seal_lines[1]}" "${seal_lines[0]}" \
  "${seal_lines[@]:2}"
printf -v wrong_mode_seal '%s\n' "${seal_lines[0]/100644/100755}" \
  "${seal_lines[@]:1}"
first_blob=$(awk '{print $2}' <<< "${seal_lines[0]}")
uppercase_seal=${valid_seal/$first_blob/${first_blob^^}}
short_seal=${valid_seal/$first_blob/${first_blob:0:39}}
wrong_blob_seal=${valid_seal/$first_blob/0000000000000000000000000000000000000000}
no_newline_seal=${valid_seal%$'\n'}
leading_space_seal=' '${valid_seal}
trailing_space_seal=${valid_seal/$'\n'/$' \n'}
tab_seal=${valid_seal/ /$'\t'}
double_space_seal=${valid_seal/ /'  '}
crlf_seal=${valid_seal//$'\n'/$'\r\n'}
malformed_names=(missing extra duplicate unsorted wrong_mode uppercase short wrong_blob no_newline
  leading_space trailing_space tab double_space crlf)
malformed_seals=("$missing_seal" "$extra_seal" "$duplicate_seal" "$unsorted_seal"
  "$wrong_mode_seal" "$uppercase_seal" "$short_seal" "$wrong_blob_seal" "$no_newline_seal"
  "$leading_space_seal" "$trailing_space_seal" "$tab_seal" "$double_space_seal" "$crlf_seal")
for index in "${!malformed_names[@]}"; do
  object=$(seal_blob_from_text "${malformed_seals[index]}")
  build_bad_seal_graph "${malformed_names[index]}" 100644 "$object"
done
build_bad_seal_graph symlink 120000 "$payload"
build_bad_seal_graph non_regular 160000 "$P"
printf 'forward-bridge-test: malformed authority seals rejected by client\n'

# R must carry every B-owned byte exactly; no helper, manifest, host-control,
# or bridge-policy substitution can hide behind an allowlisted path.
for path in "${b_paths[@]}"; do
  bad_r_index=$fixture/bad-r.index
  GIT_INDEX_FILE=$bad_r_index git -C "$repo" read-tree "$R"
  GIT_INDEX_FILE=$bad_r_index git -C "$repo" update-index --cacheinfo "100644,$payload,$path"
  BAD_R=$(commit_index "$bad_r_index" 'test: substituted B-owned R entry' "$M" "$B")
  bad_w_index=$fixture/bad-r-w.index
  GIT_INDEX_FILE=$bad_w_index git -C "$repo" read-tree "$BAD_R"
  for w_path in "${w_paths[@]}"; do index_update_source "$bad_w_index" "$w_path"; done
  BAD_W=$(commit_index "$bad_w_index" 'test: W over substituted R' "$BAD_R")
  bad_h_index=$fixture/bad-r-h.index
  GIT_INDEX_FILE=$bad_h_index git -C "$repo" read-tree "$BAD_W"
  for h_path in "${h_paths[@]}"; do index_update_source "$bad_h_index" "$h_path"; done
  BAD_H=$(commit_index "$bad_h_index" 'test: H over substituted R' "$BAD_W")
  BAD_F=$(printf '%s\n' 'test: F over substituted R' | git -C "$repo" commit-tree "$BAD_H^{tree}" -p "$M" -p "$BAD_H")
  expect_failure "substituted B-owned R entry: $path" production_forward_verify_target_graph "$B" "$BAD_F"
done
printf 'forward-bridge-test: B-owned R substitutions rejected\n'

# A sibling branch with the same parent counts, order, path set, and modes is
# not the reviewed bridge. Its substituted B0 byte disagrees with the immutable
# B manifest and must fail even though the surrounding topology looks alike.
attacker_sentinel=$fixture/attacker-ran
attacker_blob=$(printf 'production_forward_verify_target_graph() { : > "%s"; }\n' \
  "$attacker_sentinel" | git -C "$repo" hash-object -w --stdin)
sibling_fs=()
sibling_labels=()
for substituted_path in \
  ops/deploy/deploy-control-bridge-lib.sh \
  ops/deploy/production-forward-bridge-host-lib.sh \
  ops/deploy/production-forward-bridge.blobs \
  ops/deploy/production-transition-b0-host-control.sh; do
  rm -f "$attacker_sentinel"
  sibling_b_index=$fixture/sibling-b.index
  GIT_INDEX_FILE=$sibling_b_index git -C "$repo" read-tree "$B"
  GIT_INDEX_FILE=$sibling_b_index git -C "$repo" update-index --cacheinfo \
    "100644,$attacker_blob,$substituted_path"
  SIBLING_B=$(commit_index "$sibling_b_index" 'test: attacker sibling B' "$P")
  sibling_r_index=$fixture/sibling-r.index
  GIT_INDEX_FILE=$sibling_r_index git -C "$repo" read-tree "$M"
  for path in "${b_paths[@]}"; do
    read -r mode blob <<< "$(GIT_INDEX_FILE=$sibling_b_index git -C "$repo" \
      ls-files -s -- "$path" | awk '{print $1, $2}')"
    GIT_INDEX_FILE=$sibling_r_index git -C "$repo" update-index --add \
      --cacheinfo "$mode,$blob,$path"
  done
  SIBLING_R=$(commit_index "$sibling_r_index" 'test: attacker sibling R' "$M" "$SIBLING_B")
  sibling_w_index=$fixture/sibling-w.index
  GIT_INDEX_FILE=$sibling_w_index git -C "$repo" read-tree "$SIBLING_R"
  for path in "${w_paths[@]}"; do index_update_source "$sibling_w_index" "$path"; done
  SIBLING_W=$(commit_index "$sibling_w_index" 'test: attacker sibling W' "$SIBLING_R")
  sibling_h_index=$fixture/sibling-h.index
  GIT_INDEX_FILE=$sibling_h_index git -C "$repo" read-tree "$SIBLING_W"
  for path in "${h_paths[@]}"; do index_update_source "$sibling_h_index" "$path"; done
  SIBLING_H=$(commit_index "$sibling_h_index" 'test: attacker sibling H' "$SIBLING_W")
  SIBLING_F=$(printf '%s\n' sibling-f | git -C "$repo" commit-tree \
    "$SIBLING_H^{tree}" -p "$M" -p "$SIBLING_H")
  expect_failure "client attacker sibling substitution: $substituted_path" \
    verify_production_forward_target_identity "$SIBLING_F"
  [[ ! -e $attacker_sentinel ]] || fail "attacker function ran: $substituted_path"
  sibling_labels+=("$substituted_path"); sibling_fs+=("$SIBLING_F")
done
printf 'forward-bridge-test: attacker sibling authorities rejected before execution\n'

# Parent order, parent count, and final-tree identity are exact.
WRONG_F=$(printf '%s\n' wrong-order | git -C "$repo" commit-tree "$H^{tree}" -p "$H" -p "$M")
WRONG_ORDER_F=$WRONG_F
expect_failure 'wrong F parent order' production_forward_verify_target_graph "$B" "$WRONG_F"
WRONG_F=$(printf '%s\n' wrong-tree | git -C "$repo" commit-tree "$M^{tree}" -p "$M" -p "$H")
expect_failure 'wrong F tree' production_forward_verify_target_graph "$B" "$WRONG_F"
EXTRA_H=$(printf '%s\n' extra-parent | git -C "$repo" commit-tree "$H^{tree}" -p "$W" -p "$P")
WRONG_F=$(printf '%s\n' extra-parent-f | git -C "$repo" commit-tree "$EXTRA_H^{tree}" -p "$M" -p "$EXTRA_H")
expect_failure 'extra H parent' production_forward_verify_target_graph "$B" "$WRONG_F"
WRONG_R=$(printf '%s\n' wrong-r-order | git -C "$repo" commit-tree "$R^{tree}" -p "$B" -p "$M")
WRONG_W=$(printf '%s\n' wrong-r-w | git -C "$repo" commit-tree "$W^{tree}" -p "$WRONG_R")
WRONG_H=$(printf '%s\n' wrong-r-h | git -C "$repo" commit-tree "$H^{tree}" -p "$WRONG_W")
WRONG_F=$(printf '%s\n' wrong-r-f | git -C "$repo" commit-tree "$WRONG_H^{tree}" -p "$M" -p "$WRONG_H")
expect_failure 'wrong R parent order' production_forward_verify_target_graph "$B" "$WRONG_F"
WRONG_W=$(printf '%s\n' wrong-w-delta | git -C "$repo" commit-tree "$R^{tree}" -p "$R")
WRONG_H=$(printf '%s\n' wrong-w-h | git -C "$repo" commit-tree "$H^{tree}" -p "$WRONG_W")
WRONG_F=$(printf '%s\n' wrong-w-f | git -C "$repo" commit-tree "$WRONG_H^{tree}" -p "$M" -p "$WRONG_H")
expect_failure 'wrong W delta' production_forward_verify_target_graph "$B" "$WRONG_F"
printf 'forward-bridge-test: topology mutations rejected\n'

# Replacement refs cannot redirect any trusted topology read.
replacement=$(printf '%s\n' replacement | git -C "$repo" commit-tree "$M^{tree}" -p "$P")
for object in "$P" "$M" "$B" "$R" "$W" "$H" "$F"; do
  git -C "$repo" replace "$object" "$replacement"
done
production_forward_verify_target_graph "$B" "$F"
verify_production_forward_target_identity "$F"
git -C "$repo" replace -d "$P" "$M" "$B" "$R" "$W" "$H" "$F" >/dev/null
mapfile -t committed_blobs < <(awk 'NR > 1 {print $3}' \
  "$PROJECT_ROOT/ops/deploy/production-forward-bridge.blobs")
for object in "${committed_blobs[@]}"; do
  git -C "$repo" replace "$object" "$payload"
done
production_forward_verify_target_graph "$B" "$F"
verify_production_forward_target_identity "$F"
git -C "$repo" replace -d "${committed_blobs[@]}" >/dev/null
printf 'forward-bridge-test: replacement refs ignored\n'

# No payload may predict or self-pin any future topology identity.
for path in "${h_paths[@]}" "${w_paths[@]}"; do
  for identity in "$B" "$R" "$W" "$H" "$F"; do
    if grep -F "$identity" "$PROJECT_ROOT/$path" >/dev/null; then
      fail "future topology identity appears in H payload: $path"
    fi
  done
done
printf 'forward-bridge-test: H payload is future-ID-free\n'

# First-parent walks are bounded and fail closed beyond the conservative cap.
deep=$F
for _ in $(seq 1 257); do
  deep=$(printf '%s\n' deep | git -C "$repo" commit-tree "$F^{tree}" -p "$deep")
done
expect_failure 'over-limit first-parent descendant' verify_production_forward_target_identity "$deep"
printf 'forward-bridge-test: bounded walk enforced\n'

# Once F is durably represented by the backend/bootstrap markers, an ordinary
# first-parent descendant remains in the normal pipeline even when its own
# frontend, backend, and control work is pending.
POSTGRES_POOL_BOOTSTRAP_VERSION=postgres-pool-v1
(
  capture_plan() {
    PLAN_FRONTEND=true PLAN_BACKEND=true PLAN_CONTROL=true PLAN_X_COLLECTOR=false
    PLAN_BACKEND_BASE=$F
    PLAN_POSTGRES_POOL_BOOTSTRAP=$POSTGRES_POOL_BOOTSTRAP_VERSION
    PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=$F
    PLAN_POSTGRES_POOL_REPAIR=false
  }
  print_plan() { :; }
  deploy_once() { fail 'pending descendant attempted bridge deployment'; }
  prepare_production_forward_bridge "$D1"
)
printf 'forward-bridge-test: pending descendant admitted to normal pipeline\n'

# Only the four approved marker phases are admitted; maintenance never is.
POSTGRES_POOL_BOOTSTRAP_VERSION=postgres-pool-v1
# shellcheck disable=SC2034 # Consumed by the sourced forward plan predicate.
PLAN_X_COLLECTOR=false PLAN_POSTGRES_POOL_BOOTSTRAP=$POSTGRES_POOL_BOOTSTRAP_VERSION
# shellcheck disable=SC2034 # Consumed by the sourced forward plan predicate.
PLAN_POSTGRES_POOL_REPAIR=false PLAN_BACKEND_BASE=$P PLAN_FRONTEND=true
PLAN_BACKEND=true PLAN_CONTROL=true PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=$B
plan_is_approved_production_forward_handoff "$F" "$B"
PLAN_CONTROL=false
expect_failure 'impossible pending-backend plan' plan_is_approved_production_forward_handoff "$F" "$B"
CONTROL=$fixture/control STATE=$fixture/state
install -d "$CONTROL" "$STATE"
action=maintenance
expect_failure 'maintenance forward handoff' production_forward_require_exact_handoff "$B" "$F" maintenance

# The predecessor installer is idempotent at every atomic boundary. Missing
# destinations are installed, uniquely named crash orphans are ignored, and a
# retry after each injected before/after-rename crash completes the full set in
# admission/canonical/host-control order.
assert_installed_blob() {
  local commit=$1 relative=$2 destination blob
  destination=$CONTROL/${relative##*/}
  blob=$(git -C "$repo" rev-parse "$commit:$relative")
  [[ -f $destination && ! -L $destination && \
     $(git -C "$repo" hash-object --no-filters "$destination") == "$blob" ]]
}
reset_b0_destinations() {
  find "$CONTROL" -mindepth 1 -maxdepth 1 -type f -delete
  find "$CONTROL" -mindepth 1 -maxdepth 1 -type l -delete
}
# The failpoint argument is optional for the normal installation path.
# shellcheck disable=SC2120
run_b0_install() (
  export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
  export PRODUCTION_FORWARD_INSTALL_FAILPOINT=${1:-}
  production_forward_install_b0_before_entrypoint "$F"
)
git -C "$repo" checkout -q "$B"
git -C "$repo" update-ref refs/remotes/origin/main "$F"
export DEPLOY_CONTROL_BRIDGE_INITIALIZED_HEAD=$B
action=deploy
b0_files=(
  production-transition-admission.sh
  production-transition-canonical-lib.sh
  production-transition-b0-host-control.sh
)
for b0_file in "${b0_files[@]}"; do
  for side in before after; do
    reset_b0_destinations
    : > "$CONTROL/.production-forward-$b0_file.orphan"
    expect_failure "$side $b0_file rename crash" run_b0_install "$side-$b0_file-rename"
    run_b0_install
    assert_installed_blob "$F" ops/deploy/production-transition-admission.sh
    assert_installed_blob "$F" ops/deploy/production-transition-canonical-lib.sh
    assert_installed_blob "$B" ops/deploy/production-transition-b0-host-control.sh
  done
done
printf 'forward-bridge-test: B0 rename crashes resume\n'

# Existing unsafe destinations never get treated as crash orphans. Exercise
# byte, symlink, mode, and (when privileged) ownership drift independently.
for drift in bytes symlink mode owner; do
  reset_b0_destinations
  destination=$CONTROL/production-transition-admission.sh
  case $drift in
    bytes) printf 'wrong\n' > "$destination"; chmod 0755 "$destination" ;;
    symlink) ln -s /dev/null "$destination" ;;
    mode)
      git -C "$repo" show "$F:ops/deploy/production-transition-admission.sh" > "$destination"
      chmod 0644 "$destination"
      ;;
    owner)
      ((EUID == 0)) || continue
      git -C "$repo" show "$F:ops/deploy/production-transition-admission.sh" > "$destination"
      chmod 0755 "$destination"
      if ! chown 65534:65534 "$destination" 2>/dev/null; then
        rm -f "$destination"
        continue
      fi
      ;;
  esac
  expect_failure "unsafe B0 $drift destination" run_b0_install
done
reset_b0_destinations
run_b0_install

# A predecessor-started process loads no test-defined host helper. It installs
# and sources the reviewed B0 authority before the fast-forward failpoint. The
# retry is a separate fresh shell starting with HEAD=F.
run_advance_process() {
  local initialized=$1 failpoint=${2:-}
  REPO=$repo CONTROL=$CONTROL STATE=$STATE SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
    DEPLOY_CONTROL_BRIDGE_INITIALIZED_HEAD=$initialized action=deploy \
    PRODUCTION_TRANSITION_HOST_FAILPOINT=$failpoint TARGET=$F \
    bash -Eeuo pipefail -c '
      fail() { printf "fresh-forward-process: %s\n" "$*" >&2; exit 1; }
      source "$0/production-forward-bridge-host-lib.sh"
      source "$0/deploy-control-bridge-lib.sh"
      advance_integration "$TARGET"
    ' "$SCRIPT_DIR"
}
expect_failure 'fresh-process crash after integration advance' \
  run_advance_process "$B" forward-integration-advanced
[[ $(git -C "$repo" rev-parse HEAD) == "$F" ]]
for path in "${b0_files[@]}"; do [[ -f $CONTROL/$path ]]; done
run_advance_process "$F"
printf 'forward-bridge-test: B0 precedes integration advance\n'

# Materialize the committed F entrypoint and wrapper, then require the narrow
# host handoff for each permitted action. Current, origin/main, marker, or byte
# drift and every maintenance action remain outside the exception.
git -C "$repo" show "$F:ops/deploy/social-monitor-production-deploy.sh" > \
  "$CONTROL/github-production-deploy.sh"
git -C "$repo" show "$F:ops/deploy/social-monitor-production-ssh-wrapper.sh" > \
  "$CONTROL/github-production-deploy-wrapper.sh"
printf '%s\n' "$B" > "$STATE/control.sha"
printf '%s\n' "$B" > "$STATE/postgres-pool-bootstrap.sha"
for handoff_action in plan upload deploy; do
  production_forward_require_exact_handoff "$B" "$F" "$handoff_action"
done
# Reproduce the post-fast-forward recovery in a genuinely fresh shell. The
# installed B0 derives canonical F/H/B without brittle rev syntax, anchors the
# H authority to trusted B, and only then permits each narrow action.
run_fresh_host_handoff() {
  local candidate=$1 handoff_action=${2:-plan}
  git -C "$repo" checkout -q "$candidate"
  git -C "$repo" update-ref refs/remotes/origin/main "$candidate"
  REPO=$repo CONTROL=$CONTROL STATE=$STATE SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
    SOCIAL_MONITOR_DEPLOY_TEST_A0=$P TARGET=$candidate HANDOFF_ACTION=$handoff_action \
    bash -Eeuo pipefail -c '
      fail() { printf "fresh-host-handoff: %s\n" "$*" >&2; exit 1; }
      fetch_main() { :; }
      validate_main_commit() { [[ $1 == "$TARGET" ]]; }
      source "$CONTROL/production-transition-b0-host-control.sh"
      production_transition_host_try_forward_handoff "$HANDOFF_ACTION" "$TARGET"
    '
}
for index in "${!bad_seal_fs[@]}"; do
  expect_failure "fresh host malformed seal: ${bad_seal_labels[index]}" \
    run_fresh_host_handoff "${bad_seal_fs[index]}"
  [[ ! -e $attacker_sentinel ]] || \
    fail "malformed seal executed attacker code: ${bad_seal_labels[index]}"
done
for index in "${!sibling_fs[@]}"; do
  expect_failure "fresh host coherent sibling: ${sibling_labels[index]}" \
    run_fresh_host_handoff "${sibling_fs[index]}"
  [[ ! -e $attacker_sentinel ]] || \
    fail "coherent sibling executed attacker code: ${sibling_labels[index]}"
done
for recovery_target in "$H" "$F" "$D1" "$D2"; do
  for handoff_action in plan upload deploy; do
    run_fresh_host_handoff "$recovery_target" "$handoff_action"
  done
done
for rejected_target in "$WRONG_ORDER_F" "$WRONG_F" "$SIBLING_F" "$deep"; do
  expect_failure "fresh host rejected unsafe graph $rejected_target" \
    run_fresh_host_handoff "$rejected_target"
done
git -C "$repo" checkout -q "$F"
git -C "$repo" update-ref refs/remotes/origin/main "$F"
printf 'forward-bridge-test: fresh host H/F/D1/D2 recovery bounded\n'

# A real SIGKILL cannot run cleanup. The kernel must release the predecessor
# lock, and a genuinely fresh process must acquire and validate the same path.
run_killed_host_lock_holder() {
  STATE=$STATE CONTROL=$CONTROL bash -Eeuo pipefail -c '
    fail() { exit 1; }
    source "$CONTROL/production-transition-b0-host-control.sh"
    production_transition_host_acquire_lock
    kill -KILL "$BASHPID"
  '
}
run_fresh_host_lock_reacquire() {
  STATE=$STATE CONTROL=$CONTROL timeout 10 bash -Eeuo pipefail -c '
    fail() { exit 1; }
    source "$CONTROL/production-transition-b0-host-control.sh"
    production_transition_host_acquire_lock
    production_transition_host_release_lock
  '
}
expect_sigkill 'predecessor host lock holder' run_killed_host_lock_holder
run_fresh_host_lock_reacquire
expect_failure 'fake inherited host lock descriptor' env \
  STATE="$STATE" CONTROL="$CONTROL" PRODUCTION_TRANSITION_HOST_LOCK_FD=99 \
  PRODUCTION_TRANSITION_HOST_LOCK_OWNER=1 bash -Eeuo pipefail -c '
    fail() { exit 1; }
    source "$CONTROL/production-transition-b0-host-control.sh"
    production_transition_host_acquire_lock
  '
run_coherent_unlocked_host_descriptor() (
  fail() { exit 1; }
  source "$CONTROL/production-transition-b0-host-control.sh"
  exec {fake_fd}<>"$STATE/production-transition-b0-host.lock"
  # shellcheck disable=SC2034 # consumed by the sourced host-control library
  PRODUCTION_TRANSITION_HOST_LOCK_FD=$fake_fd
  PRODUCTION_TRANSITION_HOST_LOCK_OWNER=$BASHPID
  # shellcheck disable=SC2034 # consumed by the sourced host-control library
  PRODUCTION_TRANSITION_HOST_LOCK_ACTIVE=$BASHPID:$fake_fd
  production_transition_host_acquire_lock
)
expect_failure 'coherent unlocked host lock descriptor' \
  run_coherent_unlocked_host_descriptor
run_inherited_host_release() (
  local lock=$STATE/production-transition-b0-host.lock
  fail() { exit 1; }
  source "$CONTROL/production-transition-b0-host-control.sh"
  production_transition_host_acquire_lock
  (
    # shellcheck disable=SC2034 # consumed by the sourced host-control library
    PRODUCTION_TRANSITION_HOST_LOCK_OWNER=$BASHPID
    production_transition_host_release_lock
  )
  if flock -n "$lock" -c true; then
    fail 'inherited host release unlocked the live holder'
  fi
  production_transition_host_release_lock
)
run_inherited_host_release
descendant_pid_file=$fixture/host-lock-descendant.pid
descendant_release=$fixture/host-lock-descendant.release
mkfifo "$descendant_release"
run_killed_host_owner_with_descendant() {
  STATE=$STATE CONTROL=$CONTROL DESCENDANT_PID_FILE=$descendant_pid_file \
    DESCENDANT_RELEASE=$descendant_release \
    bash -Eeuo pipefail -c '
      fail() { exit 1; }
      source "$CONTROL/production-transition-b0-host-control.sh"
      production_transition_host_acquire_lock
      { read -r < "$DESCENDANT_RELEASE"; } &
      printf "%s\n" "$!" > "$DESCENDANT_PID_FILE"
      kill -KILL "$BASHPID"
    '
}
expect_sigkill 'host lock owner with live descendant' \
  run_killed_host_owner_with_descendant
[[ -s $descendant_pid_file ]]
if flock -n "$STATE/production-transition-b0-host.lock" -c true; then
  fail 'owner SIGKILL released a lock retained by its live descendant'
fi
printf '\n' > "$descendant_release"
flock -w 5 "$STATE/production-transition-b0-host.lock" -c true
printf 'forward-bridge-test: SIGKILL 137 host lock reacquired by fresh process\n'
for denied_action in maintenance maintenance-status deploy-transition; do
  expect_failure "denied $denied_action handoff" \
    production_forward_require_exact_handoff "$B" "$F" "$denied_action"
done
printf 'drift\n' >> "$CONTROL/github-production-deploy-wrapper.sh"
expect_failure 'drifted installed forward wrapper' \
  production_forward_require_exact_handoff "$B" "$F" plan
git -C "$repo" show "$F:ops/deploy/social-monitor-production-ssh-wrapper.sh" > \
  "$CONTROL/github-production-deploy-wrapper.sh"
git -C "$repo" update-ref refs/remotes/origin/main "$H"
expect_failure 'wrong forward origin/main' \
  production_forward_require_exact_handoff "$B" "$F" plan
git -C "$repo" update-ref refs/remotes/origin/main "$F"

# Exhaust the marker/boolean cross product and admit exactly the architect's
# four ordered phases (the backend-committed phase permits either frontend
# state). This supplies explicit negative assertions for every impossible plan.
plan_expected() {
  local backend=$1 frontend=$2 control=$3 base=$4 bootstrap=$5
  [[ $backend == true && $frontend == true && $control == true && \
     $base == "$P" && $bootstrap == "$B" ]] ||
  [[ $backend == false && $control == true && $base == "$F" && \
     $bootstrap == "$B" ]] ||
  [[ $backend == false && $frontend == false && $control == true && \
     $base == "$F" && $bootstrap == "$F" ]] ||
  [[ $backend == false && $frontend == false && $control == false && \
     $base == "$F" && $bootstrap == "$F" ]]
}
for backend in false true; do
  for frontend in false true; do
    for control in false true; do
      for base in "$P" "$F"; do
        for bootstrap in "$B" "$F"; do
          PLAN_BACKEND=$backend PLAN_FRONTEND=$frontend PLAN_CONTROL=$control
          PLAN_BACKEND_BASE=$base PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=$bootstrap
          if plan_expected "$backend" "$frontend" "$control" "$base" "$bootstrap"; then
            plan_is_approved_production_forward_handoff "$F" "$B" || \
              fail "rejected approved plan $backend/$frontend/$control/$base/$bootstrap"
          elif plan_is_approved_production_forward_handoff "$F" "$B"; then
            fail "admitted impossible plan $backend/$frontend/$control/$base/$bootstrap"
          fi
        done
      done
    done
  done
done
printf 'forward-bridge-test: exact ordered plans enforced\n'

# Model crashes around the remaining ordered durable boundaries with the same
# marker predicates used by the client. A runtime failure rolls back without
# advancing a marker; the next attempt then advances backend, frontend,
# bootstrap-next/rename, and control-next/rename in order. Before and after
# every boundary the resulting state is either the preceding approved phase or
# the next approved phase, never an impossible combination.
phase_backend=$P phase_frontend=$P phase_bootstrap=$B phase_control=$B
assert_phase_approved() {
  # shellcheck disable=SC2034 # Consumed by the sourced forward plan predicate.
  PLAN_BACKEND_BASE=$phase_backend
  # shellcheck disable=SC2034 # Consumed by the sourced forward plan predicate.
  [[ $phase_backend == "$F" ]] && PLAN_BACKEND=false || PLAN_BACKEND=true
  # shellcheck disable=SC2034 # Consumed by the sourced forward plan predicate.
  [[ $phase_frontend == "$F" ]] && PLAN_FRONTEND=false || PLAN_FRONTEND=true
  # shellcheck disable=SC2034 # Consumed by the sourced forward plan predicate.
  [[ $phase_control == "$F" ]] && PLAN_CONTROL=false || PLAN_CONTROL=true
  # shellcheck disable=SC2034 # Consumed by the sourced forward plan predicate.
  PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=$phase_bootstrap
  plan_is_approved_production_forward_handoff "$F" "$B"
}
assert_phase_approved
# Runtime activation failed and rollback succeeded: all durable identities stay.
runtime_attempts=1; assert_phase_approved
# Retry succeeds; exercise both sides of each marker rename.
for boundary in backend frontend bootstrap control; do
  assert_phase_approved
  case $boundary in
    backend) phase_backend=$F ;;
    frontend) phase_frontend=$F ;;
    bootstrap) phase_bootstrap=$F ;;
    control) phase_control=$F ;;
  esac
  assert_phase_approved
done
((runtime_attempts += 1)); [[ $runtime_attempts == 2 ]]
printf 'forward-bridge-test: runtime rollback and marker crashes resume\n'

printf 'production-forward-bridge-test: ok B=%s R=%s W=%s H=%s F=%s\n' \
  "$B" "$R" "$W" "$H" "$F"
