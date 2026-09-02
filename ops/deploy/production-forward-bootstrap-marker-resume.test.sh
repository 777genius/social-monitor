#!/usr/bin/env bash
set -Eeuo pipefail
((BASH_VERSINFO[0] >= 4)) || { printf 'Bash 4+ is required\n' >&2; exit 1; }

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
fixture=$(mktemp -d "${TMPDIR:-/tmp}/forward-bootstrap-marker.XXXXXX")
cleanup() { local rc=$?; trap - EXIT; /usr/bin/find "$fixture" -depth -delete || :; exit "$rc"; }
trap cleanup EXIT
STATE=$fixture/state
install -d "$STATE"
sha=0123456789abcdef0123456789abcdef01234567

fail() { printf 'forward-bootstrap-marker-test: %s\n' "$*" >&2; exit 1; }
production_transition_host_fail() { fail "$@"; }
postgres_pool_bootstrap_installed() { [[ $1 == "$sha" && -f $fixture/assets-ok ]]; }
postgres_pool_bootstrap_physically_installed() { postgres_pool_bootstrap_installed "$1"; }

load_function() {
  local source=$1 name=$2
  awk -v signature="$name()" '
    index($0, signature) == 1 { copying=1 }
    copying {
      print
      line=$0
      opens=gsub(/\{/, "", line)
      line=$0
      closes=gsub(/\}/, "", line)
      depth += opens - closes
      if (depth == 0) exit
    }
  ' "$source"
}

expect_failure() {
  local label=$1; shift
  if ("$@") >/dev/null 2>&1; then
    fail "accepted $label"
  fi
}

expect_sigkill() {
  local label=$1 status pid; shift
  set +e
  "$@" >/dev/null 2>&1 &
  pid=$!
  wait "$pid"
  status=$?
  set -e
  [[ $status == 137 ]] || fail "$label returned $status instead of SIGKILL 137"
}

run_contract() {
  local implementation=$1 function_source=$2
  rm -f "$STATE/postgres-pool-bootstrap.sha" \
    "$STATE/postgres-pool-bootstrap.sha.next" \
    "$STATE"/postgres-pool-bootstrap.sha*.retired.* "$fixture/assets-ok"
  : > "$fixture/assets-ok"
  # shellcheck source=ops/deploy/production-transition-marker-lib.sh
  source "$SCRIPT_DIR/production-transition-marker-lib.sh"
  eval "$host_function"
  if [[ $implementation == installed-entrypoint ]]; then
    eval "$function_source"
  fi

  PRODUCTION_TRANSITION_HOST_FAILPOINT=forward-bootstrap-next
  production_transition_host_failpoint() {
    [[ ${PRODUCTION_TRANSITION_HOST_FAILPOINT:-} != "$1" ]] || return 97
  }
  expect_failure "$implementation pre-rename crash" commit_postgres_pool_bootstrap "$sha"
  [[ ! -e $STATE/postgres-pool-bootstrap.sha ]]
  [[ -f $STATE/postgres-pool-bootstrap.sha.next && \
     $(cat "$STATE/postgres-pool-bootstrap.sha.next") == "$sha" ]]

  unset PRODUCTION_TRANSITION_HOST_FAILPOINT
  commit_postgres_pool_bootstrap "$sha"
  [[ -f $STATE/postgres-pool-bootstrap.sha && \
     $(cat "$STATE/postgres-pool-bootstrap.sha") == "$sha" && \
     ! -e $STATE/postgres-pool-bootstrap.sha.next ]]

  for drift in stale malformed symlink wrong-sha missing-assets; do
    rm -f "$STATE/postgres-pool-bootstrap.sha" \
      "$STATE/postgres-pool-bootstrap.sha.next"
    : > "$fixture/assets-ok"
    case $drift in
      stale|wrong-sha) printf '%040d\n' 9 > "$STATE/postgres-pool-bootstrap.sha.next" ;;
      malformed) printf 'malformed\n' > "$STATE/postgres-pool-bootstrap.sha.next" ;;
      symlink) ln -s /dev/null "$STATE/postgres-pool-bootstrap.sha.next" ;;
      missing-assets)
        printf '%s\n' "$sha" > "$STATE/postgres-pool-bootstrap.sha.next"
        rm -f "$fixture/assets-ok"
        ;;
    esac
    expect_failure "$implementation $drift next" commit_postgres_pool_bootstrap "$sha"
    [[ -e $STATE/postgres-pool-bootstrap.sha.next || \
       -L $STATE/postgres-pool-bootstrap.sha.next ]]
  done
}

host_function=$(load_function \
  "$SCRIPT_DIR/production-transition-b0-host-control.sh" \
  commit_postgres_pool_bootstrap)
entrypoint_function=$(load_function \
  "$SCRIPT_DIR/social-monitor-production-deploy.sh" \
  commit_postgres_pool_bootstrap)
physical_function=$(load_function \
  "$SCRIPT_DIR/social-monitor-production-deploy.sh" \
  postgres_pool_bootstrap_physically_installed)
run_contract host-control "$host_function"
run_contract installed-entrypoint "$entrypoint_function"

