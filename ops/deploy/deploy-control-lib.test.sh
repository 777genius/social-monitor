#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/deploy-control-lib-test.XXXXXX")
trap 'touch "$FIXTURE/release"; rm -rf "$FIXTURE"' EXIT

REPO=$FIXTURE/repo
ROOT=$FIXTURE/root
CONTROL=$FIXTURE/control
STATE=$CONTROL/deploy-state
STAGING=$ROOT/runtime/deploy-staging
RELEASES=$ROOT/runtime/frontend-releases
DEPLOY_LOCK=$CONTROL/production-deploy.lock
DAILY_SINGLETON_LOCK=$CONTROL/daily-run-singleton.lock
POSTGRES_ADMISSION_LOCK=$CONTROL/daily-run.lock
# The sourced deploy-control library consumes this fixture-scoped path.
# shellcheck disable=SC2034
POSTGRES_RUNTIME_CURRENT=$CONTROL/postgres-runtime-current
POSTGRES_RUNTIME_RELEASES=$CONTROL/postgres-runtime-releases
SYSTEMD_UNIT_DIR=$ROOT/runtime/systemd
COMPOSE=(docker compose)
FRONTEND_PATHS=(frontend)
BACKEND_PATHS=(backend)
CONTROL_PATHS=(control)
RUNTIME_CONTROL_PATHS=(runtime-control)
install -d "$REPO/ops/deploy" "$CONTROL" "$STATE" "$SYSTEMD_UNIT_DIR"
cp "$SCRIPT_DIR/social-monitor-production-deploy.sh" \
  "$SCRIPT_DIR/deploy-control-lib.sh" \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" \
  "$SCRIPT_DIR/backend-image-rescue-lib.sh" \
  "$SCRIPT_DIR/x-collector-image-deploy-lib.sh" \
  "$REPO/ops/deploy/"
cp -a "$SCRIPT_DIR/production-runtime" "$REPO/ops/deploy/"

fail() {
  printf 'test deploy failure: %s\n' "$*" >&2
  exit 1
}

# shellcheck source=ops/deploy/deploy-control-lib.sh
source "$SCRIPT_DIR/deploy-control-lib.sh"
# shellcheck source=ops/deploy/postgres-runtime-deploy-lib.sh
source "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh"
initialize_deploy_control_bridge

# Successful acquisition retains only PostgreSQL admission. A separate process
# can still acquire the singleton while this shell owns admission.
exec 8>"$POSTGRES_ADMISSION_LOCK"
POSTGRES_ADMISSION_MAX_ATTEMPTS=2
POSTGRES_ADMISSION_RETRY_SLICE_SECONDS=0.01
acquire_postgres_admission_with_daily_priority 8
flock -n "$DAILY_SINGLETON_LOCK" true
flock -u 8

# The bounded nonblocking loop times out without calling a blocking long-wait
# flock operation.
(
  exec 7>"$POSTGRES_ADMISSION_LOCK"
  flock 7
  : > "$FIXTURE/admission-held"
  while [[ ! -e $FIXTURE/release ]]; do sleep 0.01; done
) &
holder_pid=$!
while [[ ! -e $FIXTURE/admission-held ]]; do sleep 0.01; done
set +e
timeout_error=$(
  (
    exec 8>"$POSTGRES_ADMISSION_LOCK"
    acquire_postgres_admission_with_daily_priority 8
  ) 2>&1
)
timeout_status=$?
set -e
((timeout_status != 0))
grep -F 'timed out waiting for PostgreSQL admission lock' \
  <<< "$timeout_error" >/dev/null
: > "$FIXTURE/release"
wait "$holder_pid"
rm -f "$FIXTURE/release" "$FIXTURE/admission-held"

# Deterministically place a daily singleton holder after the clear probe but
# before admission acquisition. The post-acquire probe must release admission
# and fail.
postgres_admission_after_singleton_probe() {
  [[ ! -e $FIXTURE/gap-started ]] || return 0
  : > "$FIXTURE/gap-started"
  (
    exec 7>"$DAILY_SINGLETON_LOCK"
    flock 7
    : > "$FIXTURE/singleton-held"
    while [[ ! -e $FIXTURE/release ]]; do sleep 0.01; done
  ) </dev/null >/dev/null 2>&1 &
  while [[ ! -e $FIXTURE/singleton-held ]]; do sleep 0.01; done
}

