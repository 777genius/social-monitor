#!/usr/bin/env bash
set -euo pipefail

# Filters a newline-delimited service list on stdin, dropping one service
# name when the Nomad API ownership marker (ops/nomad/ownership.mjs) reports
# that service as nomad-owned. Legacy Compose deploy/backup/rescue code calls
# this so it stops mutating a service once Nomad owns it, without needing to
# know anything about Nomad itself (SRP/DIP: callers depend on this narrow
# contract, not on ownership.mjs's storage format).
#
# Fails open to the unfiltered list on any ownership-check error: this PR
# only ever writes the "compose" marker in production, so a checker that
# cannot run must not silently drop services from a deploy that predates
# Nomad adoption.
#
# Usage: ownership-guard.sh filter <service> < services.txt

main() {
  local mode=${1:-} service=${2:-}
  [[ $mode == filter && -n $service ]] || {
    printf 'ownership-guard: usage: ownership-guard.sh filter <service>\n' >&2
    return 64
  }
  local self_dir owner
  self_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  if ! owner=$(node "$self_dir/ownership.mjs" get-owner 2>/dev/null); then
    owner=compose
  fi
  if [[ $owner == nomad ]]; then
    grep -vx "$service" || true
  else
    cat
  fi
}

main "$@"
