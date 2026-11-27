#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
ENTRYPOINT="$ROOT/ops/deploy/social-monitor-production-deploy.sh"
# Extract the production function without sourcing host-specific deployment setup.
function_body=$(sed -n '/^verify_backend_proxy_readiness() {/,/^}/p' "$ENTRYPOINT")
[[ -n $function_body ]]
eval "$function_body"
curl() {
  case "${*: -1}" in
    */ready) printf '%s' "${READY_STATUS:-200}" ;;
    *'/api/reader-posts?'*) printf '%s' "${POSTS_STATUS:-200}" ;;
    *) return 1 ;;
  esac
}
verify_backend_proxy_readiness
if READY_STATUS=503 verify_backend_proxy_readiness; then exit 1; fi
if POSTS_STATUS=404 verify_backend_proxy_readiness; then exit 1; fi
if POSTS_STATUS=403 verify_backend_proxy_readiness; then exit 1; fi
printf '%s\n' 'Public reader-posts proxy readiness tests passed'
