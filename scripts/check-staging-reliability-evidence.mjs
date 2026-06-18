import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const evidencePath = 'ops/drills/staging-reliability-evidence.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';

const evidence = readJson(evidencePath);
const packageJson = readJson(packagePath);
const backendSafe = readJson(backendSafePath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const externalReadiness = readJson(externalReadinessPath);
const baseline = readJson(baselinePath);
const scripts = packageJson.scripts ?? {};
const violations = [];

const gateScript = 'check:staging-reliability-evidence';
const gateCommand = `npm run ${gateScript}`;
const gateId = 'staging-reliability-evidence';
const allowedStatuses = new Set(['pending_staging_evidence', 'passed']);
const requiredArtifactIds = new Set([
  'rabbitmq-staging-drill-output',
  'postgres-restore-drill-output',
  'durable-backend-e2e-output',
]);
const requiredSignalIds = new Set([
  'rabbitmq-publisher-confirms',
  'rabbitmq-persistent-publish',
  'rabbitmq-consumer-ack',
  'rabbitmq-consumer-nack-retry',
  'rabbitmq-poison-message-dlx',
  'rabbitmq-quorum-delivery-limit',
  'rabbitmq-worker-restart-recovery',
  'rabbitmq-queue-lag-metrics',
  'rabbitmq-event-relay-retry',
  'postgres-backup-created',
  'postgres-restore-rpo-rto',
  'postgres-migration-version',
  'postgres-validation-queries',
  'postgres-outbox-inbox-idempotency',
  'postgres-worker-pause-resume',
  'postgres-no-duplicate-side-effects',
  'backend-loop-topic-to-delivery-audit',
  'backend-loop-tenant-isolation',
  'backend-loop-idempotency',
]);
const requiredDomains = new Set(['rabbitmq', 'postgres', 'durable-backend-e2e']);
const requiredExternalGroups = [
  'rabbitmq-staging-reliability-drill',
  'postgres-restore-migration-drill',
  'durable-backend-e2e-loop',
];
const requiredBackendOpsDomains = [
  'rabbitmq-reliability',
  'postgres-reliability',
  'observability-and-drills',
  'mvp-loop',
];

if (evidence.schemaVersion !== 1) {
  violations.push(`${evidencePath}: schemaVersion must be 1`);
}

if (evidence.scope !== 'backend-only') {
  violations.push(`${evidencePath}: scope must be backend-only`);
}

if (evidence.frontendPolicy !== 'deferred_contract_only') {
  violations.push(`${evidencePath}: frontendPolicy must keep frontend deferred`);
}

if (evidence.externalBetaStatus !== 'hold_until_real_staging_drill_output' && evidence.externalBetaStatus !== 'passed') {
  violations.push(`${evidencePath}: externalBetaStatus must be hold_until_real_staging_drill_output or passed`);
}

if (evidence.goRequiresAllSignalsPassed !== true) {
  violations.push(`${evidencePath}: goRequiresAllSignalsPassed must be true`);
}

const artifactById = new Map();
for (const artifact of evidence.stagingEvidenceArtifacts ?? []) {
  if (artifactById.has(artifact.artifactId)) {
    violations.push(`${evidencePath}: duplicate staging artifact "${artifact.artifactId}"`);
  }
  artifactById.set(artifact.artifactId, artifact);

  if (!requiredArtifactIds.has(artifact.artifactId)) {
    violations.push(`${evidencePath}: unsupported staging artifact "${artifact.artifactId}"`);
  }
  if (!allowedStatuses.has(artifact.status)) {
    violations.push(`${evidencePath}: artifact "${artifact.artifactId}" has unsupported status "${artifact.status}"`);
  }
  if (artifact.requiredForExternalBeta !== true) {
    violations.push(`${evidencePath}: artifact "${artifact.artifactId}" must be required for external beta`);
  }

  if (artifact.status === 'pending_staging_evidence') {
    for (const field of ['path', 'sha256', 'environmentId', 'imageDigest', 'operator', 'startedAt', 'completedAt']) {
      if (artifact[field] !== null) {
        violations.push(`${evidencePath}: pending artifact "${artifact.artifactId}" must keep ${field}=null`);
      }
    }
  } else {
    requirePassedArtifact(artifact);
  }
}

for (const artifactId of requiredArtifactIds) {
  if (!artifactById.has(artifactId)) {
    violations.push(`${evidencePath}: missing staging artifact "${artifactId}"`);
  }
}

const signalIds = new Set();
let hasPendingSignal = false;
for (const signal of evidence.requiredSignals ?? []) {
  if (signalIds.has(signal.signalId)) {
    violations.push(`${evidencePath}: duplicate signal "${signal.signalId}"`);
  }
  signalIds.add(signal.signalId);

  if (!requiredSignalIds.has(signal.signalId)) {
    violations.push(`${evidencePath}: unsupported signal "${signal.signalId}"`);
  }
  if (!requiredDomains.has(signal.domain)) {
    violations.push(`${evidencePath}: signal "${signal.signalId}" has unsupported domain "${signal.domain}"`);
  }
  if (!allowedStatuses.has(signal.status)) {
    violations.push(`${evidencePath}: signal "${signal.signalId}" has unsupported status "${signal.status}"`);
  }
  if (signal.requiredForExternalBeta !== true) {
    violations.push(`${evidencePath}: signal "${signal.signalId}" must be required for external beta`);
  }
  if (signal.status !== 'passed') {
    hasPendingSignal = true;
  }

  const scriptName = String(signal.verificationCommand ?? '').replace(/^npm run /, '');
  if (!scripts[scriptName]) {
    violations.push(`${evidencePath}: signal "${signal.signalId}" references missing script "${scriptName}"`);
  }
  if (!existsSync(signal.contractArtifact ?? '')) {
    violations.push(`${evidencePath}: signal "${signal.signalId}" references missing contract artifact "${signal.contractArtifact}"`);
  }
  if (!artifactById.has(signal.stagingArtifactId)) {
    violations.push(`${evidencePath}: signal "${signal.signalId}" references unknown stagingArtifactId "${signal.stagingArtifactId}"`);
  }
  if (typeof signal.requiredSignal !== 'string' || signal.requiredSignal.trim().length === 0) {
    violations.push(`${evidencePath}: signal "${signal.signalId}" must define requiredSignal`);
  }
  if (typeof signal.exitCondition !== 'string' || signal.exitCondition.trim().length === 0) {
    violations.push(`${evidencePath}: signal "${signal.signalId}" must define exitCondition`);
  }

  const artifact = artifactById.get(signal.stagingArtifactId);
  if (signal.status === 'passed' && artifact?.status !== 'passed') {
    violations.push(`${evidencePath}: passed signal "${signal.signalId}" requires passed artifact "${signal.stagingArtifactId}"`);
  }
}

for (const signalId of requiredSignalIds) {
  if (!signalIds.has(signalId)) {
    violations.push(`${evidencePath}: missing signal "${signalId}"`);
  }
}

if (evidence.externalBetaStatus === 'passed' && hasPendingSignal) {
  violations.push(`${evidencePath}: externalBetaStatus cannot be passed while staging signals are pending`);
}

requirePackageWiring();
requireReleaseWiring();
requireBackendOpsWiring();
requireExternalReadinessWiring();
requireBaselineWiring();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Staging reliability evidence contract OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function requirePassedArtifact(artifact) {
  if (typeof artifact.path !== 'string' || artifact.path.trim().length === 0 || !existsSync(artifact.path)) {
    violations.push(`${evidencePath}: passed artifact "${artifact.artifactId}" must reference an existing path`);
    return;
  }

  const digest = createHash('sha256').update(readFileSync(artifact.path)).digest('hex');
  if (artifact.sha256 !== digest) {
    violations.push(`${evidencePath}: passed artifact "${artifact.artifactId}" sha256 must match ${artifact.path}`);
  }

  for (const field of ['environmentId', 'operator', 'startedAt', 'completedAt']) {
    if (typeof artifact[field] !== 'string' || artifact[field].trim().length === 0) {
      violations.push(`${evidencePath}: passed artifact "${artifact.artifactId}" must define ${field}`);
    }
  }

  if (!/^sha256:[0-9a-f]{64}$/.test(String(artifact.imageDigest ?? ''))) {
    violations.push(`${evidencePath}: passed artifact "${artifact.artifactId}" must define immutable imageDigest`);
  }
}

function requirePackageWiring() {
  if (!scripts[gateScript]) {
    violations.push(`${packagePath}: missing ${gateScript}`);
  }

  if (!new Set(backendSafe.backendScripts ?? []).has(gateScript)) {
    violations.push(`${backendSafePath}: backend-safe verify must include ${gateScript}`);
  }
}

function requireReleaseWiring() {
  const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
  const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));

  if (!releaseGateIds.has(gateId)) {
    violations.push(`${releaseContractPath}: missing ${gateId} release gate`);
  }
  if (!releaseGateCommands.has(gateCommand)) {
    violations.push(`${releaseContractPath}: release gates must include ${gateScript}`);
  }
}