# Exercise real committed bytes across the B-to-F marker transition. The old
# committed marker deliberately remains B while installed assets and .next are
# F; a second process must validate F itself and atomically finish the rename.
repo=$fixture/repo control=$fixture/control
REPO=$repo
CONTROL=$control
git init -q "$repo"
git -C "$repo" config core.hooksPath /dev/null
git -C "$repo" config user.name forward-bootstrap-test
git -C "$repo" config user.email forward-bootstrap-test@example.invalid
mkdir -p "$repo/ops/deploy/production-runtime" "$control"
for relative in social-monitor-production-deploy.sh social-monitor-production-ssh-wrapper.sh \
  postgres-runtime-deploy-lib.sh verify-postgres-runtime-topology.py; do
  printf 'old %s\n' "$relative" > "$repo/ops/deploy/$relative"
done
printf 'old compose\n' > "$repo/ops/deploy/production-runtime/compose.postgres-runtime.yml"
git -C "$repo" add . && git -C "$repo" commit -qm old-bootstrap
old_sha=$(git -C "$repo" rev-parse HEAD)
for relative in social-monitor-production-deploy.sh social-monitor-production-ssh-wrapper.sh \
  postgres-runtime-deploy-lib.sh verify-postgres-runtime-topology.py; do
  printf 'new %s\n' "$relative" > "$repo/ops/deploy/$relative"
done
printf 'new compose\n' > "$repo/ops/deploy/production-runtime/compose.postgres-runtime.yml"
: > "$repo/ops/deploy/postgres-pool-atomic-bootstrap-lib.sh"
git -C "$repo" add . && git -C "$repo" commit -qm new-bootstrap
new_sha=$(git -C "$repo" rev-parse HEAD)
git -C "$repo" show "$new_sha:ops/deploy/social-monitor-production-deploy.sh" > \
  "$control/github-production-deploy.sh"
git -C "$repo" show "$new_sha:ops/deploy/social-monitor-production-ssh-wrapper.sh" > \
  "$control/github-production-deploy-wrapper.sh"
printf '%s\n' "$old_sha" > "$STATE/postgres-pool-bootstrap.sha"
rm -f "$STATE/postgres-pool-bootstrap.sha.next"

run_real_fresh() {
  REPO=$repo CONTROL=$control STATE=$STATE TARGET=$new_sha \
    PRODUCTION_TRANSITION_HOST_FAILPOINT=${1:-} SOURCE=$SCRIPT_DIR/social-monitor-production-deploy.sh \
    bash -Eeuo pipefail -c '
      SCRIPT_DIR=$0
      fail() { printf "real-fresh-bootstrap: %s\n" "$*" >&2; exit 1; }
      production_transition_host_failpoint() {
        [[ ${PRODUCTION_TRANSITION_HOST_FAILPOINT:-} != "$1" ]] || return 97
      }
      load() { awk -v signature="$1()" '\''index($0,signature)==1{copy=1} copy{print; x=$0;o=gsub(/\{/,"",x);x=$0;c=gsub(/\}/,"",x);d+=o-c;if(d==0)exit}'\'' "$SOURCE"; }
      source "$SCRIPT_DIR/production-transition-marker-lib.sh"
      eval "$(load postgres_pool_bootstrap_physically_installed)"
      eval "$(load commit_postgres_pool_bootstrap)"
      commit_postgres_pool_bootstrap "$TARGET"
    ' "$SCRIPT_DIR"
}
expect_failure 'real fresh process crash after .next write' \
  run_real_fresh forward-bootstrap-next
[[ $(cat "$STATE/postgres-pool-bootstrap.sha") == "$old_sha" && \
   $(cat "$STATE/postgres-pool-bootstrap.sha.next") == "$new_sha" ]]
run_real_fresh
[[ $(cat "$STATE/postgres-pool-bootstrap.sha") == "$new_sha" && \
   ! -e $STATE/postgres-pool-bootstrap.sha.next ]]

for unsafe in stale malformed symlink missing-entrypoint mutated-wrapper; do
  printf '%s\n' "$old_sha" > "$STATE/postgres-pool-bootstrap.sha"
  rm -f "$STATE/postgres-pool-bootstrap.sha.next"
  git -C "$repo" show "$new_sha:ops/deploy/social-monitor-production-deploy.sh" > \
    "$control/github-production-deploy.sh"
  git -C "$repo" show "$new_sha:ops/deploy/social-monitor-production-ssh-wrapper.sh" > \
    "$control/github-production-deploy-wrapper.sh"
  case $unsafe in
    stale) printf '%s\n' "$old_sha" > "$STATE/postgres-pool-bootstrap.sha.next" ;;
    malformed) printf 'bad\n' > "$STATE/postgres-pool-bootstrap.sha.next" ;;
    symlink) ln -s /dev/null "$STATE/postgres-pool-bootstrap.sha.next" ;;
    missing-entrypoint)
      printf '%s\n' "$new_sha" > "$STATE/postgres-pool-bootstrap.sha.next"
      rm -f "$control/github-production-deploy.sh" ;;
    mutated-wrapper)
      printf '%s\n' "$new_sha" > "$STATE/postgres-pool-bootstrap.sha.next"
      printf 'mutated\n' >> "$control/github-production-deploy-wrapper.sh" ;;
  esac
  expect_failure "real physical $unsafe recovery" run_real_fresh
done

