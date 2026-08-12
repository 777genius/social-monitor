#!/usr/bin/env bash

if ! declare -F reader_summary_publication_systemctl >/dev/null; then
  reader_summary_publication_systemctl() {
    systemctl "$@"
  }
fi

reader_summary_publication_prebootstrap_absent_daily_timer() {
  local timer=social-monitor-reader-summary-production-day.timer
  local source=$REPO/ops/deploy/production-runtime/social-monitor-reader-summary-production-day.bootstrap.timer
  local destination=$SYSTEMD_UNIT_DIR/$timer next=$SYSTEMD_UNIT_DIR/.$timer.bootstrap-next
  local unit_state active_state

  unit_state=$(reader_summary_publication_systemctl show \
    --property=UnitFileState --value "$timer") || \
    fail 'target publication prebootstrap daily timer state is unavailable'
  active_state=$(reader_summary_publication_systemctl show \
    --property=ActiveState --value "$timer") || \
    fail 'target publication prebootstrap daily timer activity is unavailable'
  [[ -z $unit_state ]] || return 0
  [[ $active_state == inactive && ! -e $destination && ! -L $destination ]] || \
    fail 'target publication prebootstrap daily timer absence is unsafe'
  [[ -f $source && ! -L $source && ! -e $next && ! -L $next ]] || \
    fail 'target publication prebootstrap daily timer asset is invalid'

  install -m 0644 "$source" "$next" || return 1
  if ((EUID == 0)); then chown root:root "$next" || return 1; fi
  mv -f "$next" "$destination" || return 1
  reader_summary_publication_systemctl daemon-reload || return 1
  unit_state=$(reader_summary_publication_systemctl show \
    --property=UnitFileState --value "$timer") || return 1
  active_state=$(reader_summary_publication_systemctl show \
    --property=ActiveState --value "$timer") || return 1
  [[ $unit_state == disabled && $active_state == inactive ]] || \
    fail 'target publication prebootstrap daily timer did not become rollback-safe'
}

reader_summary_publication_prebootstrap_v6_runner() {
  local source=$REPO/ops/deploy/production-runtime/daily-run.sh
  local destination=$CONTROL/run-reader-summary-production-day.sh
  local next=$CONTROL/.run-reader-summary-production-day.sh.bootstrap-next

  if cmp -s "$source" "$destination"; then
    [[ -f $destination && ! -L $destination && -x $destination ]] || \
      fail 'target publication prebootstrap v6 runner target is unsafe'
    return 0
  fi
  [[ -f $source && ! -L $source && \
     ! -e $destination && ! -L $destination && \
     ! -e $next && ! -L $next ]] || \
    fail 'target publication prebootstrap v6 runner state is unsafe'
  install -m 0755 "$source" "$next" || return 1
  if ((EUID == 0)); then chown root:root "$next" || return 1; fi
  mv -f "$next" "$destination"
}

reader_summary_publication_prebootstrap_v6_dropin() {
  local service=social-monitor-reader-summary-production-day.service
  local asset=social-monitor-reader-summary-production-day.service.d-10-daily-c1-owner.conf
  local service_source=$REPO/ops/deploy/production-runtime/social-monitor-daily.service
  local source=$REPO/ops/deploy/production-runtime/$asset
  local service_destination=$SYSTEMD_UNIT_DIR/$service
  local service_next=$SYSTEMD_UNIT_DIR/.$service.bootstrap-next
  local directory=$SYSTEMD_UNIT_DIR/$service.d
  local destination=$directory/10-daily-c1-owner.conf
  local next=$directory/.10-daily-c1-owner.conf.bootstrap-next active_state dropins

  active_state=$(reader_summary_publication_systemctl show \
    --property=ActiveState --value "$service") || \
    fail 'target publication prebootstrap v6 service activity is unavailable'
  dropins=$(reader_summary_publication_systemctl show \
    --property=DropInPaths --value "$service") || \
    fail 'target publication prebootstrap v6 drop-in state is unavailable'
  [[ $active_state == inactive ]] || \
    fail 'target publication prebootstrap v6 service is not inactive'
  if [[ ! -e $service_destination && ! -L $service_destination ]]; then
    [[ -f $service_source && ! -L $service_source && \
       ! -e $service_next && ! -L $service_next ]] || \
      fail 'target publication prebootstrap v6 service asset is invalid'
    install -m 0644 "$service_source" "$service_next" || return 1
    if ((EUID == 0)); then chown root:root "$service_next" || return 1; fi
    mv -f "$service_next" "$service_destination" || return 1
    reader_summary_publication_systemctl daemon-reload || return 1
  else
    [[ -f $service_destination && ! -L $service_destination ]] || \
      fail 'target publication prebootstrap v6 service target is unsafe'
  fi
  if cmp -s "$source" "$destination" && \
     [[ $dropins == "$destination" || -z $dropins ]]; then
    return 0
  fi
  [[ -f $source && ! -L $source && ! -e $next && ! -L $next && \
     ((-z $dropins && ! -e $destination && ! -L $destination) || \
      ($dropins == "$destination" && -f $destination && ! -L $destination)) ]] || \
    fail 'target publication prebootstrap v6 drop-in state is unsafe'
  install -d -m 0755 "$directory" || return 1
  install -m 0644 "$source" "$next" || return 1
  if ((EUID == 0)); then chown root:root "$next" || return 1; fi
  mv -f "$next" "$destination" || return 1
  reader_summary_publication_systemctl daemon-reload || return 1
  dropins=$(reader_summary_publication_systemctl show \
    --property=DropInPaths --value "$service") || return 1
  [[ $dropins == "$destination" ]] && \
    cmp -s "$source" "$destination" || \
    fail 'target publication prebootstrap v6 drop-in did not become exact'
}

