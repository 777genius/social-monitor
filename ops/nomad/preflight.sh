#!/usr/bin/env bash
set -euo pipefail

# Read-only, allowlisted preflight evidence for the Nomad API MVP (plan
# section 2). This is the "tiny preflight" bundled with PR1: it only reads
# host/tooling identity available on the machine it runs on and never
# executes `docker inspect`, dumps environment variables, or reads any file
# under a secrets path. The full production inventory (disk inodes, cgroup
# limits, swap, running container identities, nginx/DB state) is collected by
# a separate admin-run preflight at bootstrap/activation time, not here.
#
# Usage: ops/nomad/preflight.sh [source-sha]
# Prints a single line of JSON to stdout. A field that could not be collected
# on this machine is reported as JSON null, never omitted, so a stale/broken
# collector cannot look identical to a working one.

preflight_json_string() {
  local value=$1
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  printf '%s' "$value"
}

preflight_string_field() {
  # Runs "$@", returns a quoted JSON string of the first output line, or the
  # bare JSON literal null if the command is missing or fails.
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'null'
    return 0
  fi
  local output=""
  if output=$("$@" 2>/dev/null); then
    output=$(printf '%s\n' "$output" | head -n1)
    printf '"%s"' "$(preflight_json_string "$output")"
  else
    printf 'null'
  fi
}

preflight_mem_total_kb() {
  if [[ -r /proc/meminfo ]]; then
    awk '/^MemTotal:/{print $2; found=1} END{exit !found}' /proc/meminfo && return 0
  fi
  if command -v sysctl >/dev/null 2>&1; then
    local bytes
    if bytes=$(sysctl -n hw.memsize 2>/dev/null) && [[ $bytes =~ ^[0-9]+$ ]]; then
      printf '%d' $((bytes / 1024))
      return 0
    fi
  fi
  return 1
}

preflight_disk_free_kb() {
  local target=${1:-/}
  df -Pk "$target" 2>/dev/null | awk 'NR==2 && $4 ~ /^[0-9]+$/ {print $4; found=1} END{exit !found}'
}

preflight_number_field() {
  local value
  if value=$("$@" 2>/dev/null) && [[ $value =~ ^[0-9]+$ ]]; then
    printf '%s' "$value"
  else
    printf 'null'
  fi
}

preflight_source_sha_field() {
  local candidate=${1:-${SOCIAL_MONITOR_PREFLIGHT_SOURCE_SHA:-}}
  if [[ $candidate =~ ^[0-9a-f]{40}$ ]]; then
    printf '"%s"' "$candidate"
  else
    if [[ -n $candidate ]]; then
      printf 'nomad-preflight-error: ignoring malformed source SHA\n' >&2
    fi
    printf 'null'
  fi
}

main() {
  local collected_at
  collected_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  local hostname_field kernel_field arch_field
  hostname_field=$(preflight_string_field hostname)
  kernel_field=$(preflight_string_field uname -srv)
  arch_field=$(preflight_string_field uname -m)

  local docker_version_field compose_version_field
  docker_version_field=$(preflight_string_field docker version --format '{{.Server.Version}}')
  compose_version_field=$(preflight_string_field docker compose version --short)

  local mem_total_field disk_free_field
  mem_total_field=$(preflight_number_field preflight_mem_total_kb)
  disk_free_field=$(preflight_number_field preflight_disk_free_kb /)

  local source_sha_field
  source_sha_field=$(preflight_source_sha_field "${1:-}")

  printf '{"collectedAt":"%s","sourceSha":%s,"host":{"hostname":%s,"kernel":%s,"architecture":%s},"docker":{"serverVersion":%s,"composeVersion":%s},"resources":{"memTotalKb":%s,"diskFreeKb":%s}}\n' \
    "$collected_at" "$source_sha_field" \
    "$hostname_field" "$kernel_field" "$arch_field" \
    "$docker_version_field" "$compose_version_field" \
    "$mem_total_field" "$disk_free_field"
}

main "$@"
