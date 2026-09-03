#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
LC_ALL=C
GIT_NO_REPLACE_OBJECTS=1
GIT_NO_LAZY_FETCH=1
export PATH LC_ALL GIT_NO_REPLACE_OBJECTS GIT_NO_LAZY_FETCH
umask 077

readonly SOURCE_PATH=ops/deploy/production-transition-admission.sh
readonly INSTALLED_PATH=/var/data/social-monitor/control/production-transition-admission.sh
readonly PRODUCTION_REPO=/var/data/social-monitor/integration
readonly EXPECTED_REPOSITORY=777genius/social-monitor
readonly PINNED_ORIGIN_HTTPS=https://github.com/777genius/social-monitor.git
readonly PINNED_ORIGIN_HTTPS_CHECKOUT=https://github.com/777genius/social-monitor
readonly PINNED_ORIGIN_SSH=git@github.com:777genius/social-monitor.git
readonly PINNED_A0=bb4b3f8a0e81ed371aaef5bf362afaaaaacf3c30
REPO=
TRUSTED_BASE=
EXECUTION_HEAD=
TMP_ROOT=
admission_fail() { printf 'production-transition-admission-error: %s\n' "$*" >&2; exit 1; }
fail() { admission_fail "$@"; }
cleanup() { [[ -z $TMP_ROOT ]] || /usr/bin/rm -rf -- "$TMP_ROOT"; }
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

