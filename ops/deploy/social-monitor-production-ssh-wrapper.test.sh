#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
CURRENT_SOURCE=$SCRIPT_DIR/social-monitor-production-ssh-wrapper.sh
CURRENT_ENTRYPOINT=$SCRIPT_DIR/social-monitor-production-deploy.sh
CONTROL_LIB=$SCRIPT_DIR/deploy-control-lib.sh
LEGACY_CONTROL_SHA=4f47fac7faed7dc24110f4a43e88820d776b8a40
V4A4_CONTROL_SHA=472d835c
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/production-ssh-wrapper.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

BIN=$FIXTURE/bin
ENTRYPOINT=$FIXTURE/github-production-deploy.sh
EVENT_LOG=$FIXTURE/events.log
SHA=1234567890abcdef1234567890abcdef12345678
DAILY_CANONICAL_RECOVERY_CONFIRMATION=reader-summary-daily-canonical-recovery-v4
MODEL_JOB_IDENTITY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
AUTHORITY_SHA256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
install -d "$BIN"
git -C "$PROJECT_ROOT" show \
  "$LEGACY_CONTROL_SHA:ops/deploy/social-monitor-production-ssh-wrapper.sh" \
  > "$FIXTURE/legacy-wrapper.source"
git -C "$PROJECT_ROOT" show \
  "$V4A4_CONTROL_SHA:ops/deploy/social-monitor-production-deploy.sh" \
  > "$FIXTURE/v4a4-entrypoint.source"
cmp -s "$CURRENT_ENTRYPOINT" "$FIXTURE/v4a4-entrypoint.source" || {
  echo 'current deploy entrypoint must remain byte-identical to the V4A4 bridge release' >&2
  exit 1
}

python3 - "$FIXTURE/v4a4-entrypoint.source" <<'PY'
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
load = 'source "$REPO/ops/deploy/deploy-control-lib.sh"'
dispatch = "case ${action:-} in"
if source.count(load) != 1 or source.count(dispatch) != 1:
    raise SystemExit("legacy entrypoint source/dispatch contract is not exact")
if source.index(load) >= source.index(dispatch):
    raise SystemExit("legacy entrypoint does not source current control before dispatch")
PY

cat > "$BIN/sudo" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ ${1:-} == -n ]]
shift
exec env "$@"
SH
chmod 0755 "$BIN/sudo"

cat > "$ENTRYPOINT" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
action=$1
sha=$2
command_text=${SSH_ORIGINAL_COMMAND:-${*:-}}
[[ $command_text != *$'\n'* && $command_text != *$'\r'* ]] || exit 64
[[ $command_text == "$action $sha" ]] || exit 65
if [[ $action != deploy ]]; then
  if [[ -n ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE:-} ]]; then
    [[ $READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE == 2026-07-23 ]]
    [[ ${READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY:-} =~ ^[0-9a-f]{64}$ ]]
    [[ ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256:-} =~ ^[0-9a-f]{64}$ ]]
    printf 'bounded-auth:%s:%s:%s\n' \
      "$READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE" \
      "$READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY" \
      "$READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256" >> "$EVENT_LOG"
  fi
  printf 'dispatch:%s:%s\n' "$action" "$sha" >> "$EVENT_LOG"
  exit
fi
fail() {
  printf 'test failure: %s\n' "$*" >&2
  exit 1
}
# shellcheck source=ops/deploy/deploy-control-lib.sh
source "$CONTROL_LIB"
postgres_pool_atomic_legacy_state() {
  printf 'legacy-state\n' >> "$EVENT_LOG"
  return 0
}
deploy_postgres_pool_atomic_control_bootstrap() {
  printf 'atomic:%s\n' "$1" >> "$EVENT_LOG"
}
deploy_release "$sha"
SH
chmod 0755 "$ENTRYPOINT"

materialize_wrapper() {
  local source=$1 destination=$2
  python3 - "$source" "$destination" "$BIN" "$ENTRYPOINT" <<'PY'
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
source = source.replace(
    "PATH=/usr/bin:/bin:/usr/sbin:/sbin",
    f"PATH={sys.argv[3]}:/usr/bin:/bin",
    1,
)
source = source.replace(
    "ENTRYPOINT=/var/data/social-monitor/control/github-production-deploy.sh",
    f"ENTRYPOINT={sys.argv[4]}",
    1,
)
path = pathlib.Path(sys.argv[2])
path.write_text(source, encoding="utf-8")
path.chmod(0o755)
PY
}

materialize_wrapper "$CURRENT_SOURCE" "$FIXTURE/current-wrapper.sh"
materialize_wrapper "$FIXTURE/legacy-wrapper.source" "$FIXTURE/legacy-wrapper.sh"