# A normal committed marker still uses its own SHA and rejects a marker that
# is outside the requested target's ancestry.
sibling_sha=$(printf 'sibling\n' | git -C "$repo" commit-tree "$new_sha^{tree}")
eval "$physical_function"
printf '%s\n' "$sibling_sha" > "$STATE/postgres-pool-bootstrap.sha"
expect_failure 'non-ancestor committed marker' \
  postgres_pool_bootstrap_physically_installed "$new_sha"

run_metadata_attack() (
  local implementation=$1 attack=$2 marker=$STATE/postgres-pool-bootstrap.sha
  local next=$marker.next other=$STATE/other-link
  source "$SCRIPT_DIR/production-transition-marker-lib.sh"
  eval "$host_function"
  [[ $implementation != installed-entrypoint ]] || eval "$entrypoint_function"
  postgres_pool_bootstrap_physically_installed() { return 0; }
  postgres_pool_bootstrap_installed() { return 0; }
  production_transition_host_failpoint() { :; }
  rm -f "$marker" "$next" "$other"
  printf '%s\n' "$old_sha" > "$marker"; chmod 0600 "$marker"
  case $attack in
    next-symlink) ln -s /dev/null "$next" ;;
    next-independent-hardlink)
      printf '%s\n' "$new_sha" > "$other"; chmod 0600 "$other"; ln "$other" "$next" ;;
    next-extra-hardlink)
      printf '%s\n' "$new_sha" > "$next"; chmod 0600 "$next"; ln "$next" "$other" ;;
    next-wrong-mode) printf '%s\n' "$new_sha" > "$next"; chmod 0666 "$next" ;;
    next-wrong-owner)
      printf '%s\n' "$new_sha" > "$next"; chmod 0600 "$next"
      chown 65534:65534 "$next" || return 77 ;;
    canonical-symlink) rm -f "$marker"; ln -s /dev/null "$marker" ;;
    canonical-independent-hardlink) ln "$marker" "$other" ;;
  esac
  commit_postgres_pool_bootstrap "$new_sha" force-advance
)
for implementation in host-control installed-entrypoint; do
  for attack in next-symlink next-independent-hardlink next-extra-hardlink \
      next-wrong-mode canonical-symlink canonical-independent-hardlink; do
    expect_failure "$implementation $attack" \
      run_metadata_attack "$implementation" "$attack"
  done
  if ((EUID == 0)); then
    expect_failure "$implementation next-wrong-owner" \
      run_metadata_attack "$implementation" next-wrong-owner
  fi
done
rm -f "$STATE/postgres-pool-bootstrap.sha" \
  "$STATE/postgres-pool-bootstrap.sha.next" "$STATE/other-link"
printf 'production forward bootstrap metadata attacks rejected\n'

run_lock_replacement() (
  local marker=$STATE/postgres-pool-bootstrap.sha
  source "$SCRIPT_DIR/production-transition-marker-lib.sh"
  eval "$entrypoint_function"
  postgres_pool_bootstrap_physically_installed() { return 0; }
  production_transition_host_failpoint() {
    [[ $1 == forward-bootstrap-next ]] || return 0
    mv -T "$STATE/postgres-pool-bootstrap.lock" \
      "$STATE/postgres-pool-bootstrap.lock.displaced"
    ln -s /dev/null "$STATE/postgres-pool-bootstrap.lock"
  }
  printf '%s\n' "$old_sha" > "$marker"; chmod 0600 "$marker"
  rm -f "$marker.next" "$STATE/postgres-pool-bootstrap.lock" \
    "$STATE/postgres-pool-bootstrap.lock.displaced"
  commit_postgres_pool_bootstrap "$new_sha" force-advance
)
expect_failure 'lock path replacement while held' run_lock_replacement
[[ -L $STATE/postgres-pool-bootstrap.lock && \
   $(cat "$STATE/postgres-pool-bootstrap.sha") == "$old_sha" ]]
expect_failure 'next attempt followed replaced lock symlink' \
  run_metadata_attack installed-entrypoint next-wrong-mode
rm -f "$STATE/postgres-pool-bootstrap.lock" \
  "$STATE/postgres-pool-bootstrap.lock.displaced"
printf 'production forward bootstrap lock replacement rejected\n'

run_inherited_bootstrap_release() (
  local lock=$STATE/postgres-pool-bootstrap.lock
  source "$SCRIPT_DIR/production-transition-marker-lib.sh"
  production_transition_bootstrap_lock_acquire "$lock"
  (
    PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_OWNER=$BASHPID
    production_transition_bootstrap_lock_release "$lock"
  )
  if flock -n "$lock" -c true; then
    fail 'inherited bootstrap release unlocked the live holder'
  fi
  production_transition_bootstrap_lock_release "$lock"
)
run_inherited_bootstrap_release
printf 'production forward bootstrap inherited release preserved holder lock\n'

