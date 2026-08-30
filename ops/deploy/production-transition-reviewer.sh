#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
LC_ALL=C
GIT_NO_REPLACE_OBJECTS=1
GIT_NO_LAZY_FETCH=1
export PATH LC_ALL GIT_NO_REPLACE_OBJECTS GIT_NO_LAZY_FETCH
umask 077

readonly SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
readonly PINNED_ORIGIN_HTTPS=https://github.com/777genius/social-monitor.git
readonly PINNED_ORIGIN_HTTPS_CHECKOUT=https://github.com/777genius/social-monitor
readonly PINNED_ORIGIN_SSH=git@github.com:777genius/social-monitor.git
readonly PINNED_A0=bb4b3f8a0e81ed371aaef5bf362afaaaaacf3c30

reviewer_fail() { printf 'transition-reviewer-error: %s\n' "$*" >&2; exit 1; }
fail() { reviewer_fail "$@"; }

# shellcheck source=ops/deploy/production-transition-canonical-lib.sh
source "$SCRIPT_DIR/production-transition-canonical-lib.sh"

reviewer_reject_wrong_authority() {
  [[ ! -v PRODUCTION_TRANSITION_TARGET_SIGNING_KEY && \
     ! -v PRODUCTION_TRANSITION_SIGNING_KEY && \
     ! -v PRODUCTION_TRANSITION_REQUIRED_CHECKS && \
     ! -v PRODUCTION_TRANSITION_GH_BIN && \
     ! -v PRODUCTION_TRANSITION_PR_NUMBER ]] || \
    reviewer_fail 'reviewer rejects target, legacy, or caller-named check authority'
}

reviewer_verify_origin() {
  local -a urls=()
  mapfile -t urls < <(production_transition_git -C "$REPO" remote get-url --all origin)
  [[ ${#urls[@]} == 1 && (${urls[0]} == "$PINNED_ORIGIN_HTTPS" || \
     ${urls[0]} == "$PINNED_ORIGIN_HTTPS_CHECKOUT" || \
     ${urls[0]} == "$PINNED_ORIGIN_SSH") ]] || \
    reviewer_fail 'origin differs from pinned 777genius/social-monitor'
}

reviewer_initialize_context() {
  local mode=${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-0}
  if [[ $mode == 1 ]]; then
    REPO=${PRODUCTION_TRANSITION_TEST_REPOSITORY:?test repository is required}
    PRODUCTION_TRANSITION_BRIDGE_BASE=\
${PRODUCTION_TRANSITION_TEST_TRUSTED_BASE:?test B0 is required}
    PRODUCTION_TRANSITION_ANCHOR_BASE=\
${PRODUCTION_TRANSITION_TEST_ANCHOR_BASE:?test A0 is required}
    PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT=\
${PRODUCTION_TRANSITION_TEST_REVIEW_FINGERPRINT:?test review fingerprint is required}
    PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT=\
${PRODUCTION_TRANSITION_TEST_TARGET_FINGERPRINT:?test target fingerprint is required}
    PRODUCTION_TRANSITION_EFFECTIVE_NOW_EPOCH=\
${PRODUCTION_TRANSITION_TEST_NOW_EPOCH:?test clock is required}
    REVIEW_RUN_ID=${PRODUCTION_TRANSITION_TEST_RUN_ID:?test run id is required}
    REVIEW_TRANSITION_ID=\
${PRODUCTION_TRANSITION_TEST_TRANSITION_ID:?test transition id is required}
    REVIEW_REPLAY_ID=\
${PRODUCTION_TRANSITION_TEST_REPLAY_ID:?test replay id is required}
    [[ ! -v PRODUCTION_TRANSITION_REPOSITORY && \
       ! -v PRODUCTION_TRANSITION_TRUSTED_BASE && \
       ! -v PRODUCTION_TRANSITION_RUN_ID && ! -v GITHUB_REPOSITORY && \
       ! -v GITHUB_WORKFLOW_REF && ! -v GITHUB_SHA && \
       ! -v GITHUB_WORKSPACE ]] || \
      reviewer_fail 'legacy or GitHub context overrides are forbidden in test mode'
  elif [[ $mode == 0 ]]; then
    [[ ! -v PRODUCTION_TRANSITION_TEST_REPOSITORY && \
       ! -v PRODUCTION_TRANSITION_TEST_TRUSTED_BASE && \
       ! -v PRODUCTION_TRANSITION_TEST_ANCHOR_BASE && \
       ! -v PRODUCTION_TRANSITION_TEST_REVIEW_FINGERPRINT ]] || \
      reviewer_fail 'test overrides are forbidden in production mode'
    REPO=${GITHUB_WORKSPACE:?GitHub review workspace is required}
    reviewer_verify_origin
    PRODUCTION_TRANSITION_BRIDGE_BASE=$(production_transition_git -C "$REPO" \
      ls-remote --exit-code origin refs/heads/main | /usr/bin/awk 'NR == 1 {print $1}')
    PRODUCTION_TRANSITION_ANCHOR_BASE=$PINNED_A0
    PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT=\
$PRODUCTION_TRANSITION_REVIEW_FINGERPRINT
    PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT=\
$PRODUCTION_TRANSITION_TARGET_FINGERPRINT
    PRODUCTION_TRANSITION_EFFECTIVE_NOW_EPOCH=$(/usr/bin/date +%s)
    [[ ${GITHUB_REPOSITORY:-} == "$PRODUCTION_TRANSITION_REPOSITORY_ID" && \
       ${GITHUB_WORKFLOW_REF:-} == "$PRODUCTION_TRANSITION_WORKFLOW_REF" && \
       ${GITHUB_SHA:-} == "$PRODUCTION_TRANSITION_BRIDGE_BASE" && \
       ${GITHUB_EVENT_NAME:-} == workflow_dispatch && \
       ${GITHUB_RUN_ID:-} =~ ^[1-9][0-9]*$ && \
       ${GITHUB_RUN_ATTEMPT:-} =~ ^[1-9][0-9]*$ ]] || \
      reviewer_fail 'GitHub review producer context is not exact and pinned'
    REVIEW_RUN_ID="github-run:${GITHUB_RUN_ID}"
    REVIEW_TRANSITION_ID="production-transition:${GITHUB_RUN_ID}"
    REVIEW_REPLAY_ID="github-run:${GITHUB_RUN_ID}:attempt:${GITHUB_RUN_ATTEMPT}"
  else
    reviewer_fail 'test mode must be exactly 0 or 1'
  fi
  production_transition_validate_sha "$PRODUCTION_TRANSITION_BRIDGE_BASE" B0
  [[ -d $REPO/.git || -f $REPO/.git ]] || reviewer_fail 'repository is unavailable'
}

