#!/usr/bin/env bash
set -euo pipefail

ROOT=/var/data/social-monitor
unset DATABASE_URL
COMPOSE=(
  docker compose -p social-monitor-prod
  --env-file "$ROOT/secrets/production.env"
  -f "$ROOT/integration/docker-compose.yml"
  -f "$ROOT/control/compose.production.yml"
  -f "$ROOT/control/compose.managed-db.yml"
  -f "$ROOT/control/postgres-runtime-current/compose.postgres-runtime.yml"
)
DATE_FLAG=${1:---yesterday}

case "$DATE_FLAG" in
  --today|--yesterday) ;;
  *) echo "usage: $0 [--today|--yesterday]" >&2; exit 64 ;;
esac

exec 9>"$ROOT/control/daily-run.lock"
flock -n 9 || { echo "daily production-day run already active"; exit 0; }

runtime_release=$(cat "$ROOT/control/postgres-runtime-current/READY" 2>/dev/null || true)
backend_release=$(cat "$ROOT/control/deploy-state/backend.sha" 2>/dev/null || true)
if [[ ! $runtime_release =~ ^[0-9a-f]{40}$ || $runtime_release != "$backend_release" ]]; then
  echo "daily production-day runtime is not committed by the backend release" >&2
  exit 75
fi

"$ROOT/control/refresh-codex-auth.sh"

if [[ -f "$ROOT/runtime/auth-account-changed" ]]; then
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  if [[ -d "$ROOT/runtime/subscription-runtime/sessions" ]]; then
    mv "$ROOT/runtime/subscription-runtime/sessions" \
      "$ROOT/backups/subscription-runtime-sessions.$stamp"
  fi
  install -d -m 0700 -o 1000 -g 1000 \
    "$ROOT/runtime/subscription-runtime/sessions"
  "${COMPOSE[@]}" restart agent-runtime
  rm -f "$ROOT/runtime/auth-account-changed"
  sleep 3
fi

# The quoted body expands inside the daily runner container.
# shellcheck disable=SC2016
"${COMPOSE[@]}" --profile daily run --rm --no-deps daily-runner sh -lc '
  set +e
  node scripts/run-with-timeout.mjs \
    --timeout-ms 12300000 \
    --node-options --max-old-space-size=1024 \
    -- ./node_modules/.bin/ts-node -r tsconfig-paths/register \
    scripts/run-reader-summary-production-day.ts '"$DATE_FLAG"' --update
  run_status=$?
  set -e

  mkdir -p /var/lib/social-monitor/artifacts/reports
  if [ -f ops/evals/reader-summary-production-day-run.v1.json ]; then
    cp ops/evals/reader-summary-production-day-run.v1.json /var/lib/social-monitor/artifacts/reports/latest.v1.json
  fi
  cp ops/evals/reader-summary-production-day-run.*.v1.json /var/lib/social-monitor/artifacts/reports/ 2>/dev/null || true
  exit "$run_status"
'
