#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_TEMP:?runner temporary directory required}"
[[ "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ ]] || {
  echo "frontend release identity is missing or invalid" >&2
  exit 1
}
cd "$(dirname "${BASH_SOURCE[0]}")/../../apps/frontend/app"
release="$RUNNER_TEMP/social-monitor-frontend-release"
rm -rf "$release"
install -d -m 0755 "$release/public" "$release/admin"
flutter build web --release --wasm --no-web-resources-cdn \
  --dart-define=SOCIAL_MONITOR_API_BASE_URL=https://social-monitor.app \
  --web-define=SOCIAL_MONITOR_RELEASE_ID="$GITHUB_SHA"
cp -R build/web/. "$release/public/"
flutter build web --release --wasm --no-web-resources-cdn \
  --dart-define=SOCIAL_MONITOR_API_BASE_URL=https://admin.social-monitor.app \
  --web-define=SOCIAL_MONITOR_RELEASE_ID="$GITHUB_SHA"
cp -R build/web/. "$release/admin/"
printf '%s\n' "$GITHUB_SHA" > "$release/public/release-sha.txt"
printf '%s\n' "$GITHUB_SHA" > "$release/admin/release-sha.txt"
grep -F 'https://social-monitor.app' "$release/public/main.dart.js" >/dev/null
if grep -F 'https://admin.social-monitor.app' "$release/public/main.dart.js" >/dev/null; then
  echo 'public bundle contains admin origin' >&2
  exit 1
fi
grep -F 'https://admin.social-monitor.app' "$release/admin/main.dart.js" >/dev/null
if grep -R -E 'nip\.io' "$release" >/dev/null; then
  echo 'frontend bundle contains a nip.io origin' >&2
  exit 1
fi
grep -F 'self.registration.unregister()' \
  "$release/public/flutter_service_worker.js" >/dev/null
grep -F 'self.registration.unregister()' \
  "$release/admin/flutter_service_worker.js" >/dev/null
for lane in public admin; do
  grep -F "flutter_bootstrap.js?v=$GITHUB_SHA" "$release/$lane/index.html" >/dev/null
  grep -F "const configuredRelease = '$GITHUB_SHA'" "$release/$lane/flutter_bootstrap.js" >/dev/null
done
tar -C "$release" -czf "$RUNNER_TEMP/social-monitor-frontend-release.tgz" public admin