readonly SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
admission_preverify_canonical() {
  local target=$1 repository p6 base entry mode type object path extra actual
  [[ $target =~ ^[0-9a-f]{40}$ ]] || \
    admission_fail 'target must be a full lowercase SHA'
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-0} == 1 ]]; then
    repository=${PRODUCTION_TRANSITION_TEST_REPOSITORY:?test repository is required}
  else
    repository=$PRODUCTION_REPO
  fi
  p6=$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 /usr/bin/git -C "$repository" \
    rev-parse --verify "$target^1" 2>/dev/null) || \
    admission_fail 'cannot preverify target P6'
  base=$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 /usr/bin/git -C "$repository" \
    rev-parse --verify "$p6^1" 2>/dev/null) || \
    admission_fail 'cannot preverify canonical library against protected B0'
  entry=$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 /usr/bin/git -C "$repository" \
    ls-tree "$base" -- ops/deploy/production-transition-canonical-lib.sh) || \
    admission_fail 'cannot inspect protected canonical library'
  read -r mode type object path extra <<< "$entry"
  [[ -z ${extra:-} && $mode == 100644 && $type == blob && \
     $object =~ ^[0-9a-f]{40}$ && \
     $path == ops/deploy/production-transition-canonical-lib.sh ]] || \
    admission_fail 'protected canonical library entry differs'
  actual=$(/usr/bin/git -C "$repository" hash-object --no-filters \
    "$SCRIPT_DIR/production-transition-canonical-lib.sh") || \
    admission_fail 'installed canonical library cannot be hashed'
  [[ $actual == "$object" ]] || admission_fail 'untrusted canonical library bytes'
}
[[ $# == 3 && ${1:-} == verify && ${2:-} == --target ]] || \
  admission_fail 'usage: verify --target T'
admission_preverify_canonical "$3"
# This is the installed/B0-frozen library beside this executable. No object
# from S2, P6, or T is sourced or executed.
# shellcheck source=ops/deploy/production-transition-canonical-lib.sh
source "$SCRIPT_DIR/production-transition-canonical-lib.sh"

admission_identity() {
  [[ -f $1 && ! -L $1 ]] && /usr/bin/stat -c '%d:%i:%f:%s:%y:%z' "$1"
}

admission_verify_origin() {
  local -a urls=()
  mapfile -t urls < <(production_transition_git -C "$REPO" remote get-url --all origin)
  [[ ${#urls[@]} == 1 && (${urls[0]} == "$PINNED_ORIGIN_HTTPS" || \
     ${urls[0]} == "$PINNED_ORIGIN_HTTPS_CHECKOUT" || \
     ${urls[0]} == "$PINNED_ORIGIN_SSH") ]] || \
    admission_fail 'origin differs from pinned 777genius/social-monitor'
}

admission_initialize_context() {
  local self=$1 target=$2 mode=${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-0} remote_main p6
  if [[ $mode == 1 ]]; then
    REPO=${PRODUCTION_TRANSITION_TEST_REPOSITORY:?test repository is required}
    PRODUCTION_TRANSITION_ANCHOR_BASE=\
${PRODUCTION_TRANSITION_TEST_ANCHOR_BASE:?test A0 is required}
    PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT=\
${PRODUCTION_TRANSITION_TEST_REVIEW_FINGERPRINT:?test review fingerprint is required}
    PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT=\
${PRODUCTION_TRANSITION_TEST_TARGET_FINGERPRINT:?test target fingerprint is required}
    PRODUCTION_TRANSITION_EFFECTIVE_NOW_EPOCH=\
${PRODUCTION_TRANSITION_TEST_NOW_EPOCH:?test clock is required}
    [[ ! -v PRODUCTION_TRANSITION_REPOSITORY && \
       ! -v PRODUCTION_TRANSITION_TRUSTED_BASE ]] || \
      admission_fail 'legacy repository or B0 overrides are forbidden'
  elif [[ $mode == 0 ]]; then
    [[ $self == "$INSTALLED_PATH" ]] || \
      admission_fail 'production admission must run from installed control path'
    [[ ! -v PRODUCTION_TRANSITION_TEST_REPOSITORY && \
       ! -v PRODUCTION_TRANSITION_TEST_ANCHOR_BASE ]] || \
      admission_fail 'test overrides are forbidden in production mode'
    REPO=$PRODUCTION_REPO
    PRODUCTION_TRANSITION_ANCHOR_BASE=$PINNED_A0
    PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT=\
$PRODUCTION_TRANSITION_REVIEW_FINGERPRINT
    PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT=\
$PRODUCTION_TRANSITION_TARGET_FINGERPRINT
    PRODUCTION_TRANSITION_EFFECTIVE_NOW_EPOCH=$(/usr/bin/date +%s)
    admission_verify_origin
  else
    admission_fail 'test mode must be exactly 0 or 1'
  fi
  [[ -d $REPO/.git || -f $REPO/.git ]] || admission_fail 'trusted repository is unavailable'
  EXECUTION_HEAD=$(production_transition_git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || \
    admission_fail 'admission execution checkout cannot be resolved'
  p6=$(production_transition_git -C "$REPO" rev-parse --verify "$target^1") || \
    admission_fail 'target P6 cannot be resolved'
  TRUSTED_BASE=$(production_transition_git -C "$REPO" rev-parse --verify "$p6^1") || \
    admission_fail 'target protected B0 cannot be resolved'
  production_transition_validate_sha "$TRUSTED_BASE" 'protected-main B0'
  [[ $EXECUTION_HEAD == "$TRUSTED_BASE" || $EXECUTION_HEAD == "$target" ]] || \
    admission_fail 'admission checkout is neither frozen B0 nor exact T'
  if [[ $mode == 0 ]]; then
    remote_main=$(production_transition_git -C "$REPO" ls-remote --exit-code origin \
      refs/heads/main | /usr/bin/awk 'NR == 1 {print $1}') || \
      admission_fail 'protected remote main cannot be read'
    [[ $remote_main == "$target" ]] || \
      admission_fail 'protected remote main is not exact published T'
  fi
  PRODUCTION_TRANSITION_BRIDGE_BASE=$TRUSTED_BASE
}

admission_entry_object() {
  local commit=$1 mode=$2 path=$3 entry actual_mode type object actual extra
  entry=$(production_transition_git -C "$REPO" ls-tree "$commit" -- "$path") || \
    admission_fail "cannot inspect frozen path $path"
  read -r actual_mode type object actual extra <<< "$entry"
  [[ -z ${extra:-} && $actual_mode == "$mode" && $type == blob && \
     $object =~ ^[0-9a-f]{40}$ && $actual == "$path" ]] || \
    admission_fail "frozen path is not exact mode/blob/path: $path"
  printf '%s\n' "$object"
}

admission_verify_self_and_library() {
  local self=$1 before after path mode object actual
  before=$(admission_identity "$self") || admission_fail 'admission executable is unsafe'
  for path in "$SOURCE_PATH" ops/deploy/production-transition-canonical-lib.sh; do
    mode=100644; [[ $path == "$SOURCE_PATH" ]] && mode=100755
    object=$(admission_entry_object "$TRUSTED_BASE" "$mode" "$path")
    if [[ $path == "$SOURCE_PATH" ]]; then actual=$self; else actual=$SCRIPT_DIR/${path##*/}; fi
    [[ $(production_transition_git -C "$REPO" hash-object --no-filters "$actual") == \
       "$object" ]] || admission_fail "running trusted bytes differ: $path"
  done
  after=$(admission_identity "$self") || admission_fail 'admission executable disappeared'
  [[ $before == "$after" ]] || admission_fail 'admission executable changed while verified'
}

admission_verify_frozen_manifest() {
  local s2=$1 p6=$2 target=$3 spec mode path exact commit
  while IFS= read -r spec; do
    mode=${spec%%:*}; path=${spec#*:}
    exact=$(production_transition_git -C "$REPO" ls-tree "$TRUSTED_BASE" -- "$path")
    admission_entry_object "$TRUSTED_BASE" "$mode" "$path" >/dev/null
    for commit in "$s2" "$p6" "$target"; do
      [[ $(production_transition_git -C "$REPO" ls-tree "$commit" -- "$path") == \
         "$exact" ]] || admission_fail "protected A2 trust blob changed: $path"
    done
  done < <(production_transition_protected_manifest "$TRUSTED_BASE")
}

admission_verify() (
  local target=$1 statement=$2 signature=$3 self=$4 b0 s2 p6 signers='' output
  local -a parents=()
  cleanup_local() { [[ -z $signers ]] || /usr/bin/rm -f -- "$signers"; }
  trap cleanup_local EXIT
  production_transition_validate_sha "$target" T
  read -r -a parents <<< "$(production_transition_git -C "$REPO" \
    rev-list --parents -n 1 "$target" 2>/dev/null)"
  [[ ${#parents[@]} == 3 && ${parents[0]} == "$target" ]] || \
    admission_fail 'T must have exact ordered P6 and S2 parents'
  p6=${parents[1]}; s2=${parents[2]}
  b0=$(production_transition_git -C "$REPO" rev-parse "$p6^1") || \
    admission_fail 'T B0 lease cannot be inspected'
  [[ $b0 == "$TRUSTED_BASE" ]] || \
    admission_fail 'T signed B0 differs from protected-main checkout lease'
  admission_verify_self_and_library "$self"
  production_transition_verify_trust_and_protected_blobs "$b0" "$s2"
  admission_verify_frozen_manifest "$s2" "$p6" "$target"
  signers=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/admission-target-signers.XXXXXX")
  production_transition_copy_blob "$b0" "$PRODUCTION_TRANSITION_TARGET_SIGNERS_PATH" \
    "$signers" 'B0 target signers'
  output=$(production_transition_verify_target_contract "$target" "$statement" \
    "$signature" fresh "$signers" \
    "$PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT")
  [[ $(production_transition_git -C "$REPO" rev-parse --verify 'HEAD^{commit}') == \
     "$EXECUTION_HEAD" ]] || admission_fail 'admission checkout moved during verification'
  printf 'production-transition-admission-ok trusted-base=%s target=%s repository=%s s2=%s p6=%s review-id=%s\n' \
    "$TRUSTED_BASE" "$target" "$EXPECTED_REPOSITORY" "$s2" "$p6" \
    "$(/usr/bin/sed -n 's/^review-id=//p' <<< "$output")"
)

main() {
  local self
  self=$(/usr/bin/realpath -e "${BASH_SOURCE[0]}") || \
    admission_fail 'admission executable cannot be canonicalized'
  admission_initialize_context "$self" "$3"
  TMP_ROOT=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/transition-admission.XXXXXX")
  /usr/bin/chmod 0700 "$TMP_ROOT"
  admission_verify "$3" '' '' "$self"
}

main "$@"
