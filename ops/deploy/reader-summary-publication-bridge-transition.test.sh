#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
INSTALLED_CONTROLLER=c59a0b54099c78eda2a8a3b022f438f6a30d2a46
PUBLICATION_LIBRARY=ops/deploy/reader-summary-publication-deploy-lib.sh
BACKUP_LIBRARY=ops/deploy/postgres-backup-deploy-lib.sh
BRIDGE_PATHS=(
  ops/deploy/deploy-control-lib.sh
  ops/deploy/social-monitor-production-deploy.sh
  ops/deploy/postgres-runtime-deploy-lib.sh
)
FIXTURE=$(mktemp -d \
  "${TMPDIR:-/tmp}/reader-summary-publication-c59-transition.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

ORIGIN=$FIXTURE/origin.git
SYNTHESIS_REPO=$FIXTURE/synthesis
INSTALLED_ENTRYPOINT=$FIXTURE/installed-c59-entrypoint.sh

git -C "$PROJECT_ROOT" cat-file -e "$INSTALLED_CONTROLLER^{commit}"
git -C "$PROJECT_ROOT" show \
  "$INSTALLED_CONTROLLER:ops/deploy/social-monitor-production-deploy.sh" \
  > "$INSTALLED_ENTRYPOINT"

git clone --bare --shared -q "$PROJECT_ROOT" "$ORIGIN"
git --git-dir="$ORIGIN" update-ref refs/heads/main "$INSTALLED_CONTROLLER"
git --git-dir="$ORIGIN" symbolic-ref HEAD refs/heads/main
git clone --no-checkout --shared -q "$ORIGIN" "$SYNTHESIS_REPO"
git -C "$SYNTHESIS_REPO" config user.name 'c59 Backup Transition Contract'
git -C "$SYNTHESIS_REPO" config user.email c59-backup@example.invalid
git -C "$SYNTHESIS_REPO" sparse-checkout init --cone
git -C "$SYNTHESIS_REPO" sparse-checkout set \
  .github ops/deploy apps/api-gateway prisma
git -C "$SYNTHESIS_REPO" checkout -q -B main "$INSTALLED_CONTROLLER"

# Every synthetic target is backend/runtime-control classified, while the
# installed entrypoint and both installed bridge libraries stay literal c59.
printf '\n# target runtime activation\n' >> \
  "$SYNTHESIS_REPO/ops/deploy/production-runtime/daily-run.sh"
printf '%s\n' 'target backend activation' \
  > "$SYNTHESIS_REPO/apps/api-gateway/pre-migration-backup-target.txt"
git -C "$SYNTHESIS_REPO" rm -q "$PUBLICATION_LIBRARY"
git -C "$SYNTHESIS_REPO" add \
  ops/deploy/production-runtime/daily-run.sh \
  apps/api-gateway/pre-migration-backup-target.txt
git -C "$SYNTHESIS_REPO" commit -qm \
  'test: target missing publication blob'
PUBLICATION_MISSING_BLOB_SHA=$(git -C "$SYNTHESIS_REPO" rev-parse HEAD)

ln -s ../../README.md "$SYNTHESIS_REPO/$PUBLICATION_LIBRARY"
git -C "$SYNTHESIS_REPO" add "$PUBLICATION_LIBRARY"
git -C "$SYNTHESIS_REPO" commit -qm \
  'test: target publication symlink blob'
PUBLICATION_SYMLINK_BLOB_SHA=$(git -C "$SYNTHESIS_REPO" rev-parse HEAD)

rm "$SYNTHESIS_REPO/$PUBLICATION_LIBRARY"
cat > "$SYNTHESIS_REPO/$PUBLICATION_LIBRARY" <<'LIBRARY'
#!/usr/bin/env bash

# Intentionally lacks deploy_reader_summary_publication_migrations.
LIBRARY
git -C "$SYNTHESIS_REPO" add "$PUBLICATION_LIBRARY"
git -C "$SYNTHESIS_REPO" commit -qm \
  'test: target publication entrypoint missing'
PUBLICATION_MISSING_ENTRYPOINT_SHA=$(git -C "$SYNTHESIS_REPO" rev-parse HEAD)

cp "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" \
  "$SYNTHESIS_REPO/$PUBLICATION_LIBRARY"
cp "$SCRIPT_DIR/reader-summary-publication-system-dsn-bootstrap-lib.sh" \
  "$SYNTHESIS_REPO/ops/deploy/reader-summary-publication-system-dsn-bootstrap-lib.sh"
git -C "$SYNTHESIS_REPO" add "$PUBLICATION_LIBRARY" \
  ops/deploy/reader-summary-publication-system-dsn-bootstrap-lib.sh
git -C "$SYNTHESIS_REPO" commit -qm \
  'test: target missing PostgreSQL backup blob'
BACKUP_MISSING_BLOB_SHA=$(git -C "$SYNTHESIS_REPO" rev-parse HEAD)

ln -s ../../README.md "$SYNTHESIS_REPO/$BACKUP_LIBRARY"
git -C "$SYNTHESIS_REPO" add "$BACKUP_LIBRARY"
git -C "$SYNTHESIS_REPO" commit -qm \
  'test: target PostgreSQL backup symlink blob'
BACKUP_SYMLINK_BLOB_SHA=$(git -C "$SYNTHESIS_REPO" rev-parse HEAD)

rm "$SYNTHESIS_REPO/$BACKUP_LIBRARY"
cat > "$SYNTHESIS_REPO/$BACKUP_LIBRARY" <<'LIBRARY'
#!/usr/bin/env bash

# Intentionally lacks create_pre_migration_database_backup.
LIBRARY
git -C "$SYNTHESIS_REPO" add "$BACKUP_LIBRARY"
git -C "$SYNTHESIS_REPO" commit -qm \
  'test: target PostgreSQL backup entrypoint missing'
BACKUP_MISSING_ENTRYPOINT_SHA=$(git -C "$SYNTHESIS_REPO" rev-parse HEAD)

cp "$SCRIPT_DIR/postgres-backup-deploy-lib.sh" \
  "$SYNTHESIS_REPO/$BACKUP_LIBRARY"
git -C "$SYNTHESIS_REPO" add "$BACKUP_LIBRARY"
git -C "$SYNTHESIS_REPO" commit -qm \
  'test: authenticated target publication and backup wrapper'
FINAL_SHA=$(git -C "$SYNTHESIS_REPO" rev-parse HEAD)
git -C "$SYNTHESIS_REPO" push -q origin HEAD:main

TARGET_SHAS=(
  "$PUBLICATION_MISSING_BLOB_SHA"
  "$PUBLICATION_SYMLINK_BLOB_SHA"
  "$PUBLICATION_MISSING_ENTRYPOINT_SHA"
  "$BACKUP_MISSING_BLOB_SHA"
  "$BACKUP_SYMLINK_BLOB_SHA"
  "$BACKUP_MISSING_ENTRYPOINT_SHA"
  "$FINAL_SHA"
)
for target_sha in "${TARGET_SHAS[@]}"; do
  for bridge_path in "${BRIDGE_PATHS[@]}"; do
    cmp -s \
      <(git -C "$SYNTHESIS_REPO" show \
        "$INSTALLED_CONTROLLER:$bridge_path") \
      <(git -C "$SYNTHESIS_REPO" show "$target_sha:$bridge_path") || {
      echo "target $target_sha changes installed c59 bridge: $bridge_path" >&2
      exit 1
    }
  done
done

create_case_checkout() {
  local name=$1
  local case_root=$FIXTURE/case-$name
  local case_repo=$case_root/integration

  install -d "$case_root"
  git clone --no-checkout --shared -q "$ORIGIN" "$case_repo"
  git -C "$case_repo" sparse-checkout init --cone
  git -C "$case_repo" sparse-checkout set \
    .github ops/deploy apps/api-gateway prisma
  git -C "$case_repo" checkout -q --detach "$INSTALLED_CONTROLLER"
  printf '%s\n' "$case_root"
}

install_post_merge_mutation_hook() {
  local case_repo=$1
  local hook=$case_repo/.git/hooks/post-merge

  cat > "$hook" <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
root=$(git rev-parse --show-toplevel)
publication=$root/ops/deploy/reader-summary-publication-deploy-lib.sh
backup=$root/ops/deploy/postgres-backup-deploy-lib.sh
printf 'advance %s\n' "$(git rev-parse HEAD)" >> "$BRIDGE_EVENTS"
case ${BRIDGE_MUTATION:-correct} in
  correct|publication-preloaded|publication-missing-entrypoint|helper-outside|helper-non-root|helper-preloaded|helper-missing-entrypoint)
    ;;
  publication-target-missing|publication-target-symlink)
    rm -f "$publication"
    cat > "$publication" <<'LIBRARY'
