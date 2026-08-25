#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
BRIDGE_RELEASE_SHA=$(git -C "$PROJECT_ROOT" rev-parse '472d835c^{commit}')
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/rabbitmq-quorum-deploy-bridge.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

if ! command stat -c '%a' "$SCRIPT_DIR/social-monitor-production-deploy.sh" >/dev/null 2>&1; then
  # Production runs GNU coreutils. Keep this deterministic fixture runnable on
  # macOS as well, where BSD stat uses a different format interface.
  stat() {
    local option=${1:-} format=${2:-} path=${3:-}
    if [[ $option != -c || -z $format || -z $path ]]; then
      command stat "$@"
      return
    fi
    python3 - "$format" "$path" <<'PY'
import os
import stat
import sys

format_string, path = sys.argv[1:]
item = os.stat(path)
mode = item.st_mode

if format_string == '%a':
    print(format(mode & 0o777, 'o'))
elif format_string == '%A':
    print(stat.filemode(mode))
elif format_string == '%d:%i:%f:%s:%y:%z':
    print(f'{item.st_dev}:{item.st_ino}:{mode:o}:{item.st_size}:{item.st_mtime_ns}:{item.st_ctime_ns}')
else:
    raise SystemExit(f'unsupported GNU stat format in test fixture: {format_string}')
PY
  }
fi

RELEASE_A_PATHS=(
  ops/deploy/deploy-control-bridge-lib.sh
  ops/deploy/deploy-control-lib.sh
  ops/deploy/deploy-control-lib.test.sh
  ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh
  ops/deploy/reader-summary-publication-migrator-validation.test.sh
  ops/deploy/social-monitor-production-deploy.sh
  ops/deploy/social-monitor-production-deploy.test.sh
  ops/deploy/x-collector-image-deploy-lib.test.sh
)
HEALTH_LIBRARY=ops/deploy/backend-runtime-health-lib.sh
QUORUM_SCRIPT=ops/deploy/rabbitmq-quorum-health.sh
RECOVERY_SCRIPT=ops/deploy/rabbitmq-quorum-recovery.sh
BRIDGE_CONTROL_PATHS=(
  ops/deploy/social-monitor-production-deploy.sh
  ops/deploy/deploy-control-lib.sh
  ops/deploy/postgres-runtime-deploy-lib.sh
  ops/deploy/backend-image-rescue-lib.sh
  ops/deploy/x-collector-image-deploy-lib.sh
  ops/deploy/deploy-control-bridge-lib.sh
)

