#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
LC_ALL=C
GIT_NO_REPLACE_OBJECTS=1
GIT_NO_LAZY_FETCH=1
export PATH LC_ALL GIT_NO_REPLACE_OBJECTS GIT_NO_LAZY_FETCH
umask 077

readonly SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
readonly MAIN_REF=refs/heads/main
readonly PINNED_ORIGIN_HTTPS=https://github.com/777genius/social-monitor.git
readonly PINNED_ORIGIN_HTTPS_CHECKOUT=https://github.com/777genius/social-monitor
readonly PINNED_ORIGIN_SSH=git@github.com:777genius/social-monitor.git
readonly PINNED_A0=bb4b3f8a0e81ed371aaef5bf362afaaaaacf3c30

publisher_fail() { printf 'transition-publisher-error: %s\n' "$*" >&2; exit 1; }
fail() { publisher_fail "$@"; }

# shellcheck source=ops/deploy/production-transition-canonical-lib.sh
source "$SCRIPT_DIR/production-transition-canonical-lib.sh"
source "$SCRIPT_DIR/production-transition-stale-b0-recovery-lib.sh"

publisher_reject_wrong_authority() {
  [[ ! -v PRODUCTION_TRANSITION_REVIEW_SIGNING_KEY && \
     ! -v PRODUCTION_TRANSITION_SIGNING_KEY && \
     ! -v PRODUCTION_TRANSITION_REQUIRED_CHECKS && \
     ! -v PRODUCTION_TRANSITION_GH_BIN && \
     ! -v PRODUCTION_TRANSITION_PR_NUMBER ]] || \
    publisher_fail 'publisher rejects review, legacy, or caller-named check authority'
}

publisher_verify_origin() {
  local -a urls=()
  mapfile -t urls < <(production_transition_git -C "$REPO" remote get-url --all origin)
  [[ ${#urls[@]} == 1 && (${urls[0]} == "$PINNED_ORIGIN_HTTPS" || \
     ${urls[0]} == "$PINNED_ORIGIN_HTTPS_CHECKOUT" || \
     ${urls[0]} == "$PINNED_ORIGIN_SSH") ]] || \
    publisher_fail 'origin differs from pinned 777genius/social-monitor'
}

publisher_initialize_context() {
  local mode=${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-0} remote_main
  local stale_b0 recovery_mode
  if [[ $mode == 1 ]]; then
    REPO=${PRODUCTION_TRANSITION_TEST_REPOSITORY:?test repository is required}
    REMOTE=${PRODUCTION_TRANSITION_TEST_REMOTE:?test remote is required}
    PRODUCTION_TRANSITION_ANCHOR_BASE=\
${PRODUCTION_TRANSITION_TEST_ANCHOR_BASE:?test A0 is required}
    PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT=\
${PRODUCTION_TRANSITION_TEST_REVIEW_FINGERPRINT:?test review fingerprint is required}
    PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT=\
${PRODUCTION_TRANSITION_TEST_TARGET_FINGERPRINT:?test target fingerprint is required}
    PRODUCTION_TRANSITION_EFFECTIVE_NOW_EPOCH=\
${PRODUCTION_TRANSITION_TEST_NOW_EPOCH:?test clock is required}
    [[ ! -v PRODUCTION_TRANSITION_REPOSITORY && \
       ! -v PRODUCTION_TRANSITION_REMOTE && ! -v PRODUCTION_TRANSITION_TRUSTED_BASE && \
       ! -v GITHUB_REPOSITORY && ! -v GITHUB_WORKFLOW_REF && ! -v GITHUB_SHA && \
       ! -v GITHUB_WORKSPACE ]] || \
      publisher_fail 'legacy or GitHub context overrides are forbidden'
  elif [[ $mode == 0 ]]; then
    [[ ! -v PRODUCTION_TRANSITION_TEST_REPOSITORY && \
       ! -v PRODUCTION_TRANSITION_TEST_REMOTE && \
       ! -v PRODUCTION_TRANSITION_TEST_ANCHOR_BASE ]] || \
      publisher_fail 'test overrides are forbidden in production mode'
    REPO=${GITHUB_WORKSPACE:?GitHub publisher workspace is required}
    REMOTE=origin
    PRODUCTION_TRANSITION_ANCHOR_BASE=$PINNED_A0
    PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT=\
$PRODUCTION_TRANSITION_REVIEW_FINGERPRINT
    PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT=\
$PRODUCTION_TRANSITION_TARGET_FINGERPRINT
    PRODUCTION_TRANSITION_EFFECTIVE_NOW_EPOCH=$(/usr/bin/date +%s)
    publisher_verify_origin
    remote_main=$(publisher_remote_main)
    stale_b0=${PRODUCTION_TRANSITION_STALE_B0_SHA:-}
    recovery_mode=${PRODUCTION_TRANSITION_RECOVERY_MODE:-}
    if [[ -n $stale_b0 ]]; then
      production_transition_validate_sha "$stale_b0" 'stale B0'
      [[ $recovery_mode == stale-b0 ]] || \
        publisher_fail 'stale B0 requires the explicit recovery mode'
    else
      [[ -z $recovery_mode ]] || \
        publisher_fail 'recovery mode requires an explicit stale B0'
    fi
    [[ ${GITHUB_REPOSITORY:-} == "$PRODUCTION_TRANSITION_REPOSITORY_ID" && \
       ${GITHUB_WORKFLOW_REF:-} == "$PRODUCTION_TRANSITION_PUBLISH_WORKFLOW_REF" && \
       ${GITHUB_SHA:-} == "$remote_main" && \
       ${GITHUB_EVENT_NAME:-} == workflow_dispatch && \
       ${GITHUB_RUN_ID:-} =~ ^[1-9][0-9]*$ && \
       ${GITHUB_RUN_ATTEMPT:-} =~ ^[1-9][0-9]*$ ]] || \
      publisher_fail 'GitHub publisher context is not exact and pinned'
  else
    publisher_fail 'test mode must be exactly 0 or 1'
  fi
  [[ -d $REPO/.git || -f $REPO/.git ]] || publisher_fail 'repository is unavailable'
}

