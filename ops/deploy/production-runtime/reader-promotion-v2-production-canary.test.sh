#!/usr/bin/env bash
# shellcheck disable=SC2251 # Negated commands are intentional contract assertions.
set -euo pipefail

git() {
  if [[ ${CANARY_TEST_FAIL_GIT_STATUS:-} == 1 && ${3:-} == status ]]; then
    return 73
  fi
  command git "$@"
}
export -f git

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
host=$SCRIPT_DIR/reader-promotion-v2-production-canary.sh
test_tmp=${READER_PROMOTION_V2_CANARY_TEST_TMP_ROOT:-/tmp}
root=$(mktemp -d "$test_tmp/reader-promotion-canary-host.XXXXXX")
trap 'find "$root" -depth -delete' EXIT HUP INT TERM
mkdir -p "$root/control/deploy-state" \
  "$root/control/postgres-runtime-releases" "$root/integration" \
  "$root/secrets" "$root/bin" "$root/auth-pool"
touch "$root/control/production-deploy.lock"
git -C "$root/integration" init -q
git -C "$root/integration" config user.name 'Canary Test'
git -C "$root/integration" config user.email canary@example.invalid
printf 'fixture\n' > "$root/integration/README"
mkdir -p "$root/integration/scripts" "$root/integration/ops/release"
cp "$SCRIPT_DIR/../../../scripts/run-reader-promotion-v2-production-canary.ts" \
  "$root/integration/scripts/"
cp "$SCRIPT_DIR/../../release/reader-promotion-v2-production-canary.v1.json" \
  "$root/integration/ops/release/"
git -C "$root/integration" add README scripts ops
git -C "$root/integration" commit -qm fixture
sha=$(git -C "$root/integration" rev-parse HEAD)
# Match the production topology: current is a link to a versioned release.
mkdir -p "$root/control/postgres-runtime-releases/$sha"
ln -s "postgres-runtime-releases/$sha" \
  "$root/control/postgres-runtime-current"
printf '%s\n' "$sha" > "$root/control/deploy-state/backend.sha"
printf '%s\n' "$sha" > "$root/control/deploy-state/control.sha"
printf '%s\n' "$sha" > "$root/control/postgres-runtime-current/SOURCE_SHA"
printf '%s\n' \
  'postgresql://social_monitor_reader_promotion_canary_invoker@db.invalid/app' \
  > "$root/secrets/reader-promotion-v2-canary.database-url"
printf '{"schemaVersion":1,"snapshotId":"fixture","accounts":[]}\n' \
  > "$root/auth-pool/current.json"

fake_docker=$root/bin/docker
cat >"$fake_docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ $1 == image && $2 == inspect ]]; then
  if flock -n -x "$READER_PROMOTION_CANARY_DEPLOY_LOCK" -c \
    "printf '%s\\n' bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb >'$READER_PROMOTION_CANARY_BACKEND_MARKER'"; then
    echo 'marker race acquired the production deploy lock' >&2
    exit 91
  fi
  printf 'sha256:%064d\n' 1
  printf 'sha256:%064d\n' 2 > "$READER_PROMOTION_CANARY_TAG_STATE"
  exit
fi
[[ $1 == run ]]
printf '%s\n' "$*" > "$READER_PROMOTION_CANARY_ARGS"
[[ " $* " == *" --workdir /app "* ]]
[[ " $* " == *" --env NODE_PATH=/app/node_modules "* ]]
[[ " $* " == *" --env TS_NODE_PROJECT=/app/verified-checkout/tsconfig.json "* ]]
[[ " $* " == *" $READER_PROMOTION_CANARY_CHECKOUT:/app/verified-checkout:ro "* ]]
[[ " $* " == *" sha256:0000000000000000000000000000000000000000000000000000000000000001 node "* ]]
grep -Fx 'sha256:0000000000000000000000000000000000000000000000000000000000000002' \
  "$READER_PROMOTION_CANARY_TAG_STATE" >/dev/null
[[ -f "$READER_PROMOTION_CANARY_CHECKOUT/scripts/run-reader-promotion-v2-production-canary.ts" ]]
grep -F '"model": "gpt-5.6-sol"' \
  "$READER_PROMOTION_CANARY_CHECKOUT/ops/release/reader-promotion-v2-production-canary.v1.json" >/dev/null
grep -F '"reasoningEffort": "high"' \
  "$READER_PROMOTION_CANARY_CHECKOUT/ops/release/reader-promotion-v2-production-canary.v1.json" >/dev/null
printf 'entrypoint-and-manifest-resolved\n' > "$READER_PROMOTION_CANARY_STARTED"
EOF
chmod +x "$fake_docker"
export READER_PROMOTION_CANARY_ARGS=$root/args \
  READER_PROMOTION_CANARY_CHECKOUT=$root/integration \
  READER_PROMOTION_CANARY_DEPLOY_LOCK=$root/control/production-deploy.lock \
  READER_PROMOTION_CANARY_BACKEND_MARKER=$root/control/deploy-state/backend.sha \
  READER_PROMOTION_CANARY_TAG_STATE=$root/tag-state \
  READER_PROMOTION_CANARY_STARTED=$root/started
