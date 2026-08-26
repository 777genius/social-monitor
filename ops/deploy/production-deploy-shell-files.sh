#!/usr/bin/env bash

# Emits the production deploy shell verification surface in execution order.
# The bridge phase intentionally omits scripts that depend on final-only assets.
production_deploy_shell_files() {
  local bridge_phase=${1:-}
  local -a common_files=(
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
  local -a final_only_files=(
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

  case $bridge_phase in
    true)
      printf '%s\n' "${common_files[@]}"
      ;;
    false)
      printf '%s\n' "${common_files[@]}" "${final_only_files[@]}"
      ;;
    *)
      printf 'deploy-shell-files-error: bridge phase must be true or false\n' >&2
      return 2
      ;;
  esac
}
