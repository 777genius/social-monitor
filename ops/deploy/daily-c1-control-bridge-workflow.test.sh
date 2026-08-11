#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/daily-c1-control-bridge.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo

fail() {
  printf 'daily-c1-bridge-test-error: %s\n' "$*" >&2
  exit 1
}

# shellcheck source=ops/deploy/deploy-control-bridge-lib.sh
source "$SCRIPT_DIR/deploy-control-bridge-lib.sh"

expected_sealed_paths=$(cat <<'PATHS'
ops/deploy/backend-image-rescue-lib.sh
ops/deploy/deploy-control-bridge-lib.sh
ops/deploy/deploy-control-lib.sh
ops/deploy/postgres-runtime-activation-boundary-lib.sh
ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh
ops/deploy/postgres-runtime-deploy-lib.sh
ops/deploy/postgres-runtime-weekly-timer-state-lib.sh
ops/deploy/reader-summary-recovery-maintenance-lib.sh
ops/deploy/social-monitor-production-deploy.sh
ops/deploy/x-collector-image-deploy-lib.sh
PATHS
)
actual_sealed_paths=$(deploy_control_bridge_sealed_paths | LC_ALL=C sort)
[[ $actual_sealed_paths == "$expected_sealed_paths" ]] || \
  fail 'sealed source path manifest is not exact'

git init -q -b main "$REPO"
git -C "$REPO" config user.name 'Daily C1 bridge workflow test'
git -C "$REPO" config user.email daily-c1-bridge@example.invalid
printf 'canonical B2 fixture\n' > "$REPO/base"
git -C "$REPO" add base
git -C "$REPO" commit -qm 'test: seed canonical B2 fixture'
base=$(git -C "$REPO" rev-parse HEAD)

bridge_paths=()
while IFS= read -r bridge_path; do
  bridge_paths+=("$bridge_path")
done < <(deploy_control_daily_c1_bridge_release_paths)
[[ ${#bridge_paths[@]} == 19 ]] || fail 'daily C1 bridge release manifest count drifted'
[[ $(printf '%s\n' "${bridge_paths[@]}" | LC_ALL=C sort -u | wc -l | tr -d ' ') == 19 ]] || \
  fail 'daily C1 bridge release manifest contains duplicates'
for path in "${bridge_paths[@]}"; do
  install -d "$REPO/$(dirname "$path")"
  printf 'reviewed bridge fixture: %s\n' "$path" > "$REPO/$path"
done
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: exact daily C1 control bridge'
exact_bridge=$(git -C "$REPO" rev-parse HEAD)

expected_diff=$(printf '%s\n' "${bridge_paths[@]}" | LC_ALL=C sort)
actual_diff=$(git -C "$REPO" diff --name-only --no-renames \
  "$base" "$exact_bridge" -- | LC_ALL=C sort)
[[ $actual_diff == "$expected_diff" ]] || fail 'fixture diff is not byte-exact manifest'
deploy_control_is_exact_daily_c1_bridge_release "$base" "$exact_bridge" || \
  fail 'exact B2 bridge diff was not detected'
[[ $(deploy_control_daily_c1_bridge_classification) == \
  $'frontend=false\nbackend=false\ncontrol=true' ]] || \
  fail 'daily C1 bridge classification is not exact control-only output'

install -d "$REPO/ops/deploy/production-runtime"
printf 'forbidden final runtime asset\n' > \
  "$REPO/ops/deploy/production-runtime/reader-summary-daily-c1.readiness"
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: add final asset to bridge'
asset_target=$(git -C "$REPO" rev-parse HEAD)
if deploy_control_is_exact_daily_c1_bridge_release "$base" "$asset_target"; then
  fail 'bridge detector admitted a final runtime asset'
fi

git -C "$REPO" checkout -q "$exact_bridge"
rm "$REPO/${bridge_paths[1]}"
git -C "$REPO" add -A
git -C "$REPO" commit -qm 'test: remove one manifest path'
missing_target=$(git -C "$REPO" rev-parse HEAD)
if deploy_control_is_exact_daily_c1_bridge_release "$base" "$missing_target"; then
  fail 'bridge detector admitted a missing manifest path'
fi

workflow=$PROJECT_ROOT/.github/workflows/production-deploy.yml
grep -F 'daily_c1_bridge_base=e3b5b5d89b3586668e36f987f03672415b5a0f37' \
  "$workflow" >/dev/null
[[ $(grep -Fc 'deploy_control_is_exact_daily_c1_bridge_release' "$workflow") == 1 ]] || \
  fail 'workflow must enforce exact B2 detection in its authoritative plan'
grep -F 'daily_c1_bridge: ${{ steps.plan.outputs.daily_c1_bridge }}' \
  "$workflow" >/dev/null || fail 'workflow does not export the exact bridge decision'
grep -F 'DAILY_C1_BRIDGE: ${{ needs.plan.outputs.daily_c1_bridge }}' \
  "$workflow" >/dev/null || fail 'backend gate does not consume the bridge decision'
grep -F 'backend-gate=production-release-preflight deferred-to-final-runtime-release' \
  "$workflow" >/dev/null || fail 'bridge does not defer the final-only release preflight'
grep -F 'backend-gate=weekly-runtime-contract deferred-to-final-runtime-release' \
  "$workflow" >/dev/null || fail 'bridge does not defer the final-only weekly runtime contract'
grep -F 'shellcheck -S warning -x "${deploy_shell_files[@]}"' \
  "$workflow" >/dev/null || fail 'workflow treats informational shellcheck findings as release failures'
grep -F "needs.plan.outputs.daily_c1_bridge != 'true'" \
  "$workflow" >/dev/null || fail 'bridge does not defer final-only legacy transition fixtures'
[[ $(grep -Fc "needs.plan.outputs.daily_c1_bridge != 'true'" "$workflow") == 9 ]] || \
  fail 'bridge must defer exactly the publication, frontend and legacy final-only gates'
grep -F 'Install the daily-runner bootstrap repair before the daily C1 bridge' \
  "$workflow" >/dev/null || fail 'bridge does not install its control-only bootstrap repair'
grep -F 'bootstrap_repair=28278e31' \
  "$workflow" >/dev/null || fail 'bridge bootstrap repair is not pinned to its reviewed commit'
grep -F 'Deploy the daily C1 bridge through the repaired controller' \
  "$workflow" >/dev/null || fail 'bridge does not run through the repaired controller'
grep -F 'bash ops/deploy/github-production-deploy-client.sh deploy "$GITHUB_SHA"' \
  "$workflow" >/dev/null || fail 'daily C1 bridge bypasses the reviewed deploy client'
! grep -F 'daily C1 bridge classification is not control-only' "$workflow" >/dev/null || \
  fail 'workflow confused live pending components with the control-only bridge diff'

printf 'daily C1 control bridge workflow tests passed\n'
