#!/usr/bin/env bash
# Read-only built-image inspection. No auth mount, provider call or database.
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
image=${1:?pass an existing immutable daily-runner image id}
[[ $image =~ ^sha256:[0-9a-f]{64}$ ]]
runtime_command=$(awk '$1 == "--runtime-command" { print $2 }' \
  "$repo/ops/deploy/production-runtime/reader-promotion-v2-production-canary.sh")
[[ $runtime_command == /app/apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs ]]
docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges \
  --network none --memory 384m --cpus 1 --tmpfs /tmp:rw,nosuid,nodev,size=16m \
  --workdir /verified-checkout --env NODE_PATH=/app/node_modules \
  --volume "$repo:/verified-checkout:ro" --entrypoint node "$image" \
  -r /app/node_modules/ts-node/register \
  -e '
    const { FileSubscriptionRuntimeInstallationInspector } = require(
      "./apps/agent-runtime/src/subscription-runtime-installation");
    new FileSubscriptionRuntimeInstallationInspector().inspect(process.argv[1])
      .then(identity => console.log(JSON.stringify({
        executable: identity.executablePath,
        version: identity.runtimePackageVersion,
        launcherSha256: identity.launcherSha256,
        providerCalled: false,
      })))
      .catch(() => { console.error("built-image launcher inspection failed"); process.exitCode = 1; });
  ' "$runtime_command"
