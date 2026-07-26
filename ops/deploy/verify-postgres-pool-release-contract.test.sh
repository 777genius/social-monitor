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

# Once the Release A bootstrap is installed, the next backend release must be
# exactly Release B: no missing adoption, unclassified, backend or control
# drift can ride along as the durable backend marker advances.
assert_rejected "unexpected=['ops/deploy/missing-adoption.txt']" \
  --target "$MISSING_ADOPTION_TARGET" --backend-base "$BASE" \
  --backend true --control false --bootstrap postgres-pool-v1 \
  --bootstrap-sha "$RELEASE_A"
assert_rejected "unexpected=['README.md', 'ops/deploy/bootstrap-repair.txt']" \
  --target "$UNCLASSIFIED_TARGET" --backend-base "$BASE" \
  --backend true --control false --bootstrap postgres-pool-v1 \
  --bootstrap-sha "$RELEASE_A"
assert_rejected "unexpected=['apps/api-gateway/bootstrap-repair.txt', 'ops/deploy/bootstrap-repair.txt']" \
  --target "$BACKEND_TARGET" --backend-base "$BASE" \
  --backend true --control false --bootstrap postgres-pool-v1 \
  --bootstrap-sha "$RELEASE_A"
assert_rejected "unexpected=['ops/deploy/divergent-repair.txt']" \
  --target "$DIVERGENT_TARGET" --backend-base "$BASE" \
  --backend true --control false --bootstrap postgres-pool-v1 \
  --bootstrap-sha "$RELEASE_A"

# A copied tree with the right file diff is not a durable adoption marker
# unless it descends from the pinned adoption base.
assert_rejected \
  'PostgreSQL adoption base is not an ancestor of durable backend marker' \
  --target "$COPIED_CONTROL_TARGET" --backend-base "$COPIED_BACKEND_BASE" \
  --backend false --control true --bootstrap postgres-pool-v1 \
  --bootstrap-sha "$RELEASE_A"

# The generic release verifier never waives the two-release contract for a
# combined legacy repair. The atomic deploy fast path owns that exact case.
assert_rejected \
  'uninstalled PostgreSQL bootstrap is allowed only for ordinary Release A' \
  --target "$CONTROL_TARGET" --backend-base "$RELEASE_B" \
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

ATOMIC_BASE=$(git -C "$REPO" rev-parse HEAD)
mapfile -t ATOMIC_PATHS < <(
  python3 -c 'import json,sys; print(*json.load(open(sys.argv[1]))["atomicRepairPaths"], sep="\n")' \
    "$SCRIPT_DIR/postgres-pool-release-contract.json"
)
[[ ${#ATOMIC_PATHS[@]} == 17 ]]

materialize_atomic_paths() {
  local limit=$1 path index=0
  for path in "${ATOMIC_PATHS[@]}"; do
    ((index += 1))
    ((index <= limit)) || break
    install -d "$REPO/$(dirname "$path")"
    printf 'atomic repair fixture %s\n' "$path" > "$REPO/$path"
  done
}

git -C "$REPO" switch -q -c atomic-missing "$ATOMIC_BASE"
materialize_atomic_paths 16
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: missing atomic path'
ATOMIC_MISSING=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" switch -q main

materialize_atomic_paths 17
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: exact atomic repair'
ATOMIC_TARGET=$(git -C "$REPO" rev-parse HEAD)
printf 'unexpected atomic path\n' > "$REPO/atomic-unexpected.txt"
git -C "$REPO" add atomic-unexpected.txt
git -C "$REPO" commit -qm 'test: unexpected atomic path'
ATOMIC_UNEXPECTED=$(git -C "$REPO" rev-parse HEAD)

# Execute the reviewed verifier from the fixture worktree while inspecting the
# committed target trees, including their deliberately replaced verifier blob.
cp "$SCRIPT_DIR/verify-postgres-pool-release-contract.py" "$VERIFIER"
cp "$SCRIPT_DIR/postgres-pool-release-contract.json" \
  "$REPO/ops/deploy/postgres-pool-release-contract.json"
python3 - "$REPO/ops/deploy/postgres-pool-release-contract.json" \
  "$RELEASE_B" "$ATOMIC_BASE" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
contract = json.loads(path.read_text(encoding="utf-8"))
contract["adoptionBackendCommit"] = sys.argv[2]
contract["atomicRepairBaseCommit"] = sys.argv[3]
path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
PY

run_atomic() {
  python3 "$VERIFIER" atomic-repair "$@"
}

assert_atomic_rejected() {
  local expected=$1 output
  shift
  if output=$(run_atomic "$@" 2>&1); then
    printf 'unexpectedly accepted invalid atomic repair: %s\n' "$expected" >&2
    exit 1
  fi
  grep -F "$expected" <<< "$output" >/dev/null
}

run_atomic --target "$ATOMIC_TARGET" --backend-base "$RELEASE_B"
assert_atomic_rejected 'durable backend marker is not the exact adoption backend' \
  --target "$ATOMIC_TARGET" --backend-base "$RELEASE_A"
assert_atomic_rejected 'missing=' \
  --target "$ATOMIC_MISSING" --backend-base "$RELEASE_B"
assert_atomic_rejected 'unexpected=' \
  --target "$ATOMIC_UNEXPECTED" --backend-base "$RELEASE_B"

echo 'PostgreSQL pool release contract tests passed'