set +e
gap_error=$(
  (
    exec 8>"$POSTGRES_ADMISSION_LOCK"
    acquire_postgres_admission_with_daily_priority 8
  ) 2>&1
)
gap_status=$?
set -e
((gap_status != 0))
grep -F 'daily run claimed priority while deploy acquired PostgreSQL admission' \
  <<< "$gap_error" >/dev/null
flock -n "$POSTGRES_ADMISSION_LOCK" true
: > "$FIXTURE/release"
until flock -n "$DAILY_SINGLETON_LOCK" true; do sleep 0.01; done
rm -f "$FIXTURE/release"

# Runtime assets cannot advance in the same release as the already-sourced
# bridge controller or PostgreSQL activation library.
printf '# target mutation\n' >> \
  "$REPO/ops/deploy/postgres-runtime-deploy-lib.sh"
set +e
bridge_error=$(verify_deploy_control_bridge_compatibility 2>&1)
bridge_status=$?
set -e
((bridge_status != 0))
grep -F 'deploy the bridge release first' <<< "$bridge_error" >/dev/null
cp "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" \
  "$REPO/ops/deploy/postgres-runtime-deploy-lib.sh"
verify_deploy_control_bridge_compatibility

# The image-rescue controller is part of the same control-only bridge digest;
# a publication/runtime target cannot replace it under the running controller.
printf '# target rescue mutation\n' >> \
  "$REPO/ops/deploy/backend-image-rescue-lib.sh"
set +e
rescue_bridge_error=$(verify_deploy_control_bridge_compatibility 2>&1)
rescue_bridge_status=$?
set -e
((rescue_bridge_status != 0))
grep -F 'deploy the bridge release first' <<< "$rescue_bridge_error" >/dev/null
cp "$SCRIPT_DIR/backend-image-rescue-lib.sh" \
  "$REPO/ops/deploy/backend-image-rescue-lib.sh"
verify_deploy_control_bridge_compatibility

# X image provenance is also immutable across the Release A -> Release B
# bridge so the controller that validates the candidate is already running.
printf '# target X provenance mutation\n' >> \
  "$REPO/ops/deploy/x-collector-image-deploy-lib.sh"
set +e
x_bridge_error=$(verify_deploy_control_bridge_compatibility 2>&1)
x_bridge_status=$?
set -e
((x_bridge_status != 0))
grep -F 'deploy the bridge release first' <<< "$x_bridge_error" >/dev/null
cp "$SCRIPT_DIR/x-collector-image-deploy-lib.sh" \
  "$REPO/ops/deploy/x-collector-image-deploy-lib.sh"
verify_deploy_control_bridge_compatibility

source_runtime=$REPO/ops/deploy/production-runtime
source_activation=$source_runtime/github-premidnight-capture-v1.activation
legacy_runtime=$CONTROL/legacy-postgres-runtime
current_activation=$legacy_runtime/github-premidnight-capture-v1.activation
valid_activation=$FIXTURE/github-premidnight-capture-v1.activation
install -d "$legacy_runtime"
ln -s "$legacy_runtime" "$POSTGRES_RUNTIME_CURRENT"
printf 'install-disabled-v1\n' > "$valid_activation"

assert_reconciliation_failure() {
  local expected=$1
  local error status

  set +e
  error=$(reconcile_github_premidnight_capture_runtime_control false 2>&1)
  status=$?
  set -e
  ((status != 0))
  grep -F "$expected" <<< "$error" >/dev/null
}

# Historical controller bridges predate the capture mutation classifier. They
# remain unchanged only while both activation markers are absent; any marker
# appearing without the reviewed classifier fails closed.
rm -f "$source_activation" "$current_activation"
unset -f postgres_runtime_control_mutation_scope
[[ $(reconcile_github_premidnight_capture_runtime_control false) == false ]]
[[ $(reconcile_github_premidnight_capture_runtime_control true) == true ]]
install -m 0644 "$valid_activation" "$source_activation"
assert_reconciliation_failure 'mutation classifier is unavailable'
# shellcheck source=ops/deploy/postgres-runtime-deploy-lib.sh
source "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh"

