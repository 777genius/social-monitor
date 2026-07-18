#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
VERIFIER=$SCRIPT_DIR/verify-postgres-runtime-topology.py
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/postgres-runtime-topology-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

rendered=$FIXTURE/rendered.json
facts=$FIXTURE/facts.json
operator_env=$FIXTURE/production.env

cat > "$rendered" <<'JSON'
{
  "services": {
    "api": {"environment": {"POSTGRES_RUNTIME_PROCESS": "api-gateway", "POSTGRES_RUNTIME_POOL_MIN": "0", "POSTGRES_RUNTIME_POOL_MAX": "2"}, "deploy": {"replicas": 1}},
    "ingestion-worker": {"environment": {"POSTGRES_RUNTIME_PROCESS": "ingestion-worker", "POSTGRES_RUNTIME_POOL_MIN": "0", "POSTGRES_RUNTIME_POOL_MAX": "2"}, "deploy": {"replicas": 1}},
    "intelligence-worker": {"environment": {"POSTGRES_RUNTIME_PROCESS": "intelligence-worker", "POSTGRES_RUNTIME_POOL_MIN": "0", "POSTGRES_RUNTIME_POOL_MAX": "2"}, "deploy": {"replicas": 1}},
    "delivery-service": {"environment": {"POSTGRES_RUNTIME_PROCESS": "delivery-service", "POSTGRES_RUNTIME_POOL_MIN": "0", "POSTGRES_RUNTIME_POOL_MAX": "1"}, "deploy": {"replicas": 1}},
    "event-relay": {"environment": {"POSTGRES_RUNTIME_PROCESS": "event-relay", "POSTGRES_RUNTIME_POOL_MIN": "0", "POSTGRES_RUNTIME_POOL_MAX": "1"}, "deploy": {"replicas": 1}},
    "daily-runner": {"environment": {"POSTGRES_RUNTIME_PROCESS": "daily-runner", "POSTGRES_RUNTIME_POOL_MIN": "0", "POSTGRES_RUNTIME_POOL_MAX": "2"}, "deploy": {"replicas": 1}},
    "migrate": {"environment": {}}
  }
}
JSON

cat > "$facts" <<'JSON'
{"serverMaxConnections": 25, "superuserReservedConnections": 3, "reservedConnections": 0, "roleConnectionLimit": -1, "databaseConnectionLimit": -1, "externalConnectionOccupancy": 0, "stoppedRuntimeConnectionOccupancy": 0, "capturePhase": "post-old-container-stop-pre-new-start"}
JSON
: > "$operator_env"

output=$(python3 "$VERIFIER" "$rendered" "$facts" "$operator_env")
grep -F 'server_max_connections=25' <<< "$output" >/dev/null
grep -F 'server_reserved_connections=3' <<< "$output" >/dev/null
grep -F 'effective_capacity=22' <<< "$output" >/dev/null
grep -F 'external_occupancy=0' <<< "$output" >/dev/null
grep -F 'available_capacity=22' <<< "$output" >/dev/null
grep -F 'required_reserve=5' <<< "$output" >/dev/null
grep -F 'provider_headroom=6' <<< "$output" >/dev/null
grep -F 'repository_ceiling=17' <<< "$output" >/dev/null
grep -F 'replacement_overlap=0' <<< "$output" >/dev/null

python3 - "$rendered" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
rendered = json.loads(path.read_text(encoding="utf-8"))
rendered["services"]["migrate"]["environment"]["POSTGRES_PROVIDER_MAX_CONNECTIONS"] = "25"
path.write_text(json.dumps(rendered), encoding="utf-8")
PY
if python3 "$VERIFIER" "$rendered" "$facts" >/dev/null 2>&1; then
  echo 'stale operator capacity claim was accepted' >&2
  exit 1
fi

printf 'POSTGRES_PROVIDER_HEADROOM=999\n' > "$operator_env"
if python3 "$VERIFIER" "$rendered" "$facts" "$operator_env" >/dev/null 2>&1; then
  echo 'unused stale production-environment capacity claim was accepted' >&2
  exit 1
fi
: > "$operator_env"

python3 - "$rendered" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
rendered = json.loads(path.read_text(encoding="utf-8"))
rendered["services"]["migrate"]["environment"].pop(
    "POSTGRES_PROVIDER_MAX_CONNECTIONS"
)
path.write_text(json.dumps(rendered), encoding="utf-8")
PY
cat > "$facts" <<'JSON'
{"serverMaxConnections": 100, "superuserReservedConnections": 0, "reservedConnections": 0, "roleConnectionLimit": -1, "databaseConnectionLimit": -1, "externalConnectionOccupancy": 0, "stoppedRuntimeConnectionOccupancy": 0, "capturePhase": "post-old-container-stop-pre-new-start"}
JSON
output=$(python3 "$VERIFIER" "$rendered" "$facts" "$operator_env")
grep -F 'effective_capacity=100' <<< "$output" >/dev/null
grep -F 'required_reserve=20' <<< "$output" >/dev/null

