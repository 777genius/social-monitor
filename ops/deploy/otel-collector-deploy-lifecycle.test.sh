#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d /tmp/social-monitor-otel-deploy.XXXXXX)
trap 'rm -rf "$FIXTURE"' EXIT
STATE=$FIXTURE/state
REPO=$FIXTURE/repo
PROJECT=social-monitor-test
PINNED_OTEL_COLLECTOR_IMAGE='otel.test/pinned@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
install -d "$STATE" "$REPO/ops/observability"
git init -q -b main "$REPO"
git -C "$REPO" config user.name 'OTEL Deploy Test'
git -C "$REPO" config user.email otel-deploy@example.invalid
printf 'receivers: {otlp: {}}\n' > "$REPO/ops/observability/otel-collector.yml"
git -C "$REPO" add ops/observability/otel-collector.yml
git -C "$REPO" commit -qm 'test: prior collector config'
FROM_SHA=$(git -C "$REPO" rev-parse HEAD)
TARGET_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

compose_image_name() { printf '%s-%s:latest\n' "$PROJECT" "$1"; }
stop_and_remove_database_services() { :; }
verify_backend_with_retry() { :; }
refresh_frontend_api_proxy() { :; }
# shellcheck source=ops/deploy/backend-image-rescue-lib.sh
source "$SCRIPT_DIR/backend-image-rescue-lib.sh"

[[ $(backend_image_rescue_policy otel-collector) == recreate ]]
backend_image_rescue_known_services | grep -Fx otel-collector >/dev/null
backend_image_rescue_snapshot_otel_config "$FROM_SHA" "$TARGET_SHA"
CONFIG_SNAPSHOT=$(backend_image_rescue_otel_config_path "$TARGET_SHA")
cmp -s "$REPO/ops/observability/otel-collector.yml" "$CONFIG_SNAPSHOT"
if ! snapshot_mode=$(stat -f '%Lp' "$CONFIG_SNAPSHOT" 2>/dev/null); then
  snapshot_mode=$(stat -c '%a' "$CONFIG_SNAPSHOT")
fi
[[ $snapshot_mode == 600 ]]

STATE_FILE=$STATE/backend-image-rescue-$TARGET_SHA.tsv
EVENT_LOG=$FIXTURE/events.log
backend_image_rescue_read_phase() { printf 'replacement-started\n'; }
backend_image_rescue_restore_tags() { :; }
backend_image_rescue_manifest_target() { printf '%s\n' "$TARGET_SHA"; }
backend_image_rescue_write_phase() { printf 'phase:%s\n' "$2" >> "$EVENT_LOG"; }
fake_compose() {
  printf 'compose:%s|image=%s|config=%s\n' \
    "$*" "${OTEL_COLLECTOR_IMAGE:-}" "${OTEL_COLLECTOR_CONFIG_PATH:-}" \
    >> "$EVENT_LOG"
}
COMPOSE=(fake_compose)

printf 'image\totel-collector\trecreate\tcompose-tag\t%s\t%s\t%s\n' \
  "$PINNED_OTEL_COLLECTOR_IMAGE" \
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
  "$(backend_image_rescue_tag "$TARGET_SHA" otel-collector)" > "$STATE_FILE"
rollback_backend_images "$STATE_FILE"
grep -F 'compose:--profile app --profile daily rm -sf otel-collector' \
  "$EVENT_LOG" >/dev/null

: > "$EVENT_LOG"
printf 'image\totel-collector\trecreate\trunning-image\tcollector-container\t%s\t%s\n' \
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
  "$(backend_image_rescue_tag "$TARGET_SHA" otel-collector)" > "$STATE_FILE"
rollback_backend_images "$STATE_FILE"
grep -F 'compose:--profile app up -d --no-deps --force-recreate otel-collector' \
  "$EVENT_LOG" >/dev/null
grep -F "image=$(backend_image_rescue_tag "$TARGET_SHA" otel-collector)" \
  "$EVENT_LOG" >/dev/null
grep -F "config=$CONFIG_SNAPSHOT" "$EVENT_LOG" >/dev/null

backend_image_rescue_read_phase() { printf 'prepared\n'; }
rollback_backend_images "$STATE_FILE"
[[ ! -e $CONFIG_SNAPSHOT ]]

echo 'OTEL collector deploy lifecycle contract tests passed'
