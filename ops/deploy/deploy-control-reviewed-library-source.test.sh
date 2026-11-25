#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/reviewed-library-source.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo
STATE=$FIXTURE/state
MUTATION_EXECUTED=$FIXTURE/mutation-executed
LIBRARY_PATH=ops/deploy/reviewed-library.sh
mkdir -p "$REPO/ops/deploy" "$STATE"

fail() { printf 'reviewed-library-test-error: %s\n' "$*" >&2; exit 1; }
# shellcheck source=ops/deploy/deploy-control-lib.sh
source "$SCRIPT_DIR/deploy-control-lib.sh"

cat > "$REPO/$LIBRARY_PATH" <<'LIBRARY'
source_reviewed_deploy_library "$REVIEWED_SHA" \
  ops/deploy/reviewed-dependency.sh 'reviewed dependency library'
reviewed_library_value() { printf 'reviewed\n'; }
LIBRARY
cat > "$REPO/ops/deploy/reviewed-dependency.sh" <<'LIBRARY'
reviewed_dependency_value() { printf 'reviewed-dependency\n'; }
LIBRARY
git -C "$REPO" init -q
git -C "$REPO" config user.name 'Reviewed Library Test'
git -C "$REPO" config user.email reviewed-library@example.invalid
git -C "$REPO" add ops/deploy
git -C "$REPO" commit -qm 'test: seed reviewed library'
REVIEWED_SHA=$(git -C "$REPO" rev-parse HEAD)

deploy_control_after_reviewed_library_stage() {
  case $1 in
    "$LIBRARY_PATH") cat > "$REPO/$LIBRARY_PATH" <<MUTATED
: > "$MUTATION_EXECUTED"
reviewed_library_value() { printf 'mutated\\n'; }
MUTATED
      ;;
    ops/deploy/reviewed-dependency.sh)
      printf ': > "%s"\n' "$MUTATION_EXECUTED" > \
        "$REPO/ops/deploy/reviewed-dependency.sh"
      ;;
    *) return 1 ;;
  esac
}

source_reviewed_deploy_library \
  "$REVIEWED_SHA" "$LIBRARY_PATH" 'reviewed test library'
[[ $(reviewed_library_value) == reviewed ]]
[[ $(reviewed_dependency_value) == reviewed-dependency ]]
[[ ! -e $MUTATION_EXECUTED ]]
[[ -z $(find "$STATE" -mindepth 1 -print -quit) ]]

if (source_reviewed_deploy_library \
  "$REVIEWED_SHA" ops/deploy/missing.sh 'missing test library' \
  >/dev/null 2>&1); then
  echo 'missing reviewed library was sourced' >&2
  exit 1
fi
[[ -z $(find "$STATE" -mindepth 1 -print -quit) ]]

ln -s reviewed-library.sh "$REPO/ops/deploy/symlink-library.sh"
git -C "$REPO" add ops/deploy/symlink-library.sh
git -C "$REPO" commit -qm 'test: add non-regular reviewed entry'
SYMLINK_SHA=$(git -C "$REPO" rev-parse HEAD)
if (source_reviewed_deploy_library \
  "$SYMLINK_SHA" ops/deploy/symlink-library.sh 'symlink test library' \
  >/dev/null 2>&1); then
  echo 'non-regular reviewed library was sourced' >&2
  exit 1
fi

echo 'Reviewed deploy library stable-inode tests passed'
