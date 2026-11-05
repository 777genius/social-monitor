#!/usr/bin/env bash
# Run INSIDE the reviewed read-only daily image, as uid 1000. The parent mounts
# existing host lock inodes at these exact paths and retires all legacy writers.
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin
export TS_NODE_PROJECT=tsconfig.build.json
[[ $# -ge 3 && $1 =~ ^[a-f0-9]{40}$ && $2 =~ ^[a-f0-9]{40}$ ]] || exit 64
metric_backend=$1
metric_control=$2
shift 2
metric_lock_root=/var/data/social-monitor/control
# Read-only opens cannot create, truncate, or replace the canonical root:0644 locks.
exec 7<"$metric_lock_root/production-deploy.lock"
/usr/bin/flock --exclusive --nonblock 7
exec 9<"$metric_lock_root/daily-run-singleton.lock"
/usr/bin/flock --exclusive --nonblock 9
exec 8<"$metric_lock_root/daily-run.lock"
/usr/bin/flock --exclusive --nonblock 8
# Parent pins the Docker image ID; deployed marker checks happen after all locks.
[[ $(cat "$metric_lock_root/deploy-state/backend.sha") == "$metric_backend" &&
   $(cat "$metric_lock_root/deploy-state/control.sha") == "$metric_control" &&
   $(cat "$metric_lock_root/postgres-runtime-current/READY") == "$metric_backend" ]] || exit 65
# Direct exec preserves descriptors 7/9/8. npm and Node spawn wrappers ordinarily
# close non-stdio descriptors, so they are not supported for this invocation.
exec /usr/bin/timeout --signal=TERM --kill-after=30s 4h node --max-old-space-size=1024 \
  -r ts-node/register -r tsconfig-paths/register scripts/run-retained-metric-refresh.ts "$@"
