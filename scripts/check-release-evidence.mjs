import { existsSync, readFileSync } from 'node:fs';

const contractPath = 'ops/release/mvp-release-evidence-contract.json';
const packagePath = 'package.json';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const scripts = packageJson.scripts ?? {};
const violations = [];

const requiredGateIds = new Set([
  'architecture-boundaries',
  'code-quality-guardrails',
  'secret-scan',
  'dependency-audit',
  'container-contract',
  'observability-contract',
  'openapi-drift',
  'event-contracts',
  'migration-safety',
  'persistence-readiness',
  'monitoring-prisma-persistence',
  'ingestion-feed-prisma-persistence',
  'summary-prisma-persistence',
  'identity-prisma-persistence',
  'usage-prisma-persistence',
  'load-cost-guardrail',
  'source-provider-certification',
  'delivery-replay-idempotency',
  'mvp-core-loop',
  'beta-scope-policy',
  'beta-ring-policy',
  'summary-eval-regression',
  'summary-cost-attribution',
  'summary-window-freshness',
  'summary-retry-safety',
  'backup-restore-contract',
  'retention-contract',
  'staging-drills',
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

  if (!verifyScript.includes(`npm run ${scriptName}`)) {
    violations.push(`${packagePath}: npm run verify must include release gate script "${scriptName}"`);
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

if (!verifyScript.includes('check:release')) {
  violations.push(`${packagePath}: npm run verify must include check:release`);
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('MVP release evidence contract OK');
