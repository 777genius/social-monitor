#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENTRYPOINT=$SCRIPT_DIR/social-monitor-production-deploy.sh
FIXTURE=$(mktemp -d /tmp/social-monitor-transition-prelude.XXXXXX)
cleanup() {
  [[ $FIXTURE == /tmp/social-monitor-transition-prelude.* ]] || return 1
  /usr/bin/rm -rf -- "$FIXTURE"
}
trap cleanup EXIT
REPO=$FIXTURE/repo
ORIGIN=$FIXTURE/origin.git
ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
ADMISSION_LOG=$FIXTURE/admission.log
PRELUDE_SENTINEL=$FIXTURE/prelude-ran

git init --bare -q "$ORIGIN"
git init -q -b main "$REPO"
git -C "$REPO" config user.name 'Transition Prelude Test'
git -C "$REPO" config user.email transition-prelude@example.invalid
git -C "$REPO" remote add origin "$ORIGIN"
install -d "$REPO/ops/deploy" "$STATE"
cp "$ENTRYPOINT" "$REPO/ops/deploy/social-monitor-production-deploy.sh"
cp "$SCRIPT_DIR/production-transition-b0-host-control.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/production-transition-canonical-lib.sh" "$REPO/ops/deploy/"
chmod 0644 "$REPO/ops/deploy"/{production-transition-b0-host-control.sh,production-transition-canonical-lib.sh}
printf '%s\n' '# frozen deploy control' > "$REPO/ops/deploy/deploy-control-lib.sh"
printf '%s\n' '# candidate prelude' > "$REPO/ops/deploy/postgres-runtime-deploy-lib.sh"
printf '%s\n' '#!/usr/bin/env bash' 'exit 1' > \
  "$REPO/ops/deploy/social-monitor-production-ssh-wrapper.sh"
cat > "$REPO/ops/deploy/production-transition-admission.sh" <<'ADMISSION'
#!/usr/bin/env bash
printf '%s\n' admission-called >> "${SOCIAL_MONITOR_PRELUDE_ADMISSION_LOG:?}"
exit 70
ADMISSION
chmod 0755 "$REPO/ops/deploy/production-transition-admission.sh"
cat > "$REPO/ops/deploy/production-transition-protected.manifest" <<'MANIFEST'
version=social-monitor-production-transition-protected-paths-v1
100644:ops/deploy/deploy-control-lib.sh
MANIFEST
git -C "$REPO" add ops/deploy
git -C "$REPO" commit -qm 'test: frozen B0 controls'
git -C "$REPO" push -q -u origin main
BASE=$(git -C "$REPO" rev-parse HEAD)

install -m 0755 "$REPO/ops/deploy/social-monitor-production-deploy.sh" \
  "$CONTROL/github-production-deploy.sh"
install -m 0755 "$REPO/ops/deploy/social-monitor-production-ssh-wrapper.sh" \
  "$CONTROL/github-production-deploy-wrapper.sh"
install -m 0755 "$REPO/ops/deploy/production-transition-admission.sh" \
  "$CONTROL/production-transition-admission.sh"
install -m 0644 "$REPO/ops/deploy/production-transition-b0-host-control.sh" \
  "$CONTROL/production-transition-b0-host-control.sh"
install -m 0644 "$REPO/ops/deploy/production-transition-canonical-lib.sh" \
  "$CONTROL/production-transition-canonical-lib.sh"
printf '%s\n' "$BASE" > "$STATE/control.sha"

cat >> "$REPO/ops/deploy/postgres-runtime-deploy-lib.sh" <<'SENTINEL'
printf '%s\n' candidate-prelude-ran >> "${SOCIAL_MONITOR_PRELUDE_SENTINEL:?}"
SENTINEL
git -C "$REPO" add ops/deploy/postgres-runtime-deploy-lib.sh
git -C "$REPO" commit -qm 'test: candidate unprotected prelude'
git -C "$REPO" push -q origin main
TARGET=$(git -C "$REPO" rev-parse HEAD)