# Equal activation states do not turn a marker-diff-free classification into a
# runtime-control deployment. An existing positive classification is retained.
rm -f "$source_activation" "$current_activation"
[[ $(reconcile_github_premidnight_capture_runtime_control false) == false ]]
[[ $(reconcile_github_premidnight_capture_runtime_control true) == true ]]
install -m 0644 "$valid_activation" "$source_activation"
install -m 0644 "$valid_activation" "$current_activation"
[[ $(reconcile_github_premidnight_capture_runtime_control false) == false ]]
[[ $(reconcile_github_premidnight_capture_runtime_control true) == true ]]

# A source-only activation marker is the recoverable bootstrap drift. Marker
# validation remains fail closed for malformed files and symlinks on either
# side of the comparison.
rm -f "$current_activation"
[[ $(reconcile_github_premidnight_capture_runtime_control false) == true ]]
printf 'enable-now\n' > "$source_activation"
assert_reconciliation_failure 'activation marker is invalid'
rm -f "$source_activation"
ln -s "$valid_activation" "$source_activation"
assert_reconciliation_failure 'activation marker is not a regular file'
rm -f "$source_activation"
install -m 0644 "$valid_activation" "$source_activation"
printf 'enable-now\n' > "$current_activation"
assert_reconciliation_failure 'activation marker is invalid'
rm -f "$current_activation"
ln -s "$valid_activation" "$current_activation"
assert_reconciliation_failure 'activation marker is not a regular file'

# The reconciliation seam reuses the mutation classifier's removal
# prohibition instead of treating source removal as an activation request.
rm -f "$source_activation" "$current_activation"
install -m 0644 "$valid_activation" "$current_activation"
assert_reconciliation_failure 'activation marker cannot be removed'
rm -f "$current_activation"
install -m 0644 "$valid_activation" "$source_activation"

# Exercise the later bootstrap call with the control marker already at the
# target and no component diff. The source is active while the installed legacy
# runtime has no activation marker, so reconciliation alone must select runtime
# control without changing the compatible backend release identity.
for unit in social-monitor-daily.service social-monitor-prod.service; do
  install -m 0644 "$source_runtime/$unit" "$SYSTEMD_UNIT_DIR/$unit"
done
install -m 0755 "$source_runtime/daily-run.sh" "$CONTROL/daily-run.sh"
git -C "$REPO" init -q -b main
git -C "$REPO" config user.email deploy-control-test@example.invalid
git -C "$REPO" config user.name deploy-control-test
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: reconciled runtime target'
target_sha=$(git -C "$REPO" rev-parse HEAD)
backend_marker_sha=617e284607f3dde74c27164af2b981770b9a62ed

# Entry-point-only reconciliation has a distinct primitive. Its function body
# cannot acquire the wrapper, auth-refresh, or X-image side effects retained by
# the ordinary full control sync.
entrypoint_sync_body=$(sed -n \
  '/^sync_control_entrypoint() {$/,/^}$/p' \
  "$SCRIPT_DIR/social-monitor-production-deploy.sh")
grep -F 'social-monitor-production-deploy.sh' \
  <<< "$entrypoint_sync_body" >/dev/null
grep -F 'github-production-deploy.sh' \
  <<< "$entrypoint_sync_body" >/dev/null
if grep -E 'wrapper|auth_refresh|x_collector' \
  <<< "$entrypoint_sync_body" >/dev/null; then
  echo 'entrypoint-only sync contains a broad control side effect' >&2
  exit 1
fi
grep -F 'sync_control_entrypoint' \
  <<< "$(sed -n '/^sync_control_script() {$/,/^}$/p' \
    "$SCRIPT_DIR/social-monitor-production-deploy.sh")" >/dev/null

# Normal callers retain the ancestor-accepting fast path. The explicit
# force-advance mode is separate, rejects misspellings, and is used by exactly
# one reconciliation call after marker identity race checks.
install -m 0755 "$REPO/ops/deploy/social-monitor-production-deploy.sh" \
  "$CONTROL/github-production-deploy.sh"
