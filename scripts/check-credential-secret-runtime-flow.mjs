import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validateEvidenceArtifactProvenance,
  validateEvidenceProvenanceRequirements,
  validateRealEvidenceIdentityStrings,
} from './lib/evidence-provenance.mjs';

const contractPath = 'ops/security/credential-secret-runtime-flow.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const captureScriptPath = 'scripts/capture-credential-secret-runtime-flow.mjs';
const runtimeFlowScriptPath = 'scripts/check-credential-secret-runtime-flow.ts';
const sourceConfigProtectorPath = 'libs/monitoring/adapters/security/aes-gcm-source-binding-config-protector.ts';
const sourceConfigProtectorSmokePath = 'scripts/check-source-config-protector-smoke.ts';

const contract = readJson(contractPath);
const packageJson = readJson(packagePath);
const backendSafe = readJson(backendSafePath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const externalReadiness = readJson(externalReadinessPath);
const baseline = readJson(baselinePath);
const captureScriptSource = readText(captureScriptPath);
const runtimeFlowScriptSource = readText(runtimeFlowScriptPath);
const sourceConfigProtectorSource = readText(sourceConfigProtectorPath);
const sourceConfigProtectorSmokeSource = readText(sourceConfigProtectorSmokePath);
const scripts = packageJson.scripts ?? {};
const violations = [];
const sourceCredentialRotationEvidencePath = process.env.SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH;
const webhookSecretRotationEvidencePath = process.env.WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH;
const stagingSecretStoreId = process.env.STAGING_SECRET_STORE_ID?.trim();

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
const sourceCredentialRotationFormat = 'source-credential-rotation-redacted-v1';
const webhookSecretRotationFormat = 'webhook-secret-rotation-redacted-v1';
const rotationArtifactEvidenceKinds = {
  sourceCredentialRotation: 'staging_source_credential_rotation',
  webhookSecretRotation: 'staging_webhook_secret_rotation',
};
const envArtifactValidationRules = new Map([
  ['SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH', {
    schemaKey: 'sourceCredentialRotation',
    expectedFormat: sourceCredentialRotationFormat,
    expectedSecretClass: 'source-credentials',
  }],
  ['WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH', {
    schemaKey: 'webhookSecretRotation',
    expectedFormat: webhookSecretRotationFormat,
    expectedSecretClass: 'webhook-signing-secrets',
  }],
]);
const requiredRotationOperations = {
  sourceCredentialRotation: new Set([
    'decrypt-with-current-key',
    'reencrypt-with-new-key-id',
    'preview-redaction-proof',
  ]),
  webhookSecretRotation: new Set([
    'new-key-signs',
    'old-key-rejected-after-rotation',
    'delivery-preview-redaction-proof',
  ]),
};
const requiredRotationRedactionFlags = {
  secretValuesIncluded: false,
  plaintextCredentialValuesIncluded: false,
  credentialUrlsIncluded: false,
  rawProviderPayloadsIncluded: false,
  rawWebhookPayloadsIncluded: false,
  piiIncluded: false,
};
const requiredOperationFields = new Set([
  'operationId',
  'status',
  'secretClass',
  'keyIdBefore',
  'keyIdAfter',
  'observedAt',
  'safeEvidence',
]);
const forbiddenArtifactFragments = [
  'bearer ',
  'basic ',
  'authorization',
  'access_token',
  'refresh_token',
  'id_token',
  'api_key',
  'apikey',
  'client_secret',
  'private_key',
  'password',
  'postgresql://',
  'postgres://',
  'amqp://',
  'amqps://',
  'github_pat_',
  'ghp_',
  'glpat-',
  'xoxb-',
  'xoxp-',
  'sk-proj-',
  'sk-live-',
  'smk_',
  'whsec_',
];
const forbiddenArtifactValuePatterns = [
  {
    label: 'query credential',
    regex: /\b(?:access_token|refresh_token|id_token|api_key|apikey|client_secret|signature|sig)=([^&\s"']+)/gi,
  },
  {
    label: 'header credential',
    regex: /\b(?:authorization|x-api-key|x-amz-security-token):\s*([^,\s"'}]+)/gi,
  },
  {
    label: 'jwt credential',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
];
const forbiddenArtifactKeys = new Set([
  'authorization',
  'bearer',
  'token',
  'apikey',
  'api_key',
  'apitoken',
  'api_token',
  'idtoken',
  'id_token',
  'jwttoken',
  'jwt_token',
  'sessiontoken',
  'session_token',
  'password',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'clientsecret',
  'client_secret',
  'privatekey',
  'private_key',
  'rawpayload',
  'raw_payload',
  'rawproviderpayload',
  'rawwebhookpayload',
  'secretvalue',
  'secret_value',
  'credentialurl',
  'credential_url',
  'databaseurl',
  'database_url',
  'rabbitmqurl',
  'rabbitmq_url',
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

validateRotationEvidence();
validateCaptureHandoff();
validateCaptureOutputPathGuards();
const rotationArtifactSchemas = contract.rotationArtifactSchemas ?? {};
validateRotationArtifactSchemas(rotationArtifactSchemas);
validateRotationArtifactPath(
  rotationArtifactSchemas.sourceCredentialRotation?.exampleArtifact,
  'rotationArtifactSchemas.sourceCredentialRotation.exampleArtifact',
  {
    allowExample: true,
    schemaKey: 'sourceCredentialRotation',
    expectedFormat: sourceCredentialRotationFormat,
    expectedSecretClass: 'source-credentials',
  },
);
validateRotationArtifactPath(
  rotationArtifactSchemas.webhookSecretRotation?.exampleArtifact,
  'rotationArtifactSchemas.webhookSecretRotation.exampleArtifact',
  {
    allowExample: true,
    schemaKey: 'webhookSecretRotation',
    expectedFormat: webhookSecretRotationFormat,
    expectedSecretClass: 'webhook-signing-secrets',
  },
);
if (contract.rotationEvidence?.status === 'passed') {
  validateRotationArtifactPath(
    contract.rotationEvidence.sourceCredentialArtifactPath,
    'rotationEvidence.sourceCredentialArtifactPath',
    {
      allowExample: false,
      schemaKey: 'sourceCredentialRotation',
      expectedFormat: sourceCredentialRotationFormat,
      expectedSecretClass: 'source-credentials',
      expectedEvidence: contract.rotationEvidence,
    },
  );
  validateRotationArtifactPath(
    contract.rotationEvidence.webhookSecretArtifactPath,
    'rotationEvidence.webhookSecretArtifactPath',
    {
      allowExample: false,
      schemaKey: 'webhookSecretRotation',
      expectedFormat: webhookSecretRotationFormat,
      expectedSecretClass: 'webhook-signing-secrets',
      expectedEvidence: contract.rotationEvidence,
    },
  );
}
if (
  sourceCredentialRotationEvidencePath !== undefined
  && sourceCredentialRotationEvidencePath.trim().length > 0
) {
  validateRotationArtifactPath(
    sourceCredentialRotationEvidencePath,
    'SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH',
    {
      allowExample: false,
      schemaKey: 'sourceCredentialRotation',
      expectedFormat: sourceCredentialRotationFormat,
      expectedSecretClass: 'source-credentials',
      expectedEvidence: {
        secretStoreId: requireEnvWhenRotationArtifactIsPresent(
          'SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH',
          'STAGING_SECRET_STORE_ID',
        ),
      },
    },
  );
}
if (
  webhookSecretRotationEvidencePath !== undefined
  && webhookSecretRotationEvidencePath.trim().length > 0
) {
  validateRotationArtifactPath(
    webhookSecretRotationEvidencePath,
    'WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH',
    {
      allowExample: false,
      schemaKey: 'webhookSecretRotation',
      expectedFormat: webhookSecretRotationFormat,
      expectedSecretClass: 'webhook-signing-secrets',
      expectedEvidence: {
        secretStoreId: requireEnvWhenRotationArtifactIsPresent(
          'WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH',
          'STAGING_SECRET_STORE_ID',
        ),
      },
    },
  );
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

  if (boundary.secretClass === 'source-credentials') {
    if (boundary.betaRuntimeRequiresPersistentKey !== true) {
      violations.push(
        `${contractPath}: source-credentials must set betaRuntimeRequiresPersistentKey=true`,
      );
    }
    if (!String(boundary.approvedBoundary).includes('beta runtime fails closed')) {
      violations.push(
        `${contractPath}: source-credentials approvedBoundary must document beta runtime fail-closed behavior`,
      );
    }
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

validateSourceConfigProtectorRuntimeBoundary();
validateBaselineWiring();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Credential secret runtime flow contract OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readRotationArtifact(path) {
  const rawContent = readFileSync(path, 'utf8');
  validateNoSensitiveArtifactContent(rawContent, path);
  return JSON.parse(rawContent);
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

function validateSourceConfigProtectorRuntimeBoundary() {
  for (const requiredFragment of [
    'resolveRuntimeProfile',
    "resolveRuntimeProfile(env) === 'beta'",
    'SOURCE_CONFIG_ENCRYPTION_KEY is required when SOCIAL_MONITOR_RUNTIME_PROFILE=beta',
  ]) {
    if (!sourceConfigProtectorSource.includes(requiredFragment)) {
      violations.push(
        `${sourceConfigProtectorPath}: source credential protector must fail closed without SOURCE_CONFIG_ENCRYPTION_KEY in beta runtime`,
      );
    }
  }

  for (const requiredFragment of [
    "NODE_ENV: 'production'",
    "NODE_ENV: 'staging'",
    "SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta'",
  ]) {
    if (!sourceConfigProtectorSmokeSource.includes(requiredFragment)) {
      violations.push(
        `${sourceConfigProtectorSmokePath}: source config smoke must cover missing SOURCE_CONFIG_ENCRYPTION_KEY for production, staging and beta runtime`,
      );
    }
  }
}

function validateRotationEvidence() {
  const evidence = contract.rotationEvidence ?? {};

  if (!['pending_staging_evidence', 'passed'].includes(evidence.status)) {
    violations.push(`${contractPath}: rotationEvidence.status must be pending_staging_evidence or passed`);
  }
  if (evidence.requiredForExternalBeta !== true) {
    violations.push(`${contractPath}: rotationEvidence.requiredForExternalBeta must be true`);
  }
  if (evidence.owner !== 'security-owner') {
    violations.push(`${contractPath}: rotationEvidence.owner must be security-owner`);
  }

  if (evidence.status === 'pending_staging_evidence') {
    for (const field of ['secretStoreId', 'sampledAt', 'sourceCredentialArtifactPath', 'webhookSecretArtifactPath']) {
      if (evidence[field] !== null) {
        violations.push(`${contractPath}: pending rotationEvidence must keep ${field}=null`);
      }
    }
  }

  if (evidence.status === 'passed') {
    for (const field of ['secretStoreId', 'sampledAt', 'sourceCredentialArtifactPath', 'webhookSecretArtifactPath']) {
      if (typeof evidence[field] !== 'string' || evidence[field].trim().length === 0) {
        violations.push(`${contractPath}: passed rotationEvidence must define ${field}`);
      }
    }
    if (!isIsoDateString(evidence.sampledAt)) {
      violations.push(`${contractPath}: rotationEvidence.sampledAt must be an ISO timestamp`);
    }
  }

  if (typeof evidence.exitCondition !== 'string' || evidence.exitCondition.trim().length === 0) {
    violations.push(`${contractPath}: rotationEvidence.exitCondition must be a non-empty string`);
  }
}

function validateRotationArtifactSchemas(schemas) {
  validateRotationSchema(
    schemas.sourceCredentialRotation,
    'sourceCredentialRotation',
    sourceCredentialRotationFormat,
  );
  validateRotationSchema(
    schemas.webhookSecretRotation,
    'webhookSecretRotation',
    webhookSecretRotationFormat,
  );

  for (const [field, expected] of Object.entries(requiredRotationRedactionFlags)) {
    if (schemas.requiredRedactionFlags?.[field] !== expected) {
      violations.push(`${contractPath}: rotationArtifactSchemas.requiredRedactionFlags.${field} must be ${expected}`);
    }
  }

  if (
    typeof schemas.exitCondition !== 'string'
    || !schemas.exitCondition.includes('SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH')
    || !schemas.exitCondition.includes('WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH')
  ) {
    violations.push(`${contractPath}: rotationArtifactSchemas.exitCondition must mention both rotation evidence env paths`);
  }
  validateEnvArtifactValidation(schemas.envArtifactValidation);
}

function validateRotationSchema(schema, schemaKey, expectedFormat) {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    violations.push(`${contractPath}: rotationArtifactSchemas.${schemaKey} must be an object`);
    return;
  }
  if (schema.artifactFormat !== expectedFormat) {
    violations.push(`${contractPath}: rotationArtifactSchemas.${schemaKey}.artifactFormat must be ${expectedFormat}`);
  }
  requireExistingPath(schema.exampleArtifact, `rotationArtifactSchemas.${schemaKey}.exampleArtifact`);
  validateProvenanceRequirements(schema.provenanceRequirements, schemaKey);

  const requiredOperations = requiredRotationOperations[schemaKey] ?? new Set();
  const operations = new Set(schema.requiredOperations ?? []);
  for (const operationId of requiredOperations) {
    if (!operations.has(operationId)) {
      violations.push(`${contractPath}: rotationArtifactSchemas.${schemaKey}.requiredOperations must include ${operationId}`);
    }
  }
  requireSetCoverage(
    new Set(schema.requiredOperationFields ?? []),
    requiredOperationFields,
    `rotationArtifactSchemas.${schemaKey}.requiredOperationFields`,
  );
}

function requireSetCoverage(actual, expected, label) {
  for (const expectedValue of expected) {
    if (!actual.has(expectedValue)) {
      violations.push(`${contractPath}: ${label} must include ${expectedValue}`);
    }
  }
}

function validateRotationArtifactPath(path, label, options) {
  requireExistingPath(path, label);
  if (typeof path !== 'string' || path.trim().length === 0 || !existsSync(path)) {
    return;
  }

  const artifact = readRotationArtifact(path);
  validateRotationArtifact(artifact, path, options);
}

function validateRotationArtifact(artifact, path, options) {
  if (artifact.schemaVersion !== 1) {
    violations.push(`${path}: schemaVersion must be 1`);
  }
  if (artifact.artifactFormat !== options.expectedFormat) {
    violations.push(`${path}: artifactFormat must be ${options.expectedFormat}`);
  }
  if (artifact.scope !== 'backend-only') {
    violations.push(`${path}: scope must be backend-only`);
  }
  if (artifact.frontendPolicy !== 'deferred_contract_only') {
    violations.push(`${path}: frontendPolicy must be deferred_contract_only`);
  }

  validateArtifactProvenance(artifact.provenance, path, options);
  validateArtifactEnvironment(artifact.environment, path, options);
  validateArtifactRedaction(artifact.redaction, path);
  validateArtifactOperations(artifact.operations, path, options);
  validateArtifactRollup(artifact.rollup, path);
  scanForbiddenArtifactKeys(artifact, path);
  validateNoSensitiveArtifactLiterals(artifact, path);
}

function validateProvenanceRequirements(requirements, schemaKey) {
  const expectedEvidenceKind = rotationArtifactEvidenceKinds[schemaKey];
  const label = `rotationArtifactSchemas.${schemaKey}.provenanceRequirements`;
  validateEvidenceProvenanceRequirements({
    requirements,
    expectedEvidenceKind,
    label,
    sourcePath: contractPath,
    violations,
  });
}

function validateArtifactProvenance(provenance, path, options) {
  const expectedEvidenceKind = rotationArtifactEvidenceKinds[options.schemaKey];
  validateEvidenceArtifactProvenance({
    provenance,
    label: path,
    expectedEvidenceKind,
    allowFixture: options.allowExample === true,
    violations,
    realEvidenceLabel: 'rotation evidence',
  });
}

function validateArtifactEnvironment(environment, path, options) {
  if (environment === null || typeof environment !== 'object' || Array.isArray(environment)) {
    violations.push(`${path}: environment must be an object`);
    return;
  }

  for (const field of ['environmentId', 'secretStoreId', 'sampledAt', 'operator']) {
    if (typeof environment[field] !== 'string' || environment[field].trim().length === 0) {
      violations.push(`${path}: environment.${field} must be a non-empty string`);
    }
  }
  if (!isIsoDateString(environment.sampledAt)) {
    violations.push(`${path}: environment.sampledAt must be an ISO timestamp`);
  }
  if (options.allowExample !== true) {
    validateRealEvidenceIdentityStrings({
      source: environment,
      fields: ['environmentId', 'secretStoreId', 'operator'],
      label: `${path}: environment`,
      violations,
      realEvidenceLabel: 'rotation evidence',
    });
  }

  const expected = options.expectedEvidence;
  if (expected !== undefined) {
    for (const field of ['secretStoreId', 'sampledAt']) {
      if (expected[field] !== undefined && environment[field] !== expected[field]) {
        violations.push(`${path}: environment.${field} must match rotationEvidence.${field}`);
      }
    }
  }
}

function validateArtifactRedaction(redaction, path) {
  if (redaction === null || typeof redaction !== 'object' || Array.isArray(redaction)) {
    violations.push(`${path}: redaction must be an object`);
    return;
  }

  for (const [field, expected] of Object.entries(requiredRotationRedactionFlags)) {
    if (redaction[field] !== expected) {
      violations.push(`${path}: redaction.${field} must be ${expected}`);
    }
  }
  if (typeof redaction.method !== 'string' || redaction.method.trim().length < 20) {
    violations.push(`${path}: redaction.method must explain the redaction process`);
  }
}

function validateArtifactOperations(operations, path, options) {
  if (!Array.isArray(operations)) {
    violations.push(`${path}: operations must be an array`);
    return;
  }

  const operationIds = new Set();
  for (const [index, operation] of operations.entries()) {
    validateArtifactOperation(operation, `${path}: operations[${index}]`, operationIds, options);
  }

  const requiredOperations = requiredRotationOperations[options.schemaKey] ?? new Set();
  for (const operationId of requiredOperations) {
    if (!operationIds.has(operationId)) {
      violations.push(`${path}: operations must include ${operationId}`);
    }
  }
}

function validateArtifactOperation(operation, label, operationIds, options) {
  if (operation === null || typeof operation !== 'object' || Array.isArray(operation)) {
    violations.push(`${label}: operation must be an object`);
    return;
  }

  const requiredOperations = requiredRotationOperations[options.schemaKey] ?? new Set();
  if (!requiredOperations.has(operation.operationId)) {
    violations.push(`${label}: unsupported operationId "${operation.operationId}"`);
  } else if (operationIds.has(operation.operationId)) {
    violations.push(`${label}: duplicate operationId "${operation.operationId}"`);
  } else {
    operationIds.add(operation.operationId);
  }
  if (operation.status !== 'passed') {
    violations.push(`${label}: status must be passed`);
  }
  if (!isIsoDateString(operation.observedAt)) {
    violations.push(`${label}: observedAt must be an ISO timestamp`);
  }
  if (operation.secretClass !== options.expectedSecretClass) {
    violations.push(`${label}: secretClass must be ${options.expectedSecretClass}`);
  }
  for (const field of ['keyIdBefore', 'keyIdAfter']) {
    if (typeof operation[field] !== 'string' || operation[field].trim().length === 0) {
      violations.push(`${label}: ${field} must be a non-empty string`);
    }
  }
  if (
    ['reencrypt-with-new-key-id', 'new-key-signs', 'old-key-rejected-after-rotation'].includes(operation.operationId)
    && operation.keyIdBefore === operation.keyIdAfter
  ) {
    violations.push(`${label}: ${operation.operationId} must change key id`);
  }

  validateSafeEvidence(operation.safeEvidence, label, operation.operationId);
}

function validateSafeEvidence(safeEvidence, label, operationId) {
  if (safeEvidence === null || typeof safeEvidence !== 'object' || Array.isArray(safeEvidence)) {
    violations.push(`${label}: safeEvidence must be an object`);
    return;
  }

  if (safeEvidence.plaintextObserved !== false) {
    violations.push(`${label}: safeEvidence.plaintextObserved must be false`);
  }
  if (safeEvidence.previewContainsSecretValue !== false) {
    violations.push(`${label}: safeEvidence.previewContainsSecretValue must be false`);
  }
  if (operationId === 'new-key-signs' && safeEvidence.signatureVerified !== true) {
    violations.push(`${label}: new-key-signs must have signatureVerified=true`);
  }
  if (operationId === 'old-key-rejected-after-rotation' && safeEvidence.signatureVerified !== false) {
    violations.push(`${label}: old-key-rejected-after-rotation must have signatureVerified=false`);
  }
  if (['decrypt-with-current-key', 'reencrypt-with-new-key-id', 'preview-redaction-proof'].includes(operationId)) {
    for (const field of ['credentialRecordId', 'provider']) {
      if (typeof safeEvidence[field] !== 'string' || safeEvidence[field].trim().length === 0) {
        violations.push(`${label}: ${operationId} safeEvidence.${field} must be a non-empty string`);
      }
    }
  }
  if (['new-key-signs', 'old-key-rejected-after-rotation', 'delivery-preview-redaction-proof'].includes(operationId)) {
    if (typeof safeEvidence.webhookEndpointId !== 'string' || safeEvidence.webhookEndpointId.trim().length === 0) {
      violations.push(`${label}: ${operationId} safeEvidence.webhookEndpointId must be a non-empty string`);
    }
  }
}

function validateArtifactRollup(rollup, path) {
  if (rollup === null || typeof rollup !== 'object' || Array.isArray(rollup)) {
    violations.push(`${path}: rollup must be an object`);
    return;
  }
  if (rollup.rotationPassed !== true) {
    violations.push(`${path}: rollup.rotationPassed must be true`);
  }
  if (rollup.redactionPassed !== true) {
    violations.push(`${path}: rollup.redactionPassed must be true`);
  }
  if (rollup.plaintextObserved !== false) {
    violations.push(`${path}: rollup.plaintextObserved must be false`);
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
  validateNoSensitiveArtifactContent(JSON.stringify(artifact), path);
}

function validateNoSensitiveArtifactContent(content, path) {
  const serialized = content.toLowerCase();
  for (const fragment of forbiddenArtifactFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${path}: artifact must not contain sensitive literal fragment "${fragment}"`);
    }
  }
  validateNoSensitivePatterns(content, `${path}: artifact`);
}

function validateNoSensitivePatterns(content, label) {
  for (const pattern of forbiddenArtifactValuePatterns) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(content)) {
      violations.push(`${label} must not contain sensitive ${pattern.label}`);
    }
    pattern.regex.lastIndex = 0;
  }
}

function validateBaselineWiring() {
  const artifactPaths = new Set((baseline.trackedArtifacts ?? []).map((artifact) => artifact.path));
  for (const path of [
    contractPath,
    contract.rotationArtifactSchemas?.sourceCredentialRotation?.exampleArtifact,
    contract.rotationArtifactSchemas?.webhookSecretRotation?.exampleArtifact,
  ]) {
    if (!artifactPaths.has(path)) {
      violations.push(`${baselinePath}: trackedArtifacts must include ${path}`);
    }
  }
}

function validateCaptureHandoff() {
  for (const marker of [
    'writeEvidenceEnvFile',
    'validateEvidenceEnvFilePath',
    'validateEvidenceJsonFilePath',
    'CREDENTIAL_SECRET_RUNTIME_FLOW_ENV_PATH',
    'SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH',
    'WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH',
    'STAGING_SECRET_STORE_ID',
  ]) {
    if (!captureScriptSource.includes(marker)) {
      violations.push(`${captureScriptPath}: credential secret capture env handoff must include ${marker}`);
    }
  }
  for (const marker of ['mode: 0o600', 'chmodSync']) {
    if (!runtimeFlowScriptSource.includes(marker)) {
      violations.push(`${runtimeFlowScriptPath}: credential secret runtime flow must write rotation artifacts with private permissions`);
    }
  }
  if (!captureScriptSource.includes('must not use local, fixture, example, mock or test identifiers')) {
    violations.push(`${captureScriptPath}: credential secret capture must reject non-beta evidence identity values`);
  }
}

function validateCaptureOutputPathGuards() {
  const sourceWorkspaceArtifactPath = resolve('source-credential-rotation-workspace-output.json');
  const sourceResult = runCaptureExpectingFailure({
    SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH: sourceWorkspaceArtifactPath,
    WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH: '/tmp/social-monitor-webhook-secret-rotation-output.json',
    CREDENTIAL_SECRET_RUNTIME_FLOW_ENV_PATH: '/tmp/social-monitor-credential-secret-runtime-flow.env',
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
    STAGING_SECRET_STORE_ID: 'staging-secret-store-1',
    STAGING_OPERATOR: 'security-owner-1',
  });

  if (sourceResult.exitCode === 0) {
    violations.push(`${captureScriptPath}: capture must reject workspace SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH`);
  } else if (!sourceResult.output.includes('SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH must not write release evidence into the git workspace')) {
    violations.push(`${captureScriptPath}: workspace artifact path rejection must explain evidence path policy`);
  }
  if (existsSync(sourceWorkspaceArtifactPath)) {
    violations.push(`${captureScriptPath}: workspace artifact path rejection must not create ${sourceWorkspaceArtifactPath}`);
  }

  const webhookWorkspaceArtifactPath = resolve('webhook-secret-rotation-workspace-output.json');
  const webhookResult = runCaptureExpectingFailure({
    SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH: '/tmp/social-monitor-source-credential-rotation-output.json',
    WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH: webhookWorkspaceArtifactPath,
    CREDENTIAL_SECRET_RUNTIME_FLOW_ENV_PATH: '/tmp/social-monitor-credential-secret-runtime-flow.env',
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
    STAGING_SECRET_STORE_ID: 'staging-secret-store-1',
    STAGING_OPERATOR: 'security-owner-1',
  });

  if (webhookResult.exitCode === 0) {
    violations.push(`${captureScriptPath}: capture must reject workspace WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH`);
  } else if (!webhookResult.output.includes('WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH must not write release evidence into the git workspace')) {
    violations.push(`${captureScriptPath}: workspace webhook artifact path rejection must explain evidence path policy`);
  }
  if (existsSync(webhookWorkspaceArtifactPath)) {
    violations.push(`${captureScriptPath}: workspace webhook artifact path rejection must not create ${webhookWorkspaceArtifactPath}`);
  }
}

function runCaptureExpectingFailure(env) {
  try {
    execFileSync(process.execPath, [captureScriptPath], {
      env: {
        ...process.env,
        ...env,
      },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
    };
  }
}

function validateEnvArtifactValidation(rules) {
  if (!Array.isArray(rules)) {
    violations.push(`${contractPath}: rotationArtifactSchemas.envArtifactValidation must be an array`);
    return;
  }

  const seen = new Set();
  for (const [index, rule] of rules.entries()) {
    const label = `rotationArtifactSchemas.envArtifactValidation[${index}]`;
    if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) {
      violations.push(`${contractPath}: ${label} must be an object`);
      continue;
    }
    const expected = envArtifactValidationRules.get(rule.envVar);
    if (expected === undefined) {
      violations.push(`${contractPath}: ${label}.envVar is unsupported`);
      continue;
    }
    seen.add(rule.envVar);
    if (rule.artifactFormat !== expected.expectedFormat) {
      violations.push(`${contractPath}: ${label}.artifactFormat must be ${expected.expectedFormat}`);
    }
    if (rule.secretClass !== expected.expectedSecretClass) {
      violations.push(`${contractPath}: ${label}.secretClass must be ${expected.expectedSecretClass}`);
    }
    if (!rule.requiredEnv?.includes('STAGING_SECRET_STORE_ID')) {
      violations.push(`${contractPath}: ${label}.requiredEnv must include STAGING_SECRET_STORE_ID`);
    }
    if (rule.requiredForExternalBeta !== true) {
      violations.push(`${contractPath}: ${label}.requiredForExternalBeta must be true`);
    }
  }

  for (const envVar of envArtifactValidationRules.keys()) {
    if (!seen.has(envVar)) {
      violations.push(`${contractPath}: rotationArtifactSchemas.envArtifactValidation must include ${envVar}`);
    }
  }
}

function requireEnvWhenRotationArtifactIsPresent(artifactEnvVar, requiredEnvVar) {
  if (requiredEnvVar === 'STAGING_SECRET_STORE_ID' && (stagingSecretStoreId === undefined || stagingSecretStoreId.length === 0)) {
    violations.push(`${artifactEnvVar} requires ${requiredEnvVar}`);
    return undefined;
  }

  return process.env[requiredEnvVar]?.trim();
}

function requireExistingPath(path, label) {
  if (typeof path !== 'string' || path.trim().length === 0 || !existsSync(path)) {
    violations.push(`${contractPath}: ${label} must reference an existing path`);
  }
}

function isIsoDateString(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}