path_hook=$fixture/path-operation-hook.sh
printf '%s\n' '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'stage=${4:-before-action}' \
  'case ${HOOK_ATTACK:-}:$1:$stage in' \
  '  in-place:promote:before-action) printf "%s\\n" "$HOOK_REPLACEMENT" > "$2"; chmod 0600 "$2" ;;' \
  '  canonical-replacement:promote:before-action) printf "%s\\n" "$HOOK_CANONICAL" > "$3.replacement"; chmod 0600 "$3.replacement"; mv -T "$3.replacement" "$3" ;;' \
  '  canonical-create:promote:promote-before-replace) printf "%s\\n" "$HOOK_CANONICAL" > "$3"; chmod 0600 "$3" ;;' \
  '  source-chmod:promote:promote-before-replace) chmod 0644 "$2" ;;' \
  '  source-post-open:promote:promote-after-open-before-retire) : > "$HOOK_SENTINEL"; printf "%s\\n" "$HOOK_REPLACEMENT" > "$2.replacement"; chmod 0600 "$2.replacement"; mv -T "$2.replacement" "$2" ;;' \
  '  canonical-post-open:promote:promote-after-open-before-retire) : > "$HOOK_SENTINEL"; printf "%s\\n" "$HOOK_CANONICAL" > "$3.replacement"; chmod 0600 "$3.replacement"; mv -T "$3.replacement" "$3" ;;' \
  '  remove-replacement:promote:remove-before-retire) printf "%s\\n" "$HOOK_REPLACEMENT" > "$2.replacement"; chmod 0600 "$2.replacement"; mv -T "$2.replacement" "$2" ;;' \
  '  remove-post-open:remove:remove-after-open-before-retire) : > "$HOOK_SENTINEL"; printf "%s\\n" "$HOOK_REPLACEMENT" > "$2.replacement"; chmod 0600 "$2.replacement"; mv -T "$2.replacement" "$2" ;;' \
  '  parent-replacement:remove:remove-before-retire) parent=$(dirname "$2"); mv -T "$parent" "$parent.displaced"; install -d "$parent"; printf "%s\\n" "$HOOK_REPLACEMENT" > "$2"; chmod 0600 "$2" ;;' \
  '  parent-promotion:promote:promote-after-link-before-next-retire) parent=$(dirname "$2"); mv -T "$parent" "$parent.displaced"; install -d "$parent"; printf "%s\\n" "$HOOK_REPLACEMENT" > "$3"; chmod 0600 "$3" ;;' \
  'esac' > "$path_hook"
chmod 0755 "$path_hook"
run_open_fd_attack() (
  local implementation=$1 attack=$2 marker=$STATE/postgres-pool-bootstrap.sha
  source "$SCRIPT_DIR/production-transition-marker-lib.sh"
  eval "$host_function"
  [[ $implementation != installed-entrypoint ]] || eval "$entrypoint_function"
  postgres_pool_bootstrap_physically_installed() { return 0; }
  production_transition_host_failpoint() { :; }
  printf '%s\n' "$old_sha" > "$marker"; chmod 0600 "$marker"
  rm -f "$marker.next" "$marker.replacement"
  export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
  export PRODUCTION_TRANSITION_PATH_OPERATION_HOOK=$path_hook
  export HOOK_ATTACK=$attack HOOK_REPLACEMENT=$f_sha HOOK_CANONICAL=$old_sha
  commit_postgres_pool_bootstrap "$d1_sha" force-advance
)

# Legitimate residues from a killed link/retirement promotion reconcile only
# when both names prove the exact target or the residue is its real ancestor.
for implementation in host-control installed-entrypoint; do
  source "$SCRIPT_DIR/production-transition-marker-lib.sh"
  eval "$host_function"
  [[ $implementation != installed-entrypoint ]] || eval "$entrypoint_function"
  postgres_pool_bootstrap_physically_installed() { return 0; }
  production_transition_host_failpoint() { :; }
  rm -f "$STATE/postgres-pool-bootstrap.sha.next" \
    "$STATE"/postgres-pool-bootstrap.sha*.retired.*
  printf '%s\n' "$new_sha" > "$STATE/postgres-pool-bootstrap.sha"
  chmod 0600 "$STATE/postgres-pool-bootstrap.sha"
  ln "$STATE/postgres-pool-bootstrap.sha" \
    "$STATE/postgres-pool-bootstrap.sha.next"
  commit_postgres_pool_bootstrap "$new_sha"
  [[ $(stat -c %h "$STATE/postgres-pool-bootstrap.sha") == 2 && \
     ! -e $STATE/postgres-pool-bootstrap.sha.next ]]
  compgen -G "$STATE/postgres-pool-bootstrap.sha.next.retired.*" >/dev/null
  rm -f "$STATE"/postgres-pool-bootstrap.sha*.retired.*
  printf '%s\n' "$old_sha" > "$STATE/postgres-pool-bootstrap.sha.next"
  chmod 0600 "$STATE/postgres-pool-bootstrap.sha.next"
  commit_postgres_pool_bootstrap "$new_sha"
  [[ ! -e $STATE/postgres-pool-bootstrap.sha.next ]]
  compgen -G "$STATE/postgres-pool-bootstrap.sha.next.retired.*" >/dev/null
done
printf 'production forward bootstrap link and exchange residues reconciled\n'

