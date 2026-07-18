#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
if ((EUID == 0)); then
  command -v setpriv >/dev/null || {
    echo 'Subscription auth refresh fixture requires setpriv when run as root' >&2
    exit 1
  }
  relocated_root=$(mktemp -d \
    "${TMPDIR:-/tmp}/social-monitor-auth-refresh-source.XXXXXX")
  install -d "$relocated_root/host"
  install -m 0644 "$0" "$relocated_root/refresh-codex-auth.test.sh"
  install -m 0755 "$SCRIPT_DIR/host/refresh-codex-auth.sh" \
    "$relocated_root/host/refresh-codex-auth.sh"
  : > "$relocated_root/.social-monitor-auth-refresh-relocated"
  chown -R 65534:65534 "$relocated_root"
  exec setpriv --reuid=65534 --regid=65534 --clear-groups \
    env -u SOCIAL_MONITOR_AUTH_REFRESH_RELOCATED_ROOT \
      PATH="$PATH" TMPDIR=/tmp \
      bash "$relocated_root/refresh-codex-auth.test.sh" "$@"
fi

RELOCATED_ROOT=
case $SCRIPT_DIR in
  /tmp/social-monitor-auth-refresh-source.*)
    if [[ -f $SCRIPT_DIR/.social-monitor-auth-refresh-relocated && \
          ! -L $SCRIPT_DIR/.social-monitor-auth-refresh-relocated && \
          $(stat -c '%u' "$SCRIPT_DIR" 2>/dev/null || stat -f '%u' "$SCRIPT_DIR") == "$EUID" ]]; then
      RELOCATED_ROOT=$SCRIPT_DIR
    fi
    ;;
esac
unset SOCIAL_MONITOR_AUTH_REFRESH_RELOCATED_ROOT

ENTRYPOINT=$SCRIPT_DIR/host/refresh-codex-auth.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/social-monitor-auth-refresh-test.XXXXXX")
cleanup() {
  rm -rf "$FIXTURE"
  if [[ -n $RELOCATED_ROOT ]]; then
    rm -rf -- "$RELOCATED_ROOT"
  fi
}
trap cleanup EXIT

AUTH_ROOT=$FIXTURE/auth
TARGET_DIR=$FIXTURE/target
REGISTRY_ROOT=$FIXTURE/registry
CURSOR_FILE=$FIXTURE/cursor
ACCOUNT_NAME_FILE=$FIXTURE/account-name
PROBE_WORKSPACE=$FIXTURE/workspace
CHANGED_MARKER=$FIXTURE/changed
PROBE_TMP_ROOT=$FIXTURE/tmp
BIN=$FIXTURE/bin
install -d "$AUTH_ROOT/account-a" "$AUTH_ROOT/account-b" "$REGISTRY_ROOT" \
  "$PROBE_WORKSPACE" "$BIN" "$FIXTURE/tmp"
printf '{"account":"a"}\n' > "$AUTH_ROOT/account-a/auth.json"
printf '{"account":"b"}\n' > "$AUTH_ROOT/account-b/auth.json"

