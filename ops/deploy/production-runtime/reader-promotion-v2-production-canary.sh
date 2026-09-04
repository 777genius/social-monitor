#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin
if [[ $# == 0 ]]; then
  command_text=${SSH_ORIGINAL_COMMAND:-}
  [[ $command_text != *$'\n'* && $command_text != *$'\r'* ]] || exit 64
  read -r action target workflow run_id run_attempt fence confirmation extra \
    <<< "$command_text"
  [[ $action == reader-promotion-v2-production-canary && -z ${extra:-} ]] || \
    exit 64
  set -- "$target" "$workflow" "$run_id" "$run_attempt" "$fence" \
    "$confirmation"
fi
[[ $# == 6 ]] || {
  echo 'usage: reader-promotion-v2-production-canary.sh TARGET WORKFLOW RUN ATTEMPT FENCE CONFIRMATION' >&2
  exit 64
}
target=$1 workflow=$2 run_id=$3 run_attempt=$4 fence=$5 confirmation=$6
unset SSH_ORIGINAL_COMMAND command_text action extra
[[ $target =~ ^[0-9a-f]{40}$ && $run_id =~ ^[1-9][0-9]*$ && \
   $run_attempt =~ ^[1-9][0-9]*$ && $fence =~ ^[0-9a-f]{32}$ ]] || exit 64
[[ $workflow == reader-promotion-v2-production-canary ]] || exit 64
[[ $confirmation == "RUN-READER-PROMOTION-V2-CANARY-$target" ]] || {
  echo 'typed confirmation does not match target' >&2
  exit 64
}

test_root=${READER_PROMOTION_V2_CANARY_HOST_TEST_ROOT:-}
if [[ $test_root == /tmp/* || $test_root == /var/data/jobs/*/tmp/agent/* ]]; then
  root=$test_root
  docker_command=${READER_PROMOTION_V2_CANARY_HOST_TEST_DOCKER:-docker}
  flock_command=${READER_PROMOTION_V2_CANARY_HOST_TEST_FLOCK:-flock}
else
  root=/var/data/social-monitor
  docker_command=docker
  flock_command=flock
  unset READER_PROMOTION_V2_CANARY_HOST_TEST_ROOT \
    READER_PROMOTION_V2_CANARY_HOST_TEST_DOCKER \
    READER_PROMOTION_V2_CANARY_HOST_TEST_FLOCK
fi

read_marker() {
  local path=$1 expected_root=$2 real
  [[ -f $path && ! -L $path ]] || return 1
  real=$(readlink -f -- "$path") || return 1
  [[ $real == "$expected_root"/* ]] || return 1
  tr -d '\n' < "$real"
}

integration=$root/integration
deploy_lock=$root/control/production-deploy.lock
[[ -f $deploy_lock && ! -L $deploy_lock ]] || exit 75
exec 9>"$deploy_lock"
"$flock_command" -s -w 3600 9 || {
  echo 'timed out waiting for shared production deployment lock' >&2
  exit 75
}
[[ -d $integration && ! -L $integration && \
   -z $(git -C "$integration" status --porcelain) ]] || exit 75
release=$(git -C "$integration" rev-parse --verify 'HEAD^{commit}') || exit 75
backend=$(read_marker "$root/control/deploy-state/backend.sha" \
  "$root/control/deploy-state") || exit 75
control=$(read_marker "$root/control/deploy-state/control.sha" \
  "$root/control/deploy-state") || exit 75
# The installed runtime is an atomic link to a versioned release directory.
# Resolve that directory, but reject links escaping the owned release root.
runtime_root=$(readlink -f -- "$root/control/postgres-runtime-current") || exit 75
[[ -L $root/control/postgres-runtime-current && \
   -d $runtime_root && \
   $runtime_root == "$root/control/postgres-runtime-releases/"* ]] || exit 75
runtime=$(read_marker "$root/control/postgres-runtime-current/SOURCE_SHA" \
  "$runtime_root") || exit 75
[[ $release == "$target" && $backend == "$target" && \
   $control == "$target" && $runtime == "$target" ]] || {
  echo 'deployed release/backend/control/runtime provenance does not equal target' >&2
  exit 75
}
[[ $release =~ ^[0-9a-f]{40}$ ]] || exit 75
image_id=$("$docker_command" image inspect --format '{{.Id}}' \
  social-monitor-prod-daily-runner:latest) || exit 75
[[ $image_id =~ ^sha256:[0-9a-f]{64}$ ]] || {
  echo 'daily runner image did not resolve to an immutable image id' >&2
  exit 75
}

export READER_PROMOTION_V2_CANARY_DATABASE_URL
READER_PROMOTION_V2_CANARY_DATABASE_URL=$(read_marker \
  "$root/secrets/reader-promotion-v2-canary.database-url" "$root/secrets") || exit 75
auth_pool=$root/auth-pool
auth_manifest=$auth_pool/current.json
[[ -d $auth_pool && ! -L $auth_pool && \
   -f $auth_manifest && ! -L $auth_manifest ]] || exit 75
auth_real=$(readlink -f -- "$auth_manifest") || exit 75
[[ $auth_real == "$auth_pool"/* ]] || exit 75

args=(/verified-checkout/scripts/run-reader-promotion-v2-production-canary.ts \
  --target-sha "$target" --release-sha "$release" \
  --backend-sha "$backend" --control-sha "$control" --runtime-sha "$runtime" \
  --runtime-image-id "$image_id" \
  --workflow "$workflow" --workflow-run-id "$run_id" \
  --workflow-run-attempt "$run_attempt" --fence "$fence" \
  --runtime-command /app/apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs \
  --runtime-state-root /tmp/subscription-runtime)
unset READER_PROMOTION_V2_CANARY_HOST_TEST_ROOT \
  READER_PROMOTION_V2_CANARY_HOST_TEST_DOCKER \
  READER_PROMOTION_V2_CANARY_HOST_TEST_FLOCK
exec "$docker_command" run --rm --read-only --cap-drop ALL \
  --security-opt no-new-privileges --tmpfs /tmp:rw,nosuid,nodev,size=64m \
  --network social-monitor-prod_default \
  --workdir /verified-checkout \
  --env READER_PROMOTION_V2_CANARY_DATABASE_URL \
  --env NODE_PATH=/app/node_modules \
  --env AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT=/run/social-monitor-codex-auth-pool \
  --env AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST=current.json \
  --volume "$auth_pool:/run/social-monitor-codex-auth-pool:ro" \
  --volume "$integration:/verified-checkout:ro" \
  "$image_id" node -r /app/node_modules/ts-node/register \
  -r /app/node_modules/tsconfig-paths/register "${args[@]}"