f_sha=$new_sha
d1_sha=$(printf 'equal-tree D1\n' | git -C "$repo" commit-tree "$f_sha^{tree}" -p "$f_sha")
run_marker_path_operation() {
  IMPLEMENTATION=$1 STATE=$STATE REPO=$REPO CONTROL=$CONTROL \
    SCRIPT_DIR=$SCRIPT_DIR HOST_FUNCTION=$host_function \
    ENTRYPOINT_FUNCTION=$entrypoint_function PATH_HOOK=$path_hook TARGET=$d1_sha \
    bash -Eeuo pipefail -c '
      fail() { printf "marker-kill-process: %s\n" "$*" >&2; exit 1; }
      production_transition_host_fail() { fail "$@"; }
      source "$SCRIPT_DIR/production-transition-marker-lib.sh"
      eval "$HOST_FUNCTION"
      [[ $IMPLEMENTATION != installed-entrypoint ]] || eval "$ENTRYPOINT_FUNCTION"
      postgres_pool_bootstrap_physically_installed() { return 0; }
      production_transition_host_failpoint() { :; }
      commit_postgres_pool_bootstrap "$TARGET" force-advance
    '
}

run_guarded_marker_kill() {
  KILL_STAGE=$1 EXISTING=$2 STATE=$STATE SCRIPT_DIR=$SCRIPT_DIR TARGET=$d1_sha \
    bash -Eeuo pipefail -c '
      fail() { exit 1; }
      source "$SCRIPT_DIR/production-transition-marker-lib.sh"
      export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
      export PRODUCTION_TRANSITION_PATH_OPERATION_KILL_STAGE=$KILL_STAGE
      production_transition_guarded_path_operation promote \
        "$STATE/postgres-pool-bootstrap.sha.next" "$TARGET" \
        "$STATE/postgres-pool-bootstrap.sha" "$EXISTING"
    '
}

run_marker_remove_replacement() (
  local implementation=$1
  source "$SCRIPT_DIR/production-transition-marker-lib.sh"
  eval "$host_function"
  [[ $implementation != installed-entrypoint ]] || eval "$entrypoint_function"
  postgres_pool_bootstrap_physically_installed() { return 0; }
  production_transition_host_failpoint() { :; }
  export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
  export PRODUCTION_TRANSITION_PATH_OPERATION_HOOK=$path_hook
  export HOOK_ATTACK=remove-replacement HOOK_REPLACEMENT=$d1_sha
  commit_postgres_pool_bootstrap "$d1_sha" force-advance
)

for implementation in host-control installed-entrypoint; do
  marker=$STATE/postgres-pool-bootstrap.sha; next=$marker.next
  rm -f "$marker" "$next" "$marker"*.retired.* "$next".retired.*
  printf '%s\n' "$d1_sha" > "$next"; chmod 0600 "$next"
  expect_sigkill "$implementation killed after durable link" \
    run_guarded_marker_kill promote-after-link-before-next-retire ''
  [[ -f $marker && -f $next && $(stat -c %i "$marker") == \
     $(stat -c %i "$next") && $(stat -c %h "$marker") == 2 ]]
  run_marker_path_operation "$implementation"
  [[ ! -e $next && $(cat "$marker") == "$d1_sha" ]]
  compgen -G "$next.retired.*" >/dev/null
  rm -f "$marker"*.retired.* "$next".retired.*

  printf '%s\n' "$old_sha" > "$marker"; chmod 0600 "$marker"
  rm -f "$next"
  printf '%s\n' "$d1_sha" > "$next"; chmod 0600 "$next"
  expect_sigkill "$implementation killed after replace" \
    run_guarded_marker_kill promote-after-retire-before-fsync "$old_sha"
  [[ ! -e $marker && $(cat "$next") == "$d1_sha" ]]
  compgen -G "$marker.retired.*" >/dev/null
  run_marker_path_operation "$implementation"
  [[ $(cat "$marker") == "$d1_sha" && ! -e $next ]]
  compgen -G "$next.retired.*" >/dev/null
  rm -f "$marker"*.retired.* "$next".retired.*

  ln "$marker" "$next"
  expect_sigkill "$implementation killed before duplicate retirement" \
    run_guarded_marker_kill remove-before-retire "$d1_sha"
  [[ -f $next && $(stat -c %h "$marker") == 2 ]]
  run_marker_path_operation "$implementation"
  [[ ! -e $next && $(stat -c %h "$marker") == 2 ]]
  rm -f "$marker"*.retired.* "$next".retired.*

  ln "$marker" "$next"
  expect_sigkill "$implementation killed after duplicate retirement" \
    run_guarded_marker_kill remove-after-retire-before-fsync "$d1_sha"
  [[ ! -e $next && $(cat "$marker") == "$d1_sha" ]]
  run_marker_path_operation "$implementation"
  rm -f "$marker"*.retired.* "$next".retired.*

  ln "$marker" "$next"
  marker_inode=$(stat -c %i "$marker")
  expect_failure "$implementation replacement before duplicate retirement" \
    run_marker_remove_replacement "$implementation"
  [[ -f $next && $(stat -c %i "$next") != "$marker_inode" && \
     $(cat "$next") == "$d1_sha" ]]
  rm -f "$next" "$marker"*.retired.* "$next".retired.*
done
if find "$STATE" -maxdepth 1 -name '.transition-sentinel-*' -print -quit | grep -q .; then
  fail 'random transition sentinel residue was created'
fi
printf 'production forward bootstrap SIGKILL path boundaries reconciled\n'

