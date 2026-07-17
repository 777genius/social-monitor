#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
LEGACY_BACKEND=c071bcbe2b0ef1ecab48db5bcfab281c4745f778
LEGACY_FRONTEND=a6c4f0019d8a95875837bae251c379c45f40074d
LEGACY_CONTROLLER=7185a5d02366437b5ad9146c3ae178d62c50101d
FIXTURE=$(mktemp -d \
  "${TMPDIR:-/tmp}/reader-summary-publication-bridge.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

ORIGIN=$FIXTURE/origin.git
REPO=$FIXTURE/integration
ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
INSTALLED=$CONTROL/github-production-deploy.sh
LEGACY_ENTRYPOINT=$FIXTURE/legacy-7185-controller.sh
PUBLICATION_LIBRARY=ops/deploy/reader-summary-publication-deploy-lib.sh
BRIDGE_PATHS=(
  ops/deploy/social-monitor-production-deploy.sh
  ops/deploy/deploy-control-lib.sh
  ops/deploy/postgres-runtime-deploy-lib.sh
)
LEGACY_FRONTEND_PATHS=(
  apps/frontend
  libs/contracts/rest
)
LEGACY_BACKEND_PATHS=(
  Dockerfile
  .dockerignore
  docker-compose.yml
  package.json
  package-lock.json
  tsconfig.json
  tsconfig.build.json
  prisma.config.ts
  prisma
  vendor
  libs
  apps/api-gateway
  apps/agent-runtime
  apps/ingestion-worker
  apps/intelligence-worker
  apps/delivery-service
  apps/event-relay
  apps/x-collector
  apps/social-research-runtime
  apps/social-research-grpc
  apps/social-research-mcp
  scripts
  ops/evals
  test
)
LEGACY_CONTROL_PATHS=(
  .github/workflows/production-deploy.yml
  ops/deploy
  ops/recovery/backup-restore-contract.json
)
BRIDGE_RELEASE_PATHS=(
  "${BRIDGE_PATHS[@]}"
  .github/workflows/production-deploy.yml
  ops/deploy/README.md
  ops/deploy/reader-summary-publication-bridge-transition.test.sh
)

git -C "$PROJECT_ROOT" cat-file -e "$LEGACY_BACKEND^{commit}"
git -C "$PROJECT_ROOT" cat-file -e "$LEGACY_FRONTEND^{commit}"
git -C "$PROJECT_ROOT" cat-file -e "$LEGACY_CONTROLLER^{commit}"
git -C "$PROJECT_ROOT" show \
  "$LEGACY_CONTROLLER:ops/deploy/social-monitor-production-deploy.sh" \
  > "$LEGACY_ENTRYPOINT"

git clone --bare --shared -q "$PROJECT_ROOT" "$ORIGIN"
git --git-dir="$ORIGIN" update-ref refs/heads/main "$LEGACY_BACKEND"
git --git-dir="$ORIGIN" symbolic-ref HEAD refs/heads/main
git clone --no-checkout --shared -q "$ORIGIN" "$REPO"
git -C "$REPO" config user.name 'Publication Bridge Contract'
git -C "$REPO" config user.email publication-bridge@example.invalid
git -C "$REPO" sparse-checkout init --cone
git -C "$REPO" sparse-checkout set \
  .github ops/deploy apps/api-gateway apps/frontend libs/contracts/rest
git -C "$REPO" checkout -q -B main "$LEGACY_BACKEND"

# Release B contains the final controller bridge and its admitted CI/docs/test
# support. It does not carry the target-only publication library or change
# either daily runtime asset inherited from c071.
cp "$SCRIPT_DIR/social-monitor-production-deploy.sh" \
  "$SCRIPT_DIR/deploy-control-lib.sh" \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" \
  "$REPO/ops/deploy/"
install -d "$REPO/.github/workflows"
cp "$PROJECT_ROOT/.github/workflows/production-deploy.yml" \
  "$REPO/.github/workflows/production-deploy.yml"
cp "$SCRIPT_DIR/README.md" \
  "$SCRIPT_DIR/reader-summary-publication-bridge-transition.test.sh" \
  "$REPO/ops/deploy/"
git -C "$REPO" add "${BRIDGE_RELEASE_PATHS[@]}"
git -C "$REPO" commit -qm 'test: control-only publication bridge B'
BRIDGE_SHA=$(git -C "$REPO" rev-parse HEAD)

# Bind the synthetic bridge to the exact component markers currently deployed
# in production. This proves the real divergent-marker plan, not a simplified
# all-components-at-c071 history.
git -C "$REPO" diff --quiet "$LEGACY_BACKEND" "$BRIDGE_SHA" -- \
  "${LEGACY_BACKEND_PATHS[@]}"
git -C "$REPO" diff --quiet "$LEGACY_FRONTEND" "$BRIDGE_SHA" -- \
  "${LEGACY_FRONTEND_PATHS[@]}"
if git -C "$REPO" diff --quiet "$LEGACY_CONTROLLER" "$BRIDGE_SHA" -- \
  "${LEGACY_CONTROL_PATHS[@]}"; then
  echo 'Release B does not change the deployed control component' >&2
  exit 1
fi
git -C "$REPO" diff --quiet "$LEGACY_CONTROLLER" "$BRIDGE_SHA" -- \
  ops/deploy/production-runtime/daily-run.sh \
  ops/deploy/production-runtime/social-monitor-daily.service

if git -C "$REPO" cat-file -e "$BRIDGE_SHA:$PUBLICATION_LIBRARY" \
  2>/dev/null; then
  echo 'Release B unexpectedly contains the publication library' >&2
  exit 1
fi
git -C "$REPO" diff --quiet "$LEGACY_BACKEND" "$BRIDGE_SHA" -- \
  ops/deploy/production-runtime/daily-run.sh \
  ops/deploy/production-runtime/social-monitor-daily.service
git -C "$REPO" diff --quiet "$LEGACY_BACKEND" "$BRIDGE_SHA" -- \
  apps/frontend libs/contracts/rest

# Bad intermediate targets exercise target-tree validation without becoming
# deployable releases. Release F is synthesized last so this test remains
# runnable in B, where none of these final-only assets exist yet.
install -d "$REPO/ops/deploy/production-runtime"
printf '%s\n' '-- fixture publication pre-migration' \
  > "$REPO/ops/deploy/reader-summary-publication-pre-migration.sql"
printf '%s\n' '-- fixture publication post-migration' \
  > "$REPO/ops/deploy/reader-summary-publication-post-migration.sql"
cat > "$REPO/ops/deploy/production-runtime/daily-run.sh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' 'fixture final daily runtime'
EOF
cat > "$REPO/ops/deploy/production-runtime/social-monitor-daily.service" <<'EOF'
[Unit]
Description=Fixture final daily runtime
EOF
printf '%s\n' 'fixture final backend path' \
  > "$REPO/apps/api-gateway/publication-bridge-final.txt"
git -C "$REPO" add \
  ops/deploy/reader-summary-publication-pre-migration.sql \
  ops/deploy/reader-summary-publication-post-migration.sql \
  ops/deploy/production-runtime/daily-run.sh \
  ops/deploy/production-runtime/social-monitor-daily.service \
  apps/api-gateway/publication-bridge-final.txt
git -C "$REPO" commit -qm 'test: rejected target missing publication blob'
MISSING_BLOB_SHA=$(git -C "$REPO" rev-parse HEAD)

ln -s ../../README.md "$REPO/$PUBLICATION_LIBRARY"
git -C "$REPO" add "$PUBLICATION_LIBRARY"
git -C "$REPO" commit -qm 'test: rejected symlink publication blob'
SYMLINK_BLOB_SHA=$(git -C "$REPO" rev-parse HEAD)

rm "$REPO/$PUBLICATION_LIBRARY"
cat > "$REPO/$PUBLICATION_LIBRARY" <<'EOF'
#!/usr/bin/env bash

# Intentionally lacks deploy_reader_summary_publication_migrations.
EOF
git -C "$REPO" add "$PUBLICATION_LIBRARY"
git -C "$REPO" commit -qm 'test: rejected publication library entrypoint'
MISSING_ENTRYPOINT_SHA=$(git -C "$REPO" rev-parse HEAD)

cat > "$REPO/$PUBLICATION_LIBRARY" <<'EOF'
#!/usr/bin/env bash

deploy_reader_summary_publication_migrations() {
  :
}
EOF
git -C "$REPO" add "$PUBLICATION_LIBRARY"
git -C "$REPO" commit -qm 'test: final publication and runtime release F'
FINAL_SHA=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" push -q origin HEAD:main

for bridge_path in "${BRIDGE_PATHS[@]}"; do
  bridge_digest=$(
    git -C "$REPO" show "$BRIDGE_SHA:$bridge_path" | sha256sum | \
      awk '{print $1}'
  )
  final_digest=$(
    git -C "$REPO" show "$FINAL_SHA:$bridge_path" | sha256sum | \
      awk '{print $1}'
  )
  [[ $bridge_digest == "$final_digest" ]] || {
    echo "B/F bridge digest changed: $bridge_path" >&2
    exit 1
  }
done
git -C "$REPO" cat-file -e "$FINAL_SHA:$PUBLICATION_LIBRARY"
git -C "$REPO" cat-file -e \
  "$FINAL_SHA:ops/deploy/production-runtime/daily-run.sh"
git -C "$REPO" cat-file -e \
  "$FINAL_SHA:ops/deploy/production-runtime/social-monitor-daily.service"

# Run the actual recorded 7185 controller against c071. Its component policy
# must classify B as control-only, advance to it, and install the new bridge
# without touching backend/frontend markers or runtime activation.
git -C "$REPO" checkout -q --detach "$LEGACY_BACKEND"
install -d "$CONTROL" "$STATE" "$ROOT/runtime/deploy-staging"
printf '%s\n' "$LEGACY_FRONTEND" > "$STATE/frontend.sha"
printf '%s\n' "$LEGACY_BACKEND" > "$STATE/backend.sha"
printf '%s\n' "$LEGACY_CONTROLLER" > "$STATE/control.sha"
LEGACY_EVENTS=$FIXTURE/legacy-events
# shellcheck disable=SC2016
bridge_output=$(
  LEGACY_ENTRYPOINT="$LEGACY_ENTRYPOINT" \
  BRIDGE_SHA="$BRIDGE_SHA" LEGACY_EVENTS="$LEGACY_EVENTS" \
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
    bash -c '
      source "$LEGACY_ENTRYPOINT"
      verify_compose_scope() { printf "compose\n" >> "$LEGACY_EVENTS"; }
      sync_control_script() {
        install -m 0755 \
          "$REPO/ops/deploy/social-monitor-production-deploy.sh" \
          "$CONTROL/github-production-deploy.sh"
        printf "sync\n" >> "$LEGACY_EVENTS"
      }
      commit_postgres_pool_bootstrap() { :; }
      snapshot_postgres_runtime_control() {
        printf "snapshot\n" >> "$LEGACY_EVENTS"
        return 91
      }
      activate_postgres_runtime_control() {
        printf "activation\n" >> "$LEGACY_EVENTS"
        return 92
      }
      deploy_backend() {
        printf "backend\n" >> "$LEGACY_EVENTS"
        return 93
      }
      deploy_release "$BRIDGE_SHA"
    '
)
grep -F "deployed=$BRIDGE_SHA frontend=false backend=false control=true" \
  <<< "$bridge_output" >/dev/null
[[ $(git -C "$REPO" rev-parse HEAD) == "$BRIDGE_SHA" ]]
[[ $(cat "$STATE/backend.sha") == "$LEGACY_BACKEND" ]]
[[ $(cat "$STATE/frontend.sha") == "$LEGACY_FRONTEND" ]]
[[ $(cat "$STATE/control.sha") == "$BRIDGE_SHA" ]]
cmp -s "$INSTALLED" "$REPO/ops/deploy/social-monitor-production-deploy.sh"
[[ $(cat "$LEGACY_EVENTS") == $'sync\ncompose' ]]

# The installed B bridge must also be runnable while the publication library is
# absent. A backend=false reconciliation cannot source final-only logic.
BRIDGE_RECONCILE=$FIXTURE/bridge-reconcile
# shellcheck disable=SC2016
reconcile_output=$(
  BRIDGE_SHA="$BRIDGE_SHA" BRIDGE_RECONCILE="$BRIDGE_RECONCILE" \
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
    bash -c '
      source "$SOCIAL_MONITOR_DEPLOY_CONTROL/github-production-deploy.sh"
      ! declare -F deploy_reader_summary_publication_migrations >/dev/null
      sync_control_script() { :; }
      commit_postgres_pool_bootstrap() { :; }
      deploy_release_runtime_transaction() {
        ! declare -F deploy_reader_summary_publication_migrations >/dev/null
        printf "%s %s\n" "$2" "$3" > "$BRIDGE_RECONCILE"
      }
      deploy_release "$BRIDGE_SHA"
    '
)
grep -F "deployed=$BRIDGE_SHA frontend=false backend=false control=false" \
  <<< "$reconcile_output" >/dev/null
[[ $(cat "$BRIDGE_RECONCILE") == 'false false' ]]

create_case_checkout() {
  local name=$1
  local case_root=$FIXTURE/case-$name
  local case_repo=$case_root/integration

  install -d "$case_root"
  git clone --no-checkout --shared -q "$ORIGIN" "$case_repo"
  git -C "$case_repo" sparse-checkout init --cone
  git -C "$case_repo" sparse-checkout set \
    .github ops/deploy apps/api-gateway apps/frontend libs/contracts/rest
  git -C "$case_repo" checkout -q --detach "$BRIDGE_SHA"
  printf '%s\n' "$case_root"
}

run_final_case() {
  local target_sha=$1
  local mutation=$2
  local expected_error=$3
  local expected_status=$4
  local case_root case_repo case_control case_state case_events case_output
  local case_status hook

  case_root=$(create_case_checkout "${mutation}-${target_sha:0:12}")
  case_repo=$case_root/integration
  case_control=$case_root/control
  case_state=$case_control/deploy-state
  case_events=$case_root/events
  install -d "$case_control" "$case_state" "$case_root/runtime/deploy-staging"
  cp "$case_repo/ops/deploy/social-monitor-production-deploy.sh" \
    "$case_control/github-production-deploy.sh"
  chmod 0755 "$case_control/github-production-deploy.sh"
  printf '%s\n' "$LEGACY_BACKEND" > "$case_state/backend.sha"
  printf '%s\n' "$LEGACY_FRONTEND" > "$case_state/frontend.sha"
  printf '%s\n' "$BRIDGE_SHA" > "$case_state/control.sha"

  hook=$case_repo/.git/hooks/post-merge
  cat > "$hook" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
root=$(git rev-parse --show-toplevel)
publication=$root/ops/deploy/reader-summary-publication-deploy-lib.sh
printf 'advance %s\n' "$(git rev-parse HEAD)" >> "$BRIDGE_EVENTS"
case ${BRIDGE_MUTATION:-correct} in
  correct) ;;
  target-missing)
    cat > "$publication" <<'LIBRARY'
