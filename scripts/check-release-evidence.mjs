import { existsSync, readFileSync } from 'node:fs';

const contractPath = 'ops/release/mvp-release-evidence-contract.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const backendSafe = JSON.parse(readFileSync(backendSafePath, 'utf8'));
const scripts = packageJson.scripts ?? {};
const backendSafeScripts = new Set(backendSafe.backendScripts ?? []);
const violations = [];

const requiredGateIds = new Set([
  'architecture-boundaries',
  'code-quality-guardrails',
  'secret-scan',
  'dependency-audit',
  'container-contract',
  'runtime-compose-contract',
  'runtime-profile-guards',
  'security-final-sweep',
  'release-baseline',
  'backend-safe-verify-contract',
  'durable-runtime-proof',
  'auth-boundary',
  'user-auth-boundary',
  'production-auth-matrix',
  'credential-secret-runtime-flow',
  'backend-ops-readiness',
  'external-beta-readiness',
  'backend-mvp-completion-audit',
  'backend-mvp-status',
  'external-beta-evidence-inputs',
  'no-go-cleanup',
  'release-artifact-evidence',
  'observability-contract',
  'operational-support-package',
  'api-health-smoke',
  'openapi-drift',
  'event-contracts',
  'platform-event-store',
  'event-relay',
  'cross-process-scheduler',
  'local-infra-contract',
  'rabbitmq-queue-publisher',
  'migration-safety',
  'tenant-db-guards',
  'persistence-readiness',
  'monitoring-prisma-persistence',
  'monitoring-read-rest',
  'source-binding-health-rest',
  'source-profile-rest',
  'source-config-protector',
  'source-config-reader-boundary',
  'scan-status-attempt-rest',
  'scan-scheduler-command',
  'scan-scheduler-loop',
  'scan-queue-drain-loop',
  'ingestion-feed-prisma-persistence',
  'summary-prisma-persistence',
  'summary-feedback-rest',
  'summary-policy-rest',
  'summary-request-queue',
  'summary-worker-command',
  'summary-job-polling-loop',
  'summary-queue-drain-loop',
  'summary-ready-projection-handler',
  'summary-ready-event-drain-loop',
  'identity-prisma-persistence',
  'api-key-read-scope',
  'api-key-write-scope',
  'usage-prisma-persistence',
  'usage-audit-rest',
  'delivery-prisma-persistence',
  'delivery-attempt-rest',
  'delivery-worker-command',
  'delivery-attempt-dispatch-loop',
  'delivery-attempt-queue-drain-loop',
  'http-webhook-delivery-provider',
  'realtime-websocket',
  'digest-scheduler-loop',
  'digest-schedule-rest',
  'notification-preference-rest',
  'load-cost-guardrail',
  'source-provider-certification',
  'source-live-certification-evidence',
  'hacker-news-ingestion-smoke',
  'github-ingestion-smoke',
  'reddit-ingestion-smoke',
  'rss-ingestion-smoke',
  'delivery-replay-idempotency',
  'write-idempotency-proof',
  'mvp-core-loop',
  'beta-scope-policy',
  'beta-ring-policy',
  'beta-ring-decision',
  'capacity-envelope-beta-ring-decision',
  'beta-launch-support',
  'beta-feedback-report',
  'summary-evidence-citations',
  'summary-eval-regression',
  'summary-cost-attribution',
  'summary-window-freshness',
  'summary-retry-safety',
  'summary-feedback-hardening',
  'backup-restore-contract',
  'retention-contract',
  'retention-plan',
  'staging-drills',
  'staging-reliability-evidence',
]);
const requiredSmokeIds = new Set([
  'api-health',
  'openapi-contract',
  'migration-version',
  'worker-pause-resume',
]);
const requiredRollbackTriggers = new Set([
  'security-regression',
  'migration-regression',
  'provider-failure-spike',
  'summary-cost-spike',
  'delivery-failure-spike',
]);

if (contract.schemaVersion !== 1) {
  violations.push(`${contractPath}: schemaVersion must be 1`);
}

if (contract.releaseType !== 'beta-mvp') {
  violations.push(`${contractPath}: releaseType must be beta-mvp`);
}

for (const [field, value] of Object.entries(contract.artifactEvidence ?? {})) {
  if (field.startsWith('requires') && typeof value === 'string' && !existsSync(value)) {
    violations.push(`${contractPath}: artifactEvidence.${field} references missing path "${value}"`);
  }
}

