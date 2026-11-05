# Sourced only by the pinned posts router. Reuses its complete history preclaim,
# global lock, role fence, backup, watchdog and verified cleanup functions.
telegram_channel_release() {
  /usr/bin/python3 -I -S -B /usr/local/lib/social-monitor/current-source-guard/current_telegram_channel_admission.py release
}

telegram_channel_init() {
  [[ $# -eq 0 ]] || return 64
  day=$today
  slot=$(printf '%02d' "$((10#${started:9:2} / 4 * 4))")
  telegram_release=$(telegram_channel_release) || return 78
  image=$(jq -er '.release.image' <<< "$telegram_release") || return 78
  telegram_release_sha=$(jq -er '.release_sha256' <<< "$telegram_release") || return 78
  [[ $image =~ ^sha256:[0-9a-f]{64}$ && $telegram_release_sha =~ ^[0-9a-f]{64}$ ]] || return 78
}

telegram_channel_publish() {
  local target=$1
  [[ ! -e $target.next && ! -L $target.next ]] || return 78
  cat > "$target.next" || return 78
  chmod 600 "$target.next" || return 78
  sync -f "$target.next" || return 78
  mv -T "$target.next" "$target" || return 78
  sync -f "$target" "${target%/*}"
}

telegram_channel_cleanup() {
  local launcher_rc=$? terminal=FAILED_POSSIBLE_WRITES after=UNKNOWN rc=1 completed state_sha result_sha started_sha role_safe=1 container_safe=1
  trap - EXIT INT TERM
  set +e
  if [[ -n ${collector_pid:-} ]] && kill -0 "$collector_pid" 2>/dev/null; then
    kill -TERM "$collector_pid" 2>/dev/null
    wait "$collector_pid" 2>/dev/null
  fi
  # Closing LOGIN also terminates any existing sessions via the native fence.
  revoke_role && role_safe=0
  remove_container "$name" && container_safe=0
  if [[ $role_safe == 0 && $container_safe == 0 ]] && role_closed "$id"; then
    after=$(psql_data 'SELECT (SELECT count(*) FROM source_items)||chr(44)||(SELECT count(*) FROM feed_items)')
    if [[ $launcher_rc == 0 && ${collector_rc:-125} == 0 && ${collector_quiesced:-0} == 1 &&
          $after =~ ^[0-9]+,[0-9]+$ && ! -e $record/watchdog-fired && ! -L $record/watchdog-fired ]]; then
      terminal=COMPLETED_VALIDATED
      rc=0
    fi
  fi
  printf '%s mode=telegram-channel date=%s artifact=%s collector_exit=%s exit=%s before=%s after=%s slot=%s release_sha256=%s\n' \
    "$terminal" "$day" "$artifact" "${collector_rc:-125}" "$rc" "$before" "$after" "$slot" "$telegram_release_sha" |
    telegram_channel_publish "$record/state" || rc=1
  if [[ $rc == 0 ]]; then
    completed=$(date -u +%s)
    state_sha=$(sha256sum "$record/state" | cut -d' ' -f1)
    result_sha=$(sha256sum "$record/result.json" | cut -d' ' -f1)
    started_sha=$(sha256sum "$record/started-state" | cut -d' ' -f1)
    jq -cn --arg id "$id" --arg state "$state_sha" --arg result "$result_sha" \
      --arg started "$started_sha" --arg release "$telegram_release_sha" --argjson at "$completed" \
      '{version:1,attemptId:$id,startedStateSha256:$started,stateSha256:$state,releaseSha256:$release,resultSha256:$result,completedAt:$at}' |
      telegram_channel_publish "$record/terminal-proof" || rc=1
    /usr/bin/python3 -I -S -B /usr/local/lib/social-monitor/current-source-guard/current_telegram_channel_admission.py \
      validate-terminal "$id" >/dev/null || rc=1
    # The independent timer remains armed until state and artifact qualification.
    [[ $rc != 0 ]] || stop_watchdog "$watchdog_unit" || rc=1
    [[ $rc != 0 ]] || { role_closed "$id" && container_absent "$name" && watchdog_inactive "$watchdog_unit"; } || rc=1
    [[ $rc != 0 ]] || /usr/bin/python3 -I -S -B /usr/local/lib/social-monitor/current-source-guard/current_telegram_channel_admission.py \
      validate-terminal "$id" >/dev/null || rc=1
  fi
  if [[ $rc != 0 && $terminal == COMPLETED_VALIDATED ]]; then
    printf 'UNRESOLVED mode=telegram-channel date=%s artifact=%s\n' "$day" "$artifact" |
      telegram_channel_publish "$record/state"
  fi
  printf 'telegram-channel channel=hiaimediaen status=%s exit=%s\n' "$terminal" "$rc"
  exit "$rc"
}

telegram_channel_run() {
  local entry=/usr/local/lib/social-monitor/telegram-channel/collection-entrypoint.sh release_now
  [[ -f $entry && ! -L $entry && $(stat -c '%u:%g:%a:%h' "$entry") == 0:0:644:1 ]] || exit 78
  # Pin is supplied by the reviewed router/module cascade, never environment.
  [[ $(sha256sum "$entry" | cut -d' ' -f1) == cf48bc9b9a4445cf4c46badcb7fd64e2bda35cd96100cba365f7f1c3cd060f36 ]] || exit 78
  release_now=$(telegram_channel_release) || exit 78
  [[ $release_now == "$telegram_release" ]] || exit 78
  [[ $(date -u +%F) == "$day" && $(printf '%02d' "$((10#$(date -u +%H) / 4 * 4))") == "$slot" ]] || exit 78
  prewrite_receipt=$(/usr/local/sbin/social-monitor-posts-prewrite-backup) || exit 78
  prewrite_receipt_valid "$prewrite_receipt" "$day" "$slot" || exit 78
  [[ $(( $(date -u +%s) % 14400 )) -lt 13740 ]] || exit 75
  revoke_role || exit 78
  started=$(date -u +%Y%m%dT%H%M%SZ) || exit 78
  uuid=$(cat /proc/sys/kernel/random/uuid)
  id="$started-$uuid"
  name="social-posts-${id,,}"
  watchdog_unit="social-posts-wd-$uuid"
  artifact="telegram-hiaimediaen-${started:0:8}-${slot}-$uuid"
  record="$state/posts-once/$id"
  mkdir -m 700 "$record" || exit 78
  jq '{role: .new_name, oid: .new_oid}' "$state/current-partial-R-closure-20261006/closed-v2.receipt" > "$record/generation-role" || exit 78
  cp --no-clobber /var/lib/platform/social-monitor/telegram-channel/release.json "$record/release.json" || exit 78
  [[ $(sha256sum "$record/release.json" | cut -d' ' -f1) == "$telegram_release_sha" ]] || exit 78
  before=$(psql_data 'SELECT (SELECT count(*) FROM source_items)||chr(44)||(SELECT count(*) FROM feed_items)') || exit 78
  [[ $before =~ ^[0-9]+,[0-9]+$ ]] || exit 78
  until=$(date -u -d '+10 minutes' +%FT%TZ)
  printf 'STARTED mode=telegram-channel date=%s artifact=%s image=%s before=%s watchdog=%s credential_deadline=%s slot=%s release_sha256=%s\n' \
    "$day" "$artifact" "$image" "$before" "$watchdog_unit" "$until" "$slot" "$telegram_release_sha" > "$record/state" || exit 78
  cp --no-clobber "$record/state" "$record/started-state" || exit 78
  sync -f "$record/generation-role" "$record/release.json" "$record/state" "$record/started-state" "$record" "$state/posts-once" || exit 78
  collector_rc=125
  collector_quiesced=0
  trap telegram_channel_cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  systemd-run --quiet --unit="$watchdog_unit" --on-active=11m --on-unit-active=1m \
    --property=Type=oneshot --property=TimeoutStartSec=5m \
    /usr/local/sbin/social-monitor-posts-once watchdog "$id" || exit 78
  systemctl is-active --quiet "$watchdog_unit.timer" || exit 78
  [[ $("$fence" admit) == "$role" ]] || exit 75
  prewrite_receipt_valid "$prewrite_receipt" "$day" "$slot" || exit 78
  "$fence" open-attempt "$id" "$until" "$prewrite_receipt" >/dev/null || exit 78
  set +e
  timeout --signal=TERM --kill-after=15s 4m docker run --rm --name "$name" \
    --network platform-social-monitor --add-host host.docker.internal:host-gateway \
    --user 0:0 --read-only --security-opt no-new-privileges:true --cap-drop ALL --cap-add SETUID --cap-add SETGID \
    --pids-limit 128 --memory 1g --cpus 1 --tmpfs /tmp:rw,nosuid,nodev,size=64m \
    --mount type=bind,src=/etc/platform/projects/social-monitor/secrets/postgres-collection-password,dst=/run/secrets/postgres-collection-password,readonly \
    --mount type=bind,src=/etc/platform/projects/social-monitor/secrets/postgres-ca.crt,dst=/run/postgres-ca.crt,readonly \
    --mount "type=bind,src=$entry,dst=/run/bootstrap/telegram-channel-entrypoint.sh,readonly" \
    --env SOCIAL_MONITOR_RUNTIME_PROFILE=beta --env NODE_ENV=production \
    --entrypoint /bin/sh "$image" /run/bootstrap/telegram-channel-entrypoint.sh --collect \
    > "$record/result.json" 2> "$record/collector.stderr" &
  collector_pid=$!
  wait "$collector_pid"
  collector_rc=$?
  collector_quiesced=1
  set -e
  sync -f "$record/result.json" "$record/collector.stderr" "$record" || exit 78
  exit "$collector_rc"
}