run_transition() {
  run_command deploy-transition "$1"
}

run_command() {
  local action=$1 target=$2
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
  SOCIAL_MONITOR_DEPLOY_TEST_A0="$BASE" \
  SOCIAL_MONITOR_PRELUDE_ADMISSION_LOG="$ADMISSION_LOG" \
  SOCIAL_MONITOR_PRELUDE_SENTINEL="$PRELUDE_SENTINEL" \
    bash "$ENTRYPOINT" "$action" "$target"
}

set +e
output=$(run_transition "$TARGET" 2>&1)
status=$?
set -e
((status != 0))
grep -F 'trusted transition admission rejected target' <<< "$output" >/dev/null
[[ $(cat "$ADMISSION_LOG") == admission-called ]]
[[ ! -e $PRELUDE_SENTINEL ]]

cat >> "$REPO/ops/deploy/deploy-control-lib.sh" <<'SENTINEL'
printf '%s\n' candidate-control-ran >> "${SOCIAL_MONITOR_PRELUDE_SENTINEL:?}"
SENTINEL
git -C "$REPO" add ops/deploy/deploy-control-lib.sh
git -C "$REPO" commit -qm 'test: candidate protected control'
git -C "$REPO" push -q origin main
TARGET=$(git -C "$REPO" rev-parse HEAD)
rm -f "$ADMISSION_LOG"
set +e
output=$(run_transition "$TARGET" 2>&1)
status=$?
set -e
((status != 0))
grep -F 'protected B0 trust blob changed or is missing' <<< "$output" >/dev/null
[[ ! -e $ADMISSION_LOG && ! -e $PRELUDE_SENTINEL ]]

git -C "$REPO" reset --hard -q "$BASE"
printf '%s\n' clean-target > "$REPO/README"
git -C "$REPO" add README
git -C "$REPO" commit -qm 'test: clean admitted target'
git -C "$REPO" push -q --force origin HEAD:main
TARGET=$(git -C "$REPO" rev-parse HEAD)
TARGET_TREE=$(git -C "$REPO" rev-parse "$TARGET^{tree}")
printf 'version=production-transition-b0-host-state-v1\nstatus=admitted\ntrusted-base=%s\ntarget=%s\ntarget-tree=%s\n' \
  "$BASE" "$TARGET" "$TARGET_TREE" > \
  "$STATE/production-transition-b0-host.state"
chmod 0600 "$STATE/production-transition-b0-host.state"
cat >> "$REPO/ops/deploy/deploy-control-lib.sh" <<'SENTINEL'
printf '%s\n' dirty-admitted-prelude-ran >> "${SOCIAL_MONITOR_PRELUDE_SENTINEL:?}"
exit 86
SENTINEL
set +e
output=$(run_transition "$TARGET" 2>&1)
status=$?
set -e
((status != 0 && status != 86))
grep -F 'backend runtime health library is not an authorized regular blob' \
  <<< "$output" >/dev/null
[[ ! -e $PRELUDE_SENTINEL ]]

git -C "$REPO" restore ops/deploy/deploy-control-lib.sh
sed -i 's/^status=admitted$/status=terminal/' \
  "$STATE/production-transition-b0-host.state"
cat >> "$REPO/ops/deploy/postgres-runtime-deploy-lib.sh" <<'SENTINEL'
printf '%s\n' unsigned-descendant-ran >> "${SOCIAL_MONITOR_PRELUDE_SENTINEL:?}"
exit 87
SENTINEL
git -C "$REPO" add ops/deploy/postgres-runtime-deploy-lib.sh
git -C "$REPO" commit -qm 'test: unpublished local descendant'
set +e
output=$(run_command deploy "$TARGET" 2>&1)
status=$?
set -e
((status != 0 && status != 87))
grep -F 'production prelude current commit is not authenticated origin main history' \
  <<< "$output" >/dev/null
[[ ! -e $PRELUDE_SENTINEL ]]
printf '%s\n' 'Production transition prelude authority tests passed'
