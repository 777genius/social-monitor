#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/publication-prebootstrap.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

REPO=$FIXTURE/repo
SYSTEMD_UNIT_DIR=$FIXTURE/systemd
mkdir -p "$REPO/ops/deploy/production-runtime" "$SYSTEMD_UNIT_DIR"
cp "$SCRIPT_DIR/production-runtime/social-monitor-reader-summary-production-day.bootstrap.timer" \
  "$REPO/ops/deploy/production-runtime/"

fail() {
  printf 'publication-prebootstrap-test-error: %s\n' "$*" >&2
  return 1
}

fake_active_state=inactive
reader_summary_publication_systemctl() {
  local action=$1
  shift
  case $action in
    daemon-reload) return 0 ;;
    show)
      case $1 in
        --property=UnitFileState)
          [[ -f $SYSTEMD_UNIT_DIR/social-monitor-reader-summary-production-day.timer ]] && \
            printf 'disabled\n' || printf '\n'
          ;;
        --property=ActiveState) printf '%s\n' "$fake_active_state" ;;
        *) return 1 ;;
      esac
      ;;
    *) return 1 ;;
  esac
}

# shellcheck source=ops/deploy/reader-summary-publication-prebootstrap-lib.sh
source "$SCRIPT_DIR/reader-summary-publication-prebootstrap-lib.sh"
reader_summary_publication_prebootstrap_absent_daily_timer
cmp -s \
  "$REPO/ops/deploy/production-runtime/social-monitor-reader-summary-production-day.bootstrap.timer" \
  "$SYSTEMD_UNIT_DIR/social-monitor-reader-summary-production-day.timer"
reader_summary_publication_prebootstrap_absent_daily_timer

rm -f "$SYSTEMD_UNIT_DIR/social-monitor-reader-summary-production-day.timer"
fake_active_state=active
if reader_summary_publication_prebootstrap_absent_daily_timer 2>/dev/null; then
  echo 'active absent timer was unexpectedly accepted' >&2
  exit 1
fi

echo 'reader summary publication prebootstrap tests passed'
