#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin
export GIT_AUTHOR_NAME='Production Bridge Fixture'
export GIT_AUTHOR_EMAIL='production-bridge-fixture@example.invalid'
export GIT_COMMITTER_NAME=$GIT_AUTHOR_NAME
export GIT_COMMITTER_EMAIL=$GIT_AUTHOR_EMAIL

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_REPO=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)
BASE=92afd97328c5412324c99be635de2c41db589d53
OLD_HEAD=72e17ded1e54ebd77772929fd5047ef6816dded2
OLD_FRONTEND=eaac8ad433bc9741f493e61354b3dfe1c3161224
OLD_BACKEND=09a79687e042e36d4ec9c1f33f0367527f044181
OLD_CONTROL=3f4a561e9fd6626bbd1a1e1ca73f2ec7eb34c8f8
OLD_POOL=6fefa9da5446d5e467badcc7239fdc5a6170a756
DRIVER_PATH=ops/deploy/production-control-bridge-preinstall-driver.sh

fail() { printf 'test deploy failure: %s\n' "$*" >&2; exit 1; }
FIXTURE=$(mktemp -d)
trap 'rm -rf "$FIXTURE"' EXIT
SOURCE_REPO=$FIXTURE/reviewed-source
git clone -q "$PROJECT_REPO" "$SOURCE_REPO"
if [[ -n $(git -C "$PROJECT_REPO" status --porcelain=v1 --untracked-files=all) ]]; then
  if ! git -C "$PROJECT_REPO" diff --quiet HEAD --; then
    git -C "$PROJECT_REPO" diff --binary HEAD -- | git -C "$SOURCE_REPO" apply
  fi
  while IFS= read -r untracked; do
    install -d "$SOURCE_REPO/$(dirname "$untracked")"
    cp "$PROJECT_REPO/$untracked" "$SOURCE_REPO/$untracked"
  done < <(git -C "$PROJECT_REPO" ls-files --others --exclude-standard)
  git -C "$SOURCE_REPO" add -A
  git -C "$SOURCE_REPO" commit -qm 'test: synthesize production bridge remediation'
  reviewed_source=$(git -C "$SOURCE_REPO" rev-parse HEAD)
  # shellcheck source=ops/deploy/deploy-control-bridge-lib.sh
  source "$SOURCE_REPO/ops/deploy/deploy-control-bridge-lib.sh"
  remediation_tree=$(REPO="$SOURCE_REPO" \
    deploy_control_production_bridge_expected_tree "$reviewed_source")
  remediation_target=$(printf '%s\n' \
    'test: synthesize exact direct production bridge candidate' | \
    git -C "$SOURCE_REPO" commit-tree "$remediation_tree" -p "$BASE")
  git -C "$SOURCE_REPO" checkout -q --detach "$remediation_target"
fi
TARGET=$(git -C "$SOURCE_REPO" rev-parse HEAD)
TREE=$(git -C "$SOURCE_REPO" rev-parse 'HEAD^{tree}')
DRIVER_ENTRY=$(git -C "$SOURCE_REPO" ls-tree HEAD -- "$DRIVER_PATH")
read -r DRIVER_MODE _ DRIVER_BLOB _ <<< "$DRIVER_ENTRY"
[[ $(git -C "$SOURCE_REPO" rev-parse HEAD^) == "$BASE" && \
   $(git -C "$SOURCE_REPO" rev-list --parents -n 1 HEAD | wc -w) == 2 && \
   $DRIVER_MODE == 100755 ]] || fail 'test requires the exact committed bridge shape'

CHECKOUT=$FIXTURE/checkout
INTEGRATION=$FIXTURE/integration
ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
STAGING=$ROOT/runtime/deploy-staging
RELEASES=$ROOT/runtime/frontend-releases
STAGES=$FIXTURE/stages
HOOK=$FIXTURE/preinstall-hook.sh
TRUSTED=$FIXTURE/trusted-operator.sh

git clone -q --no-checkout "$SOURCE_REPO" "$CHECKOUT"
git -C "$CHECKOUT" checkout -q "$TARGET"
git -C "$CHECKOUT" update-ref refs/remotes/origin/main "$TARGET"
git clone -q --no-checkout "$SOURCE_REPO" "$INTEGRATION"

