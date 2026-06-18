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
const securityFinalSweepArtifactPath = process.env.SECURITY_FINAL_SWEEP_ARTIFACT_PATH;

const gateScript = 'check:security-final-sweep';
const gateCommand = `npm run ${gateScript}`;
const gateId = 'security-final-sweep';
const securityFinalSweepArtifactFormat = 'security-final-sweep-staging-artifact-v1';
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
const forbiddenArtifactFragments = [
  ...forbiddenEvidenceFragments,
  'client_secret',
  'secret_key',
];
const forbiddenArtifactKeys = new Set([
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'privatekey',
  'private_key',
  'clientsecret',
  'client_secret',
  'secretkey',
  'secret_key',
  'rawpayload',
  'raw_payload',
  'rawproviderpayload',
  'rawprompt',
  'rawprompttext',
  'rawsource',
  'rawsourcetext',
  'credentialurl',
  'credentialurls',
]);
const requiredArtifactRedactionFlags = {
  secretValuesIncluded: false,
  credentialUrlsIncluded: false,
  rawProviderPayloadsIncluded: false,
  rawPromptTextIncluded: false,
  rawSourceTextIncluded: false,
  piiIncluded: false,
};

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
const deploySampleSchema = evidence.deploySampleContentSchema ?? {};
validateDeploySampleContentSchema(deploySampleSchema);
validateSecurityFinalSweepArtifactPath(
  deploySampleSchema.exampleArtifact,
  'deploySampleContentSchema.exampleArtifact',
  { allowExample: true },
);
if (evidence.deploySampleEvidence?.status === 'passed') {
  validateSecurityFinalSweepArtifactPath(
    evidence.deploySampleEvidence.artifactPath,
    'deploySampleEvidence.artifactPath',
    { allowExample: false, expectedDeploy: evidence.deploySampleEvidence },
  );
}
if (securityFinalSweepArtifactPath !== undefined && securityFinalSweepArtifactPath.trim().length > 0) {
  validateSecurityFinalSweepArtifactPath(
    securityFinalSweepArtifactPath,
    'SECURITY_FINAL_SWEEP_ARTIFACT_PATH',
    { allowExample: false },
  );
}
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

function validateDeploySampleContentSchema(schema) {
  if (schema.artifactFormat !== securityFinalSweepArtifactFormat) {
    violations.push(`${evidencePath}: deploySampleContentSchema.artifactFormat must be ${securityFinalSweepArtifactFormat}`);
  }
  requireExistingPath(schema.exampleArtifact, 'deploySampleContentSchema.exampleArtifact');
  requireSetCoverage(
    new Set(schema.requiredSurfaces ?? []),
    requiredSurfaceIds,
    'deploySampleContentSchema.requiredSurfaces',
  );
  requireSetCoverage(
    new Set(schema.requiredLeakClasses ?? []),
    requiredLeakClasses,
    'deploySampleContentSchema.requiredLeakClasses',
  );

  for (const [field, expected] of Object.entries(requiredArtifactRedactionFlags)) {
    if (schema.requiredRedactionFlags?.[field] !== expected) {
      violations.push(`${evidencePath}: deploySampleContentSchema.requiredRedactionFlags.${field} must be ${expected}`);
    }
  }

  if (
    typeof schema.exitCondition !== 'string'
    || !schema.exitCondition.includes(securityFinalSweepArtifactFormat)
  ) {
    violations.push(`${evidencePath}: deploySampleContentSchema.exitCondition must mention ${securityFinalSweepArtifactFormat}`);
  }
}

function requireSetCoverage(actual, expected, label) {
  for (const expectedValue of expected) {
    if (!actual.has(expectedValue)) {
      violations.push(`${evidencePath}: ${label} must include "${expectedValue}"`);
    }
  }
}

function validateSecurityFinalSweepArtifactPath(path, label, options) {
  requireExistingPath(path, label);
  if (typeof path !== 'string' || path.trim().length === 0 || !existsSync(path)) {
    return;
  }

  const artifact = readJson(path);
  validateSecurityFinalSweepArtifact(artifact, path, options);
}