run_generic_marker_residues() (
  source "$SCRIPT_DIR/production-transition-marker-lib.sh"
  validate_sha() { [[ $1 =~ ^[0-9a-f]{40}$ ]]; }
  marker_value() {
    production_transition_read_regular_file "$STATE/$1.sha" "$1 marker"
  }
  generic_effect_installed() { return 0; }
  marker=$STATE/generic-effect.sha; next=$marker.next
  printf '%s\n' "$new_sha" > "$marker"; chmod 0600 "$marker"
  ln "$marker" "$next"
  production_transition_commit_effect_sha_marker \
    "$marker" "$new_sha" 'generic effect' generic_effect_installed
  [[ ! -e $next && $(cat "$marker") == "$new_sha" ]]
  printf '%s\n' "$old_sha" > "$next"; chmod 0600 "$next"
  production_transition_commit_effect_sha_marker \
    "$marker" "$new_sha" 'generic effect' generic_effect_installed
  [[ ! -e $next && $(cat "$marker") == "$new_sha" ]]

  production_transition_validate_authorization() { return 0; }
  PRODUCTION_TRANSITION_SCHEDULER_HOLD_MARKER=generic-scheduler
  authorization='version=test-scheduler-authorization'
  marker=$STATE/$PRODUCTION_TRANSITION_SCHEDULER_HOLD_MARKER; next=$marker.next
  held=$(production_transition_scheduler_hold_record held "$authorization")
  release=$(production_transition_scheduler_hold_record release-authorized "$authorization")
  export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
  production_transition_write_scheduler_hold held "$authorization"
  [[ $(cat "$marker") == "$held" && ! -e $next ]]
  compgen -G "$next.retired.*" >/dev/null
  export PRODUCTION_TRANSITION_PATH_OPERATION_KILL_STAGE=promote-after-retire-before-fsync
  expect_failure 'scheduler release predecessor retirement crash' \
    production_transition_write_scheduler_hold release-authorized "$authorization"
  unset PRODUCTION_TRANSITION_PATH_OPERATION_KILL_STAGE
  [[ ! -e $marker && $(cat "$next") == "$release" ]]
  compgen -G "$marker.retired.*" >/dev/null
  production_transition_begin_scheduler_hold "$authorization"
  [[ ! -e $next && $(cat "$marker") == "$release" ]]
  rm -f "$marker" "$next" "$marker"*.retired.* "$next".retired.*

  PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_MARKER=generic-consumption
  consumption=$STATE/$PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_MARKER
  production_transition_consumption_record() {
    printf '%s\n' \
      'version=social-monitor-production-transition-review-consumption-v2' \
      "status=$1" 'command-scope=deploy-transition' "$2"
  }
  production_transition_read_consumption_record() {
    production_transition_read_regular_file \
      "$consumption" 'transition review consumption record'
  }
  pending=$(production_transition_consumption_record pending "$authorization")
  runtime=$(production_transition_consumption_record runtime-complete "$authorization")
  printf '%s\n' "$pending" > "$consumption"; chmod 0600 "$consumption"
  printf '%s\n' "$runtime" > "$consumption.next"; chmod 0600 "$consumption.next"
  export PRODUCTION_TRANSITION_PATH_OPERATION_KILL_STAGE=promote-after-retire-before-fsync
  expect_sigkill 'consumption predecessor retirement crash' \
    production_transition_guarded_path_operation promote \
      "$consumption.next" "$runtime" "$consumption" "$pending"
  unset PRODUCTION_TRANSITION_PATH_OPERATION_KILL_STAGE
  production_transition_prove_consumption_status() { return 0; }
  production_transition_reconcile_consumption_next "$authorization"
  [[ ! -e $consumption.next && \
     $(production_transition_read_consumption_record) == "$runtime" ]]

  printf '%s\n' "$release" > "$marker"; chmod 0600 "$marker"
  printf '%s\n' "$held" > "$next"; chmod 0600 "$next"
  production_transition_reconcile_scheduler_hold_next "$authorization"
  [[ ! -e $next && $(cat "$marker") == "$release" ]]
  production_transition_validate_sha() { validate_sha "$1"; }
  production_transition_require_host_terminal_receipt() { return 0; }
  production_transition_consumption_record() { printf 'complete:%s\n' "$2"; }
  production_transition_read_consumption_record() {
    production_transition_consumption_record complete "$authorization"
  }
  production_transition_read_activation_marker() { printf '%s\n' "$new_sha"; }
  ln "$marker" "$next"
  production_transition_finalize_scheduler_hold "$new_sha" "$authorization"
  production_transition_finalize_scheduler_hold "$new_sha" "$authorization"
  [[ ! -e $marker && ! -e $next ]]
  rm -f "$marker"*.retired.* "$next".retired.*
  printf '%s\n' "$release" > "$next"; chmod 0600 "$next"
  production_transition_finalize_scheduler_hold "$new_sha" "$authorization"
  production_transition_finalize_scheduler_hold "$new_sha" "$authorization"
  [[ ! -e $marker && ! -e $next ]]
)
run_generic_marker_residues
printf 'production forward generic legacy residues reconciled\n'

run_late_path_attack() (
  local attack=$1 marker next sentinel
  marker=$STATE/late-path.sha
  next=$marker.next
  sentinel=$fixture/$attack-hook-ran
  source "$SCRIPT_DIR/production-transition-marker-lib.sh"
  rm -f "$marker" "$next" "$sentinel" "$marker"*.retired.* "$next".retired.*
  printf '%s\n' "$d1_sha" > "$next"; chmod 0600 "$next"
  stat -c %i "$next" > "$fixture/$attack-original-inode"
  export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
  export PRODUCTION_TRANSITION_PATH_OPERATION_HOOK=$path_hook
  export HOOK_ATTACK=$attack HOOK_CANONICAL=$old_sha HOOK_REPLACEMENT=$d1_sha
  export HOOK_SENTINEL=$sentinel
  production_transition_guarded_path_operation \
    promote "$next" "$d1_sha" "$marker" ''
)
expect_failure 'canonical creation after absence observation' \
  run_late_path_attack canonical-create
