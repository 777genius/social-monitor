#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
CURRENT_SOURCE=$SCRIPT_DIR/social-monitor-production-ssh-wrapper.sh
CURRENT_ENTRYPOINT=$SCRIPT_DIR/social-monitor-production-deploy.sh
CONTROL_LIB=$SCRIPT_DIR/deploy-control-lib.sh
LEGACY_CONTROL_SHA=4f47fac7faed7dc24110f4a43e88820d776b8a40
V4A4_CONTROL_SHA=2f85863a
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/production-ssh-wrapper.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

BIN=$FIXTURE/bin
ENTRYPOINT=$FIXTURE/github-production-deploy.sh
EVENT_LOG=$FIXTURE/events.log
SHA=1234567890abcdef1234567890abcdef12345678
DAILY_CANONICAL_RECOVERY_CONFIRMATION=reader-summary-daily-canonical-recovery-v4
DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN=invalid-product-retry-set-v1
MODEL_JOB_IDENTITY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
AUTHORITY_SHA256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
TERMINAL_SET_SHA256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
AUTHORIZED_STDIN_RECORD="reader-summary-daily-canonical-recovery-v4 $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN $TERMINAL_SET_SHA256"
LEGACY_STDIN_RECORD="$DAILY_CANONICAL_RECOVERY_CONFIRMATION 2026-07-23 $MODEL_JOB_IDENTITY $AUTHORITY_SHA256"
install -d "$BIN"
git -C "$PROJECT_ROOT" show \
  "$LEGACY_CONTROL_SHA:ops/deploy/social-monitor-production-ssh-wrapper.sh" \
  > "$FIXTURE/legacy-wrapper.source"
git -C "$PROJECT_ROOT" show \
  "$V4A4_CONTROL_SHA:ops/deploy/social-monitor-production-deploy.sh" \
  > "$FIXTURE/v4a4-entrypoint.source"
cmp -s "$CURRENT_ENTRYPOINT" "$FIXTURE/v4a4-entrypoint.source" || {
  echo 'current deploy entrypoint must remain byte-identical to V4A4' >&2
  exit 1
}

python3 - "$FIXTURE/v4a4-entrypoint.source" <<'PY'
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
load = 'source "$REPO/ops/deploy/deploy-control-lib.sh"'
dispatch = "case ${action:-} in"
if source.count(load) != 1 or source.count(dispatch) != 1:
    raise SystemExit("V4A4 entrypoint source/dispatch contract is not exact")
if source.index(load) >= source.index(dispatch):
    raise SystemExit("V4A4 entrypoint does not source current control before dispatch")
PY

cat > "$BIN/sudo" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

[[ ${1:-} == -n ]]
shift
if [[ ${1:-} == -- ]]; then
  shift
