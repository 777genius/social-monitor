#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/postgres-pool-release-contract.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

REPO=$FIXTURE/repo
git init -q -b main "$REPO"
git -C "$REPO" config user.name 'PostgreSQL Release Contract'
git -C "$REPO" config user.email postgres-release-contract@example.invalid
printf 'fixture base\n' > "$REPO/README.md"
git -C "$REPO" add README.md
git -C "$REPO" commit -qm 'test: adoption base'
BASE=$(git -C "$REPO" rev-parse HEAD)

install -d "$REPO/ops/deploy"
cp "$SCRIPT_DIR/postgres-pool-release-a.files" \
  "$SCRIPT_DIR/postgres-pool-release-b.files" \
  "$SCRIPT_DIR/postgres-pool-release-contract.json" \
  "$SCRIPT_DIR/verify-postgres-pool-release-contract.py" \
  "$REPO/ops/deploy/"
python3 - "$REPO/ops/deploy/postgres-pool-release-contract.json" "$BASE" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
contract = json.loads(path.read_text(encoding="utf-8"))
contract["adoptionBaseCommit"] = sys.argv[2]
path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
PY

materialize_manifest() {
  local manifest=$1
  local label=$2
  local source=$FIXTURE/$label.files
  local path
  cp "$manifest" "$source"
  while IFS= read -r path; do
    [[ -z $path || $path == \#* ]] && continue
    install -d "$REPO/$(dirname "$path")"
    if [[ -e $REPO/$path ]]; then
      printf '%s\n' "$label" >> "$REPO/$path"
    else
      printf '%s\n' "$label" > "$REPO/$path"
    fi
  done < "$source"
}

materialize_manifest "$REPO/ops/deploy/postgres-pool-release-a.files" release-a
# Restore executable fixture inputs overwritten while materializing Release A.
cp "$SCRIPT_DIR/postgres-pool-release-a.files" \
  "$SCRIPT_DIR/postgres-pool-release-b.files" \
  "$SCRIPT_DIR/postgres-pool-release-contract.json" \
  "$SCRIPT_DIR/verify-postgres-pool-release-contract.py" \
  "$REPO/ops/deploy/"
python3 - "$REPO/ops/deploy/postgres-pool-release-contract.json" "$BASE" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
contract = json.loads(path.read_text(encoding="utf-8"))
contract["adoptionBaseCommit"] = sys.argv[2]
path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
PY
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: Release A'
RELEASE_A=$(git -C "$REPO" rev-parse HEAD)

git -C "$REPO" switch -q -c missing-adoption
printf 'repair without Release B\n' > "$REPO/ops/deploy/missing-adoption.txt"
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: incomplete adoption repair'
MISSING_ADOPTION_TARGET=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" switch -q main

materialize_manifest "$REPO/ops/deploy/postgres-pool-release-b.files" release-b
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: Release B'
RELEASE_B=$(git -C "$REPO" rev-parse HEAD)

printf 'legacy bootstrap marker repair\n' > "$REPO/ops/deploy/bootstrap-repair.txt"
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: control-only bootstrap repair'
CONTROL_TARGET=$(git -C "$REPO" rev-parse HEAD)

# Reuse the completed Release B and control-repair trees on a disconnected
# history. A two-tree diff from BASE still contains every A+B path, but this
# copied durable marker must not count as adoption without ancestry proof.
COPIED_BACKEND_BASE=$(
  printf 'test: copied adoption tree\n' |
    git -C "$REPO" commit-tree "$RELEASE_B^{tree}"
)
COPIED_CONTROL_TARGET=$(
  printf 'test: copied control repair tree\n' |
    git -C "$REPO" commit-tree "$CONTROL_TARGET^{tree}" \
      -p "$COPIED_BACKEND_BASE"
)

git -C "$REPO" switch -q -c unclassified-target
printf 'unclassified target mutation\n' >> "$REPO/README.md"
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: unsafe unclassified mutation'
UNCLASSIFIED_TARGET=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" switch -q main

git -C "$REPO" switch -q -c backend-target
install -d "$REPO/apps/api-gateway"
printf 'backend mutation\n' > "$REPO/apps/api-gateway/bootstrap-repair.txt"
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: unsafe backend mutation'
BACKEND_TARGET=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" switch -q main

git -C "$REPO" switch -q -c divergent-target "$RELEASE_B"
printf 'divergent control mutation\n' > "$REPO/ops/deploy/divergent-repair.txt"
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: divergent control mutation'
DIVERGENT_TARGET=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" switch -q main

VERIFIER=$REPO/ops/deploy/verify-postgres-pool-release-contract.py
ZERO_SHA=0000000000000000000000000000000000000000

run_ci() {
  python3 "$VERIFIER" ci "$@"
}

assert_rejected() {
  local expected=$1
  shift
  local output
  if output=$(run_ci "$@" 2>&1); then
    printf 'unexpectedly accepted invalid contract: %s\n' "$expected" >&2
    exit 1
  fi
  grep -F "$expected" <<< "$output" >/dev/null
}

# The exact original Release A and Release B contracts remain accepted.
run_ci --target "$RELEASE_A" --backend-base "$BASE" \
  --backend false --control true --bootstrap uninstalled \
  --bootstrap-sha "$ZERO_SHA"
run_ci --target "$RELEASE_B" --backend-base "$BASE" \
  --backend true --control false --bootstrap postgres-pool-v1 \
  --bootstrap-sha "$RELEASE_A"

# A legacy missing marker is repairable only after the full adoption and only
# through a nonempty target delta in which every path is control-classified.
run_ci --target "$CONTROL_TARGET" --backend-base "$RELEASE_B" \
  --backend false --control true --bootstrap uninstalled \
  --bootstrap-sha "$ZERO_SHA"
assert_rejected \
  'PostgreSQL adoption base is not an ancestor of durable backend marker' \
  --target "$COPIED_CONTROL_TARGET" --backend-base "$COPIED_BACKEND_BASE" \
  --backend false --control true --bootstrap uninstalled \
  --bootstrap-sha "$ZERO_SHA"
assert_rejected 'durable backend marker does not contain completed adoption' \
  --target "$MISSING_ADOPTION_TARGET" --backend-base "$RELEASE_A" \
  --backend false --control true --bootstrap uninstalled \
  --bootstrap-sha "$ZERO_SHA"
assert_rejected 'legacy PostgreSQL bootstrap repair contains non-control paths' \
  --target "$UNCLASSIFIED_TARGET" --backend-base "$RELEASE_B" \
  --backend false --control true --bootstrap uninstalled \
  --bootstrap-sha "$ZERO_SHA"
assert_rejected 'legacy PostgreSQL bootstrap repair contains backend paths' \
  --target "$BACKEND_TARGET" --backend-base "$RELEASE_B" \
  --backend false --control true --bootstrap uninstalled \
  --bootstrap-sha "$ZERO_SHA"
assert_rejected \
  'legacy PostgreSQL bootstrap repair durable backend marker is not an ancestor of target' \
  --target "$DIVERGENT_TARGET" --backend-base "$CONTROL_TARGET" \
  --backend false --control true --bootstrap uninstalled \
  --bootstrap-sha "$ZERO_SHA"
assert_rejected 'uninstalled PostgreSQL bootstrap has a nonzero durable release SHA' \
  --target "$CONTROL_TARGET" --backend-base "$RELEASE_B" \
  --backend false --control true --bootstrap uninstalled \
  --bootstrap-sha "$RELEASE_A"
assert_rejected 'first PostgreSQL adoption release must be control-only' \
  --target "$CONTROL_TARGET" --backend-base "$RELEASE_B" \
  --backend true --control true --bootstrap uninstalled \
  --bootstrap-sha "$ZERO_SHA"
assert_rejected 'first PostgreSQL adoption release must be control-only' \
  --target "$CONTROL_TARGET" --backend-base "$RELEASE_B" \
  --backend false --control false --bootstrap uninstalled \
  --bootstrap-sha "$ZERO_SHA"

echo 'PostgreSQL pool release contract tests passed'