assert_rejected() {
  local wrapper=$1 command=$2 status
  set +e
  SSH_ORIGINAL_COMMAND=$command EVENT_LOG=$EVENT_LOG CONTROL_LIB=$CONTROL_LIB \
    EXACT_SHA=$SHA bash "$wrapper" >/dev/null 2>&1
  status=$?
  set -e
  [[ $status == 64 ]]
}

for wrapper in "$FIXTURE/current-wrapper.sh" "$FIXTURE/legacy-wrapper.sh"; do
  for action in plan upload; do
    : > "$EVENT_LOG"
    SSH_ORIGINAL_COMMAND="$action $SHA" EVENT_LOG=$EVENT_LOG \
      CONTROL_LIB=$CONTROL_LIB EXACT_SHA=$SHA bash "$wrapper"
    grep -Fx "dispatch:$action:$SHA" "$EVENT_LOG" >/dev/null
    [[ $(wc -l < "$EVENT_LOG") == 1 ]]
  done

  : > "$EVENT_LOG"
  SSH_ORIGINAL_COMMAND="deploy $SHA" EVENT_LOG=$EVENT_LOG \
    CONTROL_LIB=$CONTROL_LIB EXACT_SHA=$SHA bash "$wrapper"
  [[ $(sed -n '1p' "$EVENT_LOG") == legacy-state ]]
  [[ $(sed -n '2p' "$EVENT_LOG") == "atomic:$SHA" ]]
  [[ $(wc -l < "$EVENT_LOG") == 2 ]]

  for command in \
    "bootstrap-postgres-pool $SHA" \
    "shell $SHA" \
    "deploy $SHA extra" \
    "deploy 1234" \
    "deploy $SHA"$'\n'"plan $SHA" \
    "deploy $SHA"$'\r'; do
    : > "$EVENT_LOG"
    assert_rejected "$wrapper" "$command"
    [[ ! -s $EVENT_LOG ]]
  done
done

for action in \
  disk-report project-disk-cleanup \
  reader-summary-recover-missing-days reader-summary-weekly-run; do
  : > "$EVENT_LOG"
  SSH_ORIGINAL_COMMAND="$action $SHA" EVENT_LOG=$EVENT_LOG \
    CONTROL_LIB=$CONTROL_LIB EXACT_SHA=$SHA bash "$FIXTURE/current-wrapper.sh"
  grep -Fx "dispatch:$action:$SHA" "$EVENT_LOG" >/dev/null
  [[ $(wc -l < "$EVENT_LOG") == 1 ]]

  : > "$EVENT_LOG"
  assert_rejected "$FIXTURE/legacy-wrapper.sh" "$action $SHA"
  [[ ! -s $EVENT_LOG ]]
done

: > "$EVENT_LOG"
SSH_ORIGINAL_COMMAND="reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_CONFIRMATION $MODEL_JOB_IDENTITY $AUTHORITY_SHA256" \
  EVENT_LOG=$EVENT_LOG CONTROL_LIB=$CONTROL_LIB EXACT_SHA=$SHA \
  bash "$FIXTURE/current-wrapper.sh"
grep -Fx "bounded-auth:2026-07-23:$MODEL_JOB_IDENTITY:$AUTHORITY_SHA256" \
  "$EVENT_LOG" >/dev/null
grep -Fx "dispatch:reader-summary-recover-missing-days:$SHA" "$EVENT_LOG" >/dev/null
[[ $(wc -l < "$EVENT_LOG") == 2 ]]

for command in \
  "reader-summary-daily-canonical-recovery-v4 $SHA" \
  "reader-summary-daily-canonical-recovery-v4 $SHA wrong-reader-summary-daily-canonical-recovery-v4" \
  "reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_CONFIRMATION:$SHA" \
  "reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_CONFIRMATION $MODEL_JOB_IDENTITY" \
  "reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_CONFIRMATION ${MODEL_JOB_IDENTITY^^} $AUTHORITY_SHA256" \
  "reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_CONFIRMATION $MODEL_JOB_IDENTITY short"; do
  : > "$EVENT_LOG"
  assert_rejected "$FIXTURE/current-wrapper.sh" "$command"
  [[ ! -s $EVENT_LOG ]]
done

: > "$EVENT_LOG"
assert_rejected "$FIXTURE/legacy-wrapper.sh" \
  "reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_CONFIRMATION $MODEL_JOB_IDENTITY $AUTHORITY_SHA256"
[[ ! -s $EVENT_LOG ]]

echo 'Production SSH wrapper reachability tests passed'