[[ $(cat "$STATE/late-path.sha") == "$old_sha" && \
   $(cat "$STATE/late-path.sha.next") == "$d1_sha" ]]
expect_failure 'source chmod after FD validation' run_late_path_attack source-chmod
[[ ! -e $STATE/late-path.sha && $(cat "$STATE/late-path.sha.next") == "$d1_sha" ]]
expect_failure 'source replacement after open' run_late_path_attack source-post-open
[[ -f $fixture/source-post-open-hook-ran && \
   ! -e $STATE/late-path.sha && \
   $(stat -c %i "$STATE/late-path.sha.next") != \
     $(cat "$fixture/source-post-open-original-inode") && \
   $(cat "$STATE/late-path.sha.next") == "$d1_sha" ]]

canonical_window=$fixture/canonical-window
printf '%s\n' "$old_sha" > "$canonical_window"; chmod 0600 "$canonical_window"
printf '%s\n' "$d1_sha" > "$canonical_window.next"; chmod 0600 "$canonical_window.next"
canonical_inode=$(stat -c %i "$canonical_window")
canonical_sentinel=$fixture/canonical-post-open-hook-ran
export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
export PRODUCTION_TRANSITION_PATH_OPERATION_HOOK=$path_hook
export HOOK_ATTACK=canonical-post-open HOOK_CANONICAL=$old_sha
export HOOK_SENTINEL=$canonical_sentinel
expect_failure 'canonical replacement after open' \
  production_transition_guarded_path_operation promote \
    "$canonical_window.next" "$d1_sha" "$canonical_window" "$old_sha"
canonical_receipt=$(compgen -G "$canonical_window.retired.*" | head -1)
[[ -f $canonical_sentinel && ! -e $canonical_window && \
   -f $canonical_window.next && -f $canonical_receipt && \
   $(stat -c %i "$canonical_receipt") != "$canonical_inode" && \
   $(cat "$canonical_receipt") == "$old_sha" ]]

remove_post=$fixture/remove-post-open
printf '%s\n' "$d1_sha" > "$remove_post"; chmod 0600 "$remove_post"
remove_inode=$(stat -c %i "$remove_post")
remove_sentinel=$fixture/remove-post-open-hook-ran
export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
export PRODUCTION_TRANSITION_PATH_OPERATION_HOOK=$path_hook
export HOOK_ATTACK=remove-post-open HOOK_REPLACEMENT=$d1_sha
export HOOK_SENTINEL=$remove_sentinel
expect_failure 'removal replacement after open' \
  production_transition_guarded_path_operation remove "$remove_post" "$d1_sha"
remove_receipt=$(compgen -G "$remove_post.retired.*" | head -1)
[[ -f $remove_sentinel && ! -e $remove_post && -f $remove_receipt && \
   $(stat -c %i "$remove_receipt") != "$remove_inode" && \
   $(cat "$remove_receipt") == "$d1_sha" ]]

occupied=$fixture/occupied-remove
printf '%s\n' "$d1_sha" > "$occupied"; chmod 0600 "$occupied"
digest=$(python3 -c 'import hashlib,sys; print(hashlib.sha256((sys.argv[1]+"\n").encode()).hexdigest())' "$d1_sha")
printf '%s\n' "$d1_sha" > "$occupied.retired.$digest"; chmod 0600 "$occupied.retired.$digest"
expect_failure 'preoccupied retirement receipt' \
  production_transition_guarded_path_operation remove "$occupied" "$d1_sha"
[[ -f $occupied && -f $occupied.retired.$digest && \
   $(stat -c %i "$occupied") != $(stat -c %i "$occupied.retired.$digest") ]]

parent_attack=$fixture/parent-attack
install -d "$parent_attack"
printf '%s\n' "$d1_sha" > "$parent_attack/marker"; chmod 0600 "$parent_attack/marker"
export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
export PRODUCTION_TRANSITION_PATH_OPERATION_HOOK=$path_hook
export HOOK_ATTACK=parent-replacement HOOK_REPLACEMENT=$d1_sha
expect_failure 'parent replacement before retirement' \
  production_transition_guarded_path_operation remove "$parent_attack/marker" "$d1_sha"
[[ $(cat "$parent_attack/marker") == "$d1_sha" && \
   $(cat "$parent_attack.displaced/marker") == "$d1_sha" ]]

parent_promote=$fixture/parent-promote
install -d "$parent_promote"
printf '%s\n' "$d1_sha" > "$parent_promote/marker.next"
chmod 0600 "$parent_promote/marker.next"
export HOOK_ATTACK=parent-promotion HOOK_REPLACEMENT=$old_sha
expect_failure 'parent replacement after promotion' \
  production_transition_guarded_path_operation promote \
    "$parent_promote/marker.next" "$d1_sha" "$parent_promote/marker" ''