#!/usr/bin/env bash
deploy_reader_summary_publication_migrations() { :; }
LIBRARY
    ;;
  publication-worktree-missing)
    rm -f "$publication"
    ;;
  publication-filesystem-symlink)
    rm -f "$publication"
    ln -s "$root/README.md" "$publication"
    ;;
  publication-outside)
    external=$root/../outside-deploy
    rm -rf "$external"
    mv "$root/ops/deploy" "$external"
    ln -s "$external" "$root/ops/deploy"
    ;;
  publication-unreadable)
    chmod 000 "$publication"
    ;;
  publication-mutated)
    printf '%s\n' '# mutation after reviewed checkout' >> "$publication"
    ;;
  helper-target-missing|helper-target-symlink)
    rm -f "$backup"
    cat > "$backup" <<'LIBRARY'
#!/usr/bin/env bash
create_pre_migration_database_backup() { :; }
LIBRARY
    ;;
  helper-worktree-missing)
    rm -f "$backup"
    ;;
  helper-filesystem-symlink)
    rm -f "$backup"
    ln -s "$root/README.md" "$backup"
    ;;
  helper-wrong-mode)
    chmod 600 "$backup"
    ;;
  helper-mutated)
    printf '%s\n' '# mutation after reviewed checkout' >> "$backup"
    ;;
  *)
    exit 94
    ;;