function requireBackendOpsWiring() {
  for (const domainId of requiredBackendOpsDomains) {
    const domain = (backendOps.requiredDomains ?? []).find((item) => item.domainId === domainId);
    if (domain === undefined) {
      violations.push(`${backendOpsPath}: missing backend ops domain "${domainId}"`);
      continue;
    }
    if (!domain.gates?.includes(gateScript)) {
      violations.push(`${backendOpsPath}: domain "${domainId}" must include ${gateScript}`);
    }
    if (!domain.releaseGateIds?.includes(gateId)) {
      violations.push(`${backendOpsPath}: domain "${domainId}" must include ${gateId} release gate`);
    }
    if (!domain.artifacts?.includes(evidencePath)) {
      violations.push(`${backendOpsPath}: domain "${domainId}" must include ${evidencePath}`);
    }
  }
}

function requireExternalReadinessWiring() {
  for (const groupId of requiredExternalGroups) {
    const group = (externalReadiness.requiredEvidenceGroups ?? []).find((item) => item.groupId === groupId);
    if (group === undefined) {
      violations.push(`${externalReadinessPath}: missing external readiness group "${groupId}"`);
      continue;
    }
    if (!group.verificationCommands?.includes(gateCommand)) {
      violations.push(`${externalReadinessPath}: group "${groupId}" must include ${gateScript}`);
    }
    if (!group.requiredArtifacts?.includes(evidencePath)) {
      violations.push(`${externalReadinessPath}: group "${groupId}" must include ${evidencePath}`);
    }
  }
}

function requireBaselineWiring() {
  if (!baseline.requiredGreenScripts?.includes(gateScript)) {
    violations.push(`${baselinePath}: requiredGreenScripts must include ${gateScript}`);
  }
  if (!(baseline.trackedArtifacts ?? []).some((artifact) => artifact.path === evidencePath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${evidencePath}`);
  }
}
