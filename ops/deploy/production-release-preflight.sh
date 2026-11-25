#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
cd "$PROJECT_ROOT"

# This command executes the repository's pinned high/critical npm audit and
# applies its reviewed, expiring exception policy.
npm run check:dependencies
DATABASE_URL=${DATABASE_URL:-postgresql://preflight:social_monitor_local_password@127.0.0.1:5432/preflight} \
  npm run prisma:generate
npm run check:postgres-runtime-pool-inventory
npm run check:postgres-runtime-pool-unit

deploy_shell_files=(
  ops/deploy/social-monitor-production-deploy.sh
  ops/deploy/social-monitor-production-deploy.test.sh
  ops/deploy/github-production-deploy-client.sh
  ops/deploy/github-production-deploy-client.test.sh
  ops/deploy/social-monitor-production-ssh-wrapper.sh
  ops/deploy/social-monitor-production-ssh-wrapper.test.sh
  ops/deploy/production-release-a-transition.sh
  ops/deploy/production-release-preflight.sh
  ops/deploy/social-monitor-production-forced-wrapper-cross-version.test.sh
)
bash ops/deploy/verify-production-shellcheck-baseline.sh \
  "${deploy_shell_files[@]}"
bash ops/deploy/social-monitor-production-deploy.test.sh
bash ops/deploy/github-production-deploy-client.test.sh
bash ops/deploy/social-monitor-production-ssh-wrapper.test.sh
bash ops/deploy/social-monitor-production-forced-wrapper-cross-version.test.sh