esac
HOOK
  chmod 0755 "$hook"
}

run_target_case() {
  local target_sha=$1
  local mutation=$2
  local expected_error=$3
  local expected_status=$4
  local case_root case_repo case_control case_state case_events case_output
  local case_status

  case_root=$(create_case_checkout "${mutation}-${target_sha:0:12}")
  case_repo=$case_root/integration
  case_control=$case_root/control
  case_state=$case_control/deploy-state
  case_events=$case_root/events
  install -d "$case_control" "$case_state" \
    "$case_root/runtime/deploy-staging"
  cp "$INSTALLED_ENTRYPOINT" "$case_control/github-production-deploy.sh"
  chmod 0755 "$case_control/github-production-deploy.sh"
  for component in frontend backend control; do
    printf '%s\n' "$INSTALLED_CONTROLLER" > "$case_state/$component.sha"
  done
  install_post_merge_mutation_hook "$case_repo"

  set +e
  # shellcheck disable=SC2016
  case_output=$(
    TARGET_SHA="$target_sha" BRIDGE_MUTATION="$mutation" \
    BRIDGE_EVENTS="$case_events" \
    SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
    SOCIAL_MONITOR_DEPLOY_ROOT="$case_root" \
    SOCIAL_MONITOR_DEPLOY_REPO="$case_repo" \
    SOCIAL_MONITOR_DEPLOY_CONTROL="$case_control" \
    SOCIAL_MONITOR_DEPLOY_STATE="$case_state" \
      bash -c '
        source "$SOCIAL_MONITOR_DEPLOY_CONTROL/github-production-deploy.sh"
        helper_path=$SOCIAL_MONITOR_DEPLOY_REPO/ops/deploy/postgres-backup-deploy-lib.sh
        if [[ $BRIDGE_MUTATION == publication-preloaded ]]; then
          deploy_reader_summary_publication_migrations() { :; }
        elif [[ $BRIDGE_MUTATION == helper-preloaded ]]; then
          create_pre_migration_database_backup() { :; }
        fi
        readlink() {
          local last_argument=${!#}
          if [[ $BRIDGE_MUTATION == helper-outside &&
                $last_argument == "$helper_path" ]]; then
            printf "%s\n" "$SOCIAL_MONITOR_DEPLOY_REPO/../outside-backup-library.sh"
          else
            command readlink "$@"
          fi
        }
        stat() {
          local last_argument=${!#}
          local owner mode
          if [[ $1 == -c && $2 == "%u %a" &&
                $last_argument == "$helper_path" ]]; then
            owner=0
            [[ $BRIDGE_MUTATION != helper-non-root ]] || owner=65534
            mode=$(command stat -c "%a" "$last_argument")
            printf "%s %s\n" "$owner" "$mode"
          else
            command stat "$@"
          fi
        }
        sync_control_script() {
          declare -F deploy_reader_summary_publication_migrations >/dev/null
          declare -F create_pre_migration_database_backup >/dev/null
          declare -f backup_database |
            grep -F "create_pre_migration_database_backup \"\$@\"" >/dev/null
          create_pre_migration_database_backup() {
            printf "backup\n" >> "$BRIDGE_EVENTS"
          }
          printf "sync\n" >> "$BRIDGE_EVENTS"
        }
        commit_postgres_pool_bootstrap() { :; }
        snapshot_postgres_runtime_control() {
          local snapshot=$SOCIAL_MONITOR_DEPLOY_STATE/runtime-snapshot
          install -d "$snapshot"
          printf "snapshot\n" >> "$BRIDGE_EVENTS"
          printf "%s\n" "$snapshot"
        }
        activate_postgres_runtime_control() {
          printf "activation\n" >> "$BRIDGE_EVENTS"
        }
        verify_compose_scope() {
          printf "verify\n" >> "$BRIDGE_EVENTS"
        }
        deploy_backend() {
          printf "backend\n" >> "$BRIDGE_EVENTS"
          backup_database "$1"
          printf "%s\n" "$1" > "$SOCIAL_MONITOR_DEPLOY_STATE/backend.sha"
        }
        restore_postgres_runtime_control() {
          printf "restore\n" >> "$BRIDGE_EVENTS"
          return 95
        }
        rollback_backend_images() {
          printf "rollback\n" >> "$BRIDGE_EVENTS"
          return 96
        }
        deploy_release "$TARGET_SHA"
      ' 2>&1
  )
  case_status=$?
  set -e

  if [[ $expected_status == success ]]; then
    ((case_status == 0)) || {
      printf 'success case failed: %s\n' "$case_output" >&2
      exit 1
    }
    grep -F \
      "deployed=$target_sha frontend=false backend=true control=true" \
      <<< "$case_output" >/dev/null
    [[ $(cat "$case_events") == \
      $'advance '"$target_sha"$'\nsync\nsnapshot\nactivation\nverify\nbackend\nbackup' ]]
    [[ $(cat "$case_state/backend.sha") == "$target_sha" ]]
    [[ $(cat "$case_state/control.sha") == "$target_sha" ]]
  else
    ((case_status != 0)) || {
      echo "$mutation unexpectedly succeeded" >&2
      exit 1
    }
    grep -F "$expected_error" <<< "$case_output" >/dev/null || {
      printf 'missing expected error for %s: %s\n' \
        "$mutation" "$case_output" >&2
      exit 1
    }
    [[ $(cat "$case_events") == "advance $target_sha" ]] || {
      printf '%s reached work after advance: %q\n' \
        "$mutation" "$(cat "$case_events")" >&2
      exit 1
    }
    [[ $(cat "$case_state/backend.sha") == "$INSTALLED_CONTROLLER" ]]
    [[ $(cat "$case_state/control.sha") == "$INSTALLED_CONTROLLER" ]]
  fi
}

# Existing publication-library target/worktree mutation and preload boundaries
# remain fail-closed under the literal installed c59 bridge.
run_target_case "$PUBLICATION_MISSING_BLOB_SHA" publication-target-missing \
  'target commit publication deploy library is not a regular blob' failure
run_target_case "$PUBLICATION_SYMLINK_BLOB_SHA" publication-target-symlink \
  'target commit publication deploy library is not a regular blob' failure
run_target_case "$PUBLICATION_MISSING_ENTRYPOINT_SHA" \
  publication-missing-entrypoint \
  'target publication deploy library is missing its migration entrypoint' failure
run_target_case "$FINAL_SHA" publication-worktree-missing \
  'target publication deploy library is not a regular non-symlink file' failure
run_target_case "$FINAL_SHA" publication-filesystem-symlink \
  'target publication deploy library is not a regular non-symlink file' failure
run_target_case "$FINAL_SHA" publication-outside \
  'target publication deploy library is outside integration' failure
run_target_case "$FINAL_SHA" publication-unreadable \
  'target publication deploy library is unreadable' failure
run_target_case "$FINAL_SHA" publication-mutated \
  'target publication deploy library differs from reviewed target' failure
run_target_case "$FINAL_SHA" publication-preloaded \
  'publication migration entrypoint was loaded before target validation' failure

# Every helper failure must stop immediately after c59 advances integration;
# no sync, snapshot, activation, verification, backend, backup, or marker write.
run_target_case "$BACKUP_MISSING_BLOB_SHA" helper-target-missing \
  'target commit PostgreSQL backup deploy library is not a regular blob' failure
run_target_case "$BACKUP_SYMLINK_BLOB_SHA" helper-target-symlink \
  'target commit PostgreSQL backup deploy library is not a regular blob' failure
run_target_case "$FINAL_SHA" helper-worktree-missing \
  'target PostgreSQL backup deploy library is not a regular non-symlink file' failure
run_target_case "$FINAL_SHA" helper-filesystem-symlink \
  'target PostgreSQL backup deploy library is not a regular non-symlink file' failure
run_target_case "$FINAL_SHA" helper-outside \
  'target PostgreSQL backup deploy library is outside its canonical integration path' failure
run_target_case "$FINAL_SHA" helper-wrong-mode \
  'target PostgreSQL backup deploy library mode does not match its target Git mode' failure
run_target_case "$FINAL_SHA" helper-non-root \
  'target PostgreSQL backup deploy library is not root-owned' failure
run_target_case "$FINAL_SHA" helper-mutated \
  'target PostgreSQL backup deploy library differs from reviewed target' failure
run_target_case "$BACKUP_MISSING_ENTRYPOINT_SHA" helper-missing-entrypoint \
  'target PostgreSQL backup deploy library is missing its backup entrypoint' failure
run_target_case "$FINAL_SHA" helper-preloaded \
  'PostgreSQL backup entrypoint was loaded before target validation' failure
run_target_case "$FINAL_SHA" correct '' success

# The current controller preserves the authenticated c59 seam ordering:
# advance, source target, then sync and enter the runtime transaction.
# shellcheck disable=SC2016
advance_line=$(grep -nF 'advance_integration "$sha"' \
  "$PROJECT_ROOT/ops/deploy/deploy-control-lib.sh" | tail -1 | cut -d: -f1)
# shellcheck disable=SC2016
load_line=$(grep -nF \
  'load_target_reader_summary_publication_deploy_library "$sha"' \
  "$PROJECT_ROOT/ops/deploy/deploy-control-lib.sh" | tail -1 | cut -d: -f1)
# shellcheck disable=SC2016
sync_line=$(grep -nF 'sync_control_script "$sha"' \
  "$PROJECT_ROOT/ops/deploy/deploy-control-lib.sh" | tail -1 | cut -d: -f1)
# shellcheck disable=SC2016
transaction_line=$(grep -nF \
  'deploy_release_runtime_transaction "$sha" "$backend" "$runtime_control"' \
  "$PROJECT_ROOT/ops/deploy/deploy-control-lib.sh" | tail -1 | cut -d: -f1)
((advance_line < load_line && load_line < sync_line && \
  sync_line < transaction_line))

echo 'Literal c59 pre-migration backup bridge transition tests passed'