printf '%s\n' "$target_sha" > "$STATE/postgres-pool-bootstrap.sha"
commit_mode_output=$(
  COMMIT_FUNCTION="$(sed -n \
    '/^commit_postgres_pool_bootstrap() {$/,/^}$/p' \
    "$SCRIPT_DIR/social-monitor-production-deploy.sh")" \
  TARGET_SHA="$target_sha" \
  STATE="$STATE" \
    bash -c '
      set -euo pipefail
      eval "$COMMIT_FUNCTION"
      fail() {
        printf "test deploy failure: %s\n" "$*" >&2
        exit 1
      }
      postgres_pool_bootstrap_installed() {
        return 0
      }
      marker=$STATE/postgres-pool-bootstrap.sha
      default_identity=$(stat -c "%d:%i:%s:%y:%z" "$marker")
      commit_postgres_pool_bootstrap "$TARGET_SHA"
      [[ $(stat -c "%d:%i:%s:%y:%z" "$marker") == "$default_identity" ]]
      set +e
      invalid_output=$(
        (commit_postgres_pool_bootstrap "$TARGET_SHA" force) 2>&1
      )
      invalid_status=$?
      set -e
      ((invalid_status != 0))
      grep -F "marker advance mode is invalid" <<< "$invalid_output" >/dev/null
      forced_identity=$(stat -c "%d:%i:%s:%y:%z" "$marker")
      commit_postgres_pool_bootstrap "$TARGET_SHA" force-advance
      [[ $(<"$marker") == "$TARGET_SHA" ]]
      [[ $(stat -c "%d:%i:%s:%y:%z" "$marker") != "$forced_identity" ]]
      committed_identity=$(stat -c "%d:%i:%s:%y:%z" "$marker")
      ln -s "$marker" "$marker.next"
      set +e
      temporary_output=$(
        (commit_postgres_pool_bootstrap "$TARGET_SHA" force-advance) 2>&1
      )
      temporary_status=$?
      set -e
      ((temporary_status != 0))
      grep -F "marker temporary path is invalid" \
        <<< "$temporary_output" >/dev/null
      [[ -L $marker.next ]]
      [[ $(stat -c "%d:%i:%s:%y:%z" "$marker") == "$committed_identity" ]]
      rm -f "$marker.next"
      [[ -f $marker && ! -L $marker ]]
      printf "commit-modes-ok\n"
    '
)
[[ $commit_mode_output == commit-modes-ok ]]
[[ $(grep -cF 'commit_mode=force-advance' \
  "$SCRIPT_DIR/deploy-control-lib.sh") == 1 ]]
force_call_line=$(grep -nF \
  'commit_postgres_pool_bootstrap "$current" "$commit_mode"' \
  "$SCRIPT_DIR/deploy-control-lib.sh" | cut -d: -f1)
pool_race_line=$(grep -nF \
  'PostgreSQL bootstrap marker changed during control reconciliation' \
  "$SCRIPT_DIR/deploy-control-lib.sh" | cut -d: -f1)
control_race_line=$(grep -nF \
  'control marker changed during PostgreSQL bootstrap reconciliation' \
  "$SCRIPT_DIR/deploy-control-lib.sh" | cut -d: -f1)
((pool_race_line < force_call_line && control_race_line < force_call_line))

printf '%s\n' "$target_sha" > "$STATE/frontend.sha"
printf '%s\n' "$backend_marker_sha" > "$STATE/backend.sha"
printf '%s\n' "$target_sha" > "$STATE/control.sha"
[[ $(<"$STATE/control.sha") == "$target_sha" ]]

deploy_events=$FIXTURE/deploy-events
systemctl_events=$FIXTURE/systemctl-events
timer_unit_file_state=$FIXTURE/timer-unit-file-state
timer_active_state=$FIXTURE/timer-active-state
service_active_state=$FIXTURE/service-active-state
: > "$systemctl_events"
printf 'disabled\n' > "$timer_unit_file_state"
printf 'inactive\n' > "$timer_active_state"
printf 'inactive\n' > "$service_active_state"

fetch_main() {
  :
}

validate_main_commit() {
  [[ $1 == "$target_sha" ]]
  git -C "$REPO" cat-file -e "$1^{commit}"
}

marker_value() {
  local component=$1
  local marker=$STATE/$component.sha
  [[ -s $marker ]] && tr -d '\n' < "$marker"
}

component_changed() {
  local component=$1
  local target=$2

  [[ $target == "$target_sha" ]]
  if [[ $component == control ]]; then
    [[ $(marker_value "$component") == "$target" ]] || \
      fail 'control marker did not already equal the target'
  elif [[ $component == backend ]]; then
    [[ $(marker_value "$component") == "$backend_marker_sha" ]] || \
      fail 'backend compatibility marker changed unexpectedly'
  fi
  return 1
}

