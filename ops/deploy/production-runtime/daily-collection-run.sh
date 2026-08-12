#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
ROOT=/var/data/social-monitor
POSTGRES_ADMISSION_WAIT_SECONDS=1800
COLLECTION_DATE=${1:-$(date -u +%F)}

[[ $COLLECTION_DATE =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || {
  echo 'daily collection date must use YYYY-MM-DD' >&2
  exit 64
}

COMPOSE=(
  docker compose -p social-monitor-prod
  --env-file "$ROOT/secrets/production.env"
  -f "$ROOT/integration/docker-compose.yml"
  -f "$ROOT/control/compose.production.yml"
  -f "$ROOT/control/compose.managed-db.yml"
  -f "$ROOT/control/postgres-runtime-current/compose.postgres-runtime.yml"
)

exec 9>"$ROOT/control/daily-collection-singleton.lock"
flock -n 9 || {
  echo 'daily collection is already active' >&2
  exit 75
}
exec 8>"$ROOT/control/daily-run.lock"
flock -w "$POSTGRES_ADMISSION_WAIT_SECONDS" 8 || {
  echo 'daily collection timed out waiting for PostgreSQL admission' >&2
  exit 75
}

runtime_release=$(cat "$ROOT/control/postgres-runtime-current/READY" 2>/dev/null || true)
backend_release=$(cat "$ROOT/control/deploy-state/backend.sha" 2>/dev/null || true)
if [[ ! $runtime_release =~ ^[0-9a-f]{40}$ || $runtime_release != "$backend_release" ]]; then
  echo 'daily collection runtime is not committed by the backend release' >&2
  exit 75
fi

receipt_dir=$ROOT/artifacts/daily-collection
install -d -m 0700 "$receipt_dir"
log_file=$(mktemp "$receipt_dir/.collection.$COLLECTION_DATE.XXXXXX.log")
trap 'rm -f "$log_file"' EXIT HUP INT TERM

artifact=$ROOT/artifacts/evals/reader-summary-clean-real-day-collection.v1.json
rm -f "$artifact"
set +e
"${COMPOSE[@]}" --profile daily run --rm --no-deps daily-runner \
  sh -lc '
    set -eu
    npm run run:reader-summary-clean-real-day-collection -- \
      --update --date "$1"
  ' daily-collection "$COLLECTION_DATE" 2>&1 | tee "$log_file"
collection_status=${PIPESTATUS[0]}
set -e

[[ -f $artifact ]] || {
  echo 'daily collection did not produce its scan artifact' >&2
  exit "${collection_status:-1}"
}
metrics=$(python3 - "$artifact" "$COLLECTION_DATE" <<'PY'
import json, sys
artifact, expected = sys.argv[1:]
data = json.load(open(artifact, encoding="utf-8"))
if data.get("run", {}).get("collectionDate") != expected:
    raise SystemExit("daily collection artifact date mismatch")
scans = data.get("scans")
if not isinstance(scans, list) or not scans:
    raise SystemExit("daily collection artifact has no provider scans")
successful = sum(scan.get("status") == "succeeded" for scan in scans)
fetched = sum(int(scan.get("fetched", 0)) for scan in scans)
inserted = sum(int(scan.get("inserted", 0)) for scan in scans)
duplicates = sum(int(scan.get("skippedDuplicates", 0)) for scan in scans)
if successful < 1 or fetched < 1:
    raise SystemExit("daily collection has no successful provider data")
print(successful, fetched, inserted, duplicates)
PY
)
read -r successful_providers fetched_items inserted_items duplicate_items <<<"$metrics"
dated_artifact=$receipt_dir/collection.$COLLECTION_DATE.scans.v1.json
cp "$artifact" "$dated_artifact.tmp.$$"
chmod 0444 "$dated_artifact.tmp.$$"
mv -f "$dated_artifact.tmp.$$" "$dated_artifact"

completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
log_sha256=$(sha256sum "$log_file" | awk '{print $1}')
receipt=$receipt_dir/collection.$COLLECTION_DATE.receipt.v1.json
temp=$receipt.tmp.$$
printf '%s\n' \
  "{\"schemaVersion\":\"social_monitor.daily_collection_receipt.v1\",\"collectionDate\":\"$COLLECTION_DATE\",\"completedAt\":\"$completed_at\",\"successfulProviderCount\":$successful_providers,\"fetchedItemCount\":$fetched_items,\"insertedItemCount\":$inserted_items,\"duplicateItemCount\":$duplicate_items,\"summaryQualityGatePassed\":false,\"logSha256\":\"$log_sha256\",\"status\":\"SUCCESS\"}" \
  >"$temp"
chmod 0444 "$temp"
if ! mv -n "$temp" "$receipt" 2>/dev/null; then
  cmp -s "$temp" "$receipt" || {
    echo "daily collection receipt conflicts with $receipt" >&2
    rm -f "$temp"
    exit 1
  }
  rm -f "$temp"
fi
printf 'daily-collection outcome=SUCCESS date=%s providers=%s fetched=%s inserted=%s duplicates=%s receipt=%s\n' \
  "$COLLECTION_DATE" "$successful_providers" "$fetched_items" \
  "$inserted_items" "$duplicate_items" "$receipt"