publisher_remote_main() {
  local value
  value=$(production_transition_git -C "$REPO" ls-remote --exit-code "$REMOTE" \
    "$MAIN_REF" | /usr/bin/awk 'NR == 1 {print $1}') || \
    publisher_fail 'protected main lease cannot be read'
  production_transition_validate_sha "$value" 'protected main'
  printf '%s\n' "$value"
}

publisher_materialize_signers() {
  local b0=$1 path=$2 destination=$3 expected=$4 principal=$5 fingerprint=$6 line actual
  production_transition_copy_blob "$b0" "$path" "$destination" 'B0 signer authority'
  [[ $(/usr/bin/wc -l < "$destination") == 1 ]] || \
    publisher_fail 'signer authority must contain exactly one signer'
  IFS= read -r line < "$destination"
  [[ $line == "$principal namespaces=\"git\" ssh-ed25519 "* ]] || \
    publisher_fail 'signer principal or namespace differs'
  actual=$(/usr/bin/awk '{print $3,$4}' "$destination" | \
    /usr/bin/ssh-keygen -lf - -E sha256 2>/dev/null | /usr/bin/awk '{print $2}')
  [[ $actual == "$fingerprint" && $actual == "$expected" ]] || \
    publisher_fail 'signer fingerprint differs'
}

