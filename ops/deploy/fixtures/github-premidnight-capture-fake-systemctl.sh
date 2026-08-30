#!/usr/bin/env bash
set -euo pipefail

unit_dir=${GITHUB_PREMIDNIGHT_FAKE_SYSTEMD_UNIT_DIR:?fake systemd unit directory is required}
: "${GITHUB_PREMIDNIGHT_FAKE_SYSTEMCTL_CONTROL:?fake systemctl control root is required}"
events=${GITHUB_PREMIDNIGHT_FAKE_SYSTEMCTL_EVENTS:?fake systemctl event path is required}
printf '%s\n' "$*" >> "$events"

if [[ $1 == daemon-reload ]]; then
  [[ $# == 1 ]]
  exit "${GITHUB_PREMIDNIGHT_FAKE_SYSTEMCTL_DAEMON_RELOAD_STATUS:-0}"
fi
if [[ $1 == is-enabled && $2 == --quiet ]]; then
  [[ $# == 3 && $3 == social-monitor-daily.timer ]]
  exit
fi
if [[ $1 == cat ]]; then
  [[ $# == 2 && $2 == social-monitor-daily.service ]] || exit 1
  printf '%s\n' \
    '[Service]' \
    'ExecStart=/var/data/social-monitor/control/postgres-runtime-current/reader-summary-one-shot.sh daily' \
    'TimeoutStartSec=19800' 'Restart=no'
  exit
fi
[[ $1 == show && $2 == --property=* && $3 == --value && $# == 4 ]] || exit 1
property=${2#--property=}
unit=$4
case $property in
  FragmentPath)
    printf '%s/%s\n' "$unit_dir" "$unit"
    ;;
  DropInPaths)
    if [[ ${GITHUB_PREMIDNIGHT_FAKE_SYSTEMCTL_REJECT_DROPIN:-false} == false ]]; then
      printf '\n'
    else
      printf '/unreviewed.conf\n'
    fi
    ;;
  UnitFileState)
    [[ $unit == social-monitor-github-premidnight-capture-v1.timer ]] || exit 1
    printf '%s\n' "${GITHUB_PREMIDNIGHT_FAKE_TIMER_UNIT_FILE_STATE:-disabled}"
    ;;
  ActiveState)
    case $unit in
      social-monitor-github-premidnight-capture-v1.timer)
        printf '%s\n' "${GITHUB_PREMIDNIGHT_FAKE_TIMER_ACTIVE_STATE:-inactive}"
        ;;
      social-monitor-github-premidnight-capture-v1.service)
        printf '%s\n' "${GITHUB_PREMIDNIGHT_FAKE_SERVICE_ACTIVE_STATE:-inactive}"
        ;;
      *)
        exit 1
        ;;
    esac
    ;;
  *)
    exit 1
    ;;
esac
