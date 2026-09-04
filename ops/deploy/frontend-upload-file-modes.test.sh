#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
fixture=$(mktemp -d /tmp/social-monitor-frontend-upload-modes.XXXXXX)
trap 'rm -rf "$fixture"' EXIT
STAGING=$fixture/staging
sha=1111111111111111111111111111111111111111
mkdir -p "$STAGING" "$fixture/bundle/public" "$fixture/bundle/admin"
for lane in public admin; do
  printf '<html>test sandbox</html>\n' > "$fixture/bundle/$lane/index.html"
  printf '%s\n' "$sha" > "$fixture/bundle/$lane/release-sha.txt"
  printf 'self.registration.unregister()\n' > "$fixture/bundle/$lane/flutter_service_worker.js"
done
printf 'https://social-monitor.app\n' > "$fixture/bundle/public/main.dart.js"
printf 'https://admin.social-monitor.app\n' > "$fixture/bundle/admin/main.dart.js"
chmod 0755 "$fixture/bundle" "$fixture/bundle/public" "$fixture/bundle/admin"
chmod 0644 "$fixture/bundle/public/"* "$fixture/bundle/admin/"*
tar -czf "$fixture/frontend.tgz" -C "$fixture/bundle" public admin

# Load the actual archive validator and uploader only, never the live entrypoint.
source /dev/stdin < <(sed -n '/^validate_frontend_archive() {/,/^advance_integration() {/p' \
  "$SCRIPT_DIR/social-monitor-production-deploy.sh" | sed '$d')
fetch_main() { :; }
validate_main_commit() { [[ $1 == "$sha" ]]; }
fail() { printf 'test-failure: %s\n' "$*" >&2; exit 1; }

run_upload_case() {
  local mask=$1 transport=$2
  STAGING=$fixture/staging-$mask-$transport
  mkdir -p "$STAGING"
  (
    umask "$mask"
    before=$(umask)
    if [[ $transport == fallback ]]; then
      command() {
        if [[ $* == '-v timeout' ]]; then return 1; fi
        builtin command "$@"
      }
    fi
    upload_frontend "$sha" < "$fixture/frontend.tgz"
    [[ $(umask) == "$before" ]] || fail 'uploader changed caller umask'
  )
  for lane in public admin; do
    [[ $(stat -c '%a' "$STAGING/$sha/frontend/$lane") == 755 ]] || \
      fail "unreadable $lane directory under umask $mask"
    for name in index.html main.dart.js release-sha.txt flutter_service_worker.js; do
      file=$STAGING/$sha/frontend/$lane/$name
      [[ $(stat -c '%a' "$file") == 644 ]] || fail "unreadable $name under umask $mask"
      cmp "$fixture/bundle/$lane/$name" "$file" || fail 'archive bytes changed'
    done
  done
  [[ $(cat "$STAGING/$sha/frontend/READY") == "$sha" ]]
}
for mask in 077 027 022; do
  run_upload_case "$mask" timeout
  if ((EUID != 0)); then run_upload_case "$mask" fallback; fi
done
printf 'Frontend upload modes tests passed (077, 027, 022).\n'
