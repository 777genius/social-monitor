#!/usr/bin/env bash

# Review-authority facade retained for deploy history and publisher callers.
# The canonical implementation is the only serializer/parser for v2 review
# authorization records.

declare -F production_transition_verify_canonical_review >/dev/null || \
  fail 'production transition canonical review library is unavailable'

production_transition_verify_a0_and_b0() {
  production_transition_verify_trust_and_protected_blobs \
    "$PRODUCTION_TRANSITION_BRIDGE_BASE" "${1:-}"
}

production_transition_s2_manifest_legacy() {
  production_transition_s2_manifest "$PRODUCTION_TRANSITION_BRIDGE_BASE" "$1"
}

production_transition_verify_review_handoff() {
  local s2=$1 p6=$2 statement=$3 signature=$4 signers=$5
  local lifetime=${6:-fresh}
  production_transition_verify_canonical_review "$s2" "$p6" "$statement" \
    "$signature" "$signers" "$lifetime"
}