if (contract.artifactEvidence?.requiresCommitSha !== true) {
  violations.push(`${contractPath}: release artifact evidence must require commit sha`);
}

if (contract.artifactEvidence?.requiresImageDigest !== true) {
  violations.push(`${contractPath}: release artifact evidence must require immutable image digest`);
}

const gateIds = new Set();
const verifyScript = String(scripts.verify ?? '');
const hasVerificationScript = (scriptName) =>
  verifyScript.includes(`npm run ${scriptName}`) || backendSafeScripts.has(scriptName);
for (const gate of contract.requiredGates ?? []) {
  if (gateIds.has(gate.gateId)) {
    violations.push(`${contractPath}: duplicate gateId "${gate.gateId}"`);
  }
  gateIds.add(gate.gateId);

  if (!requiredGateIds.has(gate.gateId)) {
    violations.push(`${contractPath}: unsupported gateId "${gate.gateId}"`);
  }

  if (gate.blocksRelease !== true) {
    violations.push(`${contractPath}: gate "${gate.gateId}" must block release`);
  }

  const scriptName = String(gate.command ?? '').replace(/^npm run /, '');
  if (!scripts[scriptName]) {
    violations.push(`${contractPath}: gate "${gate.gateId}" references missing npm script "${scriptName}"`);
  }

  if (!hasVerificationScript(scriptName)) {
    violations.push(`${packagePath}: npm run verify or verify:backend must include release gate script "${scriptName}"`);
  }
}

for (const requiredGate of requiredGateIds) {
  if (!gateIds.has(requiredGate)) {
    violations.push(`${contractPath}: missing required gate "${requiredGate}"`);
  }
}

const smokeIds = new Set();
for (const smoke of contract.deploySmokeChecks ?? []) {
  if (smokeIds.has(smoke.smokeId)) {
    violations.push(`${contractPath}: duplicate smokeId "${smoke.smokeId}"`);
  }
  smokeIds.add(smoke.smokeId);

  if (!requiredSmokeIds.has(smoke.smokeId)) {
    violations.push(`${contractPath}: unsupported smokeId "${smoke.smokeId}"`);
  }

  if (typeof smoke.target !== 'string' || smoke.target.trim().length === 0) {
    violations.push(`${contractPath}: smoke "${smoke.smokeId}" must define target`);
  }

  if (typeof smoke.expectedSignal !== 'string' || smoke.expectedSignal.trim().length === 0) {
    violations.push(`${contractPath}: smoke "${smoke.smokeId}" must define expectedSignal`);
  }
}

for (const requiredSmoke of requiredSmokeIds) {
  if (!smokeIds.has(requiredSmoke)) {
    violations.push(`${contractPath}: missing deploy smoke "${requiredSmoke}"`);
  }
}

const rollbackTriggerIds = new Set();
for (const trigger of contract.rollbackTriggers ?? []) {
  if (rollbackTriggerIds.has(trigger.triggerId)) {
    violations.push(`${contractPath}: duplicate rollback trigger "${trigger.triggerId}"`);
  }
  rollbackTriggerIds.add(trigger.triggerId);

  if (!requiredRollbackTriggers.has(trigger.triggerId)) {
    violations.push(`${contractPath}: unsupported rollback trigger "${trigger.triggerId}"`);
  }

  for (const field of ['condition', 'firstAction', 'owner']) {
    if (typeof trigger[field] !== 'string' || trigger[field].trim().length === 0) {
      violations.push(`${contractPath}: rollback trigger "${trigger.triggerId}" must define ${field}`);
    }
  }
}

for (const requiredTrigger of requiredRollbackTriggers) {
  if (!rollbackTriggerIds.has(requiredTrigger)) {
    violations.push(`${contractPath}: missing rollback trigger "${requiredTrigger}"`);
  }
}

const [runbookPath, runbookAnchor] = String(contract.runbook ?? '').split('#');
if (!runbookPath || !existsSync(runbookPath)) {
  violations.push(`${contractPath}: runbook path must exist`);
} else if (!readFileSync(runbookPath, 'utf8').toLowerCase().includes((runbookAnchor ?? '').replaceAll('-', ' '))) {
  violations.push(`${contractPath}: runbook anchor must point to an existing runbook section`);
}

if (!contract.promotionDoc || !existsSync(contract.promotionDoc)) {
  violations.push(`${contractPath}: promotionDoc must reference an existing document`);
}

if (!hasVerificationScript('check:release')) {
  violations.push(`${packagePath}: npm run verify or verify:backend must include check:release`);
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('MVP release evidence contract OK');