[[ $(cat "$parent_promote/marker") == "$old_sha" && \
   $(cat "$parent_promote.displaced/marker") == "$d1_sha" ]]
unset HOOK_ATTACK PRODUCTION_TRANSITION_PATH_OPERATION_HOOK
printf 'production forward late path mutations rejected\n'

# D1 has F's exact tree. Replacing the already validated D1 .next with F from
# the forward-bootstrap-next hook must fail closed in both implementations.
run_equal_tree_mutation() (
  local implementation=$1
  source "$SCRIPT_DIR/production-transition-marker-lib.sh"
  eval "$host_function"
  if [[ $implementation == installed-entrypoint ]]; then
    eval "$entrypoint_function"
  fi
  postgres_pool_bootstrap_physically_installed() { return 0; }
  postgres_pool_bootstrap_installed() { return 0; }
  production_transition_host_failpoint() {
    [[ $1 == forward-bootstrap-next ]] || return 0
    printf '%s\n' "$f_sha" > "$STATE/postgres-pool-bootstrap.sha.next.replacement"
    chmod 0600 "$STATE/postgres-pool-bootstrap.sha.next.replacement"
    mv -T "$STATE/postgres-pool-bootstrap.sha.next.replacement" \
      "$STATE/postgres-pool-bootstrap.sha.next"
  }
  commit_postgres_pool_bootstrap "$d1_sha" force-advance
)
for implementation in host-control installed-entrypoint; do
  printf '%s\n' "$old_sha" > "$STATE/postgres-pool-bootstrap.sha"
  rm -f "$STATE/postgres-pool-bootstrap.sha.next"
  expect_failure "$implementation equal-tree F-to-D1 substitution" \
    run_equal_tree_mutation "$implementation"
  [[ $(cat "$STATE/postgres-pool-bootstrap.sha") == "$old_sha" ]]
  [[ $(cat "$STATE/postgres-pool-bootstrap.sha.next") == "$f_sha" ]]
  expect_failure "$implementation rejected substituted F residue" \
    run_equal_tree_mutation "$implementation"
  [[ $(cat "$STATE/postgres-pool-bootstrap.sha") == "$old_sha" ]]
  for attack in in-place canonical-replacement; do
    expect_failure "$implementation $attack after FD validation" \
      run_open_fd_attack "$implementation" "$attack"
    [[ $(cat "$STATE/postgres-pool-bootstrap.sha") == "$old_sha" ]]
  done
done
printf 'production forward bootstrap equal-tree substitutions rejected\n'

# The terminal proof is never allowed to fall back to the committed marker;
# every pre- and post-promotion call receives the requested D1 twice.
proof_log=$fixture/terminal-physical-proof
printf '%s\n' "$old_sha" > "$STATE/postgres-pool-bootstrap.sha"
chmod 0600 "$STATE/postgres-pool-bootstrap.sha"
rm -f "$STATE/postgres-pool-bootstrap.sha.next" "$proof_log"
source "$SCRIPT_DIR/production-transition-marker-lib.sh"
eval "$entrypoint_function"
postgres_pool_bootstrap_physically_installed() {
  printf '%s %s\n' "$1" "${2:-missing}" >> "$proof_log"
}
production_transition_host_failpoint() { :; }
commit_postgres_pool_bootstrap "$d1_sha" force-advance
[[ -s $proof_log && ! -n $(grep -Fvx "$d1_sha $d1_sha" "$proof_log") ]]
printf 'production forward bootstrap terminal physical proof is exact D1,D1\n'

# A later ordinary deploy is a new process, not the B0 handoff shell. Source
# the reviewed rolling entrypoint exactly as that process does and invoke its
# thin wrapper, proving marker-lib supplied the implementation independently.
SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT=$fixture/fresh-normal-root \
  SOCIAL_MONITOR_DEPLOY_REPO=$PROJECT_ROOT \
  SOCIAL_MONITOR_DEPLOY_CONTROL=$fixture/fresh-normal-control \
  SOCIAL_MONITOR_DEPLOY_STATE=$fixture/fresh-normal-state \
  SOCIAL_MONITOR_DEPLOY_STAGING=$fixture/fresh-normal-staging \
  SOCIAL_MONITOR_DEPLOY_RELEASES=$fixture/fresh-normal-releases \
  SOURCE=$SCRIPT_DIR/social-monitor-production-deploy.sh TARGET=$d1_sha \
  bash -Eeuo pipefail -c '
    install -d "$SOCIAL_MONITOR_DEPLOY_ROOT" "$SOCIAL_MONITOR_DEPLOY_CONTROL" \
      "$SOCIAL_MONITOR_DEPLOY_STATE"
    source "$SOURCE"
    declare -F production_transition_commit_postgres_pool_bootstrap >/dev/null
    postgres_pool_bootstrap_physically_installed() {
      [[ $1 == "$TARGET" && $2 == "$TARGET" ]]
    }
    production_transition_host_failpoint() { :; }
    commit_postgres_pool_bootstrap "$TARGET" force-advance
    [[ $(cat "$SOCIAL_MONITOR_DEPLOY_STATE/postgres-pool-bootstrap.sha") == \
       "$TARGET" ]]
  '
printf 'production forward bootstrap fresh normal invocation passed\n'
printf 'production forward bootstrap real fresh-process recovery passed\n'

printf 'production forward bootstrap marker resume test passed\n'
