#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
LC_ALL=C
export PATH LC_ALL

TARGET_SHA=1111111111111111111111111111111111111111
WRONG_TARGET_SHA=2222222222222222222222222222222222222222
REPOSITORY=777genius/social-monitor
MAIN_ENDPOINT="repos/$REPOSITORY/git/ref/heads/main"

fake_gh() {
  local endpoint=${4:-}
  {
    printf 'gh'
    printf '\t%s' "$@"
    printf '\n'
  } >> "$FAKE_GH_LOG"
  [[ ${1:-} == api && ${2:-} == --method && ${3:-} == GET && \
     $endpoint == "$MAIN_ENDPOINT" ]] || exit 93
  case $FAKE_GH_SCENARIO in
    success) printf '%s\n' "$TARGET_SHA" ;;
    wrong_main) printf '%s\n' "$WRONG_TARGET_SHA" ;;
    malformed) printf '%s\n' not-a-commit ;;
    api_failure) exit 94 ;;
    *) exit 95 ;;
  esac
}

if [[ ${GITHUB_PRODUCTION_TRANSITION_FAKE_SSH:-} == 1 && $0 == */fake-ssh ]]; then
  {
    printf 'ssh'
    printf '\t%s' "$@"
    printf '\n'
  } >> "$FAKE_SSH_LOG"
  [[ ${FAKE_SSH_SCENARIO:-success} != failure ]] || exit 97
  exit 0
fi
if [[ ${GITHUB_PRODUCTION_TRANSITION_FAKE_GH:-} == 1 ]]; then
  fake_gh "$@"
  exit
fi

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPOSITORY_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
CLIENT=$SCRIPT_DIR/github-production-deploy-client.sh
LIB=$SCRIPT_DIR/github-production-transition-client-lib.sh
REMOVED_WORKFLOW=$REPOSITORY_ROOT/.github/workflows/production-transition-admission.yml
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/github-production-transition-client-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
FAKE_GH=$FIXTURE/fake-gh
FAKE_GH_LOG=$FIXTURE/gh.log
FAKE_SSH=$FIXTURE/fake-ssh
FAKE_SSH_LOG=$FIXTURE/ssh.log
ln -s "$SCRIPT_DIR/github-production-transition-client-lib.test.sh" "$FAKE_GH"
ln -s "$SCRIPT_DIR/github-production-transition-client-lib.test.sh" "$FAKE_SSH"

export TARGET_SHA WRONG_TARGET_SHA REPOSITORY MAIN_ENDPOINT
export FAKE_GH_LOG FAKE_SSH_LOG

fail_test() {
  printf 'github-production-transition-client-test-error: %s\n' "$*" >&2
  exit 1
}

reset_fake() {
  : > "$FAKE_GH_LOG"
  : > "$FAKE_SSH_LOG"
}

run_activation() {
  local gh_scenario=$1 ssh_scenario=${2:-success}
  FAKE_GH_SCENARIO=$gh_scenario \
  FAKE_SSH_SCENARIO=$ssh_scenario \
  GITHUB_PRODUCTION_TRANSITION_FAKE_GH=1 \
  GITHUB_PRODUCTION_TRANSITION_FAKE_SSH=1 \
  PRODUCTION_TRANSITION_GH_BIN=$FAKE_GH \
  DEPLOY_HOST=deploy.example.invalid \
  DEPLOY_USER=social-monitor-deploy \
  DEPLOY_SSH_BIN=$FAKE_SSH \
  DEPLOY_SSH_DIRECTORY=$FIXTURE/ssh \
    bash "$CLIENT" deploy-transition "$TARGET_SHA"
}

expect_pre_ssh_failure() {
  local scenario=$1 pattern=$2 output
  reset_fake
  if output=$(run_activation "$scenario" 2>&1); then
    fail_test "$scenario unexpectedly succeeded"
  fi
  grep -Fq "$pattern" <<< "$output" || {
    printf '%s\n' "$output" >&2
    fail_test "$scenario did not fail with expected reason: $pattern"
  }
  [[ ! -s $FAKE_SSH_LOG ]] ||
    fail_test "$scenario reached SSH before an exact protected-main observation"
}

bash -n "$CLIENT" "$LIB" "$0"
[[ $(wc -l < "$LIB") -lt 1000 ]] || fail_test 'client library exceeds source cap'
[[ ! -e $REMOVED_WORKFLOW && ! -L $REMOVED_WORKFLOW ]] ||
  fail_test 'circular GitHub admission workflow still exists'
for source in "$CLIENT" "$LIB"; do
  if grep -Eq 'admit-transition|actions/(workflows|runs)|workflow_runs|--method POST' "$source"; then
    fail_test "legacy or workflow-controlled admission remains in ${source##*/}"
  fi
done
[[ $(grep -Fc 'run_remote deploy-transition "$target"' "$LIB") == 1 ]] ||
  fail_test 'client library must issue exactly one trusted-host transition command'
grep -Fq '[[ $observed_main == "$target" ]]' "$LIB" ||
  fail_test 'client library does not bind activation to exact observed main'

reset_fake
run_activation success >/dev/null
[[ $(wc -l < "$FAKE_GH_LOG") == 1 ]] ||
  fail_test 'activation did not perform exactly one main observation'
grep -Fq $'\tapi\t--method\tGET\trepos/777genius/social-monitor/git/ref/heads/main' \
  "$FAKE_GH_LOG" || fail_test 'activation did not use the read-only exact-main endpoint'
[[ $(wc -l < "$FAKE_SSH_LOG") == 1 ]] ||
  fail_test 'transition activation did not issue exactly one SSH command'
grep -Fq "deploy-transition $TARGET_SHA" "$FAKE_SSH_LOG" ||
  fail_test 'transition activation did not issue explicit exact-target deploy-transition'

expect_pre_ssh_failure wrong_main \
  'protected main is not the exact published transition target'
expect_pre_ssh_failure malformed \
  'protected main lease is not one full lowercase commit SHA'
expect_pre_ssh_failure api_failure \
  'protected main lease could not be read'

reset_fake
set +e
run_activation success failure >/dev/null 2>&1
ssh_status=$?
set -e
[[ $ssh_status == 97 ]] || fail_test 'trusted-host transition failure was not propagated'
[[ $(wc -l < "$FAKE_GH_LOG") == 1 && $(wc -l < "$FAKE_SSH_LOG") == 1 ]] ||
  fail_test 'trusted-host failure did not preserve one-observation/one-command semantics'

reset_fake
if legacy_output=$(bash "$CLIENT" admit-transition "$TARGET_SHA" 2>&1); then
  fail_test 'legacy admit-transition route unexpectedly succeeded'
fi
grep -Fq 'command is not in the reviewed client allowlist' <<< "$legacy_output" ||
  fail_test 'legacy admit-transition route did not fail closed'
[[ ! -s $FAKE_GH_LOG && ! -s $FAKE_SSH_LOG ]] ||
  fail_test 'legacy admit-transition route reached an external boundary'

printf 'github production transition trusted-host client tests passed\n'