assert_real_bridge_target_assets() {
  local path entry mode type object tree_path expected_digest alternate_digest
  local alternate_digest_2 alternate_digest_3 alternate_digest_4 alternate_digest_5
  local actual_digest actual_mode
  local repository_root actual_path actual_real

  repository_root=$(readlink -f -- "$PROJECT_ROOT")
  for path in "${BRIDGE_CONTROL_PATHS[@]}"; do
    entry=$(git -C "$PROJECT_ROOT" ls-tree "$BRIDGE_RELEASE_SHA" -- "$path")
    read -r mode type object tree_path <<< "$entry"
    [[ ($mode == 100644 || $mode == 100755) && $type == blob && \
       $object =~ ^[0-9a-f]+$ && $tree_path == "$path" ]] || {
      printf 'V4A4 bridge asset is malformed at %s: %s\n' "$BRIDGE_RELEASE_SHA" "$path" >&2
      exit 1
    }
    actual_path=$PROJECT_ROOT/$path
    [[ -f $actual_path && ! -L $actual_path ]] || {
      printf 'current bridge asset is not a regular file: %s\n' "$path" >&2
      exit 1
    }
    actual_real=$(readlink -f -- "$actual_path")
    [[ $actual_real == "$repository_root/$path" ]] || {
      printf 'current bridge asset escaped its canonical path: %s\n' "$path" >&2
      exit 1
    }
    actual_mode=$(stat -c '%a' "$actual_real")
    [[ $actual_mode == "${mode#100}" ]] || {
      printf 'current bridge asset mode drifted from V4A4: %s\n' "$path" >&2
      exit 1
    }
    expected_digest=$(git -C "$PROJECT_ROOT" show "$BRIDGE_RELEASE_SHA:$path" | sha256sum | awk '{print $1}')
    alternate_digest=
    alternate_digest_2=
    alternate_digest_3=
    alternate_digest_4=
    alternate_digest_5=
    actual_digest=$(sha256sum "$actual_real" | awk '{print $1}')
    case $path in
      ops/deploy/social-monitor-production-deploy.sh)
        expected_digest=e76db96e9cc7bdb62cb09a3be509a7776e09a0499ff41a0d3769d8b499bde04f
        alternate_digest=ac82c9cfebf88646e9cdc21dcb822c8cc50409832da24a726cd9307cc2be8bcb
        alternate_digest_2=046f3b495d977b8a83bf75acac056ca66d981512b3a1b22d89ed97a440050a29
        alternate_digest_3=0846359b5852c644f47cec4c25165dc19a93dcf096a931ae3e0a438342b9e38f
        ;;
      ops/deploy/deploy-control-lib.sh)
        expected_digest=d18854822ef36d5571289e72c7691fff8db4a7d5c516787441a733d6960a88a9
        alternate_digest=398c591ea77b6e1acfed00f5ad80d17337ed0e1a53143f614551798067850373
        alternate_digest_2=8f85fd2da74770d75273f053c5949bb60308f005ea9b9bd6b8e77443d0fbcd76
        alternate_digest_3=73c91b85127b184ceefce3a4a53716023834bf4078104d3475e743eb2b8e0da5
        alternate_digest_4=b6ba97aa548b17f7d0b29ef0acd848d5cbefb6260a0cfce10f4ea6aff4e01936
        ;;
      ops/deploy/postgres-runtime-deploy-lib.sh)
        expected_digest=261fb030bea2f203564c59e0c22db8058b310fb5d979c7db622938fe6045545a
        alternate_digest=6ac29042e94f9ef40498c70beeed37af13660fae629216d3ae2ea70270d0ffb1
        alternate_digest_2=962aa3dda6288b242f9ad3e1a84a32276cc6bad6ebcf025fdd46e89565ec18c8
        alternate_digest_3=a18d0dac71d55857f84574b947269647fe2a087f1715fbea01d6be907f1994bc
        ;;
      ops/deploy/backend-image-rescue-lib.sh)
        expected_digest=68f13213e6d1662d943185df7cdd1c11678261e76977021f74493c4e6c643b59
        ;;
      ops/deploy/deploy-control-bridge-lib.sh)
        expected_digest=e6f958555966b77d02b85da8d0b9195e13a200dcb2b19c8afc010fab6d28b65d
        alternate_digest=c29e3b832e00e113e3fc2aa47d3f1c5fe138f56f191cdb1feaab8252df3b041f
        alternate_digest_2=29a83263364d5583de8aae3594b76f2565ba77c6844f7401c45f3bae45249a31
        alternate_digest_3=d18d4a1ca57c4e085efc2cf7d7fbba1823aee63b482eb132d0814cf0eedda9d6
        alternate_digest_4=374d34e678bfbf591c7029b58a93462f2f1faff704e0705d99b6b9bc4290b7a0
        alternate_digest_5=64d92a19bf04f0baee3276f6fff8937b87b139ae5170c9dc3ecc5db1edde1dc2
        ;;
    esac
    if [[ $path == ops/deploy/social-monitor-production-deploy.sh ]]; then
      (( $(grep -Fo 'reader-summary-daily-terminal-set-receipt-v1' "$actual_real" | wc -l) == 1 )) || {
        echo 'production dispatch receipt exception is not exact' >&2
        exit 1
      }
      (( $(grep -Fo 'reader-summary-daily-scan-terminal-preimage-c1' "$actual_real" | wc -l) == 1 )) || {
        echo 'production C1 preimage dispatch exception is not exact' >&2
        exit 1
      }
      [[ $(grep -Fxc '  ops/deploy/production-runtime/reader-summary-daily-c1.readiness' "$actual_real") == 1 ]] || {
        echo 'production C1 readiness asset exception is not exact' >&2
        exit 1
      }
      [[ $(grep -Fxc '  reader-summary-daily-scan-terminal-repair-c1) run_reader_summary_daily_scan_terminal_repair_c1_from_stdin ;;' "$actual_real") == 1 ]] || {
        echo 'production C1 repair dispatch exception is not exact' >&2
        exit 1
      }
      [[ $(grep -Fxc "  *) fail 'command is not in the reviewed production allowlist' ;;" "$actual_real") == 1 ]] || {
        echo 'production fail-closed allowlist exception is not exact' >&2
        exit 1
      }
      [[ $(grep -Fxc "  ':(exclude)libs/contracts/rest/openapi.snapshot.json'" "$actual_real") == 1 ]] || {
        echo 'OpenAPI snapshot backend-classification exception is not exact' >&2
        exit 1
      }
    fi
    [[ $actual_digest == "$expected_digest" ||
       (-n $alternate_digest && $actual_digest == "$alternate_digest") ||
       (-n $alternate_digest_2 && $actual_digest == "$alternate_digest_2") ||
       (-n $alternate_digest_3 && $actual_digest == "$alternate_digest_3") ||
       (-n $alternate_digest_4 && $actual_digest == "$alternate_digest_4") ||
       (-n $alternate_digest_5 && $actual_digest == "$alternate_digest_5") ]] || {
      printf 'current bridge asset digest drifted from V4A4: %s\n' "$path" >&2
      exit 1
    }
  done
}