reader_summary_publication_prebootstrap_target_daily_runner() {
  if [[ ! ${publication_library+x} && ! ${reviewed_digest+x} &&
        ! ${actual_digest+x} ]]; then
    return 0
  fi
  [[ ${publication_library+x} && ${reviewed_digest+x} &&
     ${actual_digest+x} ]] || fail 'incomplete target publication loader context'

  local expected_publication_library=$REPO/ops/deploy/reader-summary-publication-deploy-lib.sh
  local integration_head process_id deploy_lock_fd expected_deploy_lock
  local admission_lock_fd expected_admission_lock previous_sha services service

  [[ $publication_library == "$expected_publication_library" ]] || \
    fail 'target publication loader path is invalid'
  [[ -n ${reviewed_digest:-} && ${actual_digest:-} == "$reviewed_digest" ]] || \
    fail 'target publication loader digest does not match its review'
  [[ ${sha:-} =~ ^[0-9a-f]{40}$ ]] || fail 'target publication loader SHA is invalid'
  integration_head=$(git -C "$REPO" rev-parse HEAD) || \
    fail 'target publication loader integration HEAD cannot be read'
  [[ $integration_head == "$sha" ]] || \
    fail 'target publication loader integration HEAD does not match its SHA'
  [[ ${backend:-} == true ]] || fail 'target publication prebootstrap backend context is invalid'

  [[ -n ${DEPLOY_LOCK:-} && -n ${POSTGRES_ADMISSION_LOCK:-} ]] || \
    fail 'target publication prebootstrap lock paths are missing'
  process_id=$BASHPID
  deploy_lock_fd=$(readlink -f -- "/proc/$process_id/fd/9") || \
    fail 'target publication prebootstrap deployment lock descriptor is unavailable'
  expected_deploy_lock=$(readlink -f -- "$DEPLOY_LOCK") || \
    fail 'target publication prebootstrap deployment lock path is unavailable'
  admission_lock_fd=$(readlink -f -- "/proc/$process_id/fd/8") || \
    fail 'target publication prebootstrap PostgreSQL admission descriptor is unavailable'
  expected_admission_lock=$(readlink -f -- "$POSTGRES_ADMISSION_LOCK") || \
    fail 'target publication prebootstrap PostgreSQL admission lock path is unavailable'
  [[ $deploy_lock_fd == "$expected_deploy_lock" && \
     $admission_lock_fd == "$expected_admission_lock" ]] || \
    fail 'target publication prebootstrap lock descriptor is invalid'

  declare -F marker_value >/dev/null || \
    fail 'target publication prebootstrap backend marker helper is missing'
  declare -F backend_services >/dev/null || \
    fail 'target publication prebootstrap backend service helper is missing'
  declare -F daily_runner_image_bootstrap_before_rescue >/dev/null || \
    fail 'target publication prebootstrap daily-runner bootstrap helper is missing'
  previous_sha=$(marker_value backend) || \
    fail 'target publication prebootstrap backend marker cannot be read'
  [[ $previous_sha =~ ^[0-9a-f]{40}$ ]] || \
    fail 'target publication prebootstrap backend marker is invalid'
  if [[ $previous_sha != "$sha" ]]; then
    services=$(backend_services "$previous_sha" "$sha") || \
      fail 'target publication prebootstrap backend service discovery failed'
    while IFS= read -r service; do
      [[ $service == daily-runner ]] || continue
      daily_runner_image_bootstrap_before_rescue "$previous_sha" "$sha" || return 1
      break
    done <<< "$services"
  fi
  reader_summary_publication_prebootstrap_v6_runner
  reader_summary_publication_prebootstrap_absent_daily_timer
  reader_summary_publication_prebootstrap_v6_dropin
}
