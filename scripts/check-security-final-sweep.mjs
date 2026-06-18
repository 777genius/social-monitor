import { existsSync, readFileSync } from 'node:fs';

const evidencePath = 'ops/security/security-final-sweep-evidence.json';
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

const gateScript = 'check:security-final-sweep';
const gateCommand = `npm run ${gateScript}`;
const gateId = 'security-final-sweep';
const requiredCheckIds = new Set([
  'secret-scan',
  'dependency-audit',
  'auth-e2e-boundary',
  'redaction-tests',
  'audit-event-review',
  'credential-redaction-proof',
]);
const requiredLeakClasses = new Set([
  'secret-values',
  'raw-provider-payloads',
  'raw-prompt-or-source-text',
]);
const requiredSurfaceIds = new Set(['logs', 'metrics', 'public-errors', 'audit-metadata']);
const forbiddenEvidenceFragments = [
  'smk_',
  'whsec_',
  'bearer ',
  'basic ',
  '://user:',
  'access_token',
  'refresh_token',
  'private_key',
  'raw_payload',
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

if (!['hold_until_deploy_log_metric_public_error_samples', 'passed'].includes(evidence.externalBetaStatus)) {
  violations.push(`${evidencePath}: externalBetaStatus must hold until deploy samples or be passed`);
}

validateDeploySampleEvidence();
validateRequiredChecks();
validateLeakClasses();
validateNoSensitiveEvidenceLiterals();
requireWiring();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Security final sweep evidence OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validateDeploySampleEvidence() {
  const deploy = evidence.deploySampleEvidence ?? {};

  if (!['pending_staging_evidence', 'passed'].includes(deploy.status)) {
    violations.push(`${evidencePath}: deploySampleEvidence.status must be pending_staging_evidence or passed`);
  }
  if (deploy.requiredForExternalBeta !== true) {
    violations.push(`${evidencePath}: deploySampleEvidence must be required for external beta`);
  }

  if (deploy.status === 'pending_staging_evidence') {
    for (const field of ['artifactPath', 'environmentId', 'imageDigest', 'sampledAt']) {
      if (deploy[field] !== null) {
        violations.push(`${evidencePath}: pending deploySampleEvidence must keep ${field}=null`);
      }
    }
  }

  if (deploy.status === 'passed') {
    requireExistingPath(deploy.artifactPath, 'deploySampleEvidence.artifactPath');
    for (const field of ['environmentId', 'sampledAt']) {
      if (typeof deploy[field] !== 'string' || deploy[field].trim().length === 0) {
        violations.push(`${evidencePath}: passed deploySampleEvidence must define ${field}`);
      }
    }
    if (!/^sha256:[0-9a-f]{64}$/.test(String(deploy.imageDigest ?? ''))) {
      violations.push(`${evidencePath}: passed deploySampleEvidence must define immutable imageDigest`);
    }
  }

  if (evidence.externalBetaStatus === 'passed' && deploy.status !== 'passed') {
    violations.push(`${evidencePath}: externalBetaStatus cannot be passed without passed deploySampleEvidence`);
  }
}

function validateRequiredChecks() {
  const checkIds = new Set();

  for (const check of evidence.requiredChecks ?? []) {
    if (checkIds.has(check.checkId)) {
      violations.push(`${evidencePath}: duplicate checkId "${check.checkId}"`);
    }
    checkIds.add(check.checkId);

    if (!requiredCheckIds.has(check.checkId)) {
      violations.push(`${evidencePath}: unsupported checkId "${check.checkId}"`);
    }
    if (check.blocking !== true) {
      violations.push(`${evidencePath}: check "${check.checkId}" must be blocking`);
    }
    validateCommand(check.command, `check "${check.checkId}"`);

    if (!Array.isArray(check.artifacts) || check.artifacts.length === 0) {
      violations.push(`${evidencePath}: check "${check.checkId}" must list artifacts`);
    }
    for (const artifact of check.artifacts ?? []) {
      requireExistingPath(artifact, `check "${check.checkId}" artifact`);
    }

    if (typeof check.requiredSignal !== 'string' || check.requiredSignal.trim().length === 0) {
      violations.push(`${evidencePath}: check "${check.checkId}" must define requiredSignal`);
    }
  }

  for (const checkId of requiredCheckIds) {
    if (!checkIds.has(checkId)) {
      violations.push(`${evidencePath}: missing check "${checkId}"`);
    }
  }
}

function validateLeakClasses() {
  const leakClasses = new Set();

  for (const leak of evidence.forbiddenRuntimeLeakClasses ?? []) {
    if (leakClasses.has(leak.leakClass)) {
      violations.push(`${evidencePath}: duplicate leakClass "${leak.leakClass}"`);
    }
    leakClasses.add(leak.leakClass);

    if (!requiredLeakClasses.has(leak.leakClass)) {
      violations.push(`${evidencePath}: unsupported leakClass "${leak.leakClass}"`);
    }

    const surfaces = new Set(leak.surfaces ?? []);
    for (const surfaceId of requiredSurfaceIds) {
      if (!surfaces.has(surfaceId)) {
        violations.push(`${evidencePath}: leakClass "${leak.leakClass}" must cover surface "${surfaceId}"`);
      }
    }

    if (typeof leak.requiredMitigation !== 'string' || leak.requiredMitigation.trim().length === 0) {
      violations.push(`${evidencePath}: leakClass "${leak.leakClass}" must define requiredMitigation`);
    }
  }

  for (const leakClass of requiredLeakClasses) {
    if (!leakClasses.has(leakClass)) {
      violations.push(`${evidencePath}: missing leakClass "${leakClass}"`);
    }
  }
}

function validateNoSensitiveEvidenceLiterals() {
  const serialized = JSON.stringify(evidence).toLowerCase();

  for (const fragment of forbiddenEvidenceFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${evidencePath}: evidence must not contain sensitive literal fragment "${fragment}"`);
    }
  }
}

function validateCommand(command, label) {
  const scriptName = String(command ?? '').replace(/^npm run /, '');
  if (!String(command ?? '').startsWith('npm run ')) {
    violations.push(`${evidencePath}: ${label} command must use npm run`);
    return;
  }
  if (!scripts[scriptName]) {
    violations.push(`${evidencePath}: ${label} references missing npm script "${scriptName}"`);
  }
}

function requireExistingPath(path, label) {
  if (typeof path !== 'string' || path.trim().length === 0 || !existsSync(path)) {
    violations.push(`${evidencePath}: ${label} must reference an existing path`);
  }
}

function requireWiring() {
  const backendScripts = new Set(backendSafe.backendScripts ?? []);
  const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
  const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));
  const secretDomain = (backendOps.requiredDomains ?? []).find(
    (domain) => domain.domainId === 'credential-secret-runtime-flow',
  );
  const externalGroup = (externalReadiness.requiredEvidenceGroups ?? []).find(
    (group) => group.groupId === 'security-final-sweep',
  );

  if (!scripts[gateScript]) {
    violations.push(`${packagePath}: missing ${gateScript}`);
  }
  if (!backendScripts.has(gateScript)) {
    violations.push(`${backendSafePath}: backend-safe verify must include ${gateScript}`);
  }
  if (!releaseGateIds.has(gateId)) {
    violations.push(`${releaseContractPath}: missing ${gateId} release gate`);
  }
  if (!releaseGateCommands.has(gateCommand)) {
    violations.push(`${releaseContractPath}: release gates must include ${gateScript}`);
  }

  if (secretDomain === undefined) {
    violations.push(`${backendOpsPath}: missing credential-secret-runtime-flow domain`);
  } else {
    if (!secretDomain.gates?.includes(gateScript)) {
      violations.push(`${backendOpsPath}: credential-secret-runtime-flow domain must include ${gateScript}`);
    }
    if (!secretDomain.releaseGateIds?.includes(gateId)) {
      violations.push(`${backendOpsPath}: credential-secret-runtime-flow domain must include ${gateId}`);
    }
    if (!secretDomain.artifacts?.includes(evidencePath)) {
      violations.push(`${backendOpsPath}: credential-secret-runtime-flow domain must include ${evidencePath}`);
    }
  }

  if (externalGroup === undefined) {
    violations.push(`${externalReadinessPath}: missing security-final-sweep group`);
  } else {
    if (!externalGroup.verificationCommands?.includes(gateCommand)) {
      violations.push(`${externalReadinessPath}: security-final-sweep group must include ${gateScript}`);
    }
    if (!externalGroup.requiredArtifacts?.includes(evidencePath)) {
      violations.push(`${externalReadinessPath}: security-final-sweep group must include ${evidencePath}`);
    }
    if (externalGroup.status !== 'pending_staging_evidence' && evidence.deploySampleEvidence?.status !== 'passed') {
      violations.push(`${externalReadinessPath}: security-final-sweep group must wait for staging evidence`);
    }
  }

  if (!baseline.requiredGreenScripts?.includes(gateScript)) {
    violations.push(`${baselinePath}: requiredGreenScripts must include ${gateScript}`);
  }
  if (!(baseline.trackedArtifacts ?? []).some((artifact) => artifact.path === evidencePath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${evidencePath}`);
  }
}
