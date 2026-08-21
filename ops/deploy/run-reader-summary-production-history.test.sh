#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
WRAPPER=$SCRIPT_DIR/run-reader-summary-production-history.sh
FIXTURE=$(mktemp -d /tmp/reader-summary-production-history.XXXXXX)
trap 'rm -rf "$FIXTURE"' EXIT HUP INT TERM

sed "s|readonly DAILY_RUN=/var/data/social-monitor/control/daily-run.sh|readonly DAILY_RUN=$FIXTURE/daily-run.sh|" \
  "$WRAPPER" > "$FIXTURE/wrapper.sh"
cat > "$FIXTURE/daily-run.sh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${HISTORY_LOG:?}"
EOF
chmod 0755 "$FIXTURE/wrapper.sh" "$FIXTURE/daily-run.sh"
export HISTORY_LOG=$FIXTURE/history.log

bash "$FIXTURE/wrapper.sh" 2026-07-25
[[ $(cat "$HISTORY_LOG") == $'--maintenance-date 2026-07-23\n--maintenance-date 2026-07-24\n--maintenance-date 2026-07-25' ]]

for invalid in 2026-07-22 2026-08-21 garbage; do
  if bash "$FIXTURE/wrapper.sh" "$invalid" >/dev/null 2>&1; then
    echo "invalid historical bound was accepted: $invalid" >&2
    exit 1
  fi
done

: > "$HISTORY_LOG"
cat > "$FIXTURE/daily-run.sh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${HISTORY_LOG:?}"
[[ $* != '--maintenance-date 2026-07-24' ]]
EOF
chmod 0755 "$FIXTURE/daily-run.sh"
if bash "$FIXTURE/wrapper.sh" 2026-07-25 >/dev/null 2>&1; then
  echo 'partial historical failure was reported as success' >&2
  exit 1
fi
[[ $(cat "$HISTORY_LOG") == $'--maintenance-date 2026-07-23\n--maintenance-date 2026-07-24\n--maintenance-date 2026-07-25' ]]

printf 'reader-summary production history wrapper tests passed\n'
