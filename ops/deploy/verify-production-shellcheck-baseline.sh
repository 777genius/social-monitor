#!/usr/bin/env bash
set -euo pipefail

(($# > 0)) || {
  echo 'production-shellcheck-error: no deploy files supplied' >&2
  exit 1
}

deploy_files=("$0" "$@")
bash -n "${deploy_files[@]}"
deploy_shellcheck=$(
  shellcheck -S warning -f json -x "${deploy_files[@]}" || true
)
DEPLOY_SHELLCHECK=$deploy_shellcheck node <<'NODE'
const findings = JSON.parse(process.env.DEPLOY_SHELLCHECK ?? "[]");
const expected = new Set([
  "ops/deploy/production-forward-bridge.test.sh:410:2120:run_b0_install",
  "ops/deploy/production-forward-bridge.test.sh:571:2034:PRODUCTION_TRANSITION_HOST_LOCK_FD",
  "ops/deploy/production-forward-bridge.test.sh:573:2034:PRODUCTION_TRANSITION_HOST_LOCK_ACTIVE",
  "ops/deploy/production-forward-bridge.test.sh:584:2034:PRODUCTION_TRANSITION_HOST_LOCK_OWNER",
  "ops/deploy/social-monitor-production-deploy.sh:42:2034:PUBLIC_LINK",
  "ops/deploy/social-monitor-production-deploy.sh:43:2034:ADMIN_LINK",
]);
const actual = new Set(findings.map((finding) =>
  `${finding.file}:${finding.line}:${finding.code}:${String(finding.message).split(" ", 1)[0]}`));
// ShellCheck versions differ in whether they report the known sourced-test
// diagnostics. Accept any non-empty subset of the reviewed allowlist, while
// still rejecting unknown or duplicate findings.
if (findings.length === 0 || actual.size !== findings.length ||
    [...actual].some((finding) => !expected.has(finding))) {
  console.error("production deploy ShellCheck baseline diverged", findings);
  process.exit(1);
}
NODE
