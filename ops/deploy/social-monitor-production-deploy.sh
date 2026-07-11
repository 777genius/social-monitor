#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

if ((EUID == 0)); then
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
  [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]] || {
    echo 'deploy-error: production entrypoint requires root' >&2
    exit 1
  }
  ROOT=${SOCIAL_MONITOR_DEPLOY_ROOT:?test root is required}
  REPO=${SOCIAL_MONITOR_DEPLOY_REPO:?test repo is required}
  CONTROL=${SOCIAL_MONITOR_DEPLOY_CONTROL:?test control root is required}
  STATE=${SOCIAL_MONITOR_DEPLOY_STATE:-$CONTROL/deploy-state}
  STAGING=${SOCIAL_MONITOR_DEPLOY_STAGING:-$ROOT/runtime/deploy-staging}
  RELEASES=${SOCIAL_MONITOR_DEPLOY_RELEASES:-$ROOT/runtime/frontend-releases}
  PROJECT=${SOCIAL_MONITOR_DEPLOY_PROJECT:-social-monitor-prod}
fi
PUBLIC_LINK=$ROOT/runtime/frontend-public-web
ADMIN_LINK=$ROOT/runtime/frontend-admin-web
DEPLOY_LOCK=$CONTROL/production-deploy.lock
DAILY_LOCK=$CONTROL/daily-run.lock

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
  apps/social-research-runtime
  apps/social-research-grpc
  apps/social-research-mcp
  scripts
  ops/evals
  test
)

CONTROL_PATHS=(
  .github/workflows/production-deploy.yml
  ops/deploy
)

COMPOSE=(
  docker compose -p "$PROJECT"
  --env-file "$ROOT/secrets/production.env"
  -f "$REPO/docker-compose.yml"
  -f "$CONTROL/compose.production.yml"
  -f "$CONTROL/compose.managed-db.yml"
)

fail() {
  printf 'deploy-error: %s\n' "$*" >&2
  exit 1
}

