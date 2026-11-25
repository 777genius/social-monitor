#!/usr/bin/env bash
# Read-only built-image inspection. No auth mount, provider call or database.
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
image=${1:?pass an existing immutable daily-runner image id}
[[ $image =~ ^sha256:[0-9a-f]{64}$ ]]
host=$repo/ops/deploy/production-runtime/reader-promotion-v2-production-canary.sh
runtime_command=$(awk '$1 == "--runtime-command" { print $2 }' \
  "$host")
workdir=$(awk '$1 == "--workdir" { print $2 }' "$host")
ts_project=$(awk '$1 == "--env" && $2 ~ /^TS_NODE_PROJECT=/ { print $2 }' "$host")
[[ $runtime_command == /app/apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs ]]
[[ $workdir == /app && $ts_project == TS_NODE_PROJECT=/app/verified-checkout/tsconfig.json ]]
# Match a clean production checkout, not a dependency-populated development tree.
[[ ! -e $repo/node_modules && ! -L $repo/node_modules ]]
docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges \
  --network none --memory 2g --cpus 2 --tmpfs /tmp:rw,nosuid,nodev,size=16m \
  --env NODE_OPTIONS=--max-old-space-size=768 \
  --workdir "$workdir" --env NODE_PATH=/app/node_modules --env "$ts_project" \
  --volume "$repo:/app/verified-checkout:ro" --entrypoint node "$image" \
  -r /app/node_modules/ts-node/register \
  -r /app/node_modules/tsconfig-paths/register \
  /app/verified-checkout/ops/deploy/support/reader-promotion-v2-canary-image-probe.mjs \
  "$runtime_command"
