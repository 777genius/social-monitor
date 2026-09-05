#!/usr/bin/env bash
# Called only by the Python disposable fixture. No external binary may contact a host.
set -euo pipefail
trap 'printf "fixture host failed at %s:%s: %s\n" "${BASH_SOURCE[0]}" "$LINENO" "$BASH_COMMAND" >&2' ERR
set -E
ROOT=$1 REPO=$1/integration CONTROL=$1/control TARGET=$2 OPERATION=$3
[[ $ROOT == /tmp/exact-source-incident-* ]]
export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 SOCIAL_MONITOR_DEPLOY_ROOT=$ROOT
export SOCIAL_MONITOR_DEPLOY_REPO=$REPO SOCIAL_MONITOR_DEPLOY_CONTROL=$CONTROL
export GITHUB_WORKSPACE=$REPO
# Only transport and filesystem-wide flush are simulated. Git content queries,
# installed authority, client policy, current-target shim and deploy_release are real.
git() {
  if [[ ${3:-} == fetch ]]; then return 0; fi
  if [[ ${3:-} == ls-remote ]]; then printf '%s\trefs/heads/main\n' "$TARGET"; return; fi
  command git "$@"
}
sync() { :; }
docker() { printf 'unexpected Docker call\n' >&2; exit 91; }
systemctl() { printf 'unexpected systemctl call\n' >&2; exit 92; }
# Split only at these exact entrypoint boundaries to run its real preflight
# BEFORE its real library-loading body. Sourcing the whole entrypoint directly
# would use the legacy TEST_MODE source shortcut and miss this incident.
python3 - "$CONTROL/github-production-deploy.sh" "$ROOT" <<'PY'
import sys
from pathlib import Path
source = Path(sys.argv[1]).read_text()
head, rest = source.split('if [[ ${BASH_SOURCE[0]} != "$0" && ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]', 1)
body = 'DEPLOY_CONTROL_LIBRARY_AVAILABLE=false\n' + rest.split('DEPLOY_CONTROL_LIBRARY_AVAILABLE=false\n', 1)[1]
Path(sys.argv[2], 'entry-head.sh').write_text(head)
Path(sys.argv[2], 'entry-body.sh').write_text(body)
PY
source "$ROOT/entry-head.sh"
# Paths are now scoped to the fixture; use the production ownership/admission
# branches for preflight and loading too (the user namespace supplies root).
SOCIAL_MONITOR_DEPLOY_TEST_MODE=0
action=deploy sha=$TARGET
production_transition_host_preflight_prelude "$action" "$sha"
while read -r _ _ function_name; do
  [[ $function_name != production_transition_* ]] || readonly -f "$function_name"
done < <(declare -F)
source "$ROOT/entry-body.sh"
if [[ $OPERATION == client ]]; then
  host_plan=$(print_plan "$TARGET")
  source "$REPO/ops/deploy/github-production-deploy-client.sh"
  capture_plan() {
    local output
    [[ $1 == "$TARGET" ]]
    output=$host_plan
    parse_plan "$output"
  }
  prepare_production_forward_bridge "$TARGET"
  exit
fi
[[ $PRODUCTION_TRANSITION_PRELUDE_COMMIT == "$TARGET" ]]
[[ $(deploy_control_bridge_sealed_paths | wc -l) == 11 ]]
deploy_control_verify_loaded_current_target "$TARGET"
verify_deploy_control_bridge_target_compatibility "$TARGET"
verify_deploy_control_bridge_compatibility
production_transition_host_require_ordinary_deploy "$TARGET"
[[ $OPERATION != check ]] || { printf 'exact-11-and-ordinary-admission\n'; exit; }
# A fresh user namespace maps only this fixture owner to root. From here use
# production library-loading branches, including backup ownership checks. No
# production directories are touched; physical runtime/build effects are stubs.
mkdir -p "$SYSTEMD_UNIT_DIR"
daily_runner_image_bootstrap_before_rescue() { printf 'daily-image-effect:%s\n' "$2" >> "$ROOT/effects"; }
reader_summary_publication_systemctl() {
  case "$*" in
    *UnitFileState*) printf 'disabled\n';;
    *ActiveState*) printf 'inactive\n';;
    *DropInPaths*)
      local dropin=$SYSTEMD_UNIT_DIR/social-monitor-reader-summary-production-day.service.d/10-daily-c1-owner.conf
      [[ ! -f $dropin ]] || printf '%s\n' "$dropin"
      ;;
    daemon-reload) :;;
    *) exit 93;;
  esac
}
snapshot_postgres_runtime_control() { mkdir "$ROOT/runtime-backup"; printf '%s\n' "$ROOT/runtime-backup"; }
# Cleanup of the fake runtime backup is also a simulated runtime effect. Keep
# the directory and its containing fixture for review; never bypass safe-rm.
rm() {
  if [[ $# == 2 && $1 == -rf && $2 == "$ROOT/runtime-backup" ]]; then
    printf 'runtime-backup-retained:%s\n' "$2" >> "$ROOT/effects"
    return 0
  fi
  command rm "$@"
}
activate_postgres_runtime_control() { printf 'runtime-effect:%s\n' "$1" >> "$ROOT/effects"; }
verify_compose_scope() { :; }
deploy_backend() { printf 'backend-effect:%s\n' "$1" >> "$ROOT/effects"; }
backend_image_rescue_cleanup_otel_config() { :; }
backend_image_rescue_cleanup() { :; }
deploy_release "$TARGET"
[[ $(cat "$STATE/backend.sha") == "$TARGET" && $(cat "$STATE/control.sha") == "$TARGET" ]]
[[ $(cat "$STATE/postgres-pool-bootstrap.sha") == "$TARGET" ]]
printf 'ordinary-deployed-exact-target\n'