verify_host_policy() {
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

verify_compose_scope() (
  local rendered=$STATE/rendered-compose.$$.json
  trap 'rm -f "$rendered"' EXIT
  "${COMPOSE[@]}" --profile app --profile daily config --format json > "$rendered"
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
    "migrate", "rabbitmq", "redis", "x-collector",
}
services = config.get("services", {})
if set(services) != expected_services:
    raise SystemExit("rendered Compose service allowlist mismatch")

expected_images = {
    "caddy": "caddy:2.11.4-alpine",
    "frontend": "nginx:1.29-alpine",
    "rabbitmq": "rabbitmq:4.3-management",
    "redis": "redis:8-alpine",
}
allowed_control_dockerfiles = {
    f"{control}/daily-runner.Dockerfile",
    f"{control}/x-collector.Dockerfile",
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
    elif build.get("dockerfile") not in {"Dockerfile", *allowed_control_dockerfiles}:
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
  component_changed backend "$sha" apps/x-collector && x_collector=true
  printf 'frontend=%s\nbackend=%s\nbackend_base=%s\ncontrol=%s\nx_collector=%s\n' \
    "$frontend" "$backend" "$backend_base" "$control" "$x_collector"
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
    services=(migrate api agent-runtime ingestion-worker intelligence-worker delivery-service event-relay daily-runner)
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
    if changed_between "$from" "$to" scripts ops/evals test; then
      services+=(daily-runner)
    fi
  fi
  if changed_between "$from" "$to" apps/x-collector; then
    services+=(x-collector)
  fi
  printf '%s\n' "${services[@]}" | awk 'NF && !seen[$0]++'
}

compose_image_name() {
  printf '%s-%s:latest\n' "$PROJECT" "$1"
}

capture_previous_images() {
  local state_file=$1
  shift
  : > "$state_file"
  local service image_id
  local -a container_ids
  for service in "$@"; do
    mapfile -t container_ids < <("${COMPOSE[@]}" --profile app --profile daily ps -q "$service")
    image_id=''
    if ((${#container_ids[@]} > 0)); then
      image_id=$(docker inspect "${container_ids[0]}" --format '{{.Image}}' 2>/dev/null || true)
    fi
    if [[ -z $image_id ]]; then
      image_id=$(docker image inspect "$(compose_image_name "$service")" --format '{{.Id}}' 2>/dev/null || true)
    fi
    [[ -n $image_id ]] && printf '%s %s\n' "$service" "$image_id" >> "$state_file"
  done
}

rollback_backend_images() {
  local state_file=$1
  [[ -s $state_file ]] || return 0
  local service image_id
  while read -r service image_id; do
    docker image tag "$image_id" "$(compose_image_name "$service")" || return 1
  done < "$state_file"
  mapfile -t rollback_services < <(awk '$1 != "migrate" && $1 != "daily-runner" {print $1}' "$state_file")
  if ((${#rollback_services[@]} > 0)); then
    "${COMPOSE[@]}" --profile app up -d --no-deps --force-recreate "${rollback_services[@]}" || return 1
    verify_backend_with_retry "${rollback_services[@]}" || return 1
  fi
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
  local partial env_file listing api_id database_url database_name
  output=$ROOT/backups/pre-autodeploy-${sha:0:12}-$(date -u +%Y%m%dT%H%M%SZ).dump
  partial=$output.partial
  env_file=$STATE/database-backup.$$.env
  listing=$STATE/database-backup.$$.list
  api_id=$("${COMPOSE[@]}" --profile app ps -q api)
  [[ -n $api_id ]] || fail 'production API container is unavailable for database discovery'
  database_url=$(docker inspect "$api_id" --format '{{range .Config.Env}}{{println .}}{{end}}' | \
    awk -F= '$1 == "DATABASE_URL" {sub(/^[^=]*=/, ""); print; exit}')
  [[ -n $database_url ]] || fail 'production API has no effective database URL'
  umask 077
  trap 'rm -f "$partial" "$env_file" "$listing"' EXIT
  printf 'DATABASE_URL=%s\n' "$database_url" > "$env_file"
  local backup_image=postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
  database_name=$(docker run --rm \
    --env-file "$env_file" \
    -v "$ROOT/secrets/db/ca-certificate.crt:/run/social-monitor-db/ca-certificate.crt:ro" \
    "$backup_image" \
    sh -lc 'psql "$DATABASE_URL" -Atc "SELECT current_database()"')
  [[ $database_name == social_monitor ]] || fail 'effective production database is not social_monitor'
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
  for relation in _prisma_migrations source_items feed_items reader_summary_artifacts; do
    grep -Eq "TABLE DATA public $relation( |$)" "$listing" || fail "database backup is missing $relation"
  done
  chmod 600 "$partial"
  mv "$partial" "$output"
  printf 'database-backup=%s\n' "$output"
)

verify_backend() {
  local service container status oom
  local -a container_ids
  curl -fsS --max-time 15 http://127.0.0.1:13000/healthz >/dev/null || return 1
  curl -fsS --max-time 15 http://127.0.0.1:13000/ready >/dev/null || return 1
  for service in "$@"; do
    [[ $service == migrate || $service == daily-runner ]] && continue
    mapfile -t container_ids < <("${COMPOSE[@]}" --profile app ps -q "$service")
    ((${#container_ids[@]} > 0)) || return 1
    for container in "${container_ids[@]}"; do
      status=$(docker inspect "$container" --format '{{.State.Status}}')
      oom=$(docker inspect "$container" --format '{{.State.OOMKilled}}')
      if [[ $status != running || $oom != false ]]; then
        printf 'deploy-error: %s failed runtime verification\n' "$service" >&2
        return 1
      fi
    done
  done
}

verify_backend_with_retry() {
  for _ in {1..20}; do
    verify_backend "$@" && return 0
    sleep 3
  done
  return 1
}

deploy_backend() {
  local sha=$1
  local from
  from=$(marker_value backend)
  mapfile -t services < <(backend_services "$from" "$sha")
  if ((${#services[@]} == 0)); then
    printf '%s\n' "$sha" > "$STATE/backend.sha"
    return 0
  fi

  local previous=$STATE/previous-images-${sha:0:12}.txt
  capture_previous_images "$previous" "${services[@]}"
  verify_migration_compatibility "$from" "$sha"
  backup_database "$sha"

  local -a primary_build=()
  local service
  for service in "${services[@]}"; do
    [[ $service == daily-runner ]] || primary_build+=("$service")
  done
  ((${#primary_build[@]} == 0)) || "${COMPOSE[@]}" --profile app --profile daily build "${primary_build[@]}"
  if printf '%s\n' "${services[@]}" | grep -qx daily-runner; then
    "${COMPOSE[@]}" --profile daily build daily-runner
  fi

  local needs_migrate=false
  for service in "${services[@]}"; do
    [[ $service == x-collector || $service == daily-runner ]] || needs_migrate=true
  done
  if [[ $needs_migrate == true ]]; then
    "${COMPOSE[@]}" --profile app run --rm --no-deps migrate npm run migrate:deploy
  fi

  local -a persistent=()
  for service in "${services[@]}"; do
    [[ $service == migrate || $service == daily-runner ]] || persistent+=("$service")
  done
  if ((${#persistent[@]} > 0)); then
    if ! "${COMPOSE[@]}" --profile app up -d --no-deps --force-recreate "${persistent[@]}"; then
      rollback_backend_images "$previous" || fail 'backend recreate and rollback both failed'
      fail 'backend recreate failed; previous images restored'
    fi
    if ! verify_backend_with_retry "${persistent[@]}"; then
      rollback_backend_images "$previous" || fail 'backend health and rollback verification both failed'
      fail 'backend health failed; previous images restored'
    fi
  fi
  printf '%s\n' "$sha" > "$STATE/backend.sha"
}

switch_link() {
  local link=$1
  local target=$2
  local next=$link.next.$$
  ln -s "$target" "$next"
  mv -Tf "$next" "$link"
}

deploy_frontend() {
  local sha=$1
  local staged=$STAGING/$sha/frontend
  local release=$RELEASES/$sha
  local upload_lock=$STAGING/$sha/upload.lock
  local previous_public previous_admin
  previous_public=$(readlink -f "$PUBLIC_LINK" || true)
  previous_admin=$(readlink -f "$ADMIN_LINK" || true)
  [[ -n $previous_public && -n $previous_admin ]] || fail 'frontend rollback links are not initialized'
  exec 7>"$upload_lock"
  flock -w 600 7 || fail 'timed out waiting for frontend upload lock'
  install -d -m 0755 "$RELEASES"
  if [[ -f $release/READY ]] && [[ $(cat "$release/READY") == "$sha" ]]; then
    :
  else
    [[ ! -e $release ]] || fail 'immutable frontend release exists without a valid marker'
    [[ -f $staged/READY ]] || fail 'frontend artifact is not uploaded'
    [[ $(cat "$staged/READY") == "$sha" ]] || fail 'frontend artifact marker mismatch'
    mv "$staged" "$release"
  fi

  switch_link "$PUBLIC_LINK" "$release/public"
  switch_link "$ADMIN_LINK" "$release/admin"
  if ! "${COMPOSE[@]}" --profile app up -d --no-deps --force-recreate frontend; then
    switch_link "$PUBLIC_LINK" "$previous_public"
    switch_link "$ADMIN_LINK" "$previous_admin"
    "${COMPOSE[@]}" --profile app up -d --no-deps --force-recreate frontend
    fail 'frontend recreate failed; previous release restored'
  fi

  local public_code admin_code favicon_code release_sha
  for _ in $(seq 1 20); do
    public_code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 https://social-monitor.app/ || true)
    admin_code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 https://admin.social-monitor.app/ || true)
    favicon_code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 https://social-monitor.app/favicon.svg || true)
    release_sha=$(curl -fsS --max-time 10 \
      "https://social-monitor.app/release-sha.txt?release=$sha" 2>/dev/null || true)
    [[ $public_code == 200 && $admin_code == 401 && $favicon_code == 200 && $release_sha == "$sha" ]] && break
    sleep 2
  done
  if [[ $public_code != 200 || $admin_code != 401 || $favicon_code != 200 || $release_sha != "$sha" ]]; then
    switch_link "$PUBLIC_LINK" "$previous_public"
    switch_link "$ADMIN_LINK" "$previous_admin"
    "${COMPOSE[@]}" --profile app up -d --no-deps --force-recreate frontend
    fail 'frontend health failed; previous release restored'
  fi
  printf '%s\n' "$sha" > "$STATE/frontend.sha"
}

sync_control_script() {
  local source=$REPO/ops/deploy/social-monitor-production-deploy.sh
  local destination=$CONTROL/github-production-deploy.sh
  local wrapper_source=$REPO/ops/deploy/social-monitor-production-ssh-wrapper.sh
  local wrapper_destination=$CONTROL/github-production-deploy-wrapper.sh
  [[ -f $source ]] || return 0
  install -m 0755 -o root -g root "$source" "$destination.next"
  mv -f "$destination.next" "$destination"
  if [[ -f $wrapper_source ]]; then
    install -m 0755 -o root -g root "$wrapper_source" "$wrapper_destination.next"
    mv -f "$wrapper_destination.next" "$wrapper_destination"
  fi
}

deploy_release() {
  local sha=$1
  exec 9>"$DEPLOY_LOCK"
  flock -w 3600 9 || fail 'timed out waiting for deployment lock'
  exec 8>"$DAILY_LOCK"
  flock -w 3600 8 || fail 'timed out waiting for daily-run lock'
  fetch_main
  validate_main_commit "$sha"
  install -d -m 0755 "$STATE" "$STAGING" "$RELEASES"

  local current
  current=$(git -C "$REPO" rev-parse HEAD)
  if [[ $sha != "$current" ]] && git -C "$REPO" merge-base --is-ancestor "$sha" "$current"; then
    printf 'already-deployed-or-newer=%s\n' "$current"
    return 0
  fi

  local frontend=false backend=false control=false
  component_changed frontend "$sha" "${FRONTEND_PATHS[@]}" && frontend=true
  component_changed backend "$sha" "${BACKEND_PATHS[@]}" && backend=true
  component_changed control "$sha" "${CONTROL_PATHS[@]}" && control=true
  advance_integration "$sha"
  verify_compose_scope
  [[ $backend == false ]] || deploy_backend "$sha"
  [[ $frontend == false ]] || deploy_frontend "$sha"
  if [[ $control == true ]]; then
    printf '%s\n' "$sha" > "$STATE/control.sha"
  fi
  sync_control_script
  printf 'deployed=%s frontend=%s backend=%s control=%s\n' "$sha" "$frontend" "$backend" "$control"
}

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