publisher_prepare() (
  local s2=$1 p6=$2 statement=$3 signature=$4 b0 remote_main
  local review_signers='' target_signers='' verification target_tree message target key repo_real
  local statement_digest signature_digest review_id run_id transition_id replay_id
  local consumption_ref consumed status
  cleanup() { [[ -z $review_signers ]] || /usr/bin/rm -f -- "$review_signers"; \
    [[ -z $target_signers ]] || /usr/bin/rm -f -- "$target_signers"; }
  trap cleanup EXIT
  production_transition_validate_sha "$s2" S2
  production_transition_validate_sha "$p6" P6
  b0=$(production_transition_review_field "$statement" b0)
  production_transition_validate_sha "$b0" B0
  PRODUCTION_TRANSITION_BRIDGE_BASE=$b0
  production_transition_verify_trust_and_protected_blobs "$b0" "$s2"
  review_signers=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/publisher-review-signers.XXXXXX")
  target_signers=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/publisher-target-signers.XXXXXX")
  publisher_materialize_signers "$b0" "$PRODUCTION_TRANSITION_REVIEW_SIGNERS_PATH" \
    "$review_signers" "$PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT" \
    "$PRODUCTION_TRANSITION_REVIEW_PRINCIPAL" \
    "$PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT"
  publisher_materialize_signers "$b0" "$PRODUCTION_TRANSITION_TARGET_SIGNERS_PATH" \
    "$target_signers" "$PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT" \
    "$PRODUCTION_TRANSITION_TARGET_PRINCIPAL" \
    "$PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT"
  verification=$(production_transition_verify_canonical_review "$s2" "$p6" \
    "$statement" "$signature" "$review_signers" allow-expired)
  review_id=$(/usr/bin/sed -n 's/^review-id=//p' <<< "$verification")
  run_id=$(/usr/bin/sed -n 's/^review-run-id=//p' <<< "$verification")
  transition_id=$(/usr/bin/sed -n 's/^review-transition-id=//p' <<< "$verification")
  replay_id=$(/usr/bin/sed -n 's/^review-replay-id=//p' <<< "$verification")
  consumption_ref="refs/production-transition/review-consumed/$review_id"
  set +e
  consumed=$(production_transition_git -C "$REPO" ls-remote --exit-code "$REMOTE" \
    "$consumption_ref" 2>/dev/null | /usr/bin/awk 'NR == 1 {print $1}')
  status=$?
  set -e
  remote_main=$(publisher_remote_main)
  if ((status == 0)); then
    production_transition_validate_sha "$consumed" consumed-review
    [[ $remote_main == "$consumed" ]] || \
      publisher_fail 'consumed review and protected main differ'
    production_transition_verify_target_contract "$consumed" "$statement" \
      "$signature" allow-expired "$target_signers" \
      "$PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT" >/dev/null
    printf 'repository=%s\nb0=%s\ns2=%s\np6=%s\nt=%s\nreview-id=%s\n' \
      "$PRODUCTION_TRANSITION_REPOSITORY_ID" "$b0" "$s2" "$p6" "$consumed" "$review_id"
    return 0
  fi
  ((status == 2)) || publisher_fail 'canonical review consumption state is unreadable'
  if [[ -n ${PRODUCTION_TRANSITION_STALE_B0_SHA:-} ]]; then
    [[ ${PRODUCTION_TRANSITION_STALE_B0_SHA} == "$b0" && \
       ${PRODUCTION_TRANSITION_STALE_S2_SHA:-} == "$s2" ]] || \
      publisher_fail 'stale B0 recovery lease is not the reviewed S2'
    production_transition_stale_b0_validate_head "$b0" "$s2" "$remote_main"
  else
    [[ $remote_main == "$b0" ]] || publisher_fail 'signed B0 differs from protected main lease'
  fi
  production_transition_verify_canonical_review "$s2" "$p6" "$statement" \
    "$signature" "$review_signers" fresh >/dev/null
  statement_digest=$(production_transition_sha256_file "$statement")
  signature_digest=$(production_transition_sha256_file "$signature")
  target_tree=$(production_transition_build_target_tree "$p6" "$statement" "$signature")
  message=$(production_transition_target_message "$b0" "$s2" "$p6" "$target_tree" \
    "$statement_digest" "$signature_digest" "$review_id" "$run_id" \
    "$transition_id" "$replay_id")
  key=${PRODUCTION_TRANSITION_TARGET_SIGNING_KEY:-}
  [[ -n $key && -f $key && ! -L $key ]] || \
    publisher_fail 'external target signing authority is required'
  key=$(/usr/bin/realpath -e -- "$key") || publisher_fail 'target key cannot be resolved'
  repo_real=$(/usr/bin/realpath -e -- "$REPO") || publisher_fail 'repository cannot be resolved'
  [[ $key != "$repo_real"/* ]] || publisher_fail 'target key must remain outside repository'
  [[ $(production_transition_private_key_fingerprint "$key") == \
     "$PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT" ]] || \
    publisher_fail 'target key fingerprint differs from target authority'
  target=$(printf '%s\n' "$message" | production_transition_git -C "$REPO" \
    -c gpg.format=ssh -c gpg.ssh.program=/usr/bin/ssh-keygen \
    -c user.signingkey="$key" commit-tree -S "$target_tree" -p "$p6" -p "$s2") || \
    publisher_fail 'T could not be signed by target authority'
  production_transition_verify_target_contract "$target" "$statement" "$signature" fresh \
    "$target_signers" "$PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT" >/dev/null
  printf 'repository=%s\nb0=%s\ns2=%s\np6=%s\nt=%s\nreview-id=%s\n' \
    "$PRODUCTION_TRANSITION_REPOSITORY_ID" "$b0" "$s2" "$p6" "$target" "$review_id"
)

publisher_publish() (
  local target=$1 statement='' signature='' target_signers='' b0 review_id
  local verification consumption_ref consumed status observed s2 lease_main
  cleanup() { [[ -z $statement ]] || /usr/bin/rm -f -- "$statement"; \
    [[ -z $signature ]] || /usr/bin/rm -f -- "$signature"; \
    [[ -z $target_signers ]] || /usr/bin/rm -f -- "$target_signers"; }
  trap cleanup EXIT
  production_transition_validate_sha "$target" T
  b0=$(production_transition_git -C "$REPO" rev-parse "$target^1^1")
  s2=$(production_transition_git -C "$REPO" rev-parse "$target^2")
  PRODUCTION_TRANSITION_BRIDGE_BASE=$b0
  statement=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/publisher-statement.XXXXXX")
  signature=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/publisher-signature.XXXXXX")
  target_signers=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/publisher-target-signers.XXXXXX")
  production_transition_materialize_review_from_target "$target" "$statement" "$signature"
  production_transition_copy_blob "$b0" "$PRODUCTION_TRANSITION_TARGET_SIGNERS_PATH" \
    "$target_signers" 'B0 target signers'
  verification=$(production_transition_verify_target_contract "$target" "$statement" \
    "$signature" allow-expired "$target_signers" \
    "$PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT")
  review_id=$(/usr/bin/sed -n 's/^review-id=//p' <<< "$verification")
  consumption_ref="refs/production-transition/review-consumed/$review_id"
  set +e
  consumed=$(production_transition_git -C "$REPO" ls-remote --exit-code "$REMOTE" \
    "$consumption_ref" 2>/dev/null | /usr/bin/awk 'NR == 1 {print $1}')
  status=$?
  set -e
  observed=$(publisher_remote_main)
  if ((status == 0)); then
    production_transition_validate_sha "$consumed" consumed-review
    [[ $consumed == "$target" && $observed == "$target" ]] || \
      publisher_fail 'canonical review consumption conflicts with exact target'
    printf 'published-t=%s\nexpected-main=%s\nreview-consumption-ref=%s\n' \
      "$target" "$b0" "$consumption_ref"
    return 0
  fi
  ((status == 2)) || publisher_fail 'canonical review consumption state is unreadable'
  if [[ -n ${PRODUCTION_TRANSITION_STALE_B0_SHA:-} ]]; then
    [[ ${PRODUCTION_TRANSITION_STALE_B0_SHA} == "$b0" ]] || \
      publisher_fail 'protected main moved after stale B0 recovery lease'
    production_transition_stale_b0_validate_head "$b0" "$s2" "$observed"
    lease_main=$observed
  else
    [[ $observed == "$b0" ]] || publisher_fail 'protected main moved after signed B0 lease'
    lease_main=$b0
  fi
  production_transition_verify_target_contract "$target" "$statement" \
    "$signature" fresh "$target_signers" \
    "$PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT" >/dev/null
  production_transition_git -C "$REPO" push --atomic \
    --force-with-lease="$MAIN_REF:$lease_main" \
    --force-with-lease="$consumption_ref:0000000000000000000000000000000000000000" \
    "$REMOTE" "$target:$MAIN_REF" "$target:$consumption_ref" || \
    publisher_fail 'atomic protected-main publication failed'
  printf 'published-t=%s\nexpected-main=%s\nreview-consumption-ref=%s\n' \
    "$target" "$b0" "$consumption_ref"
)

main() {
  publisher_reject_wrong_authority
  publisher_initialize_context
  case ${1:-} in
    prepare)
      [[ $# == 5 ]] || publisher_fail 'prepare requires S2, P6, review, signature'
      publisher_prepare "$2" "$3" "$4" "$5"
      ;;
    publish)
      [[ $# == 2 ]] || publisher_fail 'publish requires exact T'
      publisher_publish "$2"
      ;;
    *) publisher_fail 'action must be prepare or publish' ;;
  esac
}

[[ ${BASH_SOURCE[0]} != "$0" ]] || main "$@"
