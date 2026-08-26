# shellcheck shell=bash
# Sourced by the focused parent contract test; keep scenario state in one shell.
if command -v shellcheck >/dev/null; then
  shellcheck -x "$SCRIPT_DIR"/daily-runner-image-bootstrap-*.sh
fi
bash "$SCRIPT_DIR/daily-runner-image-bootstrap-deploy.test.sh"
bash "$SCRIPT_DIR/daily-runner-image-bootstrap-lib.test.sh"
bash "$SCRIPT_DIR/backend-runtime-health-lib.test.sh"
bash "$SCRIPT_DIR/otel-collector-deploy-lifecycle.test.sh"
for test_file in backend-image-rescue-lib.test.sh backend-image-rescue-migrate-fallback.test.sh; do bash "$SCRIPT_DIR/$test_file"; done
bash "$SCRIPT_DIR/postgres-runtime-deploy-lib.test.sh"
TMPDIR=/tmp bash "$SCRIPT_DIR/github-premidnight-capture-runtime.test.sh"
bash "$SCRIPT_DIR/verify-postgres-runtime-topology.test.sh"
bash "$SCRIPT_DIR/reader-summary-publication-migrator-validation.test.sh"
bash "$SCRIPT_DIR/rabbitmq-quorum-deploy-bridge-transition.test.sh"
bash "$SCRIPT_DIR/daily-canonical-recovery-production.test.sh"
uid_fixture_status=0
if ((EUID == 0)); then
  uid_fixture_probe=$(mktemp -d "${TMPDIR:-/tmp}/social-monitor-uidmap.XXXXXX")
  chown 65534:65534 "$uid_fixture_probe" 2>/dev/null || uid_fixture_status=$?
  rm -rf "$uid_fixture_probe"
fi
if ((uid_fixture_status == 0)); then
  bash "$SCRIPT_DIR/refresh-codex-auth.test.sh"
  bash "$SCRIPT_DIR/prune-pre-autodeploy-backups.test.sh"
else
  printf 'Skipping UID-mapped deploy fixtures: chown 65534 unsupported\n'
fi
bash "$SCRIPT_DIR/verify-postgres-backup-coverage.test.sh"