materialize_bridge_release_a_path() {
  local path=$1 destination=$CASE_REPO/$1 entry mode type object tree_path

  install -d "$(dirname "$destination")"
  entry=$(git -C "$PROJECT_ROOT" ls-tree "$BRIDGE_RELEASE_SHA" -- "$path")
  read -r mode type object tree_path <<< "$entry"
  [[ ($mode == 100644 || $mode == 100755) && $type == blob && \
     $object =~ ^[0-9a-f]+$ && $tree_path == "$path" ]] || {
    printf 'Release A fixture asset is malformed: %s\n' "$path" >&2
    exit 1
  }
  git -C "$PROJECT_ROOT" show "$BRIDGE_RELEASE_SHA:$path" > "$destination"
  chmod "${mode#100}" "$destination"
}

assert_exact_release_a() {
  local repo=$1 base=$2 release_a=$3
  local expected actual

  expected=$(printf '%s\n' "${RELEASE_A_PATHS[@]}" | LC_ALL=C sort)
  actual=$(git -C "$repo" diff --name-only "$base" "$release_a" | LC_ALL=C sort)
  [[ $actual == "$expected" ]] || {
    printf 'Release A changed paths outside the eight admitted paths\n' >&2
    diff -u <(printf '%s\n' "$expected") <(printf '%s\n' "$actual") || true
    exit 1
  }
  if git -C "$repo" cat-file -e "$release_a:$QUORUM_SCRIPT" 2>/dev/null; then
    echo 'Release A contains the RabbitMQ quorum functional health script' >&2
    exit 1
  fi
  if git -C "$repo" cat-file -e "$release_a:$RECOVERY_SCRIPT" 2>/dev/null; then
    echo 'Release A contains the RabbitMQ quorum functional recovery script' >&2
    exit 1
  fi
}

