import { existsSync, readFileSync } from 'node:fs';

const contractPath = 'ops/release/external-beta-readiness-contract.json';
const sourceCertificationPath = 'ops/ingestion/source-provider-certification.json';
const feedbackPath = 'ops/release/beta-feedback-classification-report.json';
const decisionPath = 'ops/release/beta-ring-expansion-decision-record.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const sourceCertification = JSON.parse(readFileSync(sourceCertificationPath, 'utf8'));
const feedback = JSON.parse(readFileSync(feedbackPath, 'utf8'));
const decision = JSON.parse(readFileSync(decisionPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const backendSafe = JSON.parse(readFileSync(backendSafePath, 'utf8'));
const scripts = packageJson.scripts ?? {};
const verifyScript = String(scripts.verify ?? '');
const backendSafeScripts = new Set(backendSafe.backendScripts ?? []);
const hasVerificationScript = (scriptName) =>
  verifyScript.includes(`npm run ${scriptName}`) || backendSafeScripts.has(scriptName);
const violations = [];

const requiredGroupIds = new Set([
  'release-baseline-freeze',
  'durable-runtime-proof',
  'production-auth-finalization',
  'source-provider-live-certification',
  'credential-secret-runtime-flow',
  'rabbitmq-staging-reliability-drill',
  'postgres-restore-migration-drill',
  'durable-backend-e2e-loop',
  'summary-quality-feedback-hardening',
  'operational-support-package',
  'capacity-envelope-beta-ring-decision',
  'release-artifact-evidence',
  'security-final-sweep',
  'no-go-cleanup',
]);
const allowedStatuses = new Set([
  'contract_ready',
  'pending_staging_evidence',
  'blocked_without_live_credentials',
  'blocked_until_real_feedback',
  'pending_image_digest_and_deploy_smoke',
  'hold',
  'passed',
]);

if (contract.schemaVersion !== 1) {
  violations.push(`${contractPath}: schemaVersion must be 1`);
}

if (contract.scope !== 'backend-only') {
  violations.push(`${contractPath}: scope must be backend-only`);
}

if (contract.frontendPolicy !== 'deferred_contract_only') {
  violations.push(`${contractPath}: frontendPolicy must keep frontend deferred`);
}

if (contract.evidenceMode !== 'fixture_contract_with_external_evidence_required') {
  violations.push(`${contractPath}: evidenceMode must remain fixture_contract_with_external_evidence_required until live evidence exists`);
}

if (!['hold', 'go', 'rework'].includes(contract.externalBetaDecision)) {
  violations.push(`${contractPath}: externalBetaDecision must be hold, go or rework`);
}

const evidenceRunner = contract.evidenceRunner;
if (typeof evidenceRunner !== 'object' || evidenceRunner === null) {
  violations.push(`${contractPath}: evidenceRunner is required`);
} else {
  if (!existsSync(evidenceRunner.contract ?? '')) {
    violations.push(`${contractPath}: evidenceRunner.contract must reference an existing contract`);
  }
  for (const field of ['checkCommand', 'planCommand', 'jsonPlanCommand', 'preflightCommand']) {
    const scriptName = scriptNameFromNpmCommand(evidenceRunner[field]);
    if (scriptName === null || !scripts[scriptName]) {
      violations.push(`${contractPath}: evidenceRunner.${field} must reference an existing npm script`);
    }
  }
}

const groupIds = new Set();
let hasBlockingPendingEvidence = false;
for (const group of contract.requiredEvidenceGroups ?? []) {
  if (groupIds.has(group.groupId)) {
    violations.push(`${contractPath}: duplicate evidence group "${group.groupId}"`);
  }
  groupIds.add(group.groupId);

  if (!requiredGroupIds.has(group.groupId)) {
    violations.push(`${contractPath}: unsupported evidence group "${group.groupId}"`);
  }
  if (!allowedStatuses.has(group.status)) {
    violations.push(`${contractPath}: evidence group "${group.groupId}" has unsupported status "${group.status}"`);
  }
  if (typeof group.owner !== 'string' || group.owner.trim().length === 0) {
    violations.push(`${contractPath}: evidence group "${group.groupId}" must define owner`);
  }
  if (group.blocksExternalBeta !== true) {
    violations.push(`${contractPath}: evidence group "${group.groupId}" must block external beta until passed`);
  }
  if (group.status !== 'passed') {
    hasBlockingPendingEvidence = true;
  }

  for (const command of group.verificationCommands ?? []) {
    const scriptName = String(command).replace(/^npm run /, '');
    if (!scripts[scriptName]) {
      violations.push(`${contractPath}: evidence group "${group.groupId}" references missing script "${scriptName}"`);
    }
  }

  for (const artifact of group.requiredArtifacts ?? []) {
    if (!existsSync(artifact)) {
      violations.push(`${contractPath}: evidence group "${group.groupId}" references missing artifact "${artifact}"`);
    }
  }

  if (typeof group.exitCondition !== 'string' || group.exitCondition.trim().length === 0) {
    violations.push(`${contractPath}: evidence group "${group.groupId}" must define exitCondition`);
  }
}

for (const groupId of requiredGroupIds) {
  if (!groupIds.has(groupId)) {
    violations.push(`${contractPath}: missing required evidence group "${groupId}"`);
  }
}

if (contract.externalBetaDecision === 'go' && hasBlockingPendingEvidence) {
  violations.push(`${contractPath}: externalBetaDecision cannot be go while blocking evidence is not passed`);
}

if (contract.externalBetaDecision === 'go') {
  if (sourceCertification.certifiedProviders.some((provider) => provider.liveBetaReady !== true)) {
    violations.push(`${contractPath}: go requires every certified provider to be liveBetaReady`);
  }
  if (feedback.evidenceMode !== 'redacted_beta_samples') {
    violations.push(`${contractPath}: go requires redacted beta feedback samples`);
  }
  if (decision.decision !== 'go') {
    violations.push(`${contractPath}: go requires beta ring decision to be go`);
  }
}

const envelope = contract.capacityEnvelope ?? {};
for (const numericField of [
  'maxUsers',
  'maxTopicsPerWorkspace',
  'maxEnabledSourcesPerTopic',
  'maxManualScansPerWorkspacePerHour',
  'maxSummaryRequestsPerWorkspacePerHour',
  'maxQueueLagSeconds',
  'maxSummaryEstimatedCostUsdPerWorkspacePerDay',
  'maxDeliveryAttemptsPerWorkspacePerHour',
]) {
  if (!Number.isFinite(envelope[numericField]) || envelope[numericField] <= 0) {
    violations.push(`${contractPath}: capacityEnvelope.${numericField} must be positive`);
  }
}

for (const exception of contract.noGoExceptions ?? []) {
  if (exception.blocking !== true) {
    violations.push(`${contractPath}: noGoException "${exception.exceptionId}" must be blocking`);
  }
  for (const field of ['exceptionId', 'owner', 'exitCondition']) {
    if (typeof exception[field] !== 'string' || exception[field].trim().length === 0) {
      violations.push(`${contractPath}: noGoException must define ${field}`);
    }
  }
}

if (!scripts['check:external-beta-readiness']) {
  violations.push(`${packagePath}: missing check:external-beta-readiness`);
}
if (!hasVerificationScript('check:external-beta-readiness')) {
  violations.push(`${packagePath}: npm run verify or verify:backend must include check:external-beta-readiness`);
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('External beta readiness contract OK');

function scriptNameFromNpmCommand(command) {
  const match = /^npm run (?:--silent )?([^ ]+)/.exec(String(command ?? ''));
  return match?.[1] ?? null;
}
