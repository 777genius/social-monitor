#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/bridge-fixture-lifecycle-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
export LIFECYCLE_ROOT=$FIXTURE
export LIFECYCLE_GIT
LIFECYCLE_GIT=$(command -v git)
export LIFECYCLE_RM
LIFECYCLE_RM=$(command -v rm)
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_COUNT=0
mkdir -p "$FIXTURE/bin" "$FIXTURE/tmp"

cat > "$FIXTURE/bin/git" <<'GIT'
#!/usr/bin/env bash
set -euo pipefail
[[ $1 == -C && $2 == "$LIFECYCLE_ROOT"/tmp/*/repo ]] || exit 90
repo=$2
operation=$3
if [[ $operation == commit ]]; then
  # Reject regressions before allowing any real detached writer to escape.
  for key in gc.autoDetach maintenance.autoDetach; do
    [[ $("$LIFECYCLE_GIT" -C "$repo" config --bool "$key") == false ]] || exit 91
  done
  if [[ ! -e $LIFECYCLE_ROOT/seeded ]]; then
    touch "$LIFECYCLE_ROOT/seeded"
    [[ $LIFECYCLE_MODE != seed-failure ]] || exit 73
    # Two tiny packs exceed the threshold regardless of loose-object sampling.
    "$LIFECYCLE_GIT" -C "$repo" config gc.auto 1
    "$LIFECYCLE_GIT" -C "$repo" config gc.autoPackLimit 1
    for value in one two; do
      oid=$(printf '%s' "$value" | "$LIFECYCLE_GIT" -C "$repo" hash-object -w --stdin)
      printf '%s\n' "$oid" | "$LIFECYCLE_GIT" -C "$repo" \
        pack-objects "$repo/.git/objects/pack/pack" >/dev/null
    done
  elif [[ $LIFECYCLE_MODE == commit-failure ]]; then
    exit 74
  fi
elif [[ $operation == add && ${4:-} == -A && $LIFECYCLE_MODE == add-failure ]]; then
  exit 75
fi
exec "$LIFECYCLE_GIT" "$@"
GIT
chmod +x "$FIXTURE/bin/git"
cat > "$FIXTURE/bin/rm" <<'RM'
#!/usr/bin/env bash
set -euo pipefail
if [[ $LIFECYCLE_MODE == cleanup-failure && $1 == -rf ]]; then
  printf 'injected fixture cleanup failure\n' >&2
  exit 79
fi
exec "$LIFECYCLE_RM" "$@"
RM
chmod +x "$FIXTURE/bin/rm"

# Trace2 SIDs encode the child hierarchy. Every observed GC and its writers
# must exit successfully before the owning commit exits, and GC must do work.
assert_foreground_gc() {
  awk -F '"' '
    function field(key, i) {
      for (i=2; i<NF; i+=2) if ($i==key) return $(i+2)
      return ""
    }
    /"event":"cmd_name"/ {
      sid=field("sid"); name=field("name")
      if (name=="gc" || name=="repack" || name=="pack-objects") {
        writers[sid]=1
        for (commit in finished)
          if (index(sid,commit "/")==1) bad=1
      }
      if (name=="repack") repacks++
      if (name=="commit") commits[sid]=1
    }
    /"event":"exit"/ {
      sid=field("sid")
      if (sid in writers) {
        if ($0 !~ /"code":0[,}]/) bad=1
        exited[sid]=1
      }
      if (sid in commits) {
        finished[sid]=1
        for (writer in writers)
          if (index(writer,sid "/")==1 && !(writer in exited)) bad=1
      }
    }
    END {
      for (writer in writers) if (!(writer in exited)) bad=1
      exit (bad || repacks==0)
    }
  ' "$1"
}

run_case() {
  local mode=$1 expected=$2 status=0
  local run=$FIXTURE/$mode
  mkdir -p "$run"
  # The sentinel is a plain file; never remove a repository between scenarios.
  rm -f "$FIXTURE/seeded"
  LIFECYCLE_MODE=$mode GIT_TRACE2_EVENT=$run/trace.json \
    TMPDIR=$FIXTURE/tmp PATH="$FIXTURE/bin:$PATH" \
    bash "$SCRIPT_DIR/deploy-control-bridge-runtime-helper.test.sh" \
    >"$run/output" 2>&1 || status=$?
  if [[ $status != "$expected" ]]; then
    cat "$run/output" >&2
    printf 'lifecycle %s: expected exit %s, got %s\n' "$mode" "$expected" "$status" >&2
    return 1
  fi
  if [[ $expected == 0 || $mode == cleanup-failure ]]; then
    grep -Fx 'deploy control bridge runtime helper tests passed' "$run/output" >/dev/null
    assert_foreground_gc "$run/trace.json"
  else
    if grep -F 'deploy control bridge runtime helper tests passed' "$run/output" >/dev/null; then
      printf 'lifecycle %s swallowed a fixture failure\n' "$mode" >&2
      return 1
    fi
    if [[ $mode != seed-failure ]]; then
      assert_foreground_gc "$run/trace.json"
    fi
  fi
  printf 'fixture lifecycle %s passed (exit %s)\n' "$mode" "$status"
}

run_case success 0
run_case seed-failure 73
run_case commit-failure 74
run_case add-failure 75
run_case cleanup-failure 79
printf 'deploy control bridge fixture lifecycle tests passed\n'