write_target_health_assets() {
  local repo=$1

  cat > "$repo/$QUORUM_SCRIPT" <<'SCRIPT'
#!/usr/bin/env bash
rabbitmq_quorum_health_probe() { :; }
  printf 'quorum-health-script\n' >> "${BRIDGE_EVENTS:?}"
SCRIPT
  chmod 0755 "$repo/$QUORUM_SCRIPT"
  cat > "$repo/$RECOVERY_SCRIPT" <<'SCRIPT'
#!/usr/bin/env bash
rabbitmq_quorum_recovery_probe() { :; }
printf 'quorum-recovery-script\n' >> "${BRIDGE_EVENTS:?}"
SCRIPT
  chmod 0755 "$repo/$RECOVERY_SCRIPT"
  cat > "$repo/$HEALTH_LIBRARY" <<'LIBRARY'
#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/rabbitmq-quorum-health.sh"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/rabbitmq-quorum-recovery.sh"
printf 'target-health\n' >> "${BRIDGE_EVENTS:?}"
TARGET_BACKEND_HEALTH_LOADED=true
verify_backend() { :; }
verify_backend_with_retry() { :; }
LIBRARY
  chmod 0644 "$repo/$HEALTH_LIBRARY"
}

prepare_case() {
  local name=$1 mutation=$2
  local base_source=$FIXTURE/$name
  local path

  CASE_ROOT=$base_source/root
  CASE_REPO=$base_source/repo
  CASE_CONTROL=$CASE_ROOT/control
  CASE_STATE=$CASE_CONTROL/deploy-state
  CASE_EVENTS=$base_source/events
  install -d "$CASE_REPO/ops/deploy" "$CASE_REPO/apps/api-gateway" "$CASE_STATE"
  git init -q -b main "$CASE_REPO"
  git -C "$CASE_REPO" config user.name 'RabbitMQ quorum bridge fixture'
  git -C "$CASE_REPO" config user.email rabbitmq-bridge@example.invalid

  cp "$SCRIPT_DIR"/{production-host-policy-lib.sh,postgres-runtime-deploy-lib.sh,postgres-runtime-weekly-timer-state-lib.sh,postgres-runtime-daily-c1-readiness-lib.sh,postgres-runtime-activation-boundary-lib.sh,backend-image-rescue-lib.sh,x-collector-image-deploy-lib.sh,backend-runtime-health-lib.sh,docker-maintenance-lib.sh,daily-runner-image-bootstrap-lib.sh,reader-summary-recovery-maintenance-lib.sh} \
    "$CASE_REPO/ops/deploy/"
  printf 'legacy entrypoint\n' > "$CASE_REPO/ops/deploy/social-monitor-production-deploy.sh"
  printf 'legacy deploy control\n' > "$CASE_REPO/ops/deploy/deploy-control-lib.sh"
  for path in \
    deploy-control-lib.test.sh \
    social-monitor-production-deploy.test.sh \
    reader-summary-publication-migrator-validation.test.sh \
    x-collector-image-deploy-lib.test.sh; do
    printf 'legacy fixture\n' > "$CASE_REPO/ops/deploy/$path"
  done
  printf 'legacy API source\n' > "$CASE_REPO/apps/api-gateway/bridge-fixture.txt"
  printf 'base\n' > "$CASE_REPO/README.md"
  git -C "$CASE_REPO" add .
  git -C "$CASE_REPO" commit -qm 'test: legacy controller'
  CASE_BASE_SHA=$(git -C "$CASE_REPO" rev-parse HEAD)

  for path in "${RELEASE_A_PATHS[@]}"; do
    materialize_bridge_release_a_path "$path"
  done
  git -C "$CASE_REPO" add ops/deploy
  git -C "$CASE_REPO" commit -qm 'test: Release A deploy bridge'
  CASE_RELEASE_A_SHA=$(git -C "$CASE_REPO" rev-parse HEAD)
  assert_exact_release_a "$CASE_REPO" "$CASE_BASE_SHA" "$CASE_RELEASE_A_SHA"

  write_target_health_assets "$CASE_REPO"
  case $mutation in
    correct|wrong-mode|mutation|wrong-recovery-mode|recovery-mutation) ;;
    committed-wrong-health-library-mode)
      chmod 0755 "$CASE_REPO/$HEALTH_LIBRARY"
      ;;
    committed-wrong-health-script-mode)
      chmod 0644 "$CASE_REPO/$QUORUM_SCRIPT"
      ;;
    committed-wrong-recovery-script-mode)
      chmod 0644 "$CASE_REPO/$RECOVERY_SCRIPT"
      ;;
    missing-health-library) rm -f "$CASE_REPO/$HEALTH_LIBRARY" ;;
    symlink-health-script)
      rm -f "$CASE_REPO/$QUORUM_SCRIPT"
      ln -s backend-runtime-health-lib.sh "$CASE_REPO/$QUORUM_SCRIPT"
      ;;
    missing-recovery-script) rm -f "$CASE_REPO/$RECOVERY_SCRIPT" ;;
    symlink-recovery-script)
      rm -f "$CASE_REPO/$RECOVERY_SCRIPT"
      ln -s rabbitmq-quorum-health.sh "$CASE_REPO/$RECOVERY_SCRIPT"
      ;;
    bridge-and-backend)
      printf '# target bridge mutation\n' >> \
        "$CASE_REPO/ops/deploy/deploy-control-bridge-lib.sh"
      ;;
    *)
      printf 'unknown bridge fixture mutation: %s\n' "$mutation" >&2
      exit 1
      ;;
  esac
  printf 'target API source\n' > "$CASE_REPO/apps/api-gateway/bridge-fixture.txt"
  git -C "$CASE_REPO" add -A
  git -C "$CASE_REPO" commit -qm "test: Release B $mutation"
  CASE_RELEASE_B_SHA=$(git -C "$CASE_REPO" rev-parse HEAD)
  git -C "$CASE_REPO" checkout -q "$CASE_BASE_SHA"

  # The legacy controller admits only the exact bridge release. It never runs
  # Compose or writes a backend marker; the next invocation runs A's bridge.
  git -C "$CASE_REPO" merge --ff-only --quiet "$CASE_RELEASE_A_SHA"
  printf '%s\n' "$CASE_RELEASE_A_SHA" > "$CASE_STATE/control.sha"
  [[ ! -e $CASE_STATE/backend.sha && ! -e $CASE_STATE/postgres-pool-bootstrap.sha ]]
  [[ $(git -C "$CASE_REPO" rev-parse HEAD) == "$CASE_RELEASE_A_SHA" ]]
  printf '%s\n' "$CASE_RELEASE_A_SHA" > "$CASE_STATE/frontend.sha"
  printf '%s\n' "$CASE_RELEASE_A_SHA" > "$CASE_STATE/backend.sha"
  : > "$CASE_EVENTS"
}

