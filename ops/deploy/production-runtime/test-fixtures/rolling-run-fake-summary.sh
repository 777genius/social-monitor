#!/usr/bin/env bash
set -euo pipefail

evidence_path=${1:?summary evidence path is required}
frontend_path=${2:?summary frontend path is required}
fixture_root=$(cd "${BASH_SOURCE[0]%/*}" && pwd)
node "$fixture_root/rolling-run-fake-artifact.mjs" evidence \
  "$evidence_path" "$ROLLING_RUN_ID" "$ROLLING_COLLECTION_DATE" \
  "$frontend_path"