fi
[[ -z ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE+x} ]]
[[ -z ${READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY+x} ]]
[[ -z ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256+x} ]]
[[ -z ${READER_SUMMARY_DAILY_MAINTENANCE_RETRY_SET_TOKEN+x} ]]
[[ -z ${READER_SUMMARY_DAILY_MAINTENANCE_TERMINAL_SET_SHA256+x} ]]
[[ -z ${first_authorization_value+x} ]]
[[ -z ${second_authorization_value+x} ]]
[[ -z ${third_authorization_value+x} ]]
[[ -z ${retry_set_token+x} ]]
[[ -z ${terminal_set_sha256+x} ]]
[[ -z ${authorization_record+x} ]]
expected_authorization_record='reader-summary-daily-canonical-recovery-v4 invalid-product-retry-set-v1 cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
[[ $# == 3 ]]
for argument in "$@"; do
  [[ $argument != "$expected_authorization_record" ]]
  [[ $argument != READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE=* ]]
  [[ $argument != READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY=* ]]
  [[ $argument != READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256=* ]]
  [[ $argument != READER_SUMMARY_DAILY_MAINTENANCE_RETRY_SET_TOKEN=* ]]
  [[ $argument != READER_SUMMARY_DAILY_MAINTENANCE_TERMINAL_SET_SHA256=* ]]
done
printf 'sudo-clean\n' >> "$EVENT_LOG"
exec "$@"
SH
chmod 0755 "$BIN/sudo"

cat > "$ENTRYPOINT" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

expected_retry_set_token=invalid-product-retry-set-v1
expected_terminal_set_sha256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
action=${1:-}
sha=${2:-}
[[ $# == 2 ]]
[[ $sha =~ ^[0-9a-f]{40}$ ]]
[[ -z ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE+x} ]]
[[ -z ${READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY+x} ]]
[[ -z ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256+x} ]]
[[ -z ${READER_SUMMARY_DAILY_MAINTENANCE_RETRY_SET_TOKEN+x} ]]
[[ -z ${READER_SUMMARY_DAILY_MAINTENANCE_TERMINAL_SET_SHA256+x} ]]
[[ -z ${first_authorization_value+x} ]]
[[ -z ${second_authorization_value+x} ]]
[[ -z ${third_authorization_value+x} ]]
[[ -z ${retry_set_token+x} ]]
[[ -z ${terminal_set_sha256+x} ]]
[[ -z ${authorization_record+x} ]]
if [[ ${EXPECT_ORDINARY_PROBE_STDIN_EOF:-0} == 1 ]]; then
  unexpected_authorization_record=''
  if IFS= read -r unexpected_authorization_record; then
    exit 65
  fi
  [[ -z $unexpected_authorization_record ]]
  printf 'ordinary-probe-stdin-eof:%s\n' "$action" >> "$EVENT_LOG"
  exit
fi
if [[ ${EXPECT_AUTHORIZED_STDIN:-0} == 1 ]]; then
  [[ $action == reader-summary-recover-missing-days ]]
  [[ -z ${SSH_ORIGINAL_COMMAND+x} ]]
  IFS= read -r authorization_record
  [[ $authorization_record == "${EXPECTED_AUTHORIZED_STDIN_RECORD:-reader-summary-daily-canonical-recovery-v4 $expected_retry_set_token $expected_terminal_set_sha256}" ]]
  trailing_record=''
  if IFS= read -r trailing_record; then
    exit 65
  fi
  [[ -z $trailing_record ]]
  printf 'authorized-stdin\n' >> "$EVENT_LOG"
fi
if [[ $action != deploy ]]; then
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
    EXACT_SHA=$SHA bash "$wrapper" </dev/null >/dev/null 2>&1
  status=$?
  set -e
  [[ $status == 64 ]]
}

for wrapper in "$FIXTURE/current-wrapper.sh" "$FIXTURE/legacy-wrapper.sh"; do
  for action in plan upload; do
    : > "$EVENT_LOG"
    SSH_ORIGINAL_COMMAND="$action $SHA" EVENT_LOG=$EVENT_LOG \
      CONTROL_LIB=$CONTROL_LIB EXACT_SHA=$SHA bash "$wrapper" </dev/null
    grep -Fx "sudo-clean" "$EVENT_LOG" >/dev/null
    grep -Fx "dispatch:$action:$SHA" "$EVENT_LOG" >/dev/null
    [[ $(wc -l < "$EVENT_LOG") == 2 ]]
  done

  : > "$EVENT_LOG"
  SSH_ORIGINAL_COMMAND="deploy $SHA" EVENT_LOG=$EVENT_LOG \
    CONTROL_LIB=$CONTROL_LIB EXACT_SHA=$SHA bash "$wrapper" </dev/null
  [[ $(sed -n '1p' "$EVENT_LOG") == sudo-clean ]]
  [[ $(sed -n '2p' "$EVENT_LOG") == legacy-state ]]
  [[ $(sed -n '3p' "$EVENT_LOG") == "atomic:$SHA" ]]
  [[ $(wc -l < "$EVENT_LOG") == 3 ]]

  for command in \
    "bootstrap-postgres-pool $SHA" \
    "shell $SHA" \
    "deploy $SHA extra" \
    "deploy 1234"; do
    : > "$EVENT_LOG"
    assert_rejected "$wrapper" "$command"
    [[ ! -s $EVENT_LOG ]]
  done
done

for command in \
  "deploy $SHA"$'\n'"plan $SHA" \
  "deploy $SHA"$'\r'; do
  : > "$EVENT_LOG"
  assert_rejected "$FIXTURE/current-wrapper.sh" "$command"
  [[ ! -s $EVENT_LOG ]]
done

for action in \
  disk-report project-disk-cleanup \
  reader-summary-recover-missing-days reader-summary-weekly-run; do
  : > "$EVENT_LOG"
  SSH_ORIGINAL_COMMAND="$action $SHA" EVENT_LOG=$EVENT_LOG \
    CONTROL_LIB=$CONTROL_LIB EXACT_SHA=$SHA bash "$FIXTURE/current-wrapper.sh" </dev/null
  grep -Fx 'sudo-clean' "$EVENT_LOG" >/dev/null
  grep -Fx "dispatch:$action:$SHA" "$EVENT_LOG" >/dev/null
  [[ $(wc -l < "$EVENT_LOG") == 2 ]]

  : > "$EVENT_LOG"
  assert_rejected "$FIXTURE/legacy-wrapper.sh" "$action $SHA"
  [[ ! -s $EVENT_LOG ]]
done

assert_non_v4_stdin_is_sealed() {
  local action=$1
  : > "$EVENT_LOG"
  SSH_ORIGINAL_COMMAND="$action $SHA" EVENT_LOG=$EVENT_LOG \
    CONTROL_LIB=$CONTROL_LIB EXACT_SHA=$SHA \
    EXPECT_ORDINARY_PROBE_STDIN_EOF=1 \
    bash "$FIXTURE/current-wrapper.sh" <<< "$AUTHORIZED_STDIN_RECORD"
  grep -Fx 'sudo-clean' "$EVENT_LOG" >/dev/null
  grep -Fx "ordinary-probe-stdin-eof:$action" "$EVENT_LOG" >/dev/null
  if grep -F 'authorized-stdin' "$EVENT_LOG" >/dev/null; then
    printf 'unexpected authorized stdin record for %s\n' "$action" >&2
    exit 1
  fi
  [[ $(wc -l < "$EVENT_LOG") == 2 ]]
}

for action in \
  plan upload deploy disk-report project-disk-cleanup \
  reader-summary-recover-missing-days reader-summary-weekly-run; do
  assert_non_v4_stdin_is_sealed "$action"
done

: > "$EVENT_LOG"
SSH_ORIGINAL_COMMAND="reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN $TERMINAL_SET_SHA256" \
  EVENT_LOG=$EVENT_LOG CONTROL_LIB=$CONTROL_LIB EXACT_SHA=$SHA \
  EXPECT_AUTHORIZED_STDIN=1 \
  READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE=unexpected \
  READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY=unexpected \
  READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256=unexpected \
  READER_SUMMARY_DAILY_MAINTENANCE_RETRY_SET_TOKEN=unexpected \
  READER_SUMMARY_DAILY_MAINTENANCE_TERMINAL_SET_SHA256=unexpected \
  first_authorization_value=unexpected \
  second_authorization_value=unexpected \
  third_authorization_value=unexpected \
  retry_set_token=unexpected \
  terminal_set_sha256=unexpected \
  authorization_record=unexpected \
  bash "$FIXTURE/current-wrapper.sh" </dev/null
grep -Fx 'sudo-clean' "$EVENT_LOG" >/dev/null
grep -Fx 'authorized-stdin' "$EVENT_LOG" >/dev/null
grep -Fx "dispatch:reader-summary-recover-missing-days:$SHA" "$EVENT_LOG" >/dev/null
[[ $(wc -l < "$EVENT_LOG") == 3 ]]

: > "$EVENT_LOG"
SSH_ORIGINAL_COMMAND="reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_CONFIRMATION $MODEL_JOB_IDENTITY $AUTHORITY_SHA256" \
  EVENT_LOG=$EVENT_LOG CONTROL_LIB=$CONTROL_LIB EXACT_SHA=$SHA \
  EXPECT_AUTHORIZED_STDIN=1 EXPECTED_AUTHORIZED_STDIN_RECORD="$LEGACY_STDIN_RECORD" \
  READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE=unexpected \
  READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY=unexpected \
  READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256=unexpected \
  READER_SUMMARY_DAILY_MAINTENANCE_RETRY_SET_TOKEN=unexpected \
  READER_SUMMARY_DAILY_MAINTENANCE_TERMINAL_SET_SHA256=unexpected \
  first_authorization_value=unexpected \
  second_authorization_value=unexpected \
  third_authorization_value=unexpected \
  authorization_record=unexpected \
  bash "$FIXTURE/current-wrapper.sh" </dev/null
grep -Fx 'sudo-clean' "$EVENT_LOG" >/dev/null
grep -Fx 'authorized-stdin' "$EVENT_LOG" >/dev/null
grep -Fx "dispatch:reader-summary-recover-missing-days:$SHA" "$EVENT_LOG" >/dev/null
[[ $(wc -l < "$EVENT_LOG") == 3 ]]

for command in \
  "reader-summary-daily-canonical-recovery-v4 $SHA" \
  "reader-summary-daily-canonical-recovery-v4 $SHA wrong-invalid-product-retry-set-v1 $TERMINAL_SET_SHA256" \
  "reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN:$SHA $TERMINAL_SET_SHA256" \
  "reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN" \
  "reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN ${TERMINAL_SET_SHA256^^}" \
  "reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN short" \
  "reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN $TERMINAL_SET_SHA256 extra" \
  "reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_CONFIRMATION $MODEL_JOB_IDENTITY" \
  "reader-summary-daily-canonical-recovery-v4 $SHA wrong-reader-summary-daily-canonical-recovery-v4 $MODEL_JOB_IDENTITY $AUTHORITY_SHA256" \
  "reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_CONFIRMATION ${MODEL_JOB_IDENTITY^^} $AUTHORITY_SHA256" \
  "reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_CONFIRMATION $MODEL_JOB_IDENTITY short"; do
  : > "$EVENT_LOG"
  assert_rejected "$FIXTURE/current-wrapper.sh" "$command"
  [[ ! -s $EVENT_LOG ]]
done

: > "$EVENT_LOG"
assert_rejected "$FIXTURE/legacy-wrapper.sh" \
  "reader-summary-daily-canonical-recovery-v4 $SHA $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN $TERMINAL_SET_SHA256"
[[ ! -s $EVENT_LOG ]]

echo 'Production SSH wrapper reachability tests passed'