run_release_b() (
  set -euo pipefail
  local mutation=$1
  local repo=$CASE_REPO control=$CASE_CONTROL state=$CASE_STATE events=$CASE_EVENTS
  local target=$CASE_RELEASE_B_SHA

  ROOT=$CASE_ROOT
  REPO=$repo
  CONTROL=$control
  STATE=$state
  STAGING=$ROOT/staging
  RELEASES=$ROOT/releases
  BRIDGE_EVENTS=$events
  export BRIDGE_EVENTS SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
  export SOCIAL_MONITOR_DEPLOY_ROOT=$ROOT
  export SOCIAL_MONITOR_DEPLOY_REPO=$REPO
  export SOCIAL_MONITOR_DEPLOY_CONTROL=$CONTROL
  export SOCIAL_MONITOR_DEPLOY_STATE=$STATE
  export SOCIAL_MONITOR_DEPLOY_STAGING=$STAGING
  export SOCIAL_MONITOR_DEPLOY_RELEASES=$RELEASES
  export SOCIAL_MONITOR_DEPLOY_PROJECT=rabbitmq-bridge-transition
  install -d "$STAGING" "$RELEASES"

  # shellcheck source=ops/deploy/social-monitor-production-deploy.sh
  source "$REPO/ops/deploy/social-monitor-production-deploy.sh"

  postgres_pool_atomic_legacy_state() { return 1; }
  postgres_pool_bootstrap_installed() { return 0; }
  acquire_postgres_admission_with_daily_priority() { :; }
  fetch_main() { :; }
  validate_main_commit() { [[ $1 == "$target" ]]; }
  advance_integration() {
    git -C "$REPO" merge --ff-only --quiet "$1"
    printf 'advance %s\n' "$1" >> "$BRIDGE_EVENTS"
    case $mutation in
      wrong-mode) chmod 0600 "$REPO/$QUORUM_SCRIPT" ;;
      mutation) printf '# post-advance mutation\n' >> "$REPO/$QUORUM_SCRIPT" ;;
      wrong-recovery-mode) chmod 0600 "$REPO/$RECOVERY_SCRIPT" ;;
      recovery-mutation) printf '# post-advance mutation\n' >> "$REPO/$RECOVERY_SCRIPT" ;;
      *) ;;
    esac
  }
  load_target_reader_summary_publication_deploy_library() {
    printf 'publication\n' >> "$BRIDGE_EVENTS"
  }
  sync_control_script() { printf 'sync\n' >> "$BRIDGE_EVENTS"; }
  activate_postgres_runtime_control() { printf 'runtime\n' >> "$BRIDGE_EVENTS"; }
  verify_compose_scope() { :; }
  snapshot_postgres_runtime_control() {
    local backup=$STATE/runtime-backup-$1
    install -d "$backup"
    printf '%s\n' "$backup"
  }
  rollback_backend_and_runtime_control() { return 1; }
  cleanup_stopped_project_containers() { :; }
  backend_image_rescue_prepare() { :; }
  backend_image_rescue_mark_replacement_started() { :; }
  backend_image_rescue_cleanup_otel_config() { :; }
  backend_image_rescue_cleanup() { :; }
  reader_summary_publication_migrator_preflight() { :; }
  verify_migration_compatibility() { :; }
  backup_database() { :; }
  deploy_reader_summary_publication_migrations() { :; }
  capture_effective_postgres_environment() { : > "$1"; }
  stop_and_remove_database_services() { :; }
  verify_live_postgres_admission() { :; }
  probe_postgres_maximum_envelope() { :; }
  refresh_frontend_api_proxy() { :; }
  soak_backend_release() { :; }
  commit_postgres_pool_bootstrap() {
    printf 'bootstrap-marker\n' >> "$BRIDGE_EVENTS"
    printf '%s\n' "$1" > "$STATE/postgres-pool-bootstrap.sha"
  }
  # fake_compose is invoked indirectly through the COMPOSE command array below.
  # shellcheck disable=SC2317,SC2329
  fake_compose() {
    printf 'compose:%s\n' "$*" >> "$BRIDGE_EVENTS"
    [[ " $* " != *' rabbitmq '* ]] || \
      fail 'RabbitMQ entered the real backend Compose path'
  }
  COMPOSE=(fake_compose)

  deploy_release "$target"
)

