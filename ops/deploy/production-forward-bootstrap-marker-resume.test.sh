#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
fixture=$(mktemp -d "${TMPDIR:-/tmp}/forward-bootstrap-marker.XXXXXX")
trap '/usr/bin/find "$fixture" -depth -delete' EXIT
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

run_contract() {
  local implementation=$1 function_source=$2
  rm -f "$STATE/postgres-pool-bootstrap.sha" \
    "$STATE/postgres-pool-bootstrap.sha.next" "$fixture/assets-ok"
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

path_hook=$fixture/path-operation-hook.sh
printf '%s\n' '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  '[[ $1 == promote ]] || exit 0' \
  'case $HOOK_ATTACK in' \
  '  in-place) printf "%s\\n" "$HOOK_REPLACEMENT" > "$2"; chmod 0600 "$2" ;;' \
  '  canonical-replacement) printf "%s\\n" "$HOOK_CANONICAL" > "$3.replacement"; chmod 0600 "$3.replacement"; mv -T "$3.replacement" "$3" ;;' \
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

# Legitimate residues from a killed link/exchange promotion reconcile only
# when both names prove the exact target or the residue is its real ancestor.
for implementation in host-control installed-entrypoint; do
  source "$SCRIPT_DIR/production-transition-marker-lib.sh"
  eval "$host_function"
  [[ $implementation != installed-entrypoint ]] || eval "$entrypoint_function"
  postgres_pool_bootstrap_physically_installed() { return 0; }
  production_transition_host_failpoint() { :; }
  rm -f "$STATE/postgres-pool-bootstrap.sha.next"
  printf '%s\n' "$new_sha" > "$STATE/postgres-pool-bootstrap.sha"
  chmod 0600 "$STATE/postgres-pool-bootstrap.sha"
  ln "$STATE/postgres-pool-bootstrap.sha" \
    "$STATE/postgres-pool-bootstrap.sha.next"
  commit_postgres_pool_bootstrap "$new_sha"
  [[ $(stat -c %h "$STATE/postgres-pool-bootstrap.sha") == 1 && \
     ! -e $STATE/postgres-pool-bootstrap.sha.next ]]
  printf '%s\n' "$old_sha" > "$STATE/postgres-pool-bootstrap.sha.next"
  chmod 0600 "$STATE/postgres-pool-bootstrap.sha.next"
  commit_postgres_pool_bootstrap "$new_sha"
  [[ ! -e $STATE/postgres-pool-bootstrap.sha.next ]]
done
printf 'production forward bootstrap link and exchange residues reconciled\n'

# D1 has F's exact tree. Replacing the already validated D1 .next with F from
# the forward-bootstrap-next hook must fail closed in both implementations.
f_sha=$new_sha
d1_sha=$(printf 'equal-tree D1\n' | git -C "$repo" commit-tree "$f_sha^{tree}" -p "$f_sha")
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
