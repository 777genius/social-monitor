#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
PRODUCTION_WORKFLOW=$PROJECT_ROOT/.github/workflows/production-deploy.yml
PR_WORKFLOW=$PROJECT_ROOT/.github/workflows/pull-request.yml

# shellcheck source=ops/deploy/production-deploy-shell-files.sh
source "$SCRIPT_DIR/production-deploy-shell-files.sh"

fail() {
  printf 'deploy-shell-files-test-error: %s\n' "$*" >&2
  exit 1
}

assert_array_equals() {
  local label=$1 expected_name=$2 actual_name=$3 index
  local -n expected_ref=$expected_name
  local -n actual_ref=$actual_name
  ((${#actual_ref[@]} == ${#expected_ref[@]})) ||
    fail "$label count: expected ${#expected_ref[@]}, received ${#actual_ref[@]}"
  for index in "${!expected_ref[@]}"; do
    [[ ${actual_ref[$index]} == "${expected_ref[$index]}" ]] ||
      fail "$label[$index]: expected ${expected_ref[$index]}, received ${actual_ref[$index]}"
  done
}

expected_bridge=(
  ops/deploy/production-deploy-shell-files.sh
  ops/deploy/production-deploy-shell-files.test.sh
  ops/deploy/social-monitor-production-deploy.sh
  ops/deploy/backend-runtime-health-lib.sh
  ops/deploy/backend-runtime-health-lib.test.sh
  ops/deploy/otel-collector-deploy-lifecycle.test.sh
  ops/deploy/backend-image-rescue-lib.sh
  ops/deploy/backend-image-rescue-lib.test.sh
  ops/deploy/x-collector-image-deploy-lib.sh
  ops/deploy/x-collector-image-deploy-lib.test.sh
  ops/deploy/deploy-control-bridge-lib.sh
  ops/deploy/deploy-control-lib.sh
  ops/deploy/deploy-control-lib.test.sh
  ops/deploy/github-production-deploy-client.sh
  ops/deploy/github-production-deploy-client.test.sh
  ops/deploy/postgres-pool-atomic-bootstrap-lib.sh
  ops/deploy/postgres-pool-atomic-bootstrap-lib.test.sh
  ops/deploy/postgres-runtime-deploy-lib.sh
  ops/deploy/postgres-runtime-activation-boundary-lib.sh
  ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh
  ops/deploy/postgres-runtime-weekly-timer-state-lib.sh
  ops/deploy/reader-summary-publication-prebootstrap-lib.sh
  ops/deploy/reader-summary-publication-prebootstrap-lib.test.sh
  ops/deploy/reader-summary-recovery-maintenance-lib.sh
  ops/deploy/deploy-control-bridge-runtime-helper.test.sh
  ops/deploy/deploy-control-reviewed-library-source.test.sh
  ops/deploy/daily-c1-control-bridge-workflow.test.sh
  ops/deploy/production-release-b-bridge-order.test.sh
  ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh
  ops/deploy/reader-summary-publication-bridge-transition.test.sh
  ops/deploy/social-monitor-production-ssh-wrapper.sh
  ops/deploy/social-monitor-production-ssh-wrapper.test.sh
  ops/deploy/production-runtime/daily-run.sh
  ops/deploy/production-runtime/github-premidnight-capture-v1.sh
  ops/deploy/github-premidnight-capture-runtime.test.sh
  ops/deploy/fixtures/github-premidnight-capture-fake-date.sh
  ops/deploy/fixtures/github-premidnight-capture-fake-docker.sh
  ops/deploy/fixtures/github-premidnight-capture-fake-flock.sh
  ops/deploy/fixtures/github-premidnight-capture-fake-systemctl.sh
  ops/deploy/fixtures/github-premidnight-capture-fake-timeout.sh
  ops/deploy/postgres-pool-bootstrap-transition.test.sh
  ops/deploy/host/refresh-codex-auth.sh
  ops/deploy/refresh-codex-auth.test.sh
  ops/deploy/prune-pre-autodeploy-backups.sh
  ops/deploy/prune-pre-autodeploy-backups.test.sh
  ops/deploy/verify-postgres-backup-coverage.sh
  ops/deploy/verify-postgres-backup-coverage.test.sh
  ops/deploy/verify-postgres-pool-release-contract.test.sh
  ops/deploy/postgres-runtime-deploy-lib.test.sh
  ops/deploy/verify-postgres-runtime-topology.test.sh
)
expected_final_only=(
  ops/deploy/daily-deploy-lock-race.test.sh
  ops/deploy/backend-image-rescue-migrate-fallback.test.sh
  ops/deploy/postgres-runtime-daily-c1-readiness-lib.test.sh
  ops/deploy/reader-summary-daily-delivery-c1-action.test.sh
  ops/deploy/github-production-maintenance-dispatch.sh
  ops/deploy/github-production-maintenance-dispatch.test.sh
  ops/deploy/postgres-backup-deploy-lib.sh
  ops/deploy/reader-summary-publication-deploy-lib.sh
  ops/deploy/reader-summary-publication-system-dsn-bootstrap-lib.sh
  ops/deploy/reader-summary-publication-system-runtime-deploy-lib.sh
  ops/deploy/reader-summary-publication-migrator-validation.test.sh
  ops/deploy/reader-summary-publication-signal-regression.test.sh
  ops/deploy/fixtures/reader-summary-publication-fake-docker.sh
  ops/deploy/fixtures/reader-summary-publication-pause-worker.sh
)
expected_non_bridge=("${expected_bridge[@]}" "${expected_final_only[@]}")

mapfile -t actual_bridge < <(production_deploy_shell_files true)
mapfile -t actual_non_bridge < <(production_deploy_shell_files false)
assert_array_equals bridge expected_bridge actual_bridge
assert_array_equals non-bridge expected_non_bridge actual_non_bridge

if production_deploy_shell_files invalid >/dev/null 2>&1; then
  fail 'invalid phase was accepted'
fi

declare -A seen=()
for deploy_file in "${actual_non_bridge[@]}"; do
  [[ -f $PROJECT_ROOT/$deploy_file && ! -L $PROJECT_ROOT/$deploy_file ]] ||
    fail "listed path is not a regular repository file: $deploy_file"
  [[ -z ${seen[$deploy_file]:-} ]] || fail "duplicate path: $deploy_file"
  seen[$deploy_file]=1
done

for workflow in "$PRODUCTION_WORKFLOW" "$PR_WORKFLOW"; do
  [[ $(grep -Fc 'source ops/deploy/production-deploy-shell-files.sh' "$workflow") == 1 ]] ||
    fail "workflow must source the authoritative list exactly once: $workflow"
  [[ $(grep -Fc 'bash -n "${deploy_shell_files[@]}"' "$workflow") == 1 ]] ||
    fail "workflow must run the production bash syntax gate exactly once: $workflow"
  [[ $(grep -Fc 'shellcheck -S warning -x "${deploy_shell_files[@]}"' "$workflow") == 1 ]] ||
    fail "workflow must run the exact production ShellCheck gate exactly once: $workflow"
  if grep -F 'deploy_shell_files=(' "$workflow" >/dev/null; then
    fail "workflow contains a second inline deploy shell list: $workflow"
  fi
done

[[ $(grep -Fc 'production_deploy_shell_files "$bridge_phase"' \
  "$PRODUCTION_WORKFLOW") == 1 ]] ||
  fail 'production workflow must resolve the authoritative phase-specific list'
[[ $(grep -Fc 'production_deploy_shell_files false' "$PR_WORKFLOW") == 1 ]] ||
  fail 'PR workflow must resolve the authoritative non-bridge superset'
[[ $(grep -Fc 'bash ops/deploy/production-deploy-shell-files.test.sh' \
  "$PR_WORKFLOW") == 1 ]] ||
  fail 'PR workflow must execute the authoritative-list regression'

printf 'Production deploy shell-file list tests passed\n'
