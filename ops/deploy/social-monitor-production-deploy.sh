#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

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
  apps/api-gateway
  apps/agent-runtime
  apps/ingestion-worker
  apps/intelligence-worker
  apps/delivery-service
  apps/event-relay
  apps/x-collector
  ops/deploy/production-runtime/x-collector.Dockerfile
  apps/social-research-runtime
  apps/social-research-grpc
  apps/social-research-mcp
  scripts
  ops/evals
  ops/observability
  ops/deploy/backend-runtime-health-lib.sh
  ops/deploy/reader-summary-publication-deploy-lib.sh
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
  ops/deploy/production-runtime/daily-run.sh
  ops/deploy/production-runtime/github-premidnight-capture-v1.activation
  ops/deploy/production-runtime/github-premidnight-capture-v1.sh
  ops/deploy/production-runtime/social-monitor-github-premidnight-capture-v1.service
  ops/deploy/production-runtime/social-monitor-github-premidnight-capture-v1.timer
  ops/deploy/production-runtime/social-monitor-daily.service
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

fail() {
  printf 'deploy-error: %s\n' "$*" >&2
  exit 1
}

verify_host_policy() {
  [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]] && return 0
  ((EUID == 0)) || return 0
  [[ $(stat -c '%U:%G:%a' "$CONTROL/github-production-deploy.sh") == root:root:755 ]] || \
    fail 'root deploy entrypoint ownership or mode is invalid'
  [[ $(stat -c '%U:%G:%a' "$CONTROL/github-production-deploy-wrapper.sh") == root:root:755 ]] || \
    fail 'SSH deploy wrapper ownership or mode is invalid'
  if id -nG social-monitor-deploy | tr ' ' '\n' | grep -qx docker; then
    fail 'deploy user must not belong to the docker group'
  fi
  local sudoers=/etc/sudoers.d/social-monitor-deploy
  [[ $(stat -c '%U:%G:%a' "$sudoers") == root:root:440 ]] || \
    fail 'deploy sudoers ownership or mode is invalid'
  [[ $(cat "$sudoers") == 'social-monitor-deploy ALL=(root) NOPASSWD: /var/data/social-monitor/control/github-production-deploy.sh *' ]] || \
    fail 'deploy sudoers content is not project-scoped'
  visudo -cf "$sudoers" >/dev/null || fail 'deploy sudoers policy is invalid'
  local sudo_commands
  sudo_commands=$(LC_ALL=C sudo -l -U social-monitor-deploy | \
    sed -n '/may run the following commands/,$p' | tail -n +2 | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//')
  [[ $sudo_commands == '(root) NOPASSWD: /var/data/social-monitor/control/github-production-deploy.sh *' ]] || \
    fail 'deploy user has unexpected sudo authority'
  local ssh_policy
  ssh_policy=$(sshd -T -C user=social-monitor-deploy,host=localhost,addr=127.0.0.1)
  for expectation in \
    'passwordauthentication no' \
    'kbdinteractiveauthentication no' \
    'disableforwarding yes' \
    'allowagentforwarding no' \
    'allowtcpforwarding no' \
    'x11forwarding no' \
    'permittty no' \
    'forcecommand /var/data/social-monitor/control/github-production-deploy-wrapper.sh'; do
    grep -Fx "$expectation" <<< "$ssh_policy" >/dev/null || fail "missing SSH policy: $expectation"
  done
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
# The installed entrypoint intentionally loads the current integration
# libraries before advance_integration. A bridge release must install these
# control functions before a later release changes runtime-control assets.
DEPLOY_CONTROL_LIBRARY_AVAILABLE=false
if [[ -f $REPO/ops/deploy/deploy-control-lib.sh ]]; then
  # shellcheck source=ops/deploy/deploy-control-lib.sh
  source "$REPO/ops/deploy/deploy-control-lib.sh"
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
# shellcheck source=ops/deploy/postgres-runtime-deploy-lib.sh
source "$REPO/ops/deploy/postgres-runtime-deploy-lib.sh"
# shellcheck source=ops/deploy/backend-runtime-health-lib.sh
source "$REPO/ops/deploy/backend-runtime-health-lib.sh"
# shellcheck source=ops/deploy/backend-image-rescue-lib.sh
source "$REPO/ops/deploy/backend-image-rescue-lib.sh"
daily_runner_bootstrap_library=$REPO/ops/deploy/daily-runner-image-bootstrap-lib.sh
if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
      ! -f $daily_runner_bootstrap_library ]]; then
  daily_runner_bootstrap_library=$(
    cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
  )/daily-runner-image-bootstrap-lib.sh
