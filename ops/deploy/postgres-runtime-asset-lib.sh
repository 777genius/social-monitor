#!/usr/bin/env bash

# Focused inventory and scope policy for the immutable PostgreSQL/runtime
# control release. Sourced by postgres-runtime-deploy-lib.sh.

postgres_runtime_control_mutation_scope() {
  local source_mode current_mode=absent
  source_mode=$(
    github_premidnight_capture_marker_mode \
      "$REPO/ops/deploy/production-runtime"
  ) || return
  if [[ -e $POSTGRES_RUNTIME_CURRENT || -L $POSTGRES_RUNTIME_CURRENT ]]; then
    current_mode=$(
      github_premidnight_capture_marker_mode "$POSTGRES_RUNTIME_CURRENT"
    ) || return
  fi
  if [[ $source_mode == absent && $current_mode != absent ]]; then
    fail 'GitHub pre-midnight activation marker cannot be removed'
    return 1
  fi
  if [[ $source_mode == install-disabled && $current_mode == enable-now ]]; then
    fail 'GitHub pre-midnight activation marker cannot disable an activated timer'
    return 1
  fi
  if [[ $source_mode != "$current_mode" && $source_mode != absent ]]; then
    if postgres_runtime_base_control_matches_source; then
      printf 'capture-only\n'
    else
      printf 'full\n'
    fi
  elif [[ $source_mode != absent ]]; then
    printf 'full\n'
  else
    printf 'base\n'
  fi
}

postgres_runtime_base_control_matches_source() {
  local source=$REPO/ops/deploy/production-runtime launcher unit
  local -a launchers units
  mapfile -t launchers < <(
    postgres_runtime_control_launchers_for_scope base
  )
  mapfile -t units < <(postgres_runtime_control_units_for_scope base)
  for launcher in "${launchers[@]}"; do
    cmp -s "$source/$launcher" "$CONTROL/$launcher" || return 1
  done
  for unit in "${units[@]}"; do
    cmp -s "$source/$unit" "$SYSTEMD_UNIT_DIR/$unit" || return 1
  done
}

postgres_runtime_control_units_for_scope() {
  case $1 in
    base)
      printf '%s\n' \
        social-monitor-daily.service \
        social-monitor-daily.timer \
        social-monitor-prod.service \
        social-monitor-rolling.service \
        social-monitor-rolling.timer \
        social-monitor-weekly.service \
        social-monitor-weekly.timer
      ;;
    capture-only)
      printf '%s\n' \
        social-monitor-github-premidnight-capture-v1.service \
        social-monitor-github-premidnight-capture-v1.timer
      ;;
    full)
      printf '%s\n' \
        social-monitor-github-premidnight-capture-v1.service \
        social-monitor-github-premidnight-capture-v1.timer \
        social-monitor-daily.service \
        social-monitor-daily.timer \
        social-monitor-prod.service \
        social-monitor-rolling.service \
        social-monitor-rolling.timer \
        social-monitor-weekly.service \
        social-monitor-weekly.timer
      ;;
    *)
      fail 'PostgreSQL runtime-control mutation scope is invalid'
      return 1
      ;;
  esac
}

postgres_runtime_control_launchers_for_scope() {
  case $1 in
    base) printf '%s\n' daily-run.sh rolling-run.sh ;;
    capture-only) printf '%s\n' github-premidnight-capture-v1.sh ;;
    full)
      printf '%s\n' daily-run.sh github-premidnight-capture-v1.sh rolling-run.sh
      ;;
    *)
      fail 'PostgreSQL runtime-control launcher scope is invalid'
      return 1
      ;;
  esac
}

# Every entry required by a clean host to dispatch the daily, weekly, or
# rolling reader-summary one-shot path. Modes are part of the authenticated
# release contract and the list is deliberately product-language explicit.
postgres_runtime_reader_summary_asset_specs() {
  printf '%s\n' \
    '644 compose.agent-runtime-model.yml' \
    '644 compose.daily-artifacts.yml' \
    '755 reader-summary-one-shot.sh' \
    '644 reader-summary-scheduler-hold-common.sh' \
    '755 reader-summary-scheduler-hold-status.sh' \
    '755 reader-summary-scheduler-hold-prepare.sh' \
    '644 reader-summary-scheduler-hold-restore.sh' \
    '755 reader-summary-control-action.sh' \
    '755 rolling-containerd-fallback.sh' \
    '755 rolling-summary-container-run.sh' \
    '755 rolling-summary-receipt.mjs'
}

postgres_runtime_require_reader_summary_source_assets() {
  local source=$1 mode asset
  while read -r mode asset; do
    require_postgres_runtime_regular_source "$source/$asset" "$mode" || return 1
  done < <(postgres_runtime_reader_summary_asset_specs)
}

postgres_runtime_stage_reader_summary_assets() {
  local source=$1 destination=$2 mode asset
  while read -r mode asset; do
    install -m "0$mode" "$source/$asset" "$destination/$asset" || return 1
  done < <(postgres_runtime_reader_summary_asset_specs)
}

postgres_runtime_verify_reader_summary_assets() {
  local source=$1 release=$2 mode asset
  while read -r mode asset; do
    require_postgres_runtime_regular_release_file "$release/$asset" "$mode" || return 1
    cmp -s "$source/$asset" "$release/$asset" || \
      fail "immutable reader-summary runtime asset differs from source: $asset"
  done < <(postgres_runtime_reader_summary_asset_specs)
}

postgres_runtime_reader_summary_asset_count() {
  local count=0 _mode _asset
  while read -r _mode _asset; do
    count=$((count + 1))
  done < <(postgres_runtime_reader_summary_asset_specs)
  printf '%d\n' "$count"
}
