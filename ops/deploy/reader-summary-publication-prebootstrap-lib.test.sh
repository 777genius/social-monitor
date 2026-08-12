#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/publication-prebootstrap.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

REPO=$FIXTURE/repo
CONTROL=$FIXTURE/control
SYSTEMD_UNIT_DIR=$FIXTURE/systemd
mkdir -p "$REPO/ops/deploy/production-runtime" "$SYSTEMD_UNIT_DIR" "$CONTROL"
cp "$SCRIPT_DIR/production-runtime/social-monitor-reader-summary-production-day.bootstrap.timer" \
  "$REPO/ops/deploy/production-runtime/"
cp "$SCRIPT_DIR/production-runtime/social-monitor-reader-summary-production-day.service.d-10-daily-c1-owner.conf" \
  "$REPO/ops/deploy/production-runtime/"
cp "$SCRIPT_DIR/production-runtime/social-monitor-daily.service" \
  "$REPO/ops/deploy/production-runtime/"
cp "$SCRIPT_DIR/production-runtime/daily-run.sh" \
  "$REPO/ops/deploy/production-runtime/"
git -C "$REPO" init -q
git -C "$REPO" config user.email test@example.invalid
git -C "$REPO" config user.name test
git -C "$REPO" add ops/deploy/production-runtime/daily-run.sh
git -C "$REPO" commit -qm 'test: previous runner'
PREVIOUS_SHA=$(git -C "$REPO" rev-parse HEAD)

fail() {
  printf 'publication-prebootstrap-test-error: %s\n' "$*" >&2
  return 1
}

fake_active_state=inactive
fake_v6_dropins=
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
        --property=DropInPaths)
          if [[ -f $SYSTEMD_UNIT_DIR/social-monitor-reader-summary-production-day.service && \
                -f $SYSTEMD_UNIT_DIR/social-monitor-reader-summary-production-day.service.d/10-daily-c1-owner.conf ]]; then
            printf '%s\n' "$SYSTEMD_UNIT_DIR/social-monitor-reader-summary-production-day.service.d/10-daily-c1-owner.conf"
          else
            printf '%s\n' "$fake_v6_dropins"
          fi
          ;;
        *) return 1 ;;
      esac
      ;;
    *) return 1 ;;
  esac
}

# shellcheck source=ops/deploy/reader-summary-publication-prebootstrap-lib.sh
source "$SCRIPT_DIR/reader-summary-publication-prebootstrap-lib.sh"
reader_summary_publication_prebootstrap_v6_runner
cmp -s "$REPO/ops/deploy/production-runtime/daily-run.sh" \
  "$CONTROL/run-reader-summary-production-day.sh"
[[ -x $CONTROL/run-reader-summary-production-day.sh ]]
reader_summary_publication_prebootstrap_v6_runner

printf '# previous reviewed runner\n' > \
  "$REPO/ops/deploy/production-runtime/daily-run.sh"
chmod 0755 "$REPO/ops/deploy/production-runtime/daily-run.sh"
reader_summary_publication_prebootstrap_v6_runner "$PREVIOUS_SHA"
cmp -s "$REPO/ops/deploy/production-runtime/daily-run.sh" \
  "$CONTROL/run-reader-summary-production-day.sh"

printf '# unknown runner\n' > "$CONTROL/run-reader-summary-production-day.sh"
chmod 0755 "$CONTROL/run-reader-summary-production-day.sh"
if reader_summary_publication_prebootstrap_v6_runner "$PREVIOUS_SHA" 2>/dev/null; then
  echo 'unknown previous runner was unexpectedly accepted' >&2
  exit 1
fi
git -C "$REPO" show \
  "$PREVIOUS_SHA:ops/deploy/production-runtime/daily-run.sh" > \
  "$CONTROL/run-reader-summary-production-day.sh"
chmod 0755 "$CONTROL/run-reader-summary-production-day.sh"
fake_active_state=active
if reader_summary_publication_prebootstrap_v6_runner "$PREVIOUS_SHA" 2>/dev/null; then
  echo 'active previous runner was unexpectedly replaced' >&2
  exit 1
fi
fake_active_state=inactive
reader_summary_publication_prebootstrap_v6_runner "$PREVIOUS_SHA"
reader_summary_publication_prebootstrap_absent_daily_timer
cmp -s \
  "$REPO/ops/deploy/production-runtime/social-monitor-reader-summary-production-day.bootstrap.timer" \
  "$SYSTEMD_UNIT_DIR/social-monitor-reader-summary-production-day.timer"
reader_summary_publication_prebootstrap_absent_daily_timer
reader_summary_publication_prebootstrap_v6_dropin

printf 'stale reviewed drop-in\n' > \
  "$SYSTEMD_UNIT_DIR/social-monitor-reader-summary-production-day.service.d/10-daily-c1-owner.conf"
reader_summary_publication_prebootstrap_v6_dropin
cmp -s \
  "$REPO/ops/deploy/production-runtime/social-monitor-reader-summary-production-day.service.d-10-daily-c1-owner.conf" \
  "$SYSTEMD_UNIT_DIR/social-monitor-reader-summary-production-day.service.d/10-daily-c1-owner.conf"
cmp -s \
  "$REPO/ops/deploy/production-runtime/social-monitor-reader-summary-production-day.service.d-10-daily-c1-owner.conf" \
  "$SYSTEMD_UNIT_DIR/social-monitor-reader-summary-production-day.service.d/10-daily-c1-owner.conf"
reader_summary_publication_prebootstrap_v6_dropin

rm -rf "$SYSTEMD_UNIT_DIR/social-monitor-reader-summary-production-day.service.d"
reader_summary_publication_prebootstrap_v6_dropin
cmp -s "$REPO/ops/deploy/production-runtime/social-monitor-daily.service" \
  "$SYSTEMD_UNIT_DIR/social-monitor-reader-summary-production-day.service"
cmp -s \
  "$REPO/ops/deploy/production-runtime/social-monitor-reader-summary-production-day.service.d-10-daily-c1-owner.conf" \
  "$SYSTEMD_UNIT_DIR/social-monitor-reader-summary-production-day.service.d/10-daily-c1-owner.conf"

rm -f "$SYSTEMD_UNIT_DIR/social-monitor-reader-summary-production-day.timer"
fake_active_state=active
if reader_summary_publication_prebootstrap_absent_daily_timer 2>/dev/null; then
  echo 'active absent timer was unexpectedly accepted' >&2
  exit 1
fi

echo 'reader summary publication prebootstrap tests passed'
