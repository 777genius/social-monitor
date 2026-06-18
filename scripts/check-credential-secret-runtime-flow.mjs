import { existsSync, readFileSync } from 'node:fs';

const contractPath = 'ops/security/credential-secret-runtime-flow.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';

const contract = readJson(contractPath);
const packageJson = readJson(packagePath);
const backendSafe = readJson(backendSafePath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const externalReadiness = readJson(externalReadinessPath);
const scripts = packageJson.scripts ?? {};
const violations = [];

const requiredSecretClasses = new Set([
  'source-credentials',
  'webhook-signing-secrets',
  'oidc-config',
  'postgres-credentials',
  'rabbitmq-credentials',
]);
const requiredEvidence = new Set([
  'source-config-rotation-redaction',
  'webhook-secret-rotation-redaction',
  'public-redaction-proof',
]);
const requiredEnvRefs = new Set([
  'SOURCE_CONFIG_ENCRYPTION_KEY',
  'DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY',
  'SOCIAL_MONITOR_OIDC_JWKS_JSON',
  'DATABASE_URL',
  'RABBITMQ_URL',
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

if (contract.externalBetaStatus !== 'hold_until_runtime_secret_store_and_rotation_evidence') {
  violations.push(`${contractPath}: externalBetaStatus must block external beta until runtime evidence exists`);
}

const secretClasses = new Set();
const envRefs = new Set();
for (const boundary of contract.approvedRuntimeBoundary ?? []) {
  if (secretClasses.has(boundary.secretClass)) {
    violations.push(`${contractPath}: duplicate secretClass "${boundary.secretClass}"`);
  }
  secretClasses.add(boundary.secretClass);

  if (!requiredSecretClasses.has(boundary.secretClass)) {
    violations.push(`${contractPath}: unsupported secretClass "${boundary.secretClass}"`);
  }
  for (const field of ['owner', 'approvedBoundary', 'rotationDrill']) {
    if (typeof boundary[field] !== 'string' || boundary[field].trim().length === 0) {
      violations.push(`${contractPath}: secretClass "${boundary.secretClass}" must define ${field}`);
    }
  }
  if (boundary.committedPlaintextAllowed !== false) {
    violations.push(`${contractPath}: secretClass "${boundary.secretClass}" must forbid committed plaintext`);
  }
  if (!Array.isArray(boundary.runtimeEnvRefs) || boundary.runtimeEnvRefs.length === 0) {
    violations.push(`${contractPath}: secretClass "${boundary.secretClass}" must define runtimeEnvRefs`);
  }
  for (const envRef of boundary.runtimeEnvRefs ?? []) {
    envRefs.add(envRef);
  }
}

for (const secretClass of requiredSecretClasses) {
  if (!secretClasses.has(secretClass)) {
    violations.push(`${contractPath}: missing secretClass "${secretClass}"`);
  }
}

for (const envRef of requiredEnvRefs) {
  if (!envRefs.has(envRef)) {
    violations.push(`${contractPath}: missing runtime env ref "${envRef}"`);
  }
}

const evidenceIds = new Set();
for (const evidence of contract.requiredEvidence ?? []) {
  if (evidenceIds.has(evidence.evidenceId)) {
    violations.push(`${contractPath}: duplicate evidenceId "${evidence.evidenceId}"`);
  }
  evidenceIds.add(evidence.evidenceId);

  if (!requiredEvidence.has(evidence.evidenceId)) {
    violations.push(`${contractPath}: unsupported evidenceId "${evidence.evidenceId}"`);
  }

  const scriptName = String(evidence.command ?? '').replace(/^npm run /, '');
  if (!scripts[scriptName]) {
    violations.push(`${contractPath}: evidence "${evidence.evidenceId}" references missing script "${scriptName}"`);
  }
  if (!existsSync(evidence.artifact)) {
    violations.push(`${contractPath}: evidence "${evidence.evidenceId}" references missing artifact "${evidence.artifact}"`);
  }
  if (typeof evidence.requiredSignal !== 'string' || evidence.requiredSignal.trim().length === 0) {
    violations.push(`${contractPath}: evidence "${evidence.evidenceId}" must define requiredSignal`);
  }
}

for (const evidenceId of requiredEvidence) {
  if (!evidenceIds.has(evidenceId)) {
    violations.push(`${contractPath}: missing evidence "${evidenceId}"`);
  }
}

if (!Array.isArray(contract.externalBetaExitCriteria) || contract.externalBetaExitCriteria.length < 3) {
  violations.push(`${contractPath}: externalBetaExitCriteria must list runtime, rotation and redaction evidence`);
}

const backendScripts = new Set(backendSafe.backendScripts ?? []);
const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));
const backendOpsDomain = (backendOps.requiredDomains ?? []).find(
  (domain) => domain.domainId === 'credential-secret-runtime-flow',
);
const externalGroup = (externalReadiness.requiredEvidenceGroups ?? []).find(
  (group) => group.groupId === 'credential-secret-runtime-flow',
);

if (!scripts['check:credential-secret-runtime-flow']) {
  violations.push(`${packagePath}: missing check:credential-secret-runtime-flow`);
}
if (!backendScripts.has('check:credential-secret-runtime-flow')) {
  violations.push(`${backendSafePath}: backend-safe verify must include check:credential-secret-runtime-flow`);
}
if (!releaseGateIds.has('credential-secret-runtime-flow')) {
  violations.push(`${releaseContractPath}: missing credential-secret-runtime-flow release gate`);
}
if (!releaseGateCommands.has('npm run check:credential-secret-runtime-flow')) {
  violations.push(`${releaseContractPath}: release gates must include check:credential-secret-runtime-flow command`);
}
if (backendOpsDomain === undefined) {
  violations.push(`${backendOpsPath}: missing credential-secret-runtime-flow domain`);
} else {
  if (!backendOpsDomain.gates?.includes('check:credential-secret-runtime-flow')) {
    violations.push(`${backendOpsPath}: credential-secret-runtime-flow domain must include check:credential-secret-runtime-flow`);
  }
  if (!backendOpsDomain.releaseGateIds?.includes('credential-secret-runtime-flow')) {
    violations.push(`${backendOpsPath}: credential-secret-runtime-flow domain must include credential-secret-runtime-flow gate`);
  }
  if (!backendOpsDomain.artifacts?.includes(contractPath)) {
    violations.push(`${backendOpsPath}: credential-secret-runtime-flow domain must include ${contractPath}`);
  }
}
if (externalGroup === undefined) {
  violations.push(`${externalReadinessPath}: missing credential-secret-runtime-flow external readiness group`);
} else {
  if (!externalGroup.verificationCommands?.includes('npm run check:credential-secret-runtime-flow')) {
    violations.push(`${externalReadinessPath}: credential-secret-runtime-flow group must include check:credential-secret-runtime-flow`);
  }
  if (!externalGroup.requiredArtifacts?.includes(contractPath)) {
    violations.push(`${externalReadinessPath}: credential-secret-runtime-flow group must include ${contractPath}`);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Credential secret runtime flow contract OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
