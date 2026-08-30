#!/usr/bin/env bash

reader_summary_publication_install_migrator_fixture_assets() {
  local source_dir=$1 repository=$2
  mkdir -p "$repository/ops/deploy/production-runtime"
  cp "$source_dir"/{deploy-control-lib.sh,deploy-control-bridge-lib.sh,postgres-runtime-deploy-lib.sh,postgres-runtime-asset-lib.sh,postgres-runtime-weekly-timer-state-lib.sh,postgres-runtime-daily-c1-readiness-lib.sh,postgres-runtime-activation-boundary-lib.sh,backend-runtime-health-lib.sh,backend-image-rescue-lib.sh,backend-image-rescue-pin-cleanup-lib.sh,x-collector-image-deploy-lib.sh,reader-summary-recovery-maintenance-lib.sh,social-monitor-production-deploy.sh,postgres-backup-deploy-lib.sh,reader-summary-publication-system-runtime-deploy-lib.sh} \
    "$repository/ops/deploy/"
  cp "$source_dir/production-runtime/reader-summary-scheduler-hold-common.sh" \
    "$source_dir/production-runtime/reader-summary-scheduler-hold-restore.sh" \
    "$repository/ops/deploy/production-runtime/"
}
