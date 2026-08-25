#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
PACKAGE=$PROJECT_ROOT/package.json
HELPER=$PROJECT_ROOT/scripts/check-feed-promotion-index-recovery.ts
PUBLICATION=$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh

node - "$PACKAGE" <<'NODE'
const manifest = require(process.argv[2]);
const expected = "ts-node -r tsconfig-paths/register scripts/check-feed-promotion-index-recovery.ts";
if (manifest.scripts?.["check:feed-promotion-index-recovery"] !== expected) {
  process.exit(1);
}
NODE
[[ -f $HELPER && ! -L $HELPER ]]
grep -Fx 'import { Pool, type PoolClient } from "pg";' "$HELPER" >/dev/null
for mode in recover verify inspect; do
  [[ $(grep -Fxc "      npm run check:feed-promotion-index-recovery -- $mode" \
    "$PUBLICATION") == 1 ]]
done

printf 'production control bridge feed recovery contract test passed\n'
