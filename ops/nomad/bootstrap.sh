#!/usr/bin/env bash
set -euo pipefail

# Idempotent host bootstrap for the Nomad API vertical slice (plan section
# 5). This script never performs a destructive action without --apply: its
# default (and only fully tested-here) mode is --dry-run/--check, which
# reports what it would do without touching the host. Real root bootstrap on
# a production VPS is a separate, explicitly reviewed admin action; this
# script is the shared logic both that action and this PR's tests exercise.
#
# Usage:
#   bootstrap.sh --dry-run [--root PATH]
#   bootstrap.sh --apply   [--root PATH]     # not exercised by this PR's tests
#
# --root overrides the host root (default /var/data/social-monitor), so
# tests can point every path check at a disposable temp directory instead of
# the real filesystem.

SELF_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

usage() {
  printf 'Usage: %s (--dry-run|--apply) [--root PATH]\n' "$(basename "$0")" >&2
}

main() {
  local mode='' root=/var/data/social-monitor
  while (($# > 0)); do
    case $1 in
      --dry-run) mode=dry-run; shift ;;
      --apply) mode=apply; shift ;;
      --root)
        [[ ${2:-} ]] || { usage; return 64; }
        root=$2
        shift 2
        ;;
      *)
        usage
        return 64
        ;;
    esac
  done
  [[ -n $mode ]] || { usage; return 64; }

  local versions_file=$SELF_DIR/versions.json
  [[ -f $versions_file ]] || {
    printf 'bootstrap: %s is missing\n' "$versions_file" >&2
    return 1
  }
  local nomad_version
  nomad_version=$(node -e '
    const versions = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    if (!versions.nomad || !versions.nomad.version) {
      process.exit(1);
    }
    process.stdout.write(versions.nomad.version);
  ' "$versions_file") || {
    printf 'bootstrap: %s does not declare a pinned Nomad version\n' "$versions_file" >&2
    return 1
  }

  local -a planned_actions=(
    "verify pinned Nomad ${nomad_version} binary checksum from ${versions_file}"
    "install ${root}/../etc-equivalent nomad.d config from ${SELF_DIR}/host/nomad.hcl"
    "install systemd unit for the Nomad agent (server+client, not dev mode)"
    "apply ACL policy from ${SELF_DIR}/host/acl.hcl to the social-monitor namespace"
    "create named read-only host volume for the API secret env file"
  )

  if [[ $mode == dry-run ]]; then
    printf 'bootstrap dry-run: root=%s nomad_version=%s\n' "$root" "$nomad_version"
    local action
    for action in "${planned_actions[@]}"; do
      printf 'bootstrap dry-run: would %s\n' "$action"
    done
    return 0
  fi

  printf 'bootstrap: --apply is not implemented by this PR; run the reviewed admin bootstrap procedure instead\n' >&2
  return 1
}

main "$@"
