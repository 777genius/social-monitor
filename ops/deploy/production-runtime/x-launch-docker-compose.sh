#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
if [[ ${SOCIAL_MONITOR_X_LAUNCH_TEST_MODE:-} == 1 && \
      ${BASH_SOURCE[0]} == /var/data/social-monitor/* ]]; then
  echo 'installed Compose wrapper cannot use test mode' >&2
  exit 75
fi
guard=/var/data/social-monitor/control/postgres-runtime-current/x-launch-guard.py
if [[ ${SOCIAL_MONITOR_X_LAUNCH_TEST_MODE:-} == 1 ]]; then
  root=${SOCIAL_MONITOR_X_LAUNCH_TEST_ROOT:?test root required}
  root=$(realpath -e -- "$root" 2>/dev/null) || exit 64
  [[ -d $root && $root == /tmp/* ]] || exit 64
  guard=${SOCIAL_MONITOR_X_LAUNCH_TEST_GUARD:?test guard required}
  docker=${SOCIAL_MONITOR_X_LAUNCH_TEST_DOCKER:?test Docker required}
else
  docker=docker
  unset SOCIAL_MONITOR_X_LAUNCH_TEST_ROOT SOCIAL_MONITOR_X_LAUNCH_TEST_GUARD \
    SOCIAL_MONITOR_X_LAUNCH_TEST_DOCKER
fi
guard_owner=0
[[ ${SOCIAL_MONITOR_X_LAUNCH_TEST_MODE:-} != 1 ]] || guard_owner=$(id -u)
[[ -f $guard && ! -L $guard && \
   $(stat -c '%a:%u' "$guard" 2>/dev/null) == "644:$guard_owner" ]] || {
  echo 'X launch guard is missing or unsafe' >&2
  exit 75
}

# The wrapper is the Compose entrypoint for deploy and the production unit.
# Admission wraps the Docker request, including detached launch completion.
command_name= target_x=false
for argument in "$@"; do
  if [[ -z $command_name ]]; then
    case $argument in up|start|restart|run) command_name=$argument ;; esac
  fi
  [[ $argument != x-collector ]] || target_x=true
done
if [[ $command_name == up || $command_name == start || $command_name == restart ]]; then
  if [[ $target_x == true || " $* " != *' --no-deps '* ]]; then
    exec python3 "$guard" run "$docker" compose "$@"
  fi
fi
if [[ $command_name == run && $target_x == true ]]; then
  exec python3 "$guard" run "$docker" compose "$@"
fi
exec "$docker" compose "$@"