#!/usr/bin/env bash
deploy_reader_summary_publication_migrations() { :; }
LIBRARY
    ;;
  target-symlink)
    rm -f "$publication"
    cat > "$publication" <<'LIBRARY'
#!/usr/bin/env bash
deploy_reader_summary_publication_migrations() { :; }
LIBRARY
    ;;
  missing) rm -f "$publication" ;;
  symlink)
    rm -f "$publication"
    ln -s "$root/README.md" "$publication"
    ;;
  outside)
    external=$root/../outside-deploy
    rm -rf "$external"
    mv "$root/ops/deploy" "$external"
    ln -s "$external" "$root/ops/deploy"
    ;;
  unreadable) chmod 000 "$publication" ;;
  mutated) printf '%s\n' '# mutation after reviewed checkout' >> "$publication" ;;
  preloaded) ;;
  *) exit 94 ;;
esac
EOF
  chmod 0755 "$hook"

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
        if [[ $BRIDGE_MUTATION == preloaded ]]; then
          deploy_reader_summary_publication_migrations() { :; }
        else
          ! declare -F deploy_reader_summary_publication_migrations >/dev/null
        fi
        sync_control_script() {
          declare -F deploy_reader_summary_publication_migrations >/dev/null
          printf "sync\n" >> "$BRIDGE_EVENTS"
        }
        commit_postgres_pool_bootstrap() { :; }
        snapshot_postgres_runtime_control() {
          declare -F deploy_reader_summary_publication_migrations >/dev/null
          local backup=$SOCIAL_MONITOR_DEPLOY_STATE/snapshot
          install -d "$backup"
          printf "snapshot\n" >> "$BRIDGE_EVENTS"
          printf "%s\n" "$backup"
        }
        activate_postgres_runtime_control() {
          printf "activation\n" >> "$BRIDGE_EVENTS"
        }
        verify_compose_scope() {
          printf "verify\n" >> "$BRIDGE_EVENTS"
        }
        backup_database() {
          printf "backup\n" >> "$BRIDGE_EVENTS"
        }
        deploy_backend() {
          declare -F deploy_reader_summary_publication_migrations >/dev/null
          printf "backend\n" >> "$BRIDGE_EVENTS"
          backup_database "$1"
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
    ((case_status == 0))
    grep -F \
      "deployed=$target_sha frontend=false backend=true control=true" \
      <<< "$case_output" >/dev/null
    [[ $(cat "$case_events") == \
      $'advance '"$target_sha"$'\nsync\nsnapshot\nactivation\nverify\nbackend\nbackup' ]]
    [[ $(git -C "$case_repo" rev-parse HEAD) == "$target_sha" ]]
    [[ $(cat "$case_state/frontend.sha") == "$LEGACY_FRONTEND" ]]
  else
    ((case_status != 0))
    grep -F "$expected_error" <<< "$case_output" >/dev/null
    grep -Fx "advance $target_sha" "$case_events" >/dev/null
    if grep -E '^(sync|snapshot|activation|verify|backend|backup|restore|rollback)$' \
      "$case_events" >/dev/null; then
      echo "$mutation reached snapshot, activation, or backend work" >&2
      exit 1
    fi
    [[ $(cat "$case_state/backend.sha") == "$LEGACY_BACKEND" ]]
    [[ $(cat "$case_state/frontend.sha") == "$LEGACY_FRONTEND" ]]
    [[ $(cat "$case_state/control.sha") == "$BRIDGE_SHA" ]]
  fi
}