assert_failure() {
  local mutation=$1 expected=$2 output status events
  prepare_case "$mutation" "$mutation"
  set +e
  output=$(run_release_b "$mutation" 2>&1)
  status=$?
  set -e
  ((status != 0)) || {
    printf '%s unexpectedly succeeded\n' "$mutation" >&2
    exit 1
  }
  grep -F "$expected" <<< "$output" >/dev/null || {
    printf '%s did not report %q: %s\n' "$mutation" "$expected" "$output" >&2
    exit 1
  }
  events=$(<"$CASE_EVENTS")
  [[ $events == "advance $CASE_RELEASE_B_SHA" ]] || {
    printf '%s reached work after target health validation: %q\n' \
      "$mutation" "$events" >&2
    exit 1
  }
  [[ $(<"$CASE_STATE/backend.sha") == "$CASE_RELEASE_A_SHA" ]]
  [[ $(<"$CASE_STATE/control.sha") == "$CASE_RELEASE_A_SHA" ]]
  [[ ! -e $CASE_STATE/postgres-pool-bootstrap.sha ]]
  if grep -E 'compose:.*rabbitmq|runtime|backend-marker|bootstrap-marker' \
    "$CASE_EVENTS" >/dev/null; then
    printf '%s reached Compose, restart, or a marker\n' "$mutation" >&2
    exit 1
  fi
}