confirmation=RUN-READER-PROMOTION-V2-CANARY-$sha
READER_PROMOTION_V2_CANARY_HOST_TEST_ROOT=$root \
READER_PROMOTION_V2_CANARY_HOST_TEST_DOCKER=$fake_docker \
SSH_ORIGINAL_COMMAND="reader-promotion-v2-production-canary $sha reader-promotion-v2-production-canary 100 1 0123456789abcdef0123456789abcdef $confirmation" \
  bash "$host"
grep -F -- "--target-sha $sha" "$root/args" >/dev/null
grep -F -- '--runtime-image-id sha256:0000000000000000000000000000000000000000000000000000000000000001' \
  "$root/args" >/dev/null
grep -F -- '--workflow reader-promotion-v2-production-canary --workflow-run-id 100' \
  "$root/args" >/dev/null
grep -F -- '--runtime-command /app/apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs' \
  "$root/args" >/dev/null
grep -Fx 'entrypoint-and-manifest-resolved' "$root/started" >/dev/null
grep -F -- "$root/integration:/app/verified-checkout:ro" "$root/args" >/dev/null

# Repository-local Git settings cannot conceal unreviewed build inputs.
git -C "$root/integration" config status.showUntrackedFiles no
touch "$root/integration/hidden-untracked"
: > "$root/args"
set +e
READER_PROMOTION_V2_CANARY_HOST_TEST_ROOT=$root \
READER_PROMOTION_V2_CANARY_HOST_TEST_DOCKER=$fake_docker \
  bash "$host" "$sha" reader-promotion-v2-production-canary 100 1 0123456789abcdef0123456789abcdef \
    "$confirmation" >/dev/null 2>"$root/error"
status=$?
set -e
[[ $status == 75 && ! -s $root/args ]]
rm "$root/integration/hidden-untracked"
git -C "$root/integration" config --unset status.showUntrackedFiles

# A silent Git inspection failure must not be mistaken for a clean checkout.
export CANARY_TEST_FAIL_GIT_STATUS=1
: > "$root/args"
set +e
READER_PROMOTION_V2_CANARY_HOST_TEST_ROOT=$root \
READER_PROMOTION_V2_CANARY_HOST_TEST_DOCKER=$fake_docker \
  bash "$host" "$sha" reader-promotion-v2-production-canary 100 1 0123456789abcdef0123456789abcdef \
    "$confirmation" >/dev/null 2>"$root/error"
status=$?
set -e
unset CANARY_TEST_FAIL_GIT_STATUS
[[ $status == 75 && ! -s $root/args ]]

# An escaping release link must not grant authority to an outside marker.
mkdir -p "$root/outside-runtime"
printf '%s\n' "$sha" > "$root/outside-runtime/SOURCE_SHA"
ln -sfn "$root/outside-runtime" "$root/control/postgres-runtime-current"
: > "$root/args"
set +e
READER_PROMOTION_V2_CANARY_HOST_TEST_ROOT=$root \
READER_PROMOTION_V2_CANARY_HOST_TEST_DOCKER=$fake_docker \
  bash "$host" "$sha" reader-promotion-v2-production-canary 100 1 0123456789abcdef0123456789abcdef \
    "$confirmation" >/dev/null 2>"$root/error"
status=$?
set -e
[[ $status == 75 && ! -s $root/args ]]
ln -sfn "postgres-runtime-releases/$sha" \
  "$root/control/postgres-runtime-current"
# Even inside the approved release, the marker itself must be a regular file.
mv "$root/control/postgres-runtime-releases/$sha/SOURCE_SHA" "$root/saved-marker"
ln -s "$root/saved-marker" "$root/control/postgres-runtime-releases/$sha/SOURCE_SHA"
! READER_PROMOTION_V2_CANARY_HOST_TEST_ROOT=$root \
  READER_PROMOTION_V2_CANARY_HOST_TEST_DOCKER=$fake_docker \
  bash "$host" "$sha" reader-promotion-v2-production-canary 100 1 0123456789abcdef0123456789abcdef \
    "$confirmation" >/dev/null 2>"$root/error"
[[ ! -s $root/args ]]
unlink "$root/control/postgres-runtime-releases/$sha/SOURCE_SHA"
mv "$root/saved-marker" "$root/control/postgres-runtime-releases/$sha/SOURCE_SHA"

wrong=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
printf '%s\n' "$wrong" > "$root/control/deploy-state/backend.sha"
rm -f "$root/args"
set +e
READER_PROMOTION_V2_CANARY_HOST_TEST_ROOT=$root \
READER_PROMOTION_V2_CANARY_HOST_TEST_DOCKER=$fake_docker \
  bash "$host" "$sha" reader-promotion-v2-production-canary 100 1 0123456789abcdef0123456789abcdef \
    "$confirmation" >/dev/null 2>"$root/error"
status=$?
set -e
[[ $status == 75 && ! -e $root/args ]]
grep -Fx 'deployed release/backend/control/runtime provenance does not equal target' \
  "$root/error" >/dev/null

! grep -Eqi 'systemctl|compose (up|start|restart)|service (start|restart)|publish' \
  "$host"
grep -F -- 'run --rm --read-only --cap-drop ALL' "$host" >/dev/null
grep -F -- 'flock_command" -s -w 3600 9' "$host" >/dev/null
grep -F -- 'image inspect --format' "$host" >/dev/null
# shellcheck disable=SC2016 # Assert that the host script retains this literal.
grep -F -- '"$image_id" node' "$host" >/dev/null
echo 'Reader Promotion V2 production canary host contract passed'
