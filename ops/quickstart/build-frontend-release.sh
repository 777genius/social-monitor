#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo/apps/frontend"

# Hash Flutter sources and dependency locks, not ephemeral build/pub output
# or timestamp-bearing generated Flutter plugin metadata.
release="$(find . -type d \( -name .dart_tool -o -name build \) -prune -o \
  -type f ! -name .flutter-plugins-dependencies -print0 |
  LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -c1-40)"
[[ "$release" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid frontend release identity' >&2; exit 1; }

cd app
flutter build web --release --wasm --no-web-resources-cdn \
  --dart-define-from-file="$repo/ops/quickstart/frontend-defines.json" \
  --web-define="SOCIAL_MONITOR_RELEASE_ID=$release"
grep -F "flutter_bootstrap.js?v=$release" build/web/index.html >/dev/null
grep -F "const configuredRelease = '$release'" build/web/flutter_bootstrap.js >/dev/null
test -s build/web/main.dart.wasm && test -s build/web/main.dart.js