advance_integration() {
  [[ $1 == "$target_sha" ]]
  [[ $(git -C "$REPO" rev-parse HEAD) == "$target_sha" ]]
  printf 'integration\n' >> "$deploy_events"
}

sync_control_script() {
  [[ $1 == "$target_sha" ]]
  printf 'control\n' >> "$deploy_events"
}

verify_effective_postgres_daily_topology() {
  :
}

systemctl() {
  printf '%s\n' "$*" >> "$systemctl_events"
  case $* in
    daemon-reload) ;;
    'show --property=FragmentPath --value '*)
      printf '%s/%s\n' "$SYSTEMD_UNIT_DIR" "${*: -1}"
      ;;
    'show --property=DropInPaths --value '*) ;;
    'show --property=UnitFileState --value social-monitor-github-premidnight-capture-v1.timer')
      cat "$timer_unit_file_state"
      ;;
    'show --property=ActiveState --value social-monitor-github-premidnight-capture-v1.timer')
      cat "$timer_active_state"
      ;;
    'show --property=ActiveState --value social-monitor-github-premidnight-capture-v1.service')
      cat "$service_active_state"
      ;;
    *)
      fail "unexpected systemctl command: $*"
      ;;
  esac
}

deploy_release_runtime_transaction() {
  local sha=$1
  local backend=$2
  local runtime_control=$3
  local compatible_backend_sha

  [[ $sha == "$target_sha" && $backend == false && \
     $runtime_control == true ]] || \
    fail 'reconciled runtime transaction classification is invalid'
  compatible_backend_sha=$(marker_value backend)
  [[ $compatible_backend_sha == "$backend_marker_sha" ]] || \
    fail 'reconciled runtime release lost backend compatibility identity'
  printf 'runtime=%s backend=%s sha=%s\n' \
    "$runtime_control" "$backend" "$sha" >> "$deploy_events"
  verify_deploy_control_bridge_compatibility
  activate_postgres_runtime_control "$sha" "$compatible_backend_sha"
}

commit_postgres_pool_bootstrap() {
  [[ $1 == "$target_sha" ]]
  printf 'bootstrap\n' >> "$deploy_events"
}

deploy_output=$(deploy_release "$target_sha")
grep -Fx \
  "deployed=$target_sha frontend=false backend=false control=false" \
  <<< "$deploy_output" >/dev/null
grep -Fx "runtime=true backend=false sha=$target_sha" \
  "$deploy_events" >/dev/null
[[ $(<"$STATE/control.sha") == "$target_sha" ]]
release=$POSTGRES_RUNTIME_RELEASES/$target_sha
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$release" ]]
[[ $(<"$release/SOURCE_SHA") == "$target_sha" ]]
[[ $(<"$release/READY") == "$backend_marker_sha" ]]
cmp -s "$release/github-premidnight-capture-v1.activation" \
  "$source_activation"
cmp -s "$release/social-monitor-github-premidnight-capture-v1.service" \
  "$SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.service"
cmp -s "$release/social-monitor-github-premidnight-capture-v1.timer" \
  "$SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.timer"
grep -Fx 'Persistent=false' \
  "$SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.timer" \
  >/dev/null
[[ $(<"$timer_unit_file_state") == disabled ]]
[[ $(<"$timer_active_state") == inactive ]]
[[ $(<"$service_active_state") == inactive ]]
if grep -Eq '(^| )(enable|disable|start|stop|restart)( |$)' \
  "$systemctl_events"; then
  echo 'reconciled runtime deployment mutated a systemd unit state' >&2
  exit 1
fi
if ((EUID == 0)); then
  grep -Fx \
    'show --property=UnitFileState --value social-monitor-github-premidnight-capture-v1.timer' \
    "$systemctl_events" >/dev/null
  grep -Fx \
    'show --property=ActiveState --value social-monitor-github-premidnight-capture-v1.timer' \
    "$systemctl_events" >/dev/null
  grep -Fx \
    'show --property=ActiveState --value social-monitor-github-premidnight-capture-v1.service' \
    "$systemctl_events" >/dev/null
fi

echo 'Deploy control library tests passed'