assert_bridge_backend_rejection() {
  local output status
  prepare_case bridge-and-backend bridge-and-backend
  set +e
  output=$(run_release_b bridge-and-backend 2>&1)
  status=$?
  set -e
  ((status != 0))
  grep -F 'deploy the bridge release first' <<< "$output" >/dev/null
  [[ ! -s $CASE_EVENTS ]]
  [[ $(<"$CASE_STATE/backend.sha") == "$CASE_RELEASE_A_SHA" ]]
  [[ ! -e $CASE_STATE/postgres-pool-bootstrap.sha ]]
}

backend_path_block=$(sed -n '/^BACKEND_PATHS=(/,/^)/p' \
  "$SCRIPT_DIR/social-monitor-production-deploy.sh")
assert_real_bridge_target_assets
grep -Fx "  $HEALTH_LIBRARY" <<< "$backend_path_block" >/dev/null
grep -Fx "  $QUORUM_SCRIPT" <<< "$backend_path_block" >/dev/null
grep -Fx "  $RECOVERY_SCRIPT" <<< "$backend_path_block" >/dev/null
workflow=$SCRIPT_DIR/../../.github/workflows/production-deploy.yml
workflow_deploy_shell_files=$(sed -n '/^          deploy_shell_files=(/,/^          )/p' "$workflow")
grep -Fx '            ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh' \
  <<< "$workflow_deploy_shell_files" >/dev/null
if grep -F "$RECOVERY_SCRIPT" "$workflow" >/dev/null; then
  echo 'V4A4 workflow must not require the future RabbitMQ recovery script' >&2
  exit 1
fi

prepare_case correct correct
success_output=$(run_release_b correct)
grep -F "deployed=$CASE_RELEASE_B_SHA frontend=false backend=true control=true" \
  <<< "$success_output" >/dev/null
[[ $(<"$CASE_EVENTS") == \
  $'advance '"$CASE_RELEASE_B_SHA"$'\nquorum-health-script\nquorum-recovery-script\ntarget-health\npublication\nsync\nruntime\ncompose:--profile app --profile daily build api\ncompose:--profile app up -d --no-deps --force-recreate api ingestion-worker intelligence-worker delivery-service event-relay\nbootstrap-marker' ]]
[[ $(<"$CASE_STATE/backend.sha") == "$CASE_RELEASE_B_SHA" ]]
[[ $(<"$CASE_STATE/postgres-pool-bootstrap.sha") == "$CASE_RELEASE_B_SHA" ]]
[[ $(<"$CASE_STATE/control.sha") == "$CASE_RELEASE_B_SHA" ]]
if grep -E 'compose:.*rabbitmq' \
  "$CASE_EVENTS" >/dev/null; then
  echo 'RabbitMQ entered up or force-recreate during the bridge transition' >&2
  exit 1
fi

assert_failure missing-health-library 'target backend health library is not a regular non-symlink file'
assert_failure symlink-health-script 'target RabbitMQ quorum health script is not a regular non-symlink file'
assert_failure wrong-mode 'target RabbitMQ quorum health script mode does not match its target Git mode'
assert_failure committed-wrong-health-library-mode \
  'target backend health library committed target Git mode must be 100644'
assert_failure committed-wrong-health-script-mode \
  'target RabbitMQ quorum health script committed target Git mode must be 100755'
assert_failure mutation 'target RabbitMQ quorum health script differs from reviewed target'
assert_failure missing-recovery-script \
  'target RabbitMQ quorum recovery script is not a regular non-symlink file'
assert_failure symlink-recovery-script \
  'target RabbitMQ quorum recovery script is not a regular non-symlink file'
assert_failure wrong-recovery-mode \
  'target RabbitMQ quorum recovery script mode does not match its target Git mode'
assert_failure committed-wrong-recovery-script-mode \
  'target RabbitMQ quorum recovery script committed target Git mode must be 100755'
assert_failure recovery-mutation \
  'target RabbitMQ quorum recovery script differs from reviewed target'
assert_bridge_backend_rejection

echo 'RabbitMQ quorum deploy bridge transition tests passed'