cat > "$TRUSTED" <<'TRUSTED_OPERATOR'
#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin
fail() { printf 'trusted-bootstrap-error: %s\n' "$*" >&2; exit 1; }
[[ $# == 6 ]] || fail 'expected checkout, merged SHA, parent, tree, driver blob, and mode'
checkout=$(readlink -f "$1")
target=$2
parent=$3
tree=$4
driver_blob=$5
driver_mode=$6
relative=ops/deploy/production-control-bridge-preinstall-driver.sh
[[ $target =~ ^[0-9a-f]{40}$ && $parent =~ ^[0-9a-f]{40}$ && \
   $tree =~ ^[0-9a-f]{40}$ && $driver_blob =~ ^[0-9a-f]{40}$ && \
   $driver_mode == 100755 ]] || fail 'out-of-band manifest is malformed'
[[ -d $checkout && ! -L $checkout && \
   $(git -C "$checkout" rev-parse --verify HEAD) == "$target" && \
   $(git -C "$checkout" rev-parse --verify refs/remotes/origin/main) == "$target" && \
   $(git -C "$checkout" rev-parse 'HEAD^') == "$parent" && \
   $(git -C "$checkout" rev-list --parents -n 1 HEAD | wc -w) == 2 && \
   $(git -C "$checkout" rev-parse 'HEAD^{tree}') == "$tree" && \
   -z $(git -C "$checkout" status --porcelain=v1 --untracked-files=all) ]] || \
  fail 'checkout identity is not the reviewed merged release'
entry=$(git -C "$checkout" ls-tree HEAD -- "$relative")
read -r mode type blob path <<< "$entry"
driver=$checkout/$relative
[[ -f $driver && ! -L $driver && $mode == "$driver_mode" && $type == blob && \
   $blob == "$driver_blob" && $path == "$relative" && \
   $(git -C "$checkout" hash-object --no-filters "$driver") == "$driver_blob" ]] || \
  fail 'tracked preinstall driver is not the reviewed executable'
exec "$driver" "$target" "$parent" "$tree" "$driver_blob" "$driver_mode"
TRUSTED_OPERATOR
chmod 0755 "$TRUSTED"

cat > "$HOOK" <<'TEST_HOOK'
acquire_postgres_admission_with_daily_priority() { flock -w 10 "$1"; }
initialize_deploy_control_bridge() { printf 'initialize\n' >> "$PRODUCTION_CONTROL_BRIDGE_TEST_STAGES"; }
verify_deploy_control_bridge_compatibility() { printf 'sealed\n' >> "$PRODUCTION_CONTROL_BRIDGE_TEST_STAGES"; }
deploy_release_runtime_transaction() {
  [[ $2 == false && $3 == false ]] || return 1
  printf 'runtime-no-activation:%s:%s\n' "$2" "$3" >> "$PRODUCTION_CONTROL_BRIDGE_TEST_STAGES"
}
commit_postgres_pool_bootstrap() {
  umask 077
  printf '%s\n' "$1" > "$STATE/postgres-pool-bootstrap.sha"
  chmod 0644 "$STATE/postgres-pool-bootstrap.sha"
  printf 'pool\n' >> "$PRODUCTION_CONTROL_BRIDGE_TEST_STAGES"
}
production_control_bridge_after_journal_read() {
  [[ ${PRODUCTION_CONTROL_BRIDGE_TEST_REPLACE_JOURNAL:-} != 1 ]] || {
    cp "$1" "$1.replacement"
    chmod 0600 "$1.replacement"
    mv -f "$1.replacement" "$1"
  }
}
TEST_HOOK
chmod 0644 "$HOOK"

reset_host() {
  git -C "$INTEGRATION" checkout -q "$OLD_HEAD"
  rm -rf "$ROOT"
  install -d "$CONTROL" "$STATE" "$STAGING" "$RELEASES"
  : > "$CONTROL/production-deploy.lock"
  : > "$CONTROL/daily-run.lock"
  git -C "$INTEGRATION" show "$OLD_POOL:ops/deploy/social-monitor-production-deploy.sh" \
    > "$CONTROL/github-production-deploy.sh"
  git -C "$INTEGRATION" show "$OLD_POOL:ops/deploy/social-monitor-production-ssh-wrapper.sh" \
    > "$CONTROL/github-production-deploy-wrapper.sh"
  chmod 0755 "$CONTROL/github-production-deploy.sh" "$CONTROL/github-production-deploy-wrapper.sh"
  git -C "$INTEGRATION" show "$OLD_CONTROL:ops/deploy/host/refresh-codex-auth.sh" \
    > "$CONTROL/refresh-codex-auth.sh"
  git -C "$INTEGRATION" show "$OLD_CONTROL:ops/deploy/production-runtime/x-collector.Dockerfile" \
    > "$CONTROL/x-collector.Dockerfile"
  chmod 0700 "$CONTROL/refresh-codex-auth.sh"
  chmod 0644 "$CONTROL/x-collector.Dockerfile"
  printf '%s\n' "$OLD_FRONTEND" > "$STATE/frontend.sha"
  printf '%s\n' "$OLD_BACKEND" > "$STATE/backend.sha"
  printf '%s\n' "$OLD_CONTROL" > "$STATE/control.sha"
  printf '%s\n' "$OLD_POOL" > "$STATE/postgres-pool-bootstrap.sha"
  chmod 0644 "$STATE"/*.sha
  : > "$STAGES"
}

run_trusted() {
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$INTEGRATION" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
  SOCIAL_MONITOR_DEPLOY_RELEASES="$RELEASES" \
  PRODUCTION_CONTROL_BRIDGE_TEST_HOOK="$HOOK" \
  PRODUCTION_CONTROL_BRIDGE_TEST_STAGES="$STAGES" \
  PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE="${PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE:-}" \
  PRODUCTION_CONTROL_BRIDGE_TEST_REPLACE_JOURNAL="${PRODUCTION_CONTROL_BRIDGE_TEST_REPLACE_JOURNAL:-}" \
  PRODUCTION_CONTROL_BRIDGE_ABORT_AFTER_MUTATION="${PRODUCTION_CONTROL_BRIDGE_ABORT_AFTER_MUTATION:-}" \
  PRODUCTION_CONTROL_BRIDGE_ABORT_AFTER_CONTROL_FILE="${PRODUCTION_CONTROL_BRIDGE_ABORT_AFTER_CONTROL_FILE:-}" \
  "$TRUSTED" "$CHECKOUT" "$TARGET" "$BASE" "$TREE" "$DRIVER_BLOB" "$DRIVER_MODE"
}

run_trusted_with_timeout() {
  timeout 5 env \
    SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
    SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
    SOCIAL_MONITOR_DEPLOY_REPO="$INTEGRATION" \
    SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
    SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
    SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
    SOCIAL_MONITOR_DEPLOY_RELEASES="$RELEASES" \
    PRODUCTION_CONTROL_BRIDGE_TEST_HOOK="$HOOK" \
    PRODUCTION_CONTROL_BRIDGE_TEST_STAGES="$STAGES" \
    PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE="${PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE:-}" \
    PRODUCTION_CONTROL_BRIDGE_TEST_REPLACE_JOURNAL="${PRODUCTION_CONTROL_BRIDGE_TEST_REPLACE_JOURNAL:-}" \
    PRODUCTION_CONTROL_BRIDGE_ABORT_AFTER_MUTATION="${PRODUCTION_CONTROL_BRIDGE_ABORT_AFTER_MUTATION:-}" \
    PRODUCTION_CONTROL_BRIDGE_ABORT_AFTER_CONTROL_FILE="${PRODUCTION_CONTROL_BRIDGE_ABORT_AFTER_CONTROL_FILE:-}" \
    "$TRUSTED" "$CHECKOUT" "$TARGET" "$BASE" "$TREE" "$DRIVER_BLOB" "$DRIVER_MODE"
}

snapshot_bridge_host() {
  git -C "$INTEGRATION" rev-parse HEAD
  for path in "$CONTROL/github-production-deploy.sh" \
    "$CONTROL/github-production-deploy-wrapper.sh" \
    "$STATE/frontend.sha" "$STATE/backend.sha" "$STATE/control.sha" \
    "$STATE/postgres-pool-bootstrap.sha" \
    "$STATE/production-control-bridge-$TARGET.transaction"; do
    [[ ! -e $path && ! -L $path ]] || {
      stat -c '%n:%d:%i:%f:%s:%Y:%Z' "$path"
      sha256sum "$path"
    }
  done
}

assert_trusted_rejected() {
  local label=$1; shift
  if "$TRUSTED" "$@" >/dev/null 2>&1; then fail "$label was admitted by external authentication"; fi
}

# Outer authentication rejects every independently reviewed binding before the
# target driver can execute.
assert_trusted_rejected 'wrong SHA' "$CHECKOUT" "${TARGET%?}0" "$BASE" "$TREE" "$DRIVER_BLOB" "$DRIVER_MODE"
assert_trusted_rejected 'wrong parent' "$CHECKOUT" "$TARGET" "${BASE%?}0" "$TREE" "$DRIVER_BLOB" "$DRIVER_MODE"
assert_trusted_rejected 'wrong tree' "$CHECKOUT" "$TARGET" "$BASE" "${TREE%?}0" "$DRIVER_BLOB" "$DRIVER_MODE"
assert_trusted_rejected 'wrong driver blob' "$CHECKOUT" "$TARGET" "$BASE" "$TREE" "${DRIVER_BLOB%?}0" "$DRIVER_MODE"
assert_trusted_rejected 'wrong driver mode' "$CHECKOUT" "$TARGET" "$BASE" "$TREE" "$DRIVER_BLOB" 100644
printf 'dirty\n' > "$CHECKOUT/untracked"
assert_trusted_rejected 'dirty checkout' "$CHECKOUT" "$TARGET" "$BASE" "$TREE" "$DRIVER_BLOB" "$DRIVER_MODE"
rm "$CHECKOUT/untracked"
sibling=$(printf 'same tree sibling\n' | git -C "$CHECKOUT" commit-tree "$TREE" -p "$BASE")
git -C "$CHECKOUT" checkout -q "$sibling"
git -C "$CHECKOUT" update-ref refs/remotes/origin/main "$sibling"
assert_trusted_rejected 'same-tree sibling SHA' "$CHECKOUT" "$TARGET" "$BASE" "$TREE" "$DRIVER_BLOB" "$DRIVER_MODE"
git -C "$CHECKOUT" checkout -q "$TARGET"
git -C "$CHECKOUT" update-ref refs/remotes/origin/main "$TARGET"

# The automatic bridge push is stopped before the workflow configures SSH;
# only an exact-SHA dispatch acknowledgement can reach receipt inspection.
GATE=$SOURCE_REPO/ops/deploy/production-control-bridge-workflow-gate.sh
if (cd "$SOURCE_REPO" && bash "$GATE" push '' "$TARGET") >/dev/null 2>&1; then fail 'exact bridge push was admitted'; fi
(cd "$SOURCE_REPO" && bash "$GATE" workflow_dispatch \
  "production-control-bridge-bootstrap-complete:$TARGET" "$TARGET") >/dev/null
if (cd "$SOURCE_REPO" && bash "$GATE" workflow_dispatch \
    "production-control-bridge-bootstrap-complete:$BASE" "$TARGET") >/dev/null 2>&1; then
  fail 'wrong exact-SHA acknowledgement was admitted'
fi
if (cd "$SOURCE_REPO" && bash "$GATE" workflow_dispatch \
    "production-control-bridge-bootstrap-complete:$OLD_HEAD" "$OLD_HEAD") >/dev/null 2>&1; then
  fail 'bridge acknowledgement was admitted for a non-bridge target'
fi
workflow=$SOURCE_REPO/.github/workflows/production-deploy.yml
gate_line=$(grep -n 'Stop exact bridge push before any production SSH' "$workflow" | cut -d: -f1)
ssh_line=$(awk -v gate="$gate_line" 'NR > gate && /Configure restricted production SSH/ { print NR; exit }' "$workflow")
receipt_line=$(awk -v gate="$gate_line" 'NR > gate && /Capture exact control-bridge completion evidence/ { print NR; exit }' "$workflow")
[[ $gate_line -lt $ssh_line && $ssh_line -lt $receipt_line ]] || \
  fail 'workflow bridge gate or receipt inspection is ordered unsafely'

# A journal may only be created from the exact clean reviewed integration.
# Pre-existing tracked drift is not confused with a resumable bridge crash.
reset_host
drift_path=ops/deploy/deploy-control-lib.sh
printf '\n# pre-existing integration drift\n' >> "$INTEGRATION/$drift_path"
integration_before=$(git -C "$INTEGRATION" status --porcelain=v1; \
  sha256sum "$INTEGRATION/$drift_path")
if run_trusted >/dev/null 2>&1; then fail 'dirty pre-mutation integration was admitted'; fi
integration_after=$(git -C "$INTEGRATION" status --porcelain=v1; \
  sha256sum "$INTEGRATION/$drift_path")
[[ $integration_after == "$integration_before" && \
   ! -e $STATE/production-control-bridge-$TARGET.transaction ]] || \
  fail 'dirty pre-mutation integration rejection changed host state'
git -C "$INTEGRATION" checkout -- "$drift_path"

# Each kill window occurs after the host mutation and before its journal phase
# commit. The retry must reconcile the exact new state and complete.
for boundary in INTEGRATION_ADVANCED CONTROL_SYNCED RUNTIME_VERIFIED \
  POOL_MARKER_COMMITTED CONTROL_MARKER_COMMITTED RECEIPT_COMMITTED; do
  reset_host
  if PRODUCTION_CONTROL_BRIDGE_FAIL_AFTER_MUTATION=$boundary run_trusted >/dev/null 2>&1; then
    fail "failure injection after $boundary unexpectedly completed"
  fi
  retry_output=$(run_trusted 2>&1) || \
    fail "resume after $boundary failed: $retry_output"
  [[ $(git -C "$INTEGRATION" rev-parse HEAD) == "$TARGET" && \
     $(<"$STATE/frontend.sha") == "$OLD_FRONTEND" && \
     $(<"$STATE/backend.sha") == "$OLD_BACKEND" && \
     $(<"$STATE/control.sha") == "$TARGET" && \
     $(<"$STATE/postgres-pool-bootstrap.sha") == "$TARGET" ]] || \
    fail "resume after $boundary produced the wrong poststate"
  [[ $(grep -c '^pool$' "$STAGES") == 1 && \
     $(grep '^runtime-no-activation:' "$STAGES" | sort -u) == 'runtime-no-activation:false:false' ]] || \
    fail "resume after $boundary duplicated an activating phase"
done

# SIGKILL in the real integration mutation leaves HEAD old and the index/worktree
# partially advanced. The next locked invocation deterministically repairs it.
reset_host
set +e
PRODUCTION_CONTROL_BRIDGE_ABORT_AFTER_MUTATION=INTEGRATION_INDEX_REWRITTEN \
  run_trusted >/dev/null 2>&1
abrupt_status=$?
set -e
((abrupt_status == 137)) || fail "integration SIGKILL fixture returned $abrupt_status"
[[ $(git -C "$INTEGRATION" rev-parse HEAD) == "$OLD_HEAD" && \
   -n $(git -C "$INTEGRATION" status --porcelain=v1) ]] || \
  fail 'integration SIGKILL did not produce the expected resumable dirty state'
stale_index_lock=$(git -C "$INTEGRATION" rev-parse \
  --path-format=absolute --git-path index.lock)
: > "$stale_index_lock"
chmod 0600 "$stale_index_lock"
run_trusted >/dev/null
[[ $(git -C "$INTEGRATION" rev-parse HEAD) == "$TARGET" && \
   ! -e $stale_index_lock && \
   -z $(git -C "$INTEGRATION" status --porcelain=v1 --untracked-files=all) ]] || \
  fail 'integration SIGKILL recovery did not restore the exact target'

# Every control destination is copied from an already-open reviewed descriptor.
# Kill after each real durable rename and prove the mixed state resumes safely.
for control_path in \
  ops/deploy/social-monitor-production-deploy.sh \
  ops/deploy/social-monitor-production-ssh-wrapper.sh \
  ops/deploy/host/refresh-codex-auth.sh \
  ops/deploy/production-runtime/x-collector.Dockerfile; do
  reset_host
  case $control_path in
    ops/deploy/social-monitor-production-deploy.sh)
      chmod 0644 "$CONTROL/github-production-deploy.sh" ;;
    ops/deploy/social-monitor-production-ssh-wrapper.sh)
      chmod 0644 "$CONTROL/github-production-deploy-wrapper.sh" ;;
    ops/deploy/host/refresh-codex-auth.sh)
      chmod 0644 "$CONTROL/refresh-codex-auth.sh" ;;
    ops/deploy/production-runtime/x-collector.Dockerfile)
      chmod 0600 "$CONTROL/x-collector.Dockerfile" ;;
  esac
  set +e
  PRODUCTION_CONTROL_BRIDGE_ABORT_AFTER_CONTROL_FILE=$control_path \
    run_trusted >/dev/null 2>&1
  abrupt_status=$?
  set -e
  ((abrupt_status == 137)) || \
    fail "control sync SIGKILL fixture returned $abrupt_status for $control_path"
  run_trusted >/dev/null
done

# A matching symlink can otherwise survive phase validation because git hashes
# its target bytes. Every replacement destination must reject that alias before
# rename, leaving both the link and its real target unchanged.
for destination_name in \
  github-production-deploy.sh \
  github-production-deploy-wrapper.sh \
  refresh-codex-auth.sh \
  x-collector.Dockerfile; do
  reset_host
  destination=$CONTROL/$destination_name
  destination_target=$FIXTURE/$destination_name.symlink-target
  cp -p --dereference "$destination" "$destination_target"
  rm "$destination"
  ln -s "$destination_target" "$destination"
  link_before=$(stat -c '%d:%i:%f:%s:%Y:%Z' "$destination"; readlink "$destination")
  target_before=$(stat -c '%d:%i:%f:%s:%Y:%Z' "$destination_target"; \
    sha256sum "$destination_target")
  set +e
  symlink_error=$(run_trusted 2>&1)
  symlink_status=$?
  set -e
  ((symlink_status != 0)) || \
    fail "symlinked control destination was admitted: $destination_name"
  grep -F "destination is not an ordinary regular file" <<< "$symlink_error" >/dev/null || \
    fail "symlinked control destination missed replacement guard: $destination_name"
  [[ -L $destination && \
     $(stat -c '%d:%i:%f:%s:%Y:%Z' "$destination"; readlink "$destination") == \
       "$link_before" && \
     $(stat -c '%d:%i:%f:%s:%Y:%Z' "$destination_target"; \
       sha256sum "$destination_target") == "$target_before" ]] || \
    fail "symlinked control destination or target changed: $destination_name"
done

# Non-regular and multiply-linked destinations are rejected before hashing can
# block on them and before the reviewed replacement can mutate either inode.
reset_host
fifo_destination=$CONTROL/github-production-deploy.sh
rm "$fifo_destination"
mkfifo "$fifo_destination"
fifo_before=$(stat -c '%d:%i:%f:%s:%Y:%Z' "$fifo_destination")
set +e
fifo_error=$(run_trusted_with_timeout 2>&1)
fifo_status=$?
set -e
((fifo_status != 0 && fifo_status != 124)) || \
  fail "FIFO control destination did not reject promptly (status $fifo_status)"
grep -F 'destination is not an ordinary regular file' <<< "$fifo_error" >/dev/null || \
  fail 'FIFO control destination missed regular-file guard'
[[ -p $fifo_destination && \
   $(stat -c '%d:%i:%f:%s:%Y:%Z' "$fifo_destination") == "$fifo_before" ]] || \
  fail 'FIFO control destination changed during rejection'

reset_host
hardlink_destination=$CONTROL/github-production-deploy.sh
hardlink_alias=$FIXTURE/github-production-deploy.sh.destination-alias
ln "$hardlink_destination" "$hardlink_alias"
hardlink_before=$(stat -c '%n:%d:%i:%f:%s:%h:%Y:%Z' \
  "$hardlink_destination" "$hardlink_alias"; \
  sha256sum "$hardlink_destination" "$hardlink_alias")
set +e
hardlink_error=$(run_trusted 2>&1)
hardlink_status=$?
set -e
((hardlink_status != 0)) || fail 'exact hard-linked control destination was admitted'
grep -F 'destination must not be hard linked' <<< "$hardlink_error" >/dev/null || \
  fail 'exact hard-linked control destination missed link-count guard'
[[ $(stat -c '%n:%d:%i:%f:%s:%h:%Y:%Z' \
      "$hardlink_destination" "$hardlink_alias"; \
      sha256sum "$hardlink_destination" "$hardlink_alias") == "$hardlink_before" ]] || \
  fail 'exact hard-linked control destination or alias changed during rejection'

reset_host
directory_destination=$CONTROL/github-production-deploy.sh
rm "$directory_destination"
install -d "$directory_destination"
printf 'preserve\n' > "$directory_destination/sentinel"
directory_before=$(find "$directory_destination" -mindepth 1 -maxdepth 1 \
  -printf '%f:%y:%s\n' | LC_ALL=C sort; \
  sha256sum "$directory_destination/sentinel")
set +e
directory_error=$(run_trusted 2>&1)
directory_status=$?
set -e
((directory_status != 0)) || fail 'directory control destination was admitted'
grep -F 'destination is not an ordinary regular file' <<< "$directory_error" >/dev/null || \
  fail 'directory control destination missed regular-file guard'
[[ $(find "$directory_destination" -mindepth 1 -maxdepth 1 \
      -printf '%f:%y:%s\n' | LC_ALL=C sort; \
      sha256sum "$directory_destination/sentinel") == "$directory_before" ]] || \
  fail 'directory control destination contents changed during rejection'

# SIGKILL after a synced marker rename leaves the older journal phase durable;
# a fresh invocation must reconcile that exact inode and finish once.
reset_host
set +e
PRODUCTION_CONTROL_BRIDGE_ABORT_AFTER_MUTATION=CONTROL_MARKER_COMMITTED \
  run_trusted >/dev/null 2>&1
abrupt_status=$?
set -e
((abrupt_status == 137)) || fail "abrupt bridge fixture returned $abrupt_status instead of SIGKILL"
run_trusted >/dev/null
[[ $(<"$STATE/control.sha") == "$TARGET" && \
   $(<"$STATE/postgres-pool-bootstrap.sha") == "$TARGET" && \
   $(grep -c '^pool$' "$STAGES") == 1 ]] || \
  fail 'abrupt bridge recovery did not preserve the durable marker transition'

# All evaluated candidate libraries were already-open reviewed blobs. Mutating
# the checkout after staging cannot change the functions that execute.
reset_host
PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE=ops/deploy/production-host-policy-lib.sh \
  run_trusted >/dev/null
[[ -z $(git -C "$CHECKOUT" status --porcelain=v1 --untracked-files=all) ]] || \
  fail 'reviewed source mutation fixture did not restore the candidate checkout'
reset_host
PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE=ops/deploy/postgres-runtime-weekly-timer-state-lib.sh \
  run_trusted >/dev/null
[[ -z $(git -C "$CHECKOUT" status --porcelain=v1 --untracked-files=all) ]] || \
  fail 'transitive reviewed source mutation fixture did not restore the candidate checkout'

# O_NOFOLLOW lock opens reject symlinks without truncating their targets or
# advancing any repository, marker, control, or journal state.
reset_host
lock_target=$FIXTURE/lock-target
printf 'lock-target-sentinel\n' > "$lock_target"
rm "$CONTROL/production-deploy.lock"
ln -s "$lock_target" "$CONTROL/production-deploy.lock"
lock_before=$(snapshot_bridge_host; stat -c '%d:%i:%f:%s:%Y:%Z' "$lock_target"; sha256sum "$lock_target")
if run_trusted >/dev/null 2>&1; then fail 'symlinked deployment lock was admitted'; fi
lock_after=$(snapshot_bridge_host; stat -c '%d:%i:%f:%s:%Y:%Z' "$lock_target"; sha256sum "$lock_target")
[[ $lock_after == "$lock_before" ]] || fail 'symlinked deployment lock changed host state'

# Linux lock descriptors must be single-link regular inodes; a hard link can
# otherwise let an untrusted name alias a trusted lock and defeat lock scope.
reset_host
hardlink_alias=$CONTROL/production-deploy.lock.alias
ln "$CONTROL/production-deploy.lock" "$hardlink_alias"
lock_before=$(snapshot_bridge_host; stat -c '%d:%i:%h' "$CONTROL/production-deploy.lock" "$hardlink_alias")
if run_trusted >/dev/null 2>&1; then fail 'hard-linked deployment lock was admitted'; fi
lock_after=$(snapshot_bridge_host; stat -c '%d:%i:%h' "$CONTROL/production-deploy.lock" "$hardlink_alias")
[[ $lock_after == "$lock_before" ]] || fail 'hard-linked lock rejection changed host state'

# The two lock names may not alias the same inode. This independently proves
# that deployment and PostgreSQL admission cannot collapse into one lock scope.
reset_host
rm "$CONTROL/daily-run.lock"
ln "$CONTROL/production-deploy.lock" "$CONTROL/daily-run.lock"
lock_before=$(snapshot_bridge_host; stat -c '%d:%i:%h' \
  "$CONTROL/production-deploy.lock" "$CONTROL/daily-run.lock")
if run_trusted >/dev/null 2>&1; then fail 'aliased deployment locks were admitted'; fi
lock_after=$(snapshot_bridge_host; stat -c '%d:%i:%h' \
  "$CONTROL/production-deploy.lock" "$CONTROL/daily-run.lock")
[[ $lock_after == "$lock_before" ]] || fail 'aliased lock rejection changed host state'

# Every mutable host endpoint is rejected when its directory itself is
# group-writable; the driver checks the complete chain before sourcing target
# libraries or opening locks.
for unsafe_directory in "$ROOT" "$ROOT/runtime" "$CONTROL" "$INTEGRATION" \
  "$STATE" "$STAGING" "$RELEASES"; do
  reset_host
  chmod g+w "$unsafe_directory"
  unsafe_before=$(snapshot_bridge_host)
  if run_trusted >/dev/null 2>&1; then fail "group-writable directory was admitted: $unsafe_directory"; fi
  unsafe_after=$(snapshot_bridge_host)
  [[ $unsafe_after == "$unsafe_before" ]] || \
    fail "unsafe directory rejection changed host state: $unsafe_directory"
  chmod g-w "$unsafe_directory"
done

# An exact but non-monotonic mixture is rejected and remains resumable after
# the unexpected state is repaired.
reset_host
PRODUCTION_CONTROL_BRIDGE_FAIL_AFTER=INTEGRATION_ADVANCED run_trusted >/dev/null 2>&1 || true
printf '%s\n' "$TARGET" > "$STATE/backend.sha"
mixed_before=$(snapshot_bridge_host)
if run_trusted >/dev/null 2>&1; then fail 'mixed partial host state was admitted'; fi
mixed_after=$(snapshot_bridge_host)
[[ $mixed_after == "$mixed_before" ]] || \
  fail 'mixed partial host state rejection produced a side effect'
printf '%s\n' "$OLD_BACKEND" > "$STATE/backend.sha"
run_trusted >/dev/null

# Journal field names and cardinality are part of the authenticated state.
# A renamed key or an extra record must fail closed instead of being treated as
# a resumable transaction.
for journal_tamper in renamed-key extra-record blank-fifth-sixth missing-newline wrong-mode stable-inode; do
  reset_host
  PRODUCTION_CONTROL_BRIDGE_FAIL_AFTER=PREPARED run_trusted >/dev/null 2>&1 || true
  journal=$STATE/production-control-bridge-$TARGET.transaction
  case $journal_tamper in
    renamed-key) sed -i '2s/^target=/tampered_target=/' "$journal" ;;
    extra-record) printf 'unexpected=value\n' >> "$journal" ;;
    blank-fifth-sixth) printf '\n\n' >> "$journal" ;;
    missing-newline) truncate -s -1 "$journal" ;;
    wrong-mode) chmod 0644 "$journal" ;;
    stable-inode) export PRODUCTION_CONTROL_BRIDGE_TEST_REPLACE_JOURNAL=1 ;;
  esac
  if run_trusted >/dev/null 2>&1; then
    fail "$journal_tamper journal tampering was admitted"
  fi
  unset PRODUCTION_CONTROL_BRIDGE_TEST_REPLACE_JOURNAL
done

# Restore the exact completed state for ordinary-deploy no-op verification.
reset_host
run_trusted >/dev/null

# A completed ordinary exact-SHA deploy returns before the real sync function.
# Preserve identities for every sync destination and every release marker.
before=$(for path in \
  "$CONTROL/github-production-deploy.sh" \
  "$CONTROL/github-production-deploy-wrapper.sh" \
  "$CONTROL/refresh-codex-auth.sh" \
  "$CONTROL/x-collector.Dockerfile" \
  "$STATE/frontend.sha" "$STATE/backend.sha" "$STATE/control.sha" \
  "$STATE/postgres-pool-bootstrap.sha"; do stat -c '%n:%d:%i:%s:%Y:%Z' "$path"; sha256sum "$path"; done)
ordinary_output=$(SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" SOCIAL_MONITOR_DEPLOY_REPO="$INTEGRATION" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" SOCIAL_MONITOR_DEPLOY_RELEASES="$RELEASES" \
  bash -c 'set -euo pipefail;
    [[ -z ${PRODUCTION_CONTROL_BRIDGE_CHECKOUT+x} ]];
    source "$1/ops/deploy/social-monitor-production-deploy.sh";
    target=$2; fetch_main() { :; }; validate_main_commit() { [[ $1 == "$target" ]]; };
    acquire_postgres_admission_with_daily_priority() { flock -w 10 "$1"; };
    deploy_release "$target"' bash "$INTEGRATION" "$TARGET")
after=$(for path in \
  "$CONTROL/github-production-deploy.sh" \
  "$CONTROL/github-production-deploy-wrapper.sh" \
  "$CONTROL/refresh-codex-auth.sh" \
  "$CONTROL/x-collector.Dockerfile" \
  "$STATE/frontend.sha" "$STATE/backend.sha" "$STATE/control.sha" \
  "$STATE/postgres-pool-bootstrap.sha"; do stat -c '%n:%d:%i:%s:%Y:%Z' "$path"; sha256sum "$path"; done)
[[ $before == "$after" && $ordinary_output == already-deployed-control-bridge=* ]] || \
  fail 'completed ordinary deploy was not a true pre-sync no-op'

receipt=$STATE/production-control-bridge-$TARGET.receipt
[[ -f $receipt && ! -L $receipt && $(stat -c '%a' "$receipt") == 444 && \
   $(tail -1 "$receipt") =~ ^evidence_sha256=[0-9a-f]{64}$ ]] || \
  fail 'completion evidence is not exact and read-only'

printf 'production control bridge external-auth, crash-resume, receipt, and no-op tests passed\n'