function validateSecurityFinalSweepArtifact(artifact, path, options) {
  if (artifact.schemaVersion !== 1) {
    violations.push(`${path}: schemaVersion must be 1`);
  }
  if (artifact.artifactFormat !== securityFinalSweepArtifactFormat) {
    violations.push(`${path}: artifactFormat must be ${securityFinalSweepArtifactFormat}`);
  }
  if (artifact.scope !== 'backend-only') {
    violations.push(`${path}: scope must be backend-only`);
  }
  if (artifact.frontendPolicy !== 'deferred_contract_only') {
    violations.push(`${path}: frontendPolicy must be deferred_contract_only`);
  }

  validateArtifactEnvironment(artifact.environment, path, options);
  validateArtifactRedaction(artifact.redaction, path);
  validateArtifactSurfaces(artifact.surfaces, path);
  validateArtifactReview(artifact.review, path);
  scanForbiddenArtifactKeys(artifact, path);
  validateNoSensitiveArtifactLiterals(artifact, path);
}

function validateArtifactEnvironment(environment, path, options) {
  if (environment === null || typeof environment !== 'object' || Array.isArray(environment)) {
    violations.push(`${path}: environment must be an object`);
    return;
  }

  for (const field of ['environmentId', 'imageDigest', 'sampledAt', 'operator']) {
    if (typeof environment[field] !== 'string' || environment[field].trim().length === 0) {
      violations.push(`${path}: environment.${field} must be a non-empty string`);
    }
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(String(environment.imageDigest ?? ''))) {
    violations.push(`${path}: environment.imageDigest must be an immutable sha256 digest`);
  }
  if (!isIsoDateString(environment.sampledAt)) {
    violations.push(`${path}: environment.sampledAt must be an ISO timestamp`);
  }
  if (options.allowExample !== true && environment.environmentId?.includes('example')) {
    violations.push(`${path}: real staging artifact environmentId must not be an example environment`);
  }

  const expected = options.expectedDeploy;
  if (expected !== undefined) {
    for (const field of ['environmentId', 'imageDigest', 'sampledAt']) {
      if (environment[field] !== expected[field]) {
        violations.push(`${path}: environment.${field} must match deploySampleEvidence.${field}`);
      }
    }
  }
}

function validateArtifactRedaction(redaction, path) {
  if (redaction === null || typeof redaction !== 'object' || Array.isArray(redaction)) {
    violations.push(`${path}: redaction must be an object`);
    return;
  }

  for (const [field, expected] of Object.entries(requiredArtifactRedactionFlags)) {
    if (redaction[field] !== expected) {
      violations.push(`${path}: redaction.${field} must be ${expected}`);
    }
  }

  if (typeof redaction.method !== 'string' || redaction.method.trim().length < 20) {
    violations.push(`${path}: redaction.method must explain how staging samples were sanitized`);
  }
}

function validateArtifactSurfaces(surfaces, path) {
  if (!Array.isArray(surfaces)) {
    violations.push(`${path}: surfaces must be an array`);
    return;
  }

  const surfaceIds = new Set();
  for (const [index, surface] of surfaces.entries()) {
    const surfaceLabel = `${path}: surfaces[${index}]`;
    validateArtifactSurface(surface, surfaceLabel, surfaceIds);
  }

  for (const surfaceId of requiredSurfaceIds) {
    if (!surfaceIds.has(surfaceId)) {
      violations.push(`${path}: surfaces must include ${surfaceId}`);
    }
  }
}

