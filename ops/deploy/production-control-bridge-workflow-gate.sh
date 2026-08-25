#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin

event=${1:-} acknowledgement=${2:-} target=${3:-}
[[ $event == push || $event == workflow_dispatch ]] || { echo 'bridge-gate: invalid event' >&2; exit 1; }
[[ $target =~ ^[0-9a-f]{40}$ ]] || { echo 'bridge-gate: invalid target' >&2; exit 1; }
REPO=$(git rev-parse --show-toplevel)
fail() { printf 'bridge-gate: %s\n' "$*" >&2; exit 1; }
# shellcheck source=ops/deploy/deploy-control-bridge-lib.sh
source "$REPO/ops/deploy/deploy-control-bridge-lib.sh"

if deploy_control_is_production_bridge_candidate "$target"; then
  deploy_control_is_exact_production_bridge "$target" || fail 'bridge candidate is not the exact reviewed tree'
  if [[ $event == push ]]; then
    fail 'initial exact bridge push is intentionally stopped before production SSH; run the reviewed root bootstrap first'
  fi
  [[ $acknowledgement == "production-control-bridge-bootstrap-complete:$target" ]] || \
    fail 'explicit bridge acknowledgement is not bound to the exact merged SHA'
  printf 'production_control_bridge=true\n'
  exit 0
fi
[[ -z $acknowledgement ]] || fail 'bridge acknowledgement is forbidden for a non-bridge target'
printf 'production_control_bridge=false\n'
