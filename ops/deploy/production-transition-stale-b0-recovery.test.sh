#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
PUBLISHER=$ROOT/ops/deploy/production-transition-publisher.sh
REVIEW_WORKFLOW=$ROOT/.github/workflows/production-transition-review.yml
PUBLISH_WORKFLOW=$ROOT/.github/workflows/production-transition-publish.yml

/usr/bin/grep -Fq 'b0_sha:' "$REVIEW_WORKFLOW"
/usr/bin/grep -Fq 'b0_sha:' "$PUBLISH_WORKFLOW"
/usr/bin/grep -Fq '    environment: production' "$REVIEW_WORKFLOW"
/usr/bin/grep -Fq '    environment: production' "$PUBLISH_WORKFLOW"
/usr/bin/grep -Fq 'PRODUCTION_TRANSITION_REVIEW_SIGNING_KEY' "$REVIEW_WORKFLOW"
/usr/bin/grep -Fq 'PRODUCTION_TRANSITION_TARGET_SIGNING_KEY' "$PUBLISH_WORKFLOW"
/usr/bin/grep -Fq "git config user.name 'social-monitor-transition-review'" "$REVIEW_WORKFLOW"
/usr/bin/grep -Fq "git config user.name 'social-monitor-transition-publisher'" "$PUBLISH_WORKFLOW"
/usr/bin/grep -Fq 'PRODUCTION_TRANSITION_RECOVERY_MODE=stale-b0' "$REVIEW_WORKFLOW"
/usr/bin/grep -Fq 'PRODUCTION_TRANSITION_RECOVERY_MODE=stale-b0' "$PUBLISH_WORKFLOW"
/usr/bin/grep -Fq '"$GITHUB_SHA" == "$remote_main"' "$REVIEW_WORKFLOW"
/usr/bin/grep -Fq 'S2 is not the sole child of exact B0' \
  "$ROOT/ops/deploy/production-transition-canonical-lib.sh"
/usr/bin/grep -Fq 'production_transition_stale_b0_validate_head "$b0" "$s2" "$observed"' "$PUBLISHER"
/usr/bin/grep -Fq 'protected main moved after stale B0 recovery lease' "$PUBLISHER"
/usr/bin/grep -Fq 'lease_main=$observed' "$PUBLISHER"
/usr/bin/grep -Fq 'production_transition_stale_b0_validate_head' \
  "$ROOT/ops/deploy/production-transition-stale-b0-recovery-lib.sh"
/usr/bin/grep -Fq 'scripts/check-review-ci.mjs' \
  "$ROOT/ops/deploy/production-transition-stale-b0-recovery-lib.sh"
/usr/bin/grep -Fq 'production-forward-bridge-authority.blobs' \
  "$ROOT/ops/deploy/production-transition-stale-b0-recovery-lib.sh"
/usr/bin/grep -Fq 'first post-B0 release requires deploy-transition with a signed target' \
  "$ROOT/ops/deploy/production-transition-b0-host-control.sh"

printf 'production stale-B0 recovery contract checks passed\n'