fi
[[ -f $daily_runner_bootstrap_library && ! -L $daily_runner_bootstrap_library ]] || \
  fail 'daily-runner image bootstrap library is not a regular file'
# shellcheck source=ops/deploy/daily-runner-image-bootstrap-lib.sh
source "$daily_runner_bootstrap_library"
unset daily_runner_bootstrap_library
# shellcheck source=ops/deploy/x-collector-image-deploy-lib.sh
source "$REPO/ops/deploy/x-collector-image-deploy-lib.sh"
initialize_deploy_control_bridge

verify_compose_scope() (
  local rendered=$STATE/rendered-compose.$$.json
  trap 'rm -f "$rendered"' EXIT
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
  git -C "$REPO" merge-base --is-ancestor "$marker" "$target" || fail "$component marker diverged from target"
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

backend_services() {
  local from=$1
  local to=$2
  local -a services=()
  local -a common_paths=(Dockerfile .dockerignore docker-compose.yml package.json package-lock.json tsconfig.json tsconfig.build.json prisma.config.ts prisma vendor libs)
  if changed_between "$from" "$to" "${common_paths[@]}"; then
    services=(migrate otel-collector api agent-runtime ingestion-worker intelligence-worker delivery-service event-relay daily-runner)
  else
    local mapping
    for mapping in \
      'apps/api-gateway:api' \
      'apps/agent-runtime:agent-runtime' \
      'apps/ingestion-worker:ingestion-worker' \
      'apps/intelligence-worker:intelligence-worker' \
      'apps/delivery-service:delivery-service' \
      'apps/event-relay:event-relay'; do
      local path=${mapping%%:*}
      local service=${mapping##*:}
      if changed_between "$from" "$to" "$path"; then
        services+=("$service")
      fi
    done
    if changed_between "$from" "$to" apps/social-research-runtime; then
      services+=(api)
    fi
    if changed_between "$from" "$to" \
      ops/deploy/reader-summary-publication-deploy-lib.sh \
      ops/deploy/reader-summary-publication-pre-migration.sql \
      ops/deploy/reader-summary-publication-post-migration.sql; then
      services+=(migrate)
    fi
    if changed_between "$from" "$to" scripts ops/evals test; then
      services+=(daily-runner)
    fi
    if changed_between "$from" "$to" ops/observability; then
      services+=(otel-collector)
    fi
  fi
  if changed_between "$from" "$to" \
    apps/x-collector \
    ops/deploy/production-runtime/x-collector.Dockerfile; then
    services+=(x-collector)
  fi
  printf '%s\n' "${services[@]}" | awk 'NF && !seen[$0]++'
}

compose_image_name() {
  printf '%s-%s:latest\n' "$PROJECT" "$1"
}

stop_and_remove_database_services() {
  local service
  local -a database_services=() container_ids remaining_container_ids
  for service in "$@"; do
    case $service in
      api|ingestion-worker|intelligence-worker|delivery-service|event-relay)
        database_services+=("$service")
        ;;
    esac
  done
  ((${#database_services[@]} > 0)) || return 0
  for service in "${database_services[@]}"; do
    mapfile -t container_ids < <(
      docker ps -aq \
        --filter "label=com.docker.compose.project=$PROJECT" \
        --filter "label=com.docker.compose.service=$service"
    )
    if ((${#container_ids[@]} > 0)); then
      docker stop -t 120 "${container_ids[@]}" || return 1
      docker rm -f "${container_ids[@]}" || return 1
    fi
    mapfile -t remaining_container_ids < <(
      docker ps -aq \
        --filter "label=com.docker.compose.project=$PROJECT" \
        --filter "label=com.docker.compose.service=$service"
    )
    ((${#remaining_container_ids[@]} == 0)) || return 1
  done
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
  if [[ $runtime_control == true ]]; then
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
    activate_postgres_runtime_control "$sha" "$compatible_backend_sha"
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
    rollback_backend_and_runtime_control \
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
  if [[ ${COMPOSE[-1]} != \
        "$POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml" ]]; then
    COMPOSE+=(
      -f "$POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml"
    )
  fi
}

sync_control_script() {
  local wrapper_source=$REPO/ops/deploy/social-monitor-production-ssh-wrapper.sh
  local wrapper_destination=$CONTROL/github-production-deploy-wrapper.sh
  local auth_refresh_source=$REPO/ops/deploy/host/refresh-codex-auth.sh
  local auth_refresh_destination=$CONTROL/refresh-codex-auth.sh
  [[ -f $REPO/ops/deploy/social-monitor-production-deploy.sh ]] || return 0
  if [[ -f $wrapper_source ]]; then
    install -m 0755 -o root -g root "$wrapper_source" "$wrapper_destination.next"
    mv -f "$wrapper_destination.next" "$wrapper_destination"
  fi
  if [[ -f $auth_refresh_source ]]; then
    install -m 0700 -o root -g root "$auth_refresh_source" "$auth_refresh_destination.next"
    mv -f "$auth_refresh_destination.next" "$auth_refresh_destination"
    [[ $(stat -c '%U:%G:%a' "$auth_refresh_destination") == root:root:700 ]] || \
      fail 'subscription auth refresh ownership or mode is invalid after sync'
  fi
  if x_collector_target_has_tracked_dockerfile "$sha"; then
    sync_x_collector_dockerfile "$sha"
  fi
  sync_control_entrypoint
}

sync_control_entrypoint() {
  local source=$REPO/ops/deploy/social-monitor-production-deploy.sh
  local destination=$CONTROL/github-production-deploy.sh
  [[ -f $source ]] || return 0
  install -m 0755 -o root -g root "$source" "$destination.next"
  mv -f "$destination.next" "$destination"
  cmp -s "$source" "$destination" || fail 'installed deploy entrypoint differs from reviewed source'
}

commit_postgres_pool_bootstrap() {
  local sha=$1
  local mode=${2:-normal}
  local marker=$STATE/postgres-pool-bootstrap.sha
  local next=$marker.next
  [[ $mode == normal || $mode == force-advance ]] || fail 'PostgreSQL bootstrap marker advance mode is invalid'
  if [[ $mode == normal ]] && postgres_pool_bootstrap_installed "$sha"; then return 0; fi
  [[ ! -e $next && ! -L $next ]] || fail 'PostgreSQL bootstrap marker temporary path is invalid'
  printf '%s\n' "$sha" > "$next"
  mv -f "$next" "$marker"
  if [[ ! -f $marker || -L $marker ]] || ! postgres_pool_bootstrap_installed "$sha"; then
    fail 'PostgreSQL bootstrap marker did not commit the installed entrypoint'
  fi
}
[[ ${BASH_SOURCE[0]} == "$0" ]] || return 0
read -r action sha extra <<< "${SSH_ORIGINAL_COMMAND:-${*:-}}"
command_text=${SSH_ORIGINAL_COMMAND:-${*:-}}
[[ $command_text != *$'\n'* && $command_text != *$'\r'* ]] || fail 'command must be one line'
[[ -z ${extra:-} ]] || fail 'unexpected command arguments'
validate_sha "${sha:-}"
verify_host_policy

case ${action:-} in
  plan) print_plan "$sha" ;;
  upload) upload_frontend "$sha" ;;
  deploy) deploy_release "$sha" ;;
  *) fail 'allowed commands: plan, upload, deploy' ;;
esac
