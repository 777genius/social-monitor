#!/usr/bin/env bash
set -euo pipefail

target=${1:?target SHA is required}
REPO=${REPO:-.}
client=ops/deploy/github-production-deploy-client.sh

fail() {
  printf 'daily-final-bridge-error: %s\n' "$*" >&2
  exit 1
}

# shellcheck source=ops/deploy/deploy-control-bridge-lib.sh
source ops/deploy/deploy-control-bridge-lib.sh

bridge=$(git rev-parse "$target^2" 2>/dev/null || true)
deploy_control_is_reviewed_daily_final_transition "$bridge" "$target" || exit 0

plan=$(mktemp "${RUNNER_TEMP:-/tmp}/daily-final-bridge.XXXXXX")
trap 'rm -f "$plan"' EXIT
bash "$client" inspect-plan "$bridge" > "$plan"
frontend=$(awk -F= '$1 == "frontend" { print $2 }' "$plan")
backend=$(awk -F= '$1 == "backend" { print $2 }' "$plan")
control=$(awk -F= '$1 == "control" { print $2 }' "$plan")
x_collector=$(awk -F= '$1 == "x_collector" { print $2 }' "$plan")
[[ $frontend == false && $backend == false && $x_collector == false ]] || \
  fail 'bridge plan is not control-only'
case $control in
  true) bash "$client" deploy "$bridge" ;;
  false) ;;
  *) fail 'bridge control state is invalid' ;;
esac