cat > "$facts" <<'JSON'
{"serverMaxConnections": 25, "superuserReservedConnections": 3, "reservedConnections": 0, "roleConnectionLimit": -1, "databaseConnectionLimit": -1, "externalConnectionOccupancy": 1, "stoppedRuntimeConnectionOccupancy": 0, "capturePhase": "post-old-container-stop-pre-new-start"}
JSON
output=$(python3 "$VERIFIER" "$rendered" "$facts" "$operator_env")
grep -F 'available_capacity=21' <<< "$output" >/dev/null
grep -F 'provider_headroom=5' <<< "$output" >/dev/null

cat > "$facts" <<'JSON'
{"serverMaxConnections": 22, "superuserReservedConnections": 3, "reservedConnections": 0, "roleConnectionLimit": -1, "databaseConnectionLimit": -1, "externalConnectionOccupancy": 0, "stoppedRuntimeConnectionOccupancy": 0, "capturePhase": "post-old-container-stop-pre-new-start"}
JSON
if python3 "$VERIFIER" "$rendered" "$facts" >/dev/null 2>&1; then
  echo 'insufficient live provider headroom was accepted' >&2
  exit 1
fi

# Hostile review case: max=25, reserved=3, external=7, envelope=16.
# Static arithmetic fits before occupancy, but live admission must fail closed.
cat > "$facts" <<'JSON'
{"serverMaxConnections": 25, "superuserReservedConnections": 3, "reservedConnections": 0, "roleConnectionLimit": -1, "databaseConnectionLimit": -1, "externalConnectionOccupancy": 7, "stoppedRuntimeConnectionOccupancy": 0, "capturePhase": "post-old-container-stop-pre-new-start"}
JSON
if python3 "$VERIFIER" "$rendered" "$facts" >/dev/null 2>&1; then
  echo 'hostile external occupancy was accepted' >&2
  exit 1
fi

cat > "$facts" <<'JSON'
{"serverMaxConnections": 25, "superuserReservedConnections": 3, "reservedConnections": 0, "roleConnectionLimit": -1, "databaseConnectionLimit": -1, "externalConnectionOccupancy": 0, "stoppedRuntimeConnectionOccupancy": 0, "capturePhase": "pre-stop"}
JSON
if python3 "$VERIFIER" "$rendered" "$facts" >/dev/null 2>&1; then
  echo 'pre-stop occupancy capture was accepted' >&2
  exit 1
fi

cat > "$facts" <<'JSON'
{"serverMaxConnections": 25, "superuserReservedConnections": 3, "reservedConnections": 0, "roleConnectionLimit": -1, "databaseConnectionLimit": -1, "externalConnectionOccupancy": 0, "stoppedRuntimeConnectionOccupancy": 1, "capturePhase": "post-old-container-stop-pre-new-start"}
JSON
if python3 "$VERIFIER" "$rendered" "$facts" >/dev/null 2>&1; then
  echo 'stopped old-runtime PostgreSQL session was accepted' >&2
  exit 1
fi

daily_service=$FIXTURE/daily.service
daily_runner=$FIXTURE/daily-run.sh
printf '[Service]\nExecStart=%s --yesterday\nTimeoutStartSec=23400\nRestart=no\n' \
  "$daily_runner" > "$daily_service"
cat > "$daily_runner" <<'SH'
#!/usr/bin/env bash
ROOT=/var/data/social-monitor
POSTGRES_ADMISSION_WAIT_SECONDS=7500
COMPOSE=(
  -f "$ROOT/integration/docker-compose.yml"
  -f "$ROOT/control/compose.production.yml"
  -f "$ROOT/control/compose.managed-db.yml"
  -f "$ROOT/control/postgres-runtime-current/compose.postgres-runtime.yml"
)
exec 9>"$ROOT/control/daily-run-singleton.lock"
flock -n 9
exec 8>"$ROOT/control/daily-run.lock"
flock -w "$POSTGRES_ADMISSION_WAIT_SECONDS" 8
runtime_release=$(cat "$ROOT/control/postgres-runtime-current/READY")
backend_release=$(cat "$ROOT/control/deploy-state/backend.sha")
[[ $runtime_release == "$backend_release" ]]
SH
python3 "$VERIFIER" daily "$daily_service" "$daily_runner"
sed -i '/compose.postgres-runtime.yml/d' "$daily_runner"
if python3 "$VERIFIER" daily "$daily_service" "$daily_runner" >/dev/null 2>&1; then
  echo 'daily runner without the release-owned pool overlay was accepted' >&2
  exit 1
fi

echo 'PostgreSQL runtime topology verifier tests passed'
