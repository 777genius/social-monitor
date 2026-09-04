#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin
LC_ALL=C
export PATH LC_ALL

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/production-transition-b0-bootstrap.XXXXXX")
trap '/usr/bin/find "$FIXTURE" -depth -delete' EXIT
REPO=$FIXTURE/repo
ORIGIN=$FIXTURE/origin.git
CONTROL=$FIXTURE/control
export REPO CONTROL SOCIAL_MONITOR_DEPLOY_TEST_MODE=1

fail() { printf 'b0-bootstrap-test-error: %s\n' "$*" >&2; exit 1; }

git init --bare -q "$ORIGIN"
git init -q -b main "$REPO"
git -C "$REPO" config user.name 'B0 Bootstrap Test'
git -C "$REPO" config user.email b0-bootstrap@example.invalid
git -C "$REPO" remote add origin "$ORIGIN"
install -d "$REPO/ops/deploy" "$CONTROL"
printf 'historical control without transition bootstrap\n' > "$REPO/README"
git -C "$REPO" add README
git -C "$REPO" commit -qm 'test: historical deploy target'
HISTORICAL=$(git -C "$REPO" rev-parse HEAD)
printf '#!/usr/bin/env bash\nexit 70\n' \
  > "$REPO/ops/deploy/production-transition-admission.sh"
printf '# frozen source-only B0 host control\n' \
  > "$REPO/ops/deploy/production-transition-b0-host-control.sh"
printf '# frozen canonical verifier\n' \
  > "$REPO/ops/deploy/production-transition-canonical-lib.sh"
chmod 0755 "$REPO/ops/deploy/production-transition-admission.sh"
chmod 0644 "$REPO/ops/deploy"/{production-transition-b0-host-control.sh,production-transition-canonical-lib.sh}
git -C "$REPO" add ops/deploy
git -C "$REPO" commit -qm 'test: frozen B0 controls'
B0=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" push -q -u origin main

# shellcheck source=ops/deploy/deploy-control-bridge-lib.sh
source "$SCRIPT_DIR/deploy-control-bridge-lib.sh"
action=deploy

# Historical repair targets pre-dating the transition controls retain the
# exact current-main deployment behavior.
deploy_control_bootstrap_production_transition_b0 "$HISTORICAL"
[[ -z $(find "$CONTROL" -mindepth 1 -maxdepth 1 -print -quit) ]]

# A crash after staging one source-only library is resumed without trusting
# or rewriting any unrelated installed path.
install -m 0644 "$REPO/ops/deploy/production-transition-canonical-lib.sh" \
  "$CONTROL/production-transition-canonical-lib.sh.next"
deploy_control_bootstrap_production_transition_b0 "$B0"
[[ $(stat -c '%a' "$CONTROL/production-transition-admission.sh") == 755 ]]
[[ $(stat -c '%a' "$CONTROL/production-transition-b0-host-control.sh") == 644 ]]
[[ $(stat -c '%a' "$CONTROL/production-transition-canonical-lib.sh") == 644 ]]
for relative in production-transition-admission.sh \
  production-transition-b0-host-control.sh \
  production-transition-canonical-lib.sh; do
  [[ $(git -C "$REPO" hash-object --no-filters "$CONTROL/$relative") == \
     $(git -C "$REPO" rev-parse "$B0:ops/deploy/$relative") ]]
done

# An exact retry is a no-op, while a conflicting installed blob fails closed.
before=$(stat -c '%d:%i:%f:%s:%Y:%Z' "$CONTROL/production-transition-canonical-lib.sh")
deploy_control_bootstrap_production_transition_b0 "$B0"
[[ $(stat -c '%d:%i:%f:%s:%Y:%Z' "$CONTROL/production-transition-canonical-lib.sh") == "$before" ]]
printf 'tampered\n' > "$CONTROL/production-transition-canonical-lib.sh"
if (deploy_control_bootstrap_production_transition_b0 "$B0") 2>/dev/null; then
  fail 'conflicting installed canonical library was accepted'
fi
install -m 0644 "$REPO/ops/deploy/production-transition-canonical-lib.sh" \
  "$CONTROL/production-transition-canonical-lib.sh"

# Missing controls can only bootstrap the exact observed protected-main SHA.
rm -f "$CONTROL/production-transition-b0-host-control.sh"
printf 'later main\n' > "$REPO/later.txt"
git -C "$REPO" add later.txt
git -C "$REPO" commit -qm 'test: later protected main'
git -C "$REPO" push -q origin main
if (deploy_control_bootstrap_production_transition_b0 "$B0") 2>/dev/null; then
  fail 'stale protected-main B0 bootstrap was accepted'
fi
action=deploy-transition
deploy_control_bootstrap_production_transition_b0 "$B0"
[[ ! -e $CONTROL/production-transition-b0-host-control.sh ]]

# The current-main deploy state machine invokes bootstrap only after the exact
# target checkout, only when B0 is not already loaded, and before its legacy
# sync function can install the entrypoint.
control_library=$SCRIPT_DIR/deploy-control-lib.sh
advance_line=$(grep -nF 'advance_integration "$sha"' "$control_library" | tail -1 | cut -d: -f1)
loaded_guard_line=$(grep -nF \
  'if ! declare -F production_transition_host_failpoint >/dev/null; then' \
  "$control_library" | tail -1 | cut -d: -f1)
bootstrap_line=$(grep -nF 'deploy_control_bootstrap_production_transition_b0 "$sha"' \
  "$control_library" | tail -1 | cut -d: -f1)
sync_line=$(grep -nF 'sync_control_script "$sha"' "$control_library" | tail -1 | cut -d: -f1)
((advance_line < loaded_guard_line && loaded_guard_line < bootstrap_line && \
  bootstrap_line < sync_line))

printf 'production transition current-main B0 bootstrap test passed\n'
