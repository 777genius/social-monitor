#!/usr/bin/env bash
set -euo pipefail
root=/var/data/social-monitor
exec "$root/control/postgres-runtime-current/x-launch-docker-compose.sh" \
  -p social-monitor-prod \
  --env-file "$root/secrets/production.env" \
  -f "$root/integration/docker-compose.yml" \
  -f "$root/control/compose.production.yml" \
  -f "$root/control/compose.managed-db.yml" \
  -f "$root/control/postgres-runtime-current/compose.postgres-runtime.yml" \
  -f "$root/control/postgres-runtime-current/compose.agent-runtime-model.yml" \
  -f "$root/control/postgres-runtime-current/compose.x-launch-guard.yml" \
  --profile app up -d --remove-orphans