reviewer_sign() {
  local s2=$1 issued=$2 expires=$3 output_dir=$4 key repo_real p6 statement signature
  production_transition_validate_sha "$s2" S2
  [[ $issued =~ ^[0-9]+$ && $expires =~ ^[0-9]+$ && \
     $issued -le $expires && $((expires - issued)) -le 604800 ]] || \
    reviewer_fail 'review lifetime must be bounded epoch seconds'
  [[ -d $output_dir && ! -L $output_dir ]] || \
    reviewer_fail 'review output directory must be an existing regular directory'
  key=${PRODUCTION_TRANSITION_REVIEW_SIGNING_KEY:-}
  [[ -n $key && -f $key && ! -L $key ]] || \
    reviewer_fail 'external review signing authority is required'
  key=$(/usr/bin/realpath -e -- "$key") || reviewer_fail 'review key cannot be resolved'
  repo_real=$(/usr/bin/realpath -e -- "$REPO") || reviewer_fail 'repository cannot be resolved'
  [[ $key != "$repo_real"/* ]] || reviewer_fail 'review key must remain outside repository'
  [[ $(production_transition_private_key_fingerprint "$key") == \
     "$PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT" ]] || \
    reviewer_fail 'review key fingerprint differs from review authority'
  production_transition_verify_trust_and_protected_blobs \
    "$PRODUCTION_TRANSITION_BRIDGE_BASE" "$s2"
  p6=$(production_transition_build_p6 "$PRODUCTION_TRANSITION_BRIDGE_BASE" "$s2" \
    "$REVIEW_RUN_ID" "$REVIEW_TRANSITION_ID" "$REVIEW_REPLAY_ID")
  statement=$output_dir/production-transition-review.statement
  signature=$statement.sig
  [[ ! -e $statement && ! -L $statement && ! -e $signature && ! -L $signature ]] || \
    reviewer_fail 'review output already exists'
  production_transition_canonical_review "$PRODUCTION_TRANSITION_BRIDGE_BASE" \
    "$s2" "$p6" "$REVIEW_RUN_ID" "$REVIEW_TRANSITION_ID" \
    "$REVIEW_REPLAY_ID" "$issued" "$expires" > "$statement"
  /usr/bin/ssh-keygen -Y sign -f "$key" -n git "$statement" >/dev/null 2>&1 || \
    reviewer_fail 'review statement could not be signed'
  [[ -f $signature && ! -L $signature ]] || reviewer_fail 'review signature is absent'
  printf 'repository=%s\nb0=%s\ns2=%s\np6=%s\nstatement=%s\nsignature=%s\n' \
    "$PRODUCTION_TRANSITION_REPOSITORY_ID" "$PRODUCTION_TRANSITION_BRIDGE_BASE" \
    "$s2" "$p6" "$statement" "$signature"
}

main() {
  reviewer_reject_wrong_authority
  reviewer_initialize_context
  [[ $# == 5 && $1 == review ]] || \
    reviewer_fail 'usage: review <S2> <issued-at> <expires-at> <output-directory>'
  reviewer_sign "$2" "$3" "$4" "$5"
}

[[ ${BASH_SOURCE[0]} != "$0" ]] || main "$@"