cat > "$BIN/subscription-runtime-codex-goal" <<'SH'
#!/usr/bin/env bash
[[ $* == *'"liveCheck":false'* ]] || exit 41
accounts=${SOCIAL_MONITOR_TEST_ACCOUNTS:-'["account-a","account-b"]'}
printf '{"ok":true,"hasAvailableAccount":true,"availableDedupedAccountNames":%s}\n' "$accounts"
SH
cat > "$BIN/codex" <<'SH'
#!/usr/bin/env bash
while (($#)); do
  if [[ $1 == --output-last-message ]]; then
    if [[ -n ${SOCIAL_MONITOR_TEST_FAIL_ACCOUNT:-} ]] \
      && grep -F "\"$SOCIAL_MONITOR_TEST_FAIL_ACCOUNT\"" "$CODEX_HOME/auth.json" >/dev/null; then
      exit 43
    fi
    printf '%s\n' "${SOCIAL_MONITOR_TEST_RESULT:-AUTH_OK}" > "$2"
    exit 0
  fi
  shift
done
exit 42
SH
cat > "$BIN/flock" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod 0755 "$BIN/subscription-runtime-codex-goal" "$BIN/codex" "$BIN/flock"

run_refresh() {
PATH="$BIN:$PATH" \
SOCIAL_MONITOR_AUTH_REFRESH_TEST_MODE=1 \
SOCIAL_MONITOR_AUTH_ROOT="$AUTH_ROOT" \
SOCIAL_MONITOR_AUTH_TARGET_DIR="$TARGET_DIR" \
SOCIAL_MONITOR_AUTH_REGISTRY_ROOT="$REGISTRY_ROOT" \
SOCIAL_MONITOR_AUTH_CURSOR_FILE="$CURSOR_FILE" \
SOCIAL_MONITOR_AUTH_ACCOUNT_NAME_FILE="$ACCOUNT_NAME_FILE" \
SOCIAL_MONITOR_AUTH_PROBE_WORKSPACE="$PROBE_WORKSPACE" \
SOCIAL_MONITOR_AUTH_CHANGED_MARKER="$CHANGED_MARKER" \
SOCIAL_MONITOR_AUTH_PROBE_TMP_ROOT="$PROBE_TMP_ROOT" \
  bash "$ENTRYPOINT"
}

run_refresh >/dev/null

cmp "$AUTH_ROOT/account-a/auth.json" "$TARGET_DIR/auth.json"
[[ $(cat "$CURSOR_FILE") == 0 ]]
[[ $(cat "$ACCOUNT_NAME_FILE") == account-a ]]
if stat -c '%a' "$TARGET_DIR/auth.json" >/dev/null 2>&1; then
  target_mode=$(stat -c '%a' "$TARGET_DIR/auth.json")
else
  target_mode=$(stat -f '%Lp' "$TARGET_DIR/auth.json")
fi
[[ $target_mode == 400 ]]
[[ ! -e $CHANGED_MARKER ]]

SOCIAL_MONITOR_TEST_ACCOUNTS='["account-b"]' run_refresh >/dev/null
cmp "$AUTH_ROOT/account-b/auth.json" "$TARGET_DIR/auth.json"
[[ $(cat "$CURSOR_FILE") == 0 ]]
[[ $(cat "$ACCOUNT_NAME_FILE") == account-b ]]
[[ -f $CHANGED_MARKER ]]

rm -f "$CHANGED_MARKER"
SOCIAL_MONITOR_TEST_FAIL_ACCOUNT=b run_refresh >/dev/null
cmp "$AUTH_ROOT/account-a/auth.json" "$TARGET_DIR/auth.json"
[[ $(cat "$CURSOR_FILE") == 0 ]]
[[ $(cat "$ACCOUNT_NAME_FILE") == account-a ]]
[[ -f $CHANGED_MARKER ]]

old_hash=$(cksum < "$TARGET_DIR/auth.json")
if SOCIAL_MONITOR_TEST_RESULT=WRONG run_refresh >/dev/null 2>&1; then
  echo 'invalid probe result was accepted' >&2
  exit 1
fi
[[ $(cksum < "$TARGET_DIR/auth.json") == "$old_hash" ]]
[[ -z $(find "$PROBE_TMP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'auth-probe.*' -print -quit) ]]

if SOCIAL_MONITOR_TEST_ACCOUNTS='["../escape"]' run_refresh >/dev/null 2>&1; then
  echo 'unsafe broker account path was accepted' >&2
  exit 1
fi
[[ $(cksum < "$TARGET_DIR/auth.json") == "$old_hash" ]]

if SOCIAL_MONITOR_TEST_ACCOUNTS='[]' run_refresh >/dev/null 2>&1; then
  echo 'empty broker account pool was accepted' >&2
  exit 1
fi
[[ $(cksum < "$TARGET_DIR/auth.json") == "$old_hash" ]]
grep -F -- '--sandbox read-only' "$ENTRYPOINT" >/dev/null
grep -F -- '--output-last-message' "$ENTRYPOINT" >/dev/null

echo 'Subscription auth refresh tests passed'
