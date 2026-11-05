#!/usr/bin/env bash
# Authenticated transition wire parsing and exactly-once target activation.

production_transition_read_wire_evidence() (
  local target=$1 purpose=${2:-transition} header repository target_line review_line
  local statement_digest_line signature_digest_line statement_line signature_line extra
  local statement='' signature=''
  cleanup_transition_wire_evidence() {
    [[ -z ${statement:-} ]] || /usr/bin/rm -f -- "$statement"
    [[ -z ${signature:-} ]] || /usr/bin/rm -f -- "$signature"
  }
  trap cleanup_transition_wire_evidence EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  IFS= read -r header || fail 'public transition review evidence is missing'
  IFS= read -r repository || fail 'public transition repository is missing'
  IFS= read -r target_line || fail 'public transition target is missing'
  IFS= read -r review_line || fail 'public transition review identity is missing'
  IFS= read -r statement_digest_line || fail 'public review statement digest is missing'
  IFS= read -r signature_digest_line || fail 'public review signature digest is missing'
  IFS= read -r statement_line || fail 'public transition review statement is missing'
  IFS= read -r signature_line || fail 'public transition review signature is missing'
  if IFS= read -r extra; then
    [[ -z $extra ]] || :
    fail 'public transition review evidence has trailing data'
  fi
  [[ $header == 'version=social-monitor-production-transition-wire-canonical-v2' && \
     $repository == "repository=$PRODUCTION_TRANSITION_REPOSITORY_ID" && \
     $target_line == "t=$target" && \
     $review_line =~ ^review-id=[0-9a-f]{64}$ && \
     $statement_digest_line =~ ^statement-sha256=[0-9a-f]{64}$ && \
     $signature_digest_line =~ ^signature-sha256=[0-9a-f]{64}$ && \
     $statement_line =~ ^statement-base64=[A-Za-z0-9+/=]+$ && \
     $signature_line =~ ^signature-base64=[A-Za-z0-9+/=]+$ && \
     ${#statement_line} -le 16384 && ${#signature_line} -le 16384 ]] || \
    fail 'public transition review evidence envelope is malformed'
  statement=$(mktemp "${TMPDIR:-/tmp}/production-transition-wire-statement.XXXXXX") || \
    fail 'public transition review statement fixture cannot be created'
  signature=$(mktemp "${TMPDIR:-/tmp}/production-transition-wire-signature.XXXXXX") || \
    fail 'public transition review signature fixture cannot be created'
  printf '%s' "${statement_line#statement-base64=}" | base64 -d > "$statement" || \
    fail 'public transition review statement encoding is malformed'
  printf '%s' "${signature_line#signature-base64=}" | base64 -d > "$signature" || \
    fail 'public transition review signature encoding is malformed'
  [[ $(production_transition_sha256_file "$statement") == \
       "${statement_digest_line#statement-sha256=}" && \
     $(production_transition_sha256_file "$signature") == \
       "${signature_digest_line#signature-sha256=}" && \
     $(production_transition_review_field "$statement" review-id) == \
       "${review_line#review-id=}" ]] || \
    fail 'public transition canonical review digests differ'
  [[ $purpose == transition ]] || \
    fail 'obsolete transition bootstrap/manifest override is forbidden'
  (deploy_production_transition_target "$target" "$statement" "$signature")
)

deploy_production_transition_target() {
  local target=$1 statement=${2:-} signature=${3:-} verification
  local expires now fresh=false lock_fd claim deploy_state activated
  [[ -n $statement && -n $signature ]] || \
    fail 'public transition review statement and signature are required'
  exec {lock_fd}>"$STATE/$PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_LOCK"
  flock -w 3600 "$lock_fd" || fail 'timed out waiting for transition review consumption lock'
  production_transition_verify_signed_target "$target" allow-expired
  verification=$(production_transition_verify_embedded_review \
    "$target" "$statement" "$signature" allow-expired) || return 1
  expires=$(sed -n 's/^review-expires-at=//p' <<< "$verification")
  now=${PRODUCTION_TRANSITION_EFFECTIVE_NOW_EPOCH:-$(date +%s)}
  [[ $now =~ ^[0-9]+$ && $expires =~ ^[0-9]+$ ]] || \
    fail 'transition review freshness inputs are malformed'
  ((now <= expires)) && fresh=true
  claim=$(production_transition_begin_consumption "$verification" "$fresh")
  [[ $claim == claimed || $claim == resume || $claim == terminal ]] || \
    fail 'transition review consumption state is invalid'
  if [[ $claim == terminal ]]; then
    if production_transition_scheduler_hold_exists; then
      production_transition_begin_scheduler_hold "$verification"
      production_transition_authorize_scheduler_release "$verification"
      production_transition_resume_scheduler_hold "$target" "$verification"
    fi
    flock -u "$lock_fd"
    exec {lock_fd}>&-
    return 0
  fi
  production_transition_begin_scheduler_hold "$verification"
  production_transition_marker_failpoint scheduler-hold-held-before-deploy
  declare -F production_transition_reconcile_target_effect_markers >/dev/null && \
    production_transition_reconcile_target_effect_markers "$target"
  if [[ $(production_transition_read_consumption_record) == \
        "$(production_transition_consumption_record runtime-complete "$verification")" ]]; then
    deploy_state='receipt-complete'
  else
    deploy_state=$(production_transition_require_target_deploy_state \
      "$target" allow-expired classify)
  fi
  if [[ $deploy_state == pre-deploy ]]; then
    deploy_release "$target"
    deploy_state=$(production_transition_require_target_deploy_state \
      "$target" allow-expired classify)
  elif [[ $deploy_state == target-prepared ]]; then
    deploy_release "$target" resume-target-prepared
    deploy_state=$(production_transition_require_target_deploy_state \
      "$target" allow-expired classify)
  fi
  if [[ $deploy_state == target-control-pending ]]; then
    declare -F production_transition_require_runtime_terminal_receipts >/dev/null || \
      fail 'stable transition runtime terminal-receipt hook is unavailable'
    production_transition_require_runtime_terminal_receipts "$target"
    production_transition_commit_effect_sha_marker \
      "$STATE/control.sha" "$target" control production_transition_control_effect_installed
    deploy_state=$(production_transition_require_target_deploy_state \
      "$target" allow-expired classify)
  fi
  if [[ $deploy_state == runtime-complete ]]; then
    # Reconstruct a missing receipt without replaying completed runtime work.
    declare -F production_transition_require_runtime_terminal_receipts >/dev/null || \
      fail 'stable transition runtime terminal-receipt hook is unavailable'
    production_transition_require_runtime_terminal_receipts "$target"
    production_transition_commit_runtime_completion "$target"
    deploy_state=receipt-complete
  elif [[ $deploy_state != receipt-complete ]]; then
    fail 'transition deploy state is not resumable'
  fi
  if [[ $deploy_state == receipt-complete ]]; then
    if activated=$(production_transition_read_activation_marker); then
      [[ $activated == "$target" ]] || \
        fail 'authenticated runtime receipt activation differs from target'
    else
      production_transition_require_target_deploy_state "$target" allow-expired
    fi
  else
    production_transition_require_target_deploy_state "$target" allow-expired
  fi
  declare -F production_transition_require_runtime_terminal_receipts >/dev/null || \
    fail 'stable transition runtime terminal-receipt hook is unavailable'
  production_transition_require_runtime_terminal_receipts "$target"
  production_transition_commit_activation "$target"
  production_transition_complete_consumption "$verification"
  production_transition_authorize_scheduler_release "$verification"
  production_transition_resume_scheduler_hold "$target" "$verification"
  flock -u "$lock_fd"
  exec {lock_fd}>&-
}

production_transition_deploy_embedded_target() (
  local target=$1 statement='' signature=''
  cleanup_embedded_target() {
    [[ -z $statement ]] || /usr/bin/rm -f -- "$statement"
    [[ -z $signature ]] || /usr/bin/rm -f -- "$signature"
  }
  trap cleanup_embedded_target EXIT
  statement=$(/usr/bin/mktemp \
    "${TMPDIR:-/tmp}/production-transition-embedded-review.XXXXXX") || \
    fail 'embedded transition review temporary file cannot be created'
  signature=$(/usr/bin/mktemp \
    "${TMPDIR:-/tmp}/production-transition-embedded-signature.XXXXXX") || \
    fail 'embedded transition signature temporary file cannot be created'
  production_transition_materialize_review_from_target \
    "$target" "$statement" "$signature"
  deploy_production_transition_target "$target" "$statement" "$signature"
)

production_transition_finalize_embedded_scheduler_hold() (
  local target=$1 statement='' signature='' verification
  cleanup_embedded_scheduler_hold() {
    [[ -z $statement ]] || /usr/bin/rm -f -- "$statement"
    [[ -z $signature ]] || /usr/bin/rm -f -- "$signature"
  }
  trap cleanup_embedded_scheduler_hold EXIT
  statement=$(/usr/bin/mktemp \
    "${TMPDIR:-/tmp}/production-transition-final-review.XXXXXX") || \
    fail 'terminal transition review temporary file cannot be created'
  signature=$(/usr/bin/mktemp \
    "${TMPDIR:-/tmp}/production-transition-final-signature.XXXXXX") || \
    fail 'terminal transition signature temporary file cannot be created'
  production_transition_verify_signed_target "$target" allow-expired || return 1
  production_transition_materialize_review_from_target \
    "$target" "$statement" "$signature" || return 1
  verification=$(production_transition_verify_embedded_review \
    "$target" "$statement" "$signature" allow-expired) || return 1
  production_transition_finalize_scheduler_hold "$target" "$verification"
)
