#!/usr/bin/env bash
set -euo pipefail

# Filters a newline-delimited service list on stdin, dropping one service
# name when the Nomad API ownership marker (ops/nomad/ownership.mjs) reports
# that service as nomad-owned. Legacy Compose deploy/backup/rescue code calls
# this so it stops mutating a service once Nomad owns it, without needing to
# know anything about Nomad itself (SRP/DIP: callers depend on this narrow
# contract, not on ownership.mjs's storage format).
#
# Fails closed on any ownership-check error: this script only ever runs on
# a host where ops/nomad has already been bootstrapped (a legacy deploy that
# predates Nomad adoption entirely does not have this file to call in the
# first place), so a broken check here means something is wrong with that
# install, not "Nomad was never adopted". Defaulting to "compose" on error
# would risk letting a legacy Compose path mutate a service Nomad has
# already taken ownership of - exactly the dual-owner regression this guard
# exists to prevent. Refuse instead, and require a human to look.
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
    printf 'ownership-guard: could not determine the API owner (node/ownership.mjs unavailable or failing) - refusing rather than assuming "compose"\n' >&2
    return 1
  fi
  if [[ $owner == nomad ]]; then
    grep -vFx "$service" || true
  else
    cat
  fi
}

main "$@"
