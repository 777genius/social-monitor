#!/usr/bin/env bash
# shellcheck disable=SC1090
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
LC_ALL=C
export PATH LC_ALL

if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
  ROOT=${SOCIAL_MONITOR_DEPLOY_ROOT:?test root is required}
  REPO=${SOCIAL_MONITOR_DEPLOY_REPO:?test repo is required}
  CONTROL=${SOCIAL_MONITOR_DEPLOY_CONTROL:?test control root is required}
  [[ $ROOT == /tmp/* ]] || {
    echo 'deploy-error: test root must be below /tmp' >&2
    exit 1
  }
  STATE=${SOCIAL_MONITOR_DEPLOY_STATE:-$CONTROL/deploy-state}
  STAGING=${SOCIAL_MONITOR_DEPLOY_STAGING:-$ROOT/runtime/deploy-staging}
  RELEASES=${SOCIAL_MONITOR_DEPLOY_RELEASES:-$ROOT/runtime/frontend-releases}
  PROJECT=${SOCIAL_MONITOR_DEPLOY_PROJECT:-social-monitor-prod}
elif ((EUID == 0)); then
  ROOT=/var/data/social-monitor
  REPO=$ROOT/integration
  CONTROL=$ROOT/control
  STATE=$CONTROL/deploy-state
  STAGING=$ROOT/runtime/deploy-staging
  RELEASES=$ROOT/runtime/frontend-releases
  PROJECT=social-monitor-prod
  unset SOCIAL_MONITOR_DEPLOY_ROOT SOCIAL_MONITOR_DEPLOY_REPO \
    SOCIAL_MONITOR_DEPLOY_CONTROL SOCIAL_MONITOR_DEPLOY_STATE \
    SOCIAL_MONITOR_DEPLOY_STAGING SOCIAL_MONITOR_DEPLOY_RELEASES \
    SOCIAL_MONITOR_DEPLOY_PROJECT SOCIAL_MONITOR_DEPLOY_TEST_MODE
else
  echo 'deploy-error: production entrypoint requires root' >&2
  exit 1
fi
unset DATABASE_URL
PINNED_OTEL_COLLECTOR_IMAGE=otel/opentelemetry-collector-contrib:0.157.0@sha256:f2f01157055a9b2aab9df7118e1f1c9abf345e99b23bc7a2bc791db374a7d0f6
OTEL_COLLECTOR_IMAGE=$PINNED_OTEL_COLLECTOR_IMAGE
OTEL_COLLECTOR_CONFIG_PATH=$REPO/ops/observability/otel-collector.yml
export OTEL_COLLECTOR_IMAGE OTEL_COLLECTOR_CONFIG_PATH
POSTGRES_POOL_BOOTSTRAP_VERSION=postgres-pool-v1
PUBLIC_LINK=$ROOT/runtime/frontend-public-web
ADMIN_LINK=$ROOT/runtime/frontend-admin-web
DEPLOY_LOCK=$CONTROL/production-deploy.lock
# Deployment, the control-owned daily runner, and every manual production DB
# command use this admission lock. Daily separately owns a singleton lock so it
# can announce priority without deployment holding that singleton while it runs.
POSTGRES_ADMISSION_LOCK=$CONTROL/daily-run.lock
DAILY_SINGLETON_LOCK=$CONTROL/daily-run-singleton.lock
DAILY_RUNNER_MAINTENANCE_ADMISSION_WAIT_SECONDS=7500
READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR=/var/lib/social-monitor/artifacts/reader-summary-weekly-production
export DAILY_RUNNER_MAINTENANCE_ADMISSION_WAIT_SECONDS READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR
POSTGRES_RUNTIME_RELEASES=$CONTROL/postgres-runtime-releases
POSTGRES_RUNTIME_CURRENT=$CONTROL/postgres-runtime-current
POSTGRES_ROLLOUT_SOAK_SECONDS=300
POSTGRES_ROLLOUT_SOAK_HEARTBEAT_SECONDS=30
if ((EUID == 0)) && [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
  SYSTEMD_UNIT_DIR=/etc/systemd/system
else
  SYSTEMD_UNIT_DIR=$ROOT/runtime/systemd
fi
FRONTEND_PATHS=(
  apps/frontend
  libs/contracts/rest
)
BACKEND_PATHS=(
  Dockerfile
  .dockerignore
  docker-compose.yml
  package.json
  package-lock.json
  tsconfig.json
  tsconfig.build.json
  prisma.config.ts
  prisma
  vendor
  libs
  ':(exclude)libs/contracts/rest/openapi.snapshot.json'
  apps/api-gateway
  apps/agent-runtime
  apps/ingestion-worker
  apps/intelligence-worker
  apps/delivery-service
  apps/event-relay
  apps/x-collector
  ops/deploy/production-runtime/x-collector.Dockerfile
  ops/deploy/production-runtime/rolling-summary-container-run.sh
  ops/deploy/production-runtime/rolling-summary-receipt.mjs
  ops/deploy/production-runtime/compose.agent-runtime-model.yml
  ops/deploy/production-runtime/reader-summary-one-shot.sh
  ops/deploy/production-runtime/reader-summary-scheduler-hold-common.sh
  ops/deploy/production-runtime/reader-summary-scheduler-hold-status.sh
  ops/deploy/production-runtime/reader-summary-scheduler-hold-prepare.sh
  ops/deploy/production-runtime/reader-summary-scheduler-hold-restore.sh
  ops/deploy/production-runtime/reader-summary-control-action.sh
  ops/deploy/production-runtime/rolling-containerd-fallback.sh
  ops/deploy/postgres-runtime-asset-lib.sh
  apps/social-research-runtime
  apps/social-research-grpc
  apps/social-research-mcp
  scripts
  ops/evals
  ops/observability
  ops/deploy/backend-runtime-health-lib.sh
  ops/deploy/rabbitmq-quorum-health.sh
  ops/deploy/rabbitmq-quorum-recovery.sh
  ops/deploy/reader-summary-publication-deploy-lib.sh ops/deploy/reader-summary-publication-system-dsn-bootstrap-lib.sh ops/deploy/reader-summary-publication-system-runtime-deploy-lib.sh
  ops/deploy/reader-summary-publication-pre-migration.sql
  ops/deploy/reader-summary-publication-post-migration.sql
  test
)
CONTROL_PATHS=(
  .github/workflows/production-deploy.yml
  ops/deploy
  ops/recovery/backup-restore-contract.json
)
RUNTIME_CONTROL_PATHS=(
  ops/deploy/production-runtime/daily-c1-runtime.sh
  ops/deploy/production-runtime/daily-run.sh
  ops/deploy/production-runtime/rolling-run.sh
  ops/deploy/production-runtime/rolling-summary-receipt.mjs
  ops/deploy/production-runtime/compose.daily-artifacts.yml
  ops/deploy/production-runtime/compose.agent-runtime-model.yml
  ops/deploy/production-runtime/reader-summary-one-shot.sh
  ops/deploy/production-runtime/reader-summary-scheduler-hold-common.sh
  ops/deploy/production-runtime/reader-summary-scheduler-hold-status.sh
  ops/deploy/production-runtime/reader-summary-scheduler-hold-prepare.sh
  ops/deploy/production-runtime/reader-summary-scheduler-hold-restore.sh
  ops/deploy/production-runtime/reader-summary-control-action.sh
  ops/deploy/production-runtime/rolling-containerd-fallback.sh
  ops/deploy/production-runtime/reader-summary-daily-c1.readiness
  ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh ops/deploy/postgres-runtime-weekly-timer-state-lib.sh ops/deploy/postgres-runtime-activation-boundary-lib.sh ops/deploy/postgres-runtime-asset-lib.sh
  ops/deploy/production-runtime/github-premidnight-capture-v1.activation
  ops/deploy/production-runtime/github-premidnight-capture-v1.sh
  ops/deploy/production-runtime/social-monitor-github-premidnight-capture-v1.service
  ops/deploy/production-runtime/social-monitor-github-premidnight-capture-v1.timer
  ops/deploy/production-runtime/social-monitor-daily.service ops/deploy/production-runtime/social-monitor-daily.timer
  ops/deploy/production-runtime/social-monitor-rolling.service ops/deploy/production-runtime/social-monitor-rolling.timer
  ops/deploy/production-runtime/social-monitor-reader-summary-production-day.service.d-10-daily-c1-owner.conf
  ops/deploy/production-runtime/social-monitor-weekly.service ops/deploy/production-runtime/social-monitor-weekly.timer
)
COMPOSE=(
  docker compose -p "$PROJECT"
  --env-file "$ROOT/secrets/production.env"
  -f "$REPO/docker-compose.yml"
  -f "$CONTROL/compose.production.yml"
  -f "$CONTROL/compose.managed-db.yml"
)
if [[ -f $POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml ]]; then
  COMPOSE+=(
    -f "$POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml"
  )
fi
if [[ -f $POSTGRES_RUNTIME_CURRENT/compose.agent-runtime-model.yml ]]; then
  COMPOSE+=(
    -f "$POSTGRES_RUNTIME_CURRENT/compose.agent-runtime-model.yml"
  )
fi
fail() {
  printf 'deploy-error: %s\n' "$*" >&2
  exit 1
}
validate_sha() {
  [[ ${1:-} =~ ^[0-9a-f]{40}$ ]] || fail 'commit must be a full lowercase SHA'
}
fetch_main() {
  git -C "$REPO" fetch --quiet origin main
}
validate_main_commit() {
  local sha=$1
  validate_sha "$sha"
  git -C "$REPO" cat-file -e "$sha^{commit}" 2>/dev/null || fail 'commit is unavailable'
  git -C "$REPO" merge-base --is-ancestor "$sha" origin/main || fail 'commit is not on origin/main'
}
: "$POSTGRES_RUNTIME_RELEASES" "$SYSTEMD_UNIT_DIR" "$DAILY_SINGLETON_LOCK"
source_production_transition_b0_host_control() {
  local marker=$STATE/control.sha base path relative entry mode type object tree_path extra
  local owner before after installed_object staging staged fd marker_owner marker_before
  local marker_after required_a0 expected_owner
  relative=ops/deploy/production-transition-b0-host-control.sh; path=$CONTROL/production-transition-b0-host-control.sh
  [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 || -e $marker || -e $path ]] || return 0
  [[ -f $marker && ! -L $marker ]] || fail 'B0 host control marker is unsafe'
  marker_before=$(stat -Lc '%d:%i:%f:%s:%Y:%Z' "$marker") || fail 'B0 host control marker identity cannot be read'; marker_owner=$(stat -Lc '%u:%g:%a' "$marker") || fail 'B0 host control marker mode cannot be read'
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
    expected_owner=$(id -u):$(id -g)
  else expected_owner=0:0
  fi
  [[ $marker_owner == "$expected_owner:600" || $marker_owner == "$expected_owner:644" ]] || fail 'B0 host control marker mode is invalid'
  IFS= read -r base < "$marker" || fail 'B0 host control marker cannot be read'
  [[ $(wc -c < "$marker") == 41 && $base =~ ^[0-9a-f]{40}$ ]] || \
    fail 'B0 host control marker is malformed'
  marker_after=$(stat -Lc '%d:%i:%f:%s:%Y:%Z' "$marker") || fail 'B0 host control marker identity cannot be re-read'
  [[ $marker_before == "$marker_after" ]] || fail 'B0 host control marker changed while being read'
  required_a0=bb4b3f8a0e81ed371aaef5bf362afaaaaacf3c30
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && -n ${SOCIAL_MONITOR_DEPLOY_TEST_A0:-} ]]; then required_a0=$SOCIAL_MONITOR_DEPLOY_TEST_A0; fi
  [[ $required_a0 =~ ^[0-9a-f]{40}$ ]] || fail 'required A0 identity is malformed'
  git -C "$REPO" cat-file -e "$base^{commit}" 2>/dev/null || fail 'B0 host control commit is unavailable'
  git -C "$REPO" merge-base --is-ancestor "$required_a0" "$base" || fail 'B0 host control does not descend from pinned A0'
  entry=$(git -C "$REPO" ls-tree "$base" -- "$relative") || fail 'B0 host control blob cannot be inspected'; read -r mode type object tree_path extra <<< "$entry"
  [[ -z ${extra:-} && $mode == 100644 && $type == blob && \
     $object =~ ^[0-9a-f]{40}$ && $tree_path == "$relative" ]] || \
    fail 'B0 host control is not a regular trusted blob'
  [[ -f $path && ! -L $path ]] || fail 'installed B0 host control is unsafe'
  owner=$(stat -Lc '%u:%g:%a' "$path") || fail 'installed B0 host control mode cannot be read'
  [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]] || expected_owner=$(id -u):$(id -g)
  [[ $owner == "$expected_owner:644" ]] || fail 'installed B0 host control mode is invalid'
  before=$(stat -Lc '%d:%i:%f:%s:%Y:%Z' "$path"); installed_object=$(git -C "$REPO" hash-object --no-filters "$path"); after=$(stat -Lc '%d:%i:%f:%s:%Y:%Z' "$path")
  [[ $before == "$after" && $installed_object == "$object" ]] || \
    fail 'installed B0 host control differs from trusted B0'
  staging=$(mktemp -d "$STATE/b0-host-control.XXXXXX") || fail 'B0 host control staging failed'; chmod 0700 "$staging"
  staged=$staging/control.sh; git -C "$REPO" cat-file blob "$object" > "$staged"; chmod 0400 "$staged"
  exec {fd}<"$staged"; rm -f "$staged"; rmdir "$staging"
  # shellcheck source=/dev/null
  source "/dev/fd/$fd" || fail 'trusted B0 host control could not be loaded'
  exec {fd}<&-
}
source_production_transition_b0_host_control
if [[ ${BASH_SOURCE[0]} != "$0" && ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]] || ! declare -F production_transition_host_source_authorized_prelude >/dev/null; then
  production_transition_host_source_authorized_prelude() { source "$REPO/$1"; }
fi
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  command_text=${SSH_ORIGINAL_COMMAND:-${*:-}}
  [[ $command_text != *$'\n'* && $command_text != *$'\r'* ]] || fail 'command must be one line'
  read -r action sha extra <<< "$command_text"
  [[ -z ${extra:-} ]] || fail 'unexpected command arguments'
  validate_sha "${sha:-}"
  verify_host_policy
  production_transition_host_preflight_prelude "${action:-}" "$sha"
  while read -r _ _ authority_function; do
    [[ $authority_function != production_transition_* ]] || readonly -f "$authority_function"
  done < <(declare -F)
  readonly -f fail validate_sha fetch_main validate_main_commit \
    source_production_transition_b0_host_control
fi
DEPLOY_CONTROL_LIBRARY_AVAILABLE=false
if [[ ${BASH_SOURCE[0]} == "$0" || -f $REPO/ops/deploy/deploy-control-lib.sh ]]; then
  production_transition_host_source_authorized_prelude \
    ops/deploy/deploy-control-lib.sh 'deploy control library'
  DEPLOY_CONTROL_LIBRARY_AVAILABLE=true
else
  acquire_postgres_admission_with_daily_priority() {
    local admission_fd=$1
    flock -w 3600 "$admission_fd" || \
      fail 'timed out waiting for PostgreSQL admission lock'
  }
  initialize_deploy_control_bridge() { :; }
  deploy_release() {
    local sha=$1
    exec 9>"$DEPLOY_LOCK"
    flock -w 3600 9 || fail 'timed out waiting for deployment lock'
    exec 8>"$POSTGRES_ADMISSION_LOCK"
    acquire_postgres_admission_with_daily_priority 8
    fetch_main
    validate_main_commit "$sha"
    install -d -m 0755 "$STATE" "$STAGING" "$RELEASES"
    component_changed backend "$sha" "${BACKEND_PATHS[@]}" && \
      fail 'deploy control bridge library is required for backend activation'
    component_changed frontend "$sha" "${FRONTEND_PATHS[@]}" && \
      fail 'deploy control bridge library is required for frontend activation'
    component_changed control "$sha" "${RUNTIME_CONTROL_PATHS[@]}" && \
      fail 'deploy control bridge library is required for runtime activation'
    advance_integration "$sha"
    sync_control_script "$sha"
    verify_compose_scope
    commit_postgres_pool_bootstrap "$sha"
    printf 'deployed=%s frontend=false backend=false control=false\n' "$sha"
  }
fi
production_transition_host_source_authorized_prelude \
  ops/deploy/postgres-runtime-deploy-lib.sh 'PostgreSQL runtime deploy library'
production_transition_host_source_authorized_prelude \
  ops/deploy/backend-runtime-health-lib.sh 'backend runtime health library'
production_transition_host_source_authorized_prelude \
  ops/deploy/backend-image-rescue-lib.sh 'backend image rescue library'
source_deploy_library() {
  local library=$1 label=$2 path=$REPO/ops/deploy/$1 reviewed_sha
  if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
    production_transition_host_source_authorized_prelude "ops/deploy/$library" "$label"
    return
  fi
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
    [[ -f $path && ! -L $path ]] || path=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$library
    [[ -f $path && ! -L $path ]] || fail "$label is not a regular file"
    # shellcheck source=/dev/null
    source "$path"
    return
  fi
  reviewed_sha=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || fail "$label reviewed integration commit is unavailable"
  source_reviewed_deploy_library "$reviewed_sha" "ops/deploy/$library" "$label"
}
source_deploy_library docker-maintenance-lib.sh 'docker maintenance library'
# Ordering marker for legacy fixture checks: source "$daily_runner_bootstrap_library".
source_deploy_library \
  daily-runner-image-bootstrap-lib.sh \
  'daily-runner image bootstrap library'
production_transition_host_source_authorized_prelude \
  ops/deploy/x-collector-image-deploy-lib.sh 'X collector image deploy library'
source_deploy_library \
  reader-summary-recovery-maintenance-lib.sh \
  'reader-summary recovery maintenance library'
source_deploy_library \
  production-backend-classification-lib.sh \
  'production backend classification library'
load_reader_summary_publication_deploy_library() {
  source_deploy_library reader-summary-publication-deploy-lib.sh 'reader-summary publication deploy library'
}
initialize_deploy_control_bridge
declare -F production_transition_install_compatibility_overrides >/dev/null && production_transition_install_compatibility_overrides
verify_compose_scope() (
  local rendered=$STATE/rendered-compose.$$.json
  trap 'rm -f "$rendered"' EXIT
  if ! declare -F ensure_system_database_url_deploy_contract >/dev/null; then
    load_reader_summary_publication_deploy_library
  fi
  ensure_system_database_url_deploy_contract
  umask 077
  "${COMPOSE[@]}" --profile app --profile daily config --format json > "$rendered"
  if [[ -f $POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml ]]; then
    if ((EUID == 0)) && [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
      verify_effective_postgres_daily_topology
    fi
  fi
  python3 - "$rendered" "$ROOT" "$REPO" "$CONTROL" <<'PY'
import json
import pathlib
import sys
rendered_path, root, repo, control = sys.argv[1:]
with open(rendered_path, encoding="utf-8") as handle:
    config = json.load(handle)
expected_services = {
    "agent-runtime", "api", "caddy", "daily-runner", "delivery-service",
    "event-relay", "frontend", "ingestion-worker", "intelligence-worker",
    "migrate", "otel-collector", "rabbitmq", "redis", "x-collector",
}
services = config.get("services", {})
if set(services) != expected_services:
    raise SystemExit("rendered Compose service allowlist mismatch")
model_route = {
    "agent-runtime": {
        "AGENT_RUNTIME_PROVIDER": "codex",
        "AGENT_RUNTIME_MODEL": "gpt-5.6-sol",
        "AGENT_RUNTIME_REASONING_EFFORT": "high",
    },
    "daily-runner": {
        "READER_SUMMARY_MODEL_PROVIDER": "agent-runtime",
        "AGENT_RUNTIME_READER_SUMMARY_MODEL": "gpt-5.6-sol",
        "AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT": "high",
    },
}
for service_name, expected_environment in model_route.items():
    environment = services[service_name].get("environment", {})
    if any(environment.get(key) != value for key, value in expected_environment.items()):
        raise SystemExit(f"exact production model route mismatch for {service_name}")
expected_images = {
    "caddy": "caddy:2.11.4-alpine",
    "frontend": "nginx:1.29-alpine",
    "otel-collector": "otel/opentelemetry-collector-contrib:0.157.0@sha256:f2f01157055a9b2aab9df7118e1f1c9abf345e99b23bc7a2bc791db374a7d0f6",
    "rabbitmq": "rabbitmq:4.3-management",
    "redis": "redis:8-alpine",
}
expected_dockerfiles = {
    "daily-runner": f"{control}/daily-runner.Dockerfile",
    "x-collector": f"{control}/x-collector.Dockerfile",
}
for name, service in services.items():
    forbidden = {
        "privileged": service.get("privileged"),
        "pid": service.get("pid"),
        "ipc": service.get("ipc"),
        "network_mode": service.get("network_mode"),
        "devices": service.get("devices"),
        "cap_add": service.get("cap_add"),
        "security_opt": service.get("security_opt"),
        "configs": service.get("configs"),
        "secrets": service.get("secrets"),
        "volumes_from": service.get("volumes_from"),
    }
    unexpected = sorted(key for key, value in forbidden.items() if value)
    if unexpected:
        raise SystemExit(f"forbidden Compose settings for {name}: {unexpected}")
    service_networks = service.get("networks") or {}
    if set(service_networks) != {"default"}:
        raise SystemExit(f"unexpected networks for {name}")
    image = service.get("image")
    build = service.get("build")
    if name in expected_images:
        if image != expected_images[name] or build is not None:
            raise SystemExit(f"unexpected image/build policy for {name}")
    elif image is not None:
        raise SystemExit(f"build service {name} must use the project-generated image name")
    elif not isinstance(build, dict) or build.get("context") != repo:
        raise SystemExit(f"unexpected build context for {name}")
    elif build.get("dockerfile") != expected_dockerfiles.get(name, "Dockerfile"):
        raise SystemExit(f"unexpected Dockerfile for {name}")
    elif not set(build).issubset({"args", "context", "dockerfile"}):
        raise SystemExit(f"unexpected build options for {name}")
expected_ports = {
    "api": {("127.0.0.1", "13000", 3000, "tcp")},
    "frontend": {("127.0.0.1", "13080", 80, "tcp")},
    "caddy": {
        ("", "80", 80, "tcp"),
        ("", "443", 443, "tcp"),
        ("", "443", 443, "udp"),
    },
}
for name, service in services.items():
    actual = {
        (
            str(port.get("host_ip", "")),
            str(port.get("published", "")),
            int(port.get("target", 0)),
            str(port.get("protocol", "tcp")),
        )
        for port in service.get("ports") or []
    }
    if actual != expected_ports.get(name, set()):
        raise SystemExit(f"unexpected published ports for {name}: {sorted(actual)}")
    for volume in service.get("volumes") or []:
        volume_type = volume.get("type")
        source = str(volume.get("source", ""))
        if volume_type == "bind":
            try:
                resolved = pathlib.Path(source).resolve(strict=True)
                root_path = pathlib.Path(root).resolve(strict=True)
                resolved.relative_to(root_path)
            except (FileNotFoundError, RuntimeError, ValueError):
                raise SystemExit(f"bind mount escapes project root for {name}")
        elif volume_type == "volume":
            if source not in {"rabbitmq-data", "redis-data"}:
                raise SystemExit(f"unexpected named volume for {name}")
        else:
            raise SystemExit(f"unexpected volume type for {name}")
networks = config.get("networks", {})
if set(networks) != {"default"} or networks["default"].get("external") is True:
    raise SystemExit("unexpected or external Compose network")
if config.get("configs") or config.get("secrets"):
    raise SystemExit("top-level Compose configs or secrets are forbidden")
volumes = config.get("volumes", {})
if set(volumes) != {"rabbitmq-data", "redis-data"}:
    raise SystemExit("top-level Compose volume allowlist mismatch")
if any(value.get("external") is True for value in volumes.values()):
    raise SystemExit("external Compose volumes are forbidden")
PY
)
marker_value() {
  local component=$1
  local marker=$STATE/$component.sha
  [[ -s $marker ]] && tr -d '\n' < "$marker"
}
component_changed() {
  local component=$1
  local target=$2
  shift 2
  local marker
  marker=$(marker_value "$component")
  if [[ -z $marker ]] || ! git -C "$REPO" cat-file -e "$marker^{commit}" 2>/dev/null; then
    return 0
  fi
  if git -C "$REPO" merge-base --is-ancestor "$target" "$marker"; then
    return 1
  fi
  if ! git -C "$REPO" merge-base --is-ancestor "$marker" "$target"; then
    if [[ $component == control ]] && \
       deploy_control_reviewed_transition_matches "$marker" "$target"; then
      return 0
    fi
    fail "$component marker diverged from target"
  fi
  ! git -C "$REPO" diff --quiet "$marker" "$target" -- "$@"
}

print_plan() {
  local sha=$1
  fetch_main
  validate_main_commit "$sha"
  local frontend=false backend=false control=false x_collector=false backend_base
  backend_base=$(marker_value backend)
  if [[ ! $backend_base =~ ^[0-9a-f]{40}$ ]] || \
    ! git -C "$REPO" cat-file -e "$backend_base^{commit}" 2>/dev/null || \
    ! git -C "$REPO" merge-base --is-ancestor "$backend_base" "$sha"; then
    backend_base=0000000000000000000000000000000000000000
  fi
  component_changed frontend "$sha" "${FRONTEND_PATHS[@]}" && frontend=true
  component_changed backend "$sha" "${BACKEND_PATHS[@]}" && backend=true
  component_changed control "$sha" "${CONTROL_PATHS[@]}" && control=true
  component_changed backend "$sha" \
    apps/x-collector \
    ops/deploy/production-runtime/x-collector.Dockerfile && x_collector=true
  local postgres_pool_bootstrap=uninstalled
  local postgres_pool_bootstrap_sha=0000000000000000000000000000000000000000
  if postgres_pool_bootstrap_installed "$sha"; then
    postgres_pool_bootstrap=$POSTGRES_POOL_BOOTSTRAP_VERSION
    postgres_pool_bootstrap_sha=$(tr -d '\n' < "$STATE/postgres-pool-bootstrap.sha")
  fi
  printf 'frontend=%s\nbackend=%s\nbackend_base=%s\ncontrol=%s\nx_collector=%s\npostgres_pool_bootstrap=%s\npostgres_pool_bootstrap_sha=%s\n' \
    "$frontend" "$backend" "$backend_base" "$control" "$x_collector" \
    "$postgres_pool_bootstrap" "$postgres_pool_bootstrap_sha"
}
postgres_pool_bootstrap_installed() {
  local target=$1 marker=$STATE/postgres-pool-bootstrap.sha
  local installed=$CONTROL/github-production-deploy.sh
  local wrapper=$CONTROL/github-production-deploy-wrapper.sh
  local marker_sha relative_path expected
  [[ -s $marker && ! -L $marker && -f $installed && ! -L $installed ]] || return 1
  marker_sha=$(tr -d '\n' < "$marker")
  [[ $marker_sha =~ ^[0-9a-f]{40}$ ]] || return 1
  git -C "$REPO" cat-file -e "$marker_sha^{commit}" 2>/dev/null || return 1
  git -C "$REPO" merge-base --is-ancestor "$marker_sha" "$target" || return 1
  expected=$(git -C "$REPO" show "$marker_sha:ops/deploy/social-monitor-production-deploy.sh" | sha256sum | awk '{print $1}') || return 1
  [[ $(sha256sum "$installed" | awk '{print $1}') == "$expected" ]] || return 1
  if git -C "$REPO" cat-file -e \
    "$marker_sha:ops/deploy/postgres-pool-atomic-bootstrap-lib.sh" 2>/dev/null; then
    [[ -f $wrapper && ! -L $wrapper ]] || return 1
    expected=$(git -C "$REPO" show "$marker_sha:ops/deploy/social-monitor-production-ssh-wrapper.sh" | sha256sum | awk '{print $1}') || return 1
    [[ $(sha256sum "$wrapper" | awk '{print $1}') == "$expected" ]] || return 1
  fi
  for relative_path in ops/deploy/postgres-runtime-deploy-lib.sh \
    ops/deploy/verify-postgres-runtime-topology.py \
    ops/deploy/production-runtime/compose.postgres-runtime.yml; do
    git -C "$REPO" cat-file -e "$marker_sha:$relative_path" 2>/dev/null || return 1
  done
}
validate_frontend_archive() {
  local archive=$1
  local archive_size
  [[ -s $archive ]] || fail 'frontend archive is empty'
  archive_size=$(wc -c < "$archive")
  [[ $archive_size -le 209715200 ]] || fail 'frontend archive exceeds 200 MiB'
  python3 - "$archive" <<'PY'
import pathlib
import sys
import tarfile

archive = sys.argv[1]
member_count = 0
expanded_size = 0
with tarfile.open(archive, mode="r:gz") as bundle:
    for member in bundle:
        member_count += 1
        expanded_size += member.size
        path = pathlib.PurePosixPath(member.name)
        if any(ord(character) < 32 or ord(character) == 127 for character in member.name):
            raise SystemExit("frontend archive contains a control character")
        if path.is_absolute() or ".." in path.parts:
            raise SystemExit("frontend archive contains an unsafe path")
        if not path.parts or path.parts[0] not in {"public", "admin"}:
            raise SystemExit("frontend archive contains an unexpected root")
        if not (member.isfile() or member.isdir()):
            raise SystemExit("frontend archive contains a non-regular entry")
        if member_count > 20000 or expanded_size > 536870912:
            raise SystemExit("frontend archive exceeds extraction limits")
if member_count == 0:
    raise SystemExit("frontend archive has no entries")
PY
}

upload_frontend() (
  local sha=$1
  fetch_main
  validate_main_commit "$sha"
  local target=$STAGING/$sha/frontend
  local temp=$STAGING/$sha/frontend-upload.$$.tgz
  local extracted=$STAGING/$sha/frontend.$$.new
  local upload_lock=$STAGING/$sha/upload.lock
  install -d -m 0755 "$STAGING/$sha"
  exec 7>"$upload_lock"
  if command -v flock >/dev/null; then
    flock -w 600 7 || fail 'timed out waiting for frontend upload lock'
  elif ((EUID == 0)); then
    fail 'flock is required for production uploads'
  fi
  if [[ -f $target/READY ]] && [[ $(cat "$target/READY") == "$sha" ]]; then
    printf 'already-uploaded=%s\n' "$sha"
    return 0
  fi
  [[ ! -e $target ]] || fail 'frontend staging target exists without a valid marker'
  trap 'rm -f "$temp"; rm -rf "$extracted"' EXIT
  head -c 209715201 > "$temp"
  validate_frontend_archive "$temp"
  [[ $(df -Pk "$STAGING" | awk 'NR == 2 {print $4}') -ge 1048576 ]] || fail 'less than 1 GiB is free for frontend extraction'
  install -d -m 0755 "$extracted"
  if command -v timeout >/dev/null; then
    timeout 180 tar --no-same-owner --no-same-permissions -xzf "$temp" -C "$extracted"
  elif ((EUID == 0)); then
    fail 'timeout is required for production extraction'
  else
    tar --no-same-owner --no-same-permissions -xzf "$temp" -C "$extracted"
  fi
  test -s "$extracted/public/index.html"
  test -s "$extracted/public/main.dart.js"
  test -s "$extracted/admin/index.html"
  test -s "$extracted/admin/main.dart.js"
  [[ $(cat "$extracted/public/release-sha.txt") == "$sha" ]]
  [[ $(cat "$extracted/admin/release-sha.txt") == "$sha" ]]
  grep -F 'https://social-monitor.app' "$extracted/public/main.dart.js" >/dev/null
  if grep -F 'https://admin.social-monitor.app' "$extracted/public/main.dart.js" >/dev/null; then
    fail 'public frontend bundle contains the admin origin'
  fi
  grep -F 'https://admin.social-monitor.app' "$extracted/admin/main.dart.js" >/dev/null
  if grep -R -E 'nip\.io' "$extracted/public" "$extracted/admin" >/dev/null; then
    fail 'frontend bundle contains a retired hostname'
  fi
  grep -F 'self.registration.unregister()' "$extracted/public/flutter_service_worker.js" >/dev/null
  grep -F 'self.registration.unregister()' "$extracted/admin/flutter_service_worker.js" >/dev/null
  printf '%s\n' "$sha" > "$extracted/READY"
  mv "$extracted" "$target"
  printf 'uploaded=%s\n' "$sha"
)

advance_integration() {
  local sha=$1
  [[ -z $(git -C "$REPO" status --porcelain) ]] || fail 'integration worktree is dirty'
  local current
  current=$(git -C "$REPO" rev-parse HEAD)
  if git -C "$REPO" merge-base --is-ancestor "$sha" "$current"; then
    return 0
  fi
  git -C "$REPO" merge-base --is-ancestor "$current" "$sha" || fail 'integration worktree cannot fast-forward'
  git -C "$REPO" merge --ff-only --quiet "$sha"
}

changed_between() {
  local from=$1
  local to=$2
  shift 2
  [[ -z $from ]] && return 0
  ! git -C "$REPO" diff --quiet "$from" "$to" -- "$@"
}

verify_migration_compatibility() {
  local from=$1
  local to=$2
  [[ -n $from ]] || fail 'backend marker is required before automatic migration'
  changed_between "$from" "$to" prisma/migrations || return 0
  if git -C "$REPO" diff --unified=0 "$from" "$to" -- 'prisma/migrations/**/migration.sql' | \
    awk '/^\+/ && !/^\+\+\+/' | \
    grep -Eiq '(DROP[[:space:]]+(TABLE|COLUMN)|TRUNCATE[[:space:]]+TABLE|ALTER[[:space:]]+TABLE.*ALTER[[:space:]]+COLUMN.*TYPE|ALTER[[:space:]]+TABLE.*RENAME)'; then
    fail 'destructive or rename migration requires a manual expand/contract deployment'
  fi
}

backup_database() (
  local sha=$1
  local output
  local partial env_file listing schema_tables api_id database_url database_name
  output=$ROOT/backups/pre-autodeploy-${sha:0:12}-$(date -u +%Y%m%dT%H%M%SZ).dump
  partial=$output.partial
  [[ ! -e $output && ! -L $output && ! -e $partial && ! -L $partial ]] || \
    fail 'database backup output already exists'
  env_file=$STATE/database-backup.$$.env
  listing=$STATE/database-backup.$$.list
  schema_tables=$STATE/database-backup.$$.tables
  api_id=$("${COMPOSE[@]}" --profile app ps -q api)
  [[ -n $api_id ]] || fail 'production API container is unavailable for database discovery'
  database_url=$(docker inspect "$api_id" --format '{{range .Config.Env}}{{println .}}{{end}}' | \
    awk -F= '$1 == "DATABASE_URL" {sub(/^[^=]*=/, ""); print; exit}')
  [[ -n $database_url ]] || fail 'production API has no effective database URL'
  umask 077
  trap 'rm -f "$partial" "$env_file" "$listing" "$schema_tables"' EXIT
  printf 'DATABASE_URL=%s\n' "$database_url" > "$env_file"
  local backup_image=postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
  database_name=$(docker run --rm \
    --env-file "$env_file" \
    -v "$ROOT/secrets/db/ca-certificate.crt:/run/social-monitor-db/ca-certificate.crt:ro" \
    "$backup_image" \
    sh -lc 'psql "$DATABASE_URL" -Atc "SELECT current_database()"')
  [[ $database_name == social_monitor ]] || \
    fail 'effective production database is not social_monitor'
  docker run --rm \
    --env-file "$env_file" \
    -v "$ROOT/secrets/db/ca-certificate.crt:/run/social-monitor-db/ca-certificate.crt:ro" \
    "$backup_image" \
    sh -c 'psql "$DATABASE_URL" -Atc "$1"' _ \
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name" \
    > "$schema_tables"
  bash "$REPO/ops/deploy/verify-postgres-backup-coverage.sh" "$schema_tables"
  docker run --rm \
    --env-file "$env_file" \
    -v "$ROOT/secrets/db/ca-certificate.crt:/run/social-monitor-db/ca-certificate.crt:ro" \
    "$backup_image" \
    sh -lc 'pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL"' > "$partial"
  test -s "$partial"
  docker run --rm \
    -v "$ROOT/backups:/backups:ro" \
    "$backup_image" \
    pg_restore -l "/backups/$(basename "$partial")" > "$listing"
  bash "$REPO/ops/deploy/verify-postgres-backup-coverage.sh" \
    "$schema_tables" "$listing"
  chmod 600 "$partial"
  mv "$partial" "$output"
  bash "$REPO/ops/deploy/prune-pre-autodeploy-backups.sh" \
    "$ROOT/backups" 10 "$output"
  printf 'database-backup=%s\n' "$output"
)

verify_backend_proxy_readiness() {
  local status
  status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 \
    -H 'Host: social-monitor.app' \
    http://127.0.0.1:13080/ready 2>/dev/null || true)
  [[ $status == 200 ]]
}

soak_backend_release() (
  local -a services=("$@")
  local baseline=$STATE/backend-soak-baseline.$$.txt
  local started_at now elapsed remaining next_heartbeat_at
  trap 'rm -f "$baseline"' EXIT
  capture_backend_soak_baseline "$baseline" "${services[@]}" || return 1
  started_at=$(date +%s)
  next_heartbeat_at=$((started_at + POSTGRES_ROLLOUT_SOAK_HEARTBEAT_SECONDS))
  printf 'backend-soak-heartbeat elapsed_seconds=0 target_seconds=%d\n' \
    "$POSTGRES_ROLLOUT_SOAK_SECONDS"
  while true; do
    verify_backend "${services[@]}" || return 1
    verify_backend_proxy_readiness || return 1
    verify_concurrent_backend_readiness || return 1
    verify_backend_soak_state "$baseline" || return 1
    verify_backend_soak_logs "$baseline" || return 1
    now=$(date +%s)
    elapsed=$((now - started_at))
    if ((elapsed >= POSTGRES_ROLLOUT_SOAK_SECONDS)); then
      verify_ingestion_queue_recovery "$baseline"
      return
    fi
    if ((now >= next_heartbeat_at)); then
      remaining=$((POSTGRES_ROLLOUT_SOAK_SECONDS - elapsed))
      printf 'backend-soak-heartbeat elapsed_seconds=%d remaining_seconds=%d\n' \
        "$elapsed" "$remaining"
      next_heartbeat_at=$((now + POSTGRES_ROLLOUT_SOAK_HEARTBEAT_SECONDS))
    fi
    sleep 5
  done
)

deploy_backend() (
  set -euo pipefail
  local sha=$1
  local from
  local postgres_env=$STATE/postgres-admission.$$.env
  trap 'rm -f "$postgres_env"' EXIT
  from=$(marker_value backend)
  cleanup_stopped_project_containers || \
    fail 'stopped project container cleanup failed'
  mapfile -t services < <(backend_services "$from" "$sha")
  ((${#services[@]} > 0)) || return 0
  if declare -F ensure_system_database_url_deploy_contract >/dev/null && [[ " ${COMPOSE[*]} " == *" $POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml "* ]]; then
    ensure_system_database_url_deploy_contract
  fi
  local -a persistent=()
  local service database_replacement=false
  for service in "${services[@]}"; do
    [[ $service == migrate || $service == daily-runner ]] || \
      persistent+=("$service")
    case $service in
      api|ingestion-worker|intelligence-worker|delivery-service|event-relay)
        database_replacement=true
        ;;
    esac
  done
  if [[ $database_replacement == true ]]; then
    persistent+=(
      api ingestion-worker intelligence-worker delivery-service event-relay
    )
    mapfile -t persistent < <(
      printf '%s\n' "${persistent[@]}" | awk 'NF && !seen[$0]++'
    )
  fi
  local -a captured_services
  mapfile -t captured_services < <(
    printf '%s\n' "${services[@]}" "${persistent[@]}" | awk 'NF && !seen[$0]++'
  )
  local previous
  previous=$(backend_image_rescue_state_file "$sha")
  if printf '%s\n' "${captured_services[@]}" | grep -qx daily-runner; then
    daily_runner_image_bootstrap_before_rescue "$from" "$sha" || \
      fail 'missing prior daily-runner image could not be reconstructed'
  fi
  if printf '%s\n' "${captured_services[@]}" | grep -qx otel-collector; then
    docker image inspect "$PINNED_OTEL_COLLECTOR_IMAGE" >/dev/null 2>&1 || \
      timeout 300 docker pull "$PINNED_OTEL_COLLECTOR_IMAGE" >/dev/null || \
      fail 'pinned collector image could not be pulled'
    backend_image_rescue_snapshot_otel_config "$from" "$sha" || \
      fail 'prior collector configuration could not be snapshotted'
  fi
  backend_image_rescue_prepare "$sha" "$previous" "${captured_services[@]}" || \
    fail 'required rollback images could not be pinned before build'
  local needs_migrate=false
  for service in "${services[@]}"; do
    [[ $service == x-collector || $service == daily-runner || \
       $service == otel-collector ]] || \
      needs_migrate=true
  done
  if [[ $needs_migrate == true ]]; then
    reader_summary_publication_migrator_preflight || \
      fail 'reader summary publication migrator preflight failed'
  fi

  verify_migration_compatibility "$from" "$sha"
  backup_database "$sha"

  local -a primary_build_order=(
    migrate api agent-runtime ingestion-worker intelligence-worker
    delivery-service event-relay
  )
  local x_collector_candidate_image_id=
  for service in "${primary_build_order[@]}"; do
    if printf '%s\n' "${services[@]}" | grep -qx "$service"; then
      "${COMPOSE[@]}" --profile app --profile daily build "$service"
    fi
  done
  if printf '%s\n' "${services[@]}" | grep -qx x-collector; then
    x_collector_build_candidate "$sha" x_collector_candidate_image_id
  fi
  if printf '%s\n' "${services[@]}" | grep -qx daily-runner; then
    "${COMPOSE[@]}" --profile daily build daily-runner
  fi

  if [[ $needs_migrate == true ]]; then
    deploy_reader_summary_publication_migrations
  fi

  if ((${#persistent[@]} > 0)); then
    if [[ $database_replacement == true ]]; then
      umask 077
      capture_effective_postgres_environment "$postgres_env"
      backend_image_rescue_mark_replacement_started "$previous" || \
        fail 'backend replacement phase could not be persisted'
      if ! stop_and_remove_database_services "${persistent[@]}"; then
        fail 'database service removal failed'
      fi
      verify_live_postgres_admission "$postgres_env"
      probe_postgres_maximum_envelope "$postgres_env"
    else
      backend_image_rescue_mark_replacement_started "$previous" || \
        fail 'backend replacement phase could not be persisted'
    fi
    if ! "${COMPOSE[@]}" --profile app up -d --no-deps --force-recreate "${persistent[@]}"; then
      fail 'backend recreate failed'
    fi
    if ! verify_backend_with_retry "${persistent[@]}"; then
      fail 'backend health failed'
    fi
    if [[ -n $x_collector_candidate_image_id ]]; then
      x_collector_verify_running_candidate \
        "$sha" "$x_collector_candidate_image_id"
    fi
    if printf '%s\n' "${persistent[@]}" | grep -qx api && ! refresh_frontend_api_proxy; then
      fail 'frontend API proxy refresh failed'
    fi
    if [[ $database_replacement == true ]] && \
      ! soak_backend_release "${persistent[@]}" frontend caddy; then
      fail 'backend restart/readiness/502 soak failed'
    fi
  fi
)

switch_link() {
  local link=$1
  local target=$2
  local next=$link.next.$$
  ln -s "$target" "$next"
  mv -Tf "$next" "$link"
}

# Ordinary deploy_release invokes this runtime/Compose transaction only after
# any repair-only fast path has returned from deploy-control-lib.sh.
# shellcheck disable=SC2329
deploy_release_runtime_transaction() {
  local sha=$1
  local backend=$2
  local runtime_control=$3
  local compatible_backend_sha=$sha
  local runtime_control_backup previous_images previous_phase activation_status
  local transaction_signal="" rollback_status=0

  [[ $backend =~ ^(true|false)$ && $runtime_control =~ ^(true|false)$ ]] || \
    fail 'runtime-control deployment classification is invalid'
  if [[ $DEPLOY_CONTROL_LIBRARY_AVAILABLE != true && \
        ( $backend == true || $runtime_control == true ) ]]; then
    fail 'deploy control bridge library is required for runtime activation'
  fi
  if [[ $backend == false && $runtime_control == false ]]; then
    verify_compose_scope
    return
  fi
  if [[ $backend == true || $runtime_control == true ]]; then
    verify_deploy_control_bridge_compatibility
  fi
  if [[ $backend == false ]]; then
    compatible_backend_sha=$(marker_value backend)
    [[ $compatible_backend_sha =~ ^[0-9a-f]{40}$ ]] || \
      fail 'control-only runtime activation requires a committed backend marker'
  fi

  previous_images=$(backend_image_rescue_state_file "$sha")
  if [[ $backend == true && ( -e $previous_images || -L $previous_images ) ]]; then
    previous_phase=$(backend_image_rescue_read_phase "$previous_images") || \
      fail 'existing backend image rescue phase is invalid'
    [[ $previous_phase == prepared ]] || \
      fail 'unfinished backend rollback requires operator recovery before retry'
  fi
  runtime_control_backup=$(snapshot_postgres_runtime_control "$sha")

  trap 'transaction_signal=HUP' HUP
  trap 'transaction_signal=INT' INT
  trap 'transaction_signal=TERM' TERM
  set +e
  (
    set -euo pipefail
    activate_postgres_runtime_control "$sha" "$compatible_backend_sha" "$runtime_control_backup"
    verify_compose_scope
    if [[ $backend == true ]]; then
      deploy_backend "$sha"
    fi
  )
  activation_status=$?
  set -e
  if [[ -n $transaction_signal && $activation_status -eq 0 ]]; then
    activation_status=1
  fi
  trap - HUP INT TERM
  if ((activation_status != 0)); then
    rollback_backend_and_runtime_control_forward_only_safe \
      "$backend" "$previous_images" "$runtime_control_backup" || rollback_status=$?
    if ((rollback_status != 0)); then
      fail 'release failed; rollback is incomplete and rescue tags were preserved'
    fi
    fail 'release failed; backend images and PostgreSQL runtime control were restored'
  fi

  if [[ $backend == true ]]; then
    printf '%s\n' "$sha" > "$STATE/backend.sha.next"
    mv -f "$STATE/backend.sha.next" "$STATE/backend.sha"
  fi
  rm -rf "$runtime_control_backup"
  if [[ $backend == true ]]; then
    backend_image_rescue_cleanup_otel_config "$previous_images" || \
      fail 'release succeeded but collector config snapshot cleanup failed'
    backend_image_rescue_cleanup "$previous_images" || \
      fail 'release succeeded but exact backend rescue-tag cleanup failed'
  fi
  if [[ " ${COMPOSE[*]} " != \
        *" $POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml "* ]]; then
    COMPOSE+=(
      -f "$POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml"
    )
  fi
  if [[ " ${COMPOSE[*]} " != *" $POSTGRES_RUNTIME_CURRENT/compose.agent-runtime-model.yml "* ]]; then
    COMPOSE+=(
      -f "$POSTGRES_RUNTIME_CURRENT/compose.agent-runtime-model.yml"
    )
  fi
}

sync_control_entrypoint() {
  # Installed source: social-monitor-production-deploy.sh
  # Installed destination: github-production-deploy.sh
  production_transition_sync_control_entrypoint
}

sync_control_script() {
  production_transition_sync_control_script "$@"
  : sync_control_entrypoint
}

commit_postgres_pool_bootstrap() {
  local sha=$1 mode=${2:-normal} marker=$STATE/postgres-pool-bootstrap.sha
  local next=$marker.next
  [[ $mode == normal || $mode == force-advance ]] || fail 'PostgreSQL bootstrap marker advance mode is invalid'
  if [[ $mode == normal ]] && postgres_pool_bootstrap_installed "$sha"; then return 0; fi
  [[ ! -e $next && ! -L $next ]] || fail 'PostgreSQL bootstrap marker temporary path is invalid'
  printf '%s\n' "$sha" > "$next"; mv -f "$next" "$marker"
  [[ -f $marker && ! -L $marker ]] && postgres_pool_bootstrap_installed "$sha" || \
    fail 'PostgreSQL bootstrap marker did not commit the installed entrypoint'
}
[[ ${BASH_SOURCE[0]} == "$0" ]] || return 0
case ${action:-} in
  plan) print_plan "$sha" ;;
  upload) upload_frontend "$sha" ;;
  deploy)
    production_transition_host_require_ordinary_deploy "$sha"
    deploy_release "$sha"
    ;;
  deploy-transition) production_transition_deploy_authenticated_target "$sha" ;;
  disk-report) print_docker_disk_report ;;
  project-disk-cleanup)
    production_transition_host_require_action_allowed "$action"
    cleanup_project_docker_storage
    ;;
  reader-summary-recover-missing-days|reader-summary-weekly-run|reader-summary-daily-terminal-set-receipt-v1|reader-summary-daily-scan-terminal-preimage-c1)
    production_transition_host_require_action_allowed "$action"
    run_reader_summary_daily_runner_maintenance "$action"
    ;;
  reader-summary-daily-scan-terminal-repair-c1) run_reader_summary_daily_scan_terminal_repair_c1_from_stdin ;;
  reader-summary-production-history) run_reader_summary_production_history_from_stdin ;;
  reader-summary-daily-delivery-c1-run) run_reader_summary_daily_delivery_c1 "$sha" ;;
  reader-summary-daily-delivery-c1-contain) run_reader_summary_daily_delivery_c1_containment "$sha" ;;
  *) fail 'command is not in the reviewed production allowlist' ;;
esac
