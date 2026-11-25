#!/usr/bin/env bash

# Read-only GitHub lease observation for the one-time production transition.
# Cryptographic admission belongs exclusively to the installed trusted-B0 host
# control. GitHub metadata is an early race/liveness guard, never authority.

PRODUCTION_TRANSITION_MAIN_REPOSITORY=777genius/social-monitor
PRODUCTION_TRANSITION_MAIN_BRANCH=main
PRODUCTION_TRANSITION_GH_BIN=${PRODUCTION_TRANSITION_GH_BIN:-gh}

validate_production_transition_main_observer() {
  command -v "$PRODUCTION_TRANSITION_GH_BIN" >/dev/null 2>&1 ||
    fail 'gh CLI is required to observe protected main'
}

production_transition_observe_main_sha() {
  local sha
  sha=$("$PRODUCTION_TRANSITION_GH_BIN" api --method GET \
    "repos/$PRODUCTION_TRANSITION_MAIN_REPOSITORY/git/ref/heads/$PRODUCTION_TRANSITION_MAIN_BRANCH" \
    --jq '.object.sha') ||
    fail 'protected main lease could not be read'
  [[ $sha =~ ^[0-9a-f]{40}$ ]] ||
    fail 'protected main lease is not one full lowercase commit SHA'
  printf '%s\n' "$sha"
}

production_transition_activate_via_trusted_host() {
  local target=$1 observed_main
  validate_sha "$target"
  validate_production_transition_main_observer
  observed_main=$(production_transition_observe_main_sha)
  [[ $observed_main == "$target" ]] ||
    fail 'protected main is not the exact published transition target'
  run_remote deploy-transition "$target"
}