run_final_case "$MISSING_BLOB_SHA" target-missing \
  'target commit publication deploy library is not a regular blob' failure
run_final_case "$SYMLINK_BLOB_SHA" target-symlink \
  'target commit publication deploy library is not a regular blob' failure
run_final_case "$MISSING_ENTRYPOINT_SHA" correct \
  'target publication deploy library is missing its migration entrypoint' failure
run_final_case "$FINAL_SHA" missing \
  'target publication deploy library is not a regular non-symlink file' failure
run_final_case "$FINAL_SHA" symlink \
  'target publication deploy library is not a regular non-symlink file' failure
run_final_case "$FINAL_SHA" outside \
  'target publication deploy library is outside integration' failure
run_final_case "$FINAL_SHA" unreadable \
  'target publication deploy library is unreadable' failure
run_final_case "$FINAL_SHA" mutated \
  'target publication deploy library differs from reviewed target' failure
run_final_case "$FINAL_SHA" preloaded \
  'publication migration entrypoint was loaded before target validation' failure
run_final_case "$FINAL_SHA" correct '' success

# shellcheck disable=SC2016
advance_line=$(grep -nF 'advance_integration "$sha"' \
  "$SCRIPT_DIR/deploy-control-lib.sh" | tail -1 | cut -d: -f1)
# shellcheck disable=SC2016
load_line=$(grep -nF \
  'load_target_reader_summary_publication_deploy_library "$sha"' \
  "$SCRIPT_DIR/deploy-control-lib.sh" | tail -1 | cut -d: -f1)
# shellcheck disable=SC2016
transaction_line=$(grep -nF \
  'deploy_release_runtime_transaction "$sha" "$backend" "$runtime_control"' \
  "$SCRIPT_DIR/deploy-control-lib.sh" | tail -1 | cut -d: -f1)
((advance_line < load_line && load_line < transaction_line))

echo 'Reader-summary publication B-to-F bridge transition tests passed'
