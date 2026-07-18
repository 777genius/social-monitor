#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
ENTRYPOINT=$SCRIPT_DIR/social-monitor-production-deploy.sh
DAILY_RUN=$SCRIPT_DIR/production-runtime/daily-run.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/daily-deploy-lock-race.XXXXXX")
trap 'touch "$FIXTURE/release"; rm -rf "$FIXTURE"' EXIT

ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
SINGLETON_LOCK=$CONTROL/daily-run-singleton.lock
ADMISSION_LOCK=$CONTROL/daily-run.lock
install -d "$CONTROL" "$STATE" "$ROOT/runtime"

FAKE_DOCKER=$FIXTURE/fake-docker
cat > "$FAKE_DOCKER" <<'SH'
#!/usr/bin/env bash
: > "${RACE_DOCKER_CALLED:?}"
exit 97
SH
chmod 0755 "$FAKE_DOCKER"
cat > "$CONTROL/refresh-codex-auth.sh" <<'SH'
#!/usr/bin/env bash
: > "${RACE_REFRESH_CALLED:?}"
exit 97
SH
chmod 0700 "$CONTROL/refresh-codex-auth.sh"

REFRESH_CALLED=$FIXTURE/refresh-called
DOCKER_CALLED=$FIXTURE/docker-called
export RACE_REFRESH_CALLED=$REFRESH_CALLED RACE_DOCKER_CALLED=$DOCKER_CALLED

# A duplicate daily invocation observes only the dedicated singleton and exits
# successfully without touching admission-dependent work.
(
  exec 7>"$SINGLETON_LOCK"
  flock 7
  : > "$FIXTURE/singleton-ready"
  while [[ ! -e $FIXTURE/release ]]; do sleep 0.01; done
) &
singleton_pid=$!
while [[ ! -e $FIXTURE/singleton-ready ]]; do sleep 0.01; done
duplicate_output=$(
  SOCIAL_MONITOR_DAILY_RUN_TEST_MODE=1 \
  SOCIAL_MONITOR_DAILY_RUN_TEST_ROOT="$ROOT" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_DOCKER="$FAKE_DOCKER" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_ADMISSION_WAIT_SECONDS=0.05 \
    bash "$DAILY_RUN" --yesterday
)
grep -F 'daily production-day run already active' \
  <<< "$duplicate_output" >/dev/null
[[ ! -e $REFRESH_CALLED && ! -e $DOCKER_CALLED ]]
: > "$FIXTURE/release"
wait "$singleton_pid"
rm -f "$FIXTURE/release" "$FIXTURE/singleton-ready"

# Admission timeout is EX_TEMPFAIL and occurs before release-marker reads can
# lead to auth refresh, Docker, or database work.
(
  exec 7>"$ADMISSION_LOCK"
  flock 7
  : > "$FIXTURE/admission-ready"
  while [[ ! -e $FIXTURE/release ]]; do sleep 0.01; done
) &
admission_pid=$!
while [[ ! -e $FIXTURE/admission-ready ]]; do sleep 0.01; done
set +e
daily_timeout_error=$(
  SOCIAL_MONITOR_DAILY_RUN_TEST_MODE=1 \
  SOCIAL_MONITOR_DAILY_RUN_TEST_ROOT="$ROOT" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_DOCKER="$FAKE_DOCKER" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_ADMISSION_WAIT_SECONDS=0.05 \
    bash "$DAILY_RUN" --yesterday 2>&1
)
daily_timeout_status=$?
set -e
((daily_timeout_status == 75))
grep -F 'timed out waiting for PostgreSQL admission' \
  <<< "$daily_timeout_error" >/dev/null
[[ ! -e $REFRESH_CALLED && ! -e $DOCKER_CALLED ]]
: > "$FIXTURE/release"
wait "$admission_pid"
rm -f "$FIXTURE/release" "$FIXTURE/admission-ready"

# Force the exact clear-probe release -> admission-acquire gap. A daily
# singleton appears while admission is still free, so deploy acquires it,
# immediately observes daily priority, releases admission, and fails before
# fetch, auth-control sync, Compose, Docker, or database work.
FETCH_CALLED=$FIXTURE/fetch-called
SYNC_CALLED=$FIXTURE/sync-called
COMPOSE_CALLED=$FIXTURE/compose-called
DATABASE_CALLED=$FIXTURE/database-called
export ENTRYPOINT PROJECT_ROOT ROOT CONTROL STATE FIXTURE
export FETCH_CALLED SYNC_CALLED COMPOSE_CALLED DATABASE_CALLED
TARGET_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

# These fixture variables must expand only inside the isolated child shell.
# shellcheck disable=SC2016
deploy_gap_probe_script='
  source "$ENTRYPOINT"
  fetch_main() { : > "$FETCH_CALLED"; }
  sync_control_script() { : > "$SYNC_CALLED"; }
  verify_compose_scope() { : > "$COMPOSE_CALLED"; }
  deploy_backend() { : > "$DATABASE_CALLED"; }
  docker() { : > "$DOCKER_CALLED"; return 97; }
  postgres_admission_after_singleton_probe() {
    [[ ! -e $FIXTURE/gap-started ]] || return 0
    : > "$FIXTURE/gap-started"
    (
      exec 7>"$DAILY_SINGLETON_LOCK"
      flock 7
      : > "$FIXTURE/gap-singleton-held"
      while [[ ! -e $FIXTURE/release ]]; do sleep 0.01; done
    ) </dev/null >/dev/null 2>&1 &
    while [[ ! -e $FIXTURE/gap-singleton-held ]]; do sleep 0.01; done
  }
  deploy_release "$TARGET_SHA"
'

set +e
deploy_error=$(
  timeout 5 env \
    SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
    SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
    SOCIAL_MONITOR_DEPLOY_REPO="$PROJECT_ROOT" \
    SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
    SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
    ENTRYPOINT="$ENTRYPOINT" TARGET_SHA="$TARGET_SHA" \
    FETCH_CALLED="$FETCH_CALLED" SYNC_CALLED="$SYNC_CALLED" \
    COMPOSE_CALLED="$COMPOSE_CALLED" DATABASE_CALLED="$DATABASE_CALLED" \
    DOCKER_CALLED="$DOCKER_CALLED" \
    FIXTURE="$FIXTURE" \
    bash -c "$deploy_gap_probe_script" 2>&1
)
deploy_status=$?
set -e
((deploy_status != 0 && deploy_status != 124))
grep -F 'daily run claimed priority while deploy acquired PostgreSQL admission' \
  <<< "$deploy_error" >/dev/null
[[ ! -e $FETCH_CALLED && ! -e $SYNC_CALLED && ! -e $COMPOSE_CALLED && \
   ! -e $DATABASE_CALLED && ! -e $REFRESH_CALLED && ! -e $DOCKER_CALLED ]]
flock -n "$ADMISSION_LOCK" true
: > "$FIXTURE/release"
until flock -n "$SINGLETON_LOCK" true; do sleep 0.01; done

echo 'Daily/deploy exact-gap lock race tests passed'