function validateArtifactSurface(surface, surfaceLabel, surfaceIds) {
  if (surface === null || typeof surface !== 'object' || Array.isArray(surface)) {
    violations.push(`${surfaceLabel}: surface must be an object`);
    return;
  }

  if (!requiredSurfaceIds.has(surface.surfaceId)) {
    violations.push(`${surfaceLabel}: unsupported surfaceId "${surface.surfaceId}"`);
  } else if (surfaceIds.has(surface.surfaceId)) {
    violations.push(`${surfaceLabel}: duplicate surfaceId "${surface.surfaceId}"`);
  } else {
    surfaceIds.add(surface.surfaceId);
  }

  if (!Number.isInteger(surface.sampleCount) || surface.sampleCount <= 0) {
    violations.push(`${surfaceLabel}: sampleCount must be a positive integer`);
  }
  if (surface.scanStatus !== 'passed') {
    violations.push(`${surfaceLabel}: scanStatus must be passed`);
  }
  if (surface.redactedOnly !== true) {
    violations.push(`${surfaceLabel}: redactedOnly must be true`);
  }
  if (!Array.isArray(surface.safeDiagnosticFields) || surface.safeDiagnosticFields.length === 0) {
    violations.push(`${surfaceLabel}: safeDiagnosticFields must be a non-empty array`);
  }

  for (const field of surface.safeDiagnosticFields ?? []) {
    if (typeof field !== 'string' || field.trim().length === 0) {
      violations.push(`${surfaceLabel}: safeDiagnosticFields must contain non-empty strings`);
      continue;
    }
    const normalized = field.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (forbiddenArtifactKeys.has(normalized)) {
      violations.push(`${surfaceLabel}: unsafe diagnostic field "${field}"`);
    }
  }

  validateLeakClassResults(surface.leakClassResults, surfaceLabel);
}

function validateLeakClassResults(results, surfaceLabel) {
  if (!Array.isArray(results)) {
    violations.push(`${surfaceLabel}: leakClassResults must be an array`);
    return;
  }

  const resultIds = new Set();
  for (const [index, result] of results.entries()) {
    const resultLabel = `${surfaceLabel}.leakClassResults[${index}]`;
    if (result === null || typeof result !== 'object' || Array.isArray(result)) {
      violations.push(`${resultLabel}: result must be an object`);
      continue;
    }

    if (!requiredLeakClasses.has(result.leakClass)) {
      violations.push(`${resultLabel}: unsupported leakClass "${result.leakClass}"`);
    } else if (resultIds.has(result.leakClass)) {
      violations.push(`${resultLabel}: duplicate leakClass "${result.leakClass}"`);
    } else {
      resultIds.add(result.leakClass);
    }
    if (result.found !== false) {
      violations.push(`${resultLabel}: found must be false`);
    }
    if (!Number.isInteger(result.sampleCount) || result.sampleCount <= 0) {
      violations.push(`${resultLabel}: sampleCount must be a positive integer`);
    }
  }

  for (const leakClass of requiredLeakClasses) {
    if (!resultIds.has(leakClass)) {
      violations.push(`${surfaceLabel}: leakClassResults must include ${leakClass}`);
    }
  }
}

function validateArtifactReview(review, path) {
  if (review === null || typeof review !== 'object' || Array.isArray(review)) {
    violations.push(`${path}: review must be an object`);
    return;
  }

  if (typeof review.reviewer !== 'string' || review.reviewer.trim().length === 0) {
    violations.push(`${path}: review.reviewer must be a non-empty string`);
  }
  if (review.decision !== 'passed') {
    violations.push(`${path}: review.decision must be passed`);
  }
  if (typeof review.notes !== 'string' || review.notes.trim().length < 20) {
    violations.push(`${path}: review.notes must explain the staging redaction review`);
  }
}

function scanForbiddenArtifactKeys(value, label) {
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      scanForbiddenArtifactKeys(item, `${label}[${index}]`);
    }
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (forbiddenArtifactKeys.has(normalizedKey)) {
      violations.push(`${label}: forbidden sensitive field "${key}"`);
    }
    scanForbiddenArtifactKeys(nested, `${label}.${key}`);
  }
}

function validateNoSensitiveArtifactLiterals(artifact, path) {
  const serialized = JSON.stringify(artifact).toLowerCase();
  for (const fragment of forbiddenArtifactFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${path}: artifact must not contain sensitive literal fragment "${fragment}"`);
    }
  }
}

function isIsoDateString(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && value.includes('T');
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
