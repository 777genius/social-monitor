import { existsSync, readFileSync } from 'node:fs';
import {
  validateEvidenceArtifactProvenance,
  validateEvidenceProvenanceRequirements,
  validateRealEvidenceIdentityStrings,
} from './lib/evidence-provenance.mjs';
import { URL } from 'node:url';

const proofPath = 'ops/release/durable-runtime-proof.json';
const persistencePath = 'ops/release/persistence-readiness-contract.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const dockerDurableRuntimeCapturePath = 'scripts/capture-docker-durable-runtime-proof.mjs';
const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
const persistence = JSON.parse(readFileSync(persistencePath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const backendSafe = JSON.parse(readFileSync(backendSafePath, 'utf8'));
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const scripts = packageJson.scripts ?? {};
const verifyScript = String(scripts.verify ?? '');
const backendSafeScripts = new Set(backendSafe.backendScripts ?? []);
const durableRuntimeSelectorArtifactPath = process.env.DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH;
const hasVerificationScript = (scriptName) =>
  verifyScript.includes(`npm run ${scriptName}`) || backendSafeScripts.has(scriptName);
const violations = [];
const durableRuntimeSelectorArtifactFormat = 'durable-runtime-selector-artifact-v1';
const durableRuntimeEvidenceKind = 'staging_runtime_selector';
const forbiddenArtifactFragments = [
  'bearer ',
  'basic ',
  'access_token',
  'refresh_token',
  'id_token',
  'client_secret=',
  'private_key',
  'postgres://',
  'postgresql://',
  'amqp://',
  'amqps://',
  'redis://',
  'rediss://',
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
const requiredServiceSelectorValues = new Map([
  ['api-gateway', {
    MONITORING_PERSISTENCE: 'prisma',
    MONITORING_SCAN_QUEUE: 'rabbitmq',
    FEED_PERSISTENCE: 'prisma',
    SUMMARY_PERSISTENCE: 'prisma',
    SUMMARY_JOB_QUEUE_MODE: 'rabbitmq',
    DELIVERY_PERSISTENCE: 'prisma',
    DELIVERY_ENABLED_CHANNELS: 'webhook',
    DELIVERY_WEBHOOK_PROVIDER: 'http',
    IDENTITY_PERSISTENCE: 'prisma',
    USAGE_PERSISTENCE: 'prisma',
  }],
  ['ingestion-worker', {
    INGESTION_SUPPORT_PERSISTENCE: 'prisma',
    INGESTION_WORKER_PERSISTENCE: 'prisma',
    INGESTION_SCAN_QUEUE_READER: 'rabbitmq',
    INGESTION_SCAN_QUEUE_DRAIN_LOOP: 'enabled',
    INGESTION_SCAN_REPORTER: 'monitoring',
    MONITORING_PERSISTENCE: 'prisma',
    FEED_PERSISTENCE: 'prisma',
  }],
  ['intelligence-worker', {
    SUMMARY_PERSISTENCE: 'prisma',
    SUMMARY_JOB_QUEUE_MODE: 'rabbitmq',
    INTELLIGENCE_SUMMARY_QUEUE_READER: 'rabbitmq',
    INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP: 'enabled',
    INTELLIGENCE_SUMMARY_JOB_LOOP: 'disabled',
  }],
  ['delivery-service', {
    DELIVERY_PERSISTENCE: 'prisma',
    DELIVERY_ENABLED_CHANNELS: 'webhook',
    DELIVERY_WEBHOOK_PROVIDER: 'http',
    DELIVERY_ATTEMPT_DISPATCH_TARGET: 'queue',
    DELIVERY_ATTEMPT_DISPATCH_QUEUE: 'rabbitmq',
    DELIVERY_ATTEMPT_QUEUE_READER: 'rabbitmq',
    DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP: 'enabled',
    DELIVERY_SUMMARY_READY_EVENT_READER: 'rabbitmq',
    DELIVERY_SUMMARY_READY_EVENT_DRAIN_LOOP: 'enabled',
  }],
  ['event-relay', {
    EVENT_RELAY_LOOP: 'enabled',
  }],
]);

if (proof.schemaVersion !== 1) {
  violations.push(`${proofPath}: schemaVersion must be 1`);
}

if (proof.scope !== 'backend-only') {
  violations.push(`${proofPath}: scope must be backend-only`);
}

if (proof.proofMode !== 'compose_contract_without_live_deploy') {
  violations.push(`${proofPath}: proofMode must stay compose_contract_without_live_deploy until staging evidence is attached`);
}

if (proof.externalBetaStatus !== 'hold_until_staging_runtime_evidence') {
  violations.push(`${proofPath}: externalBetaStatus must hold until staging runtime evidence exists`);
}

validateStagingRuntimeEvidence();
const stagingRuntimeEvidenceSchema = proof.stagingRuntimeEvidenceSchema ?? {};
validateStagingRuntimeEvidenceSchema(stagingRuntimeEvidenceSchema);
validateDurableRuntimeSelectorArtifactPath(
  stagingRuntimeEvidenceSchema.exampleArtifact,
  'stagingRuntimeEvidenceSchema.exampleArtifact',
  { allowExample: true },
);
if (proof.stagingRuntimeEvidence?.status === 'passed') {
  validateDurableRuntimeSelectorArtifactPath(
    proof.stagingRuntimeEvidence.artifactPath,
    'stagingRuntimeEvidence.artifactPath',
    { allowExample: false, expectedEvidence: proof.stagingRuntimeEvidence },
  );
}
if (
  durableRuntimeSelectorArtifactPath !== undefined
  && durableRuntimeSelectorArtifactPath.trim().length > 0
) {
  validateDurableRuntimeSelectorArtifactPath(
    durableRuntimeSelectorArtifactPath,
    'DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH',
    {
      allowExample: false,
      expectedEvidence: {
        environmentId: requireEnvWhenArtifactIsPresent('STAGING_ENVIRONMENT_ID'),
        imageDigest: requireEnvWhenArtifactIsPresent('BACKEND_IMAGE_DIGEST'),
        apiBaseUrl: requireEnvWhenArtifactIsPresent('API_BASE_URL'),
      },
    },
  );
}

if (!existsSync(proof.composeFile)) {
  violations.push(`${proofPath}: composeFile must exist`);
} else {
  const compose = readFileSync(proof.composeFile, 'utf8');
  for (const marker of proof.requiredComposeMarkers ?? []) {
    if (!compose.includes(marker)) {
      violations.push(`${proof.composeFile}: missing durable runtime marker "${marker}"`);
    }
  }

  for (const forbidden of proof.forbiddenBetaSelectorValues ?? []) {
    if (compose.includes(forbidden)) {
      violations.push(`${proof.composeFile}: beta compose must not include forbidden selector "${forbidden}"`);
    }
  }
}

if (persistence.mvpRuntimeDecision?.blocksExternalBeta !== true) {
  violations.push(`${persistencePath}: persistence readiness must continue blocking external beta without deployed runtime proof`);
}

if (!Array.isArray(proof.stagingExitCriteria) || proof.stagingExitCriteria.length < 4) {
  violations.push(`${proofPath}: stagingExitCriteria must list concrete staging evidence`);
}
if (!(proof.stagingExitCriteria ?? []).some((criterion) => criterion.includes(durableRuntimeSelectorArtifactFormat))) {
  violations.push(`${proofPath}: stagingExitCriteria must require ${durableRuntimeSelectorArtifactFormat}`);
}

for (const requiredScript of ['check:durable-runtime-proof', 'check:persistence-readiness']) {
  if (!scripts[requiredScript]) {
    violations.push(`${packagePath}: missing ${requiredScript}`);
  }
  if (!hasVerificationScript(requiredScript)) {
    violations.push(`${packagePath}: npm run verify or verify:backend must include ${requiredScript}`);
  }
}

validateBaselineWiring();
validateCaptureScriptWiring();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Durable runtime proof contract OK');

function validateStagingRuntimeEvidence() {
  const staging = proof.stagingRuntimeEvidence ?? {};

  if (!['pending_staging_evidence', 'passed'].includes(staging.status)) {
    violations.push(`${proofPath}: stagingRuntimeEvidence.status must be pending_staging_evidence or passed`);
  }
  if (staging.requiredForExternalBeta !== true) {
    violations.push(`${proofPath}: stagingRuntimeEvidence must be required for external beta`);
  }

  if (staging.status === 'pending_staging_evidence') {
    for (const field of ['artifactPath', 'environmentId', 'imageDigest', 'apiBaseUrl', 'sampledAt']) {
      if (staging[field] !== null) {
        violations.push(`${proofPath}: pending stagingRuntimeEvidence must keep ${field}=null`);
      }
    }
  }

  if (staging.status === 'passed') {
    requireExistingPath(staging.artifactPath, 'stagingRuntimeEvidence.artifactPath');
    for (const field of ['environmentId', 'sampledAt']) {
      if (typeof staging[field] !== 'string' || staging[field].trim().length === 0) {
        violations.push(`${proofPath}: passed stagingRuntimeEvidence must define ${field}`);
      }
    }
    if (!isHttpUrlWithoutCredentials(staging.apiBaseUrl)) {
      violations.push(`${proofPath}: passed stagingRuntimeEvidence must define apiBaseUrl without credentials`);
    }
    if (!/^sha256:[0-9a-f]{64}$/.test(String(staging.imageDigest ?? ''))) {
      violations.push(`${proofPath}: passed stagingRuntimeEvidence must define immutable imageDigest`);
    }
  }
}

function validateStagingRuntimeEvidenceSchema(schema) {
  if (schema.artifactFormat !== durableRuntimeSelectorArtifactFormat) {
    violations.push(`${proofPath}: stagingRuntimeEvidenceSchema.artifactFormat must be ${durableRuntimeSelectorArtifactFormat}`);
  }
  requireExistingPath(schema.exampleArtifact, 'stagingRuntimeEvidenceSchema.exampleArtifact');
  requireSetCoverage(
    new Set(schema.requiredServices ?? []),
    new Set(requiredServiceSelectorValues.keys()),
    'stagingRuntimeEvidenceSchema.requiredServices',
  );

  const shared = schema.requiredSharedSelectors ?? {};
  for (const [selector, expected] of Object.entries({
    SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
    DATABASE_URL_KIND: 'postgresql',
    RABBITMQ_URL_KIND: 'amqp',
    RABBITMQ_QUEUE_TYPE: 'quorum',
    RABBITMQ_QUEUE_DELIVERY_LIMIT: '20',
    SOCIAL_MONITOR_USER_AUTH_MODE: 'oidc-jwt',
  })) {
    if (shared[selector] !== expected) {
      violations.push(`${proofPath}: stagingRuntimeEvidenceSchema.requiredSharedSelectors.${selector} must be ${expected}`);
    }
  }

  const forbiddenValues = new Set(schema.forbiddenSelectorValues ?? []);
  for (const forbidden of ['in-memory', 'noop', 'auth-disabled', 'event-relay-disabled']) {
    if (!forbiddenValues.has(forbidden)) {
      violations.push(`${proofPath}: stagingRuntimeEvidenceSchema.forbiddenSelectorValues must include ${forbidden}`);
    }
  }

  requireSetCoverage(
    new Set(schema.requiredRuntimeEnv ?? []),
    new Set(['STAGING_ENVIRONMENT_ID', 'BACKEND_IMAGE_DIGEST', 'API_BASE_URL', 'DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH']),
    'stagingRuntimeEvidenceSchema.requiredRuntimeEnv',
  );
  validateProvenanceRequirements(schema.provenanceRequirements);

  if (
    typeof schema.exitCondition !== 'string'
    || !schema.exitCondition.includes(durableRuntimeSelectorArtifactFormat)
  ) {
    violations.push(`${proofPath}: stagingRuntimeEvidenceSchema.exitCondition must mention ${durableRuntimeSelectorArtifactFormat}`);
  }
}

function validateProvenanceRequirements(requirements) {
  validateEvidenceProvenanceRequirements({
    requirements,
    expectedEvidenceKind: durableRuntimeEvidenceKind,
    label: 'stagingRuntimeEvidenceSchema.provenanceRequirements',
    sourcePath: proofPath,
    violations,
  });
}

function requireSetCoverage(actual, expected, label) {
  for (const expectedValue of expected) {
    if (!actual.has(expectedValue)) {
      violations.push(`${proofPath}: ${label} must include "${expectedValue}"`);
    }
  }
}

function validateDurableRuntimeSelectorArtifactPath(path, label, options) {
  requireExistingPath(path, label);
  if (typeof path !== 'string' || path.trim().length === 0 || !existsSync(path)) {
    return;
  }

  const artifact = readDurableRuntimeSelectorArtifact(path);
  if (artifact === undefined) {
    return;
  }
  validateDurableRuntimeSelectorArtifact(artifact, path, options);
}

function readDurableRuntimeSelectorArtifact(path) {
  const rawContent = readFileSync(path, 'utf8');
  validateNoSensitiveArtifactContent(rawContent, path);
  try {
    return JSON.parse(rawContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    violations.push(`${path}: durable runtime selector artifact must be valid JSON (${message})`);
    return undefined;
  }
}

function validateDurableRuntimeSelectorArtifact(artifact, path, options) {
  if (artifact.schemaVersion !== 1) {
    violations.push(`${path}: schemaVersion must be 1`);
  }
  if (artifact.artifactFormat !== durableRuntimeSelectorArtifactFormat) {
    violations.push(`${path}: artifactFormat must be ${durableRuntimeSelectorArtifactFormat}`);
  }
  if (artifact.scope !== 'backend-only') {
    violations.push(`${path}: scope must be backend-only`);
  }
  if (artifact.frontendPolicy !== 'deferred_contract_only') {
    violations.push(`${path}: frontendPolicy must be deferred_contract_only`);
  }

  validateArtifactProvenance(artifact.provenance, path, options);
  validateArtifactEnvironment(artifact.environment, path, options);
  validateArtifactServices(artifact.services, path);
  validateArtifactRollup(artifact.rollup, path);
  validateNoSensitiveArtifactContent(JSON.stringify(artifact), path);
}

function validateArtifactProvenance(provenance, path, options) {
  validateEvidenceArtifactProvenance({
    provenance,
    label: path,
    expectedEvidenceKind: durableRuntimeEvidenceKind,
    allowFixture: options.allowExample === true,
    violations,
    realEvidenceLabel: 'runtime selector evidence',
  });
}

function validateArtifactEnvironment(environment, path, options) {
  if (environment === null || typeof environment !== 'object' || Array.isArray(environment)) {
    violations.push(`${path}: environment must be an object`);
    return;
  }

  for (const field of ['environmentId', 'imageDigest', 'apiBaseUrl', 'sampledAt', 'operator']) {
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
  if (!isHttpUrlWithoutCredentials(environment.apiBaseUrl)) {
    violations.push(`${path}: environment.apiBaseUrl must be an http(s) URL without credentials`);
  }
  if (options.allowExample !== true) {
    validateRealEvidenceIdentityStrings({
      source: environment,
      fields: ['environmentId', 'operator'],
      label: `${path}: environment`,
      violations,
      realEvidenceLabel: 'runtime selector evidence',
    });
  }

  const expected = options.expectedEvidence;
  if (expected !== undefined) {
    for (const field of ['environmentId', 'imageDigest', 'apiBaseUrl', 'sampledAt']) {
      if (expected[field] !== undefined && environment[field] !== expected[field]) {
        violations.push(`${path}: environment.${field} must match stagingRuntimeEvidence.${field}`);
      }
    }
  }
}

function validateArtifactServices(services, path) {
  if (!Array.isArray(services)) {
    violations.push(`${path}: services must be an array`);
    return;
  }

  const serviceIds = new Set();
  for (const [index, service] of services.entries()) {
    validateArtifactService(service, `${path}: services[${index}]`, serviceIds);
  }

  for (const serviceId of requiredServiceSelectorValues.keys()) {
    if (!serviceIds.has(serviceId)) {
      violations.push(`${path}: services must include ${serviceId}`);
    }
  }
}

function validateArtifactService(service, serviceLabel, serviceIds) {
  if (service === null || typeof service !== 'object' || Array.isArray(service)) {
    violations.push(`${serviceLabel}: service must be an object`);
    return;
  }

  if (!requiredServiceSelectorValues.has(service.serviceId)) {
    violations.push(`${serviceLabel}: unsupported serviceId "${service.serviceId}"`);
  } else if (serviceIds.has(service.serviceId)) {
    violations.push(`${serviceLabel}: duplicate serviceId "${service.serviceId}"`);
  } else {
    serviceIds.add(service.serviceId);
  }

  if (service.runtimeProfile !== 'beta') {
    violations.push(`${serviceLabel}: runtimeProfile must be beta`);
  }
  validateSharedSelectors(service.sharedSelectors, serviceLabel);
  validateServiceSelectors(service.serviceId, service.serviceSelectors, serviceLabel);

  if (!Array.isArray(service.forbiddenSelectorValuesFound) || service.forbiddenSelectorValuesFound.length !== 0) {
    violations.push(`${serviceLabel}: forbiddenSelectorValuesFound must be an empty array`);
  }

  if (service.healthCheck?.status !== 'passed') {
    violations.push(`${serviceLabel}: healthCheck.status must be passed`);
  }
  if (!isIsoDateString(service.healthCheck?.checkedAt)) {
    violations.push(`${serviceLabel}: healthCheck.checkedAt must be an ISO timestamp`);
  }
}

function validateSharedSelectors(sharedSelectors, serviceLabel) {
  if (sharedSelectors === null || typeof sharedSelectors !== 'object' || Array.isArray(sharedSelectors)) {
    violations.push(`${serviceLabel}: sharedSelectors must be an object`);
    return;
  }

  for (const [selector, expected] of Object.entries(proof.stagingRuntimeEvidenceSchema.requiredSharedSelectors ?? {})) {
    if (sharedSelectors[selector] !== expected) {
      violations.push(`${serviceLabel}: sharedSelectors.${selector} must be ${expected}`);
    }
  }
  rejectForbiddenSelectorValues(sharedSelectors, `${serviceLabel}.sharedSelectors`);
}

function validateServiceSelectors(serviceId, serviceSelectors, serviceLabel) {
  if (serviceSelectors === null || typeof serviceSelectors !== 'object' || Array.isArray(serviceSelectors)) {
    violations.push(`${serviceLabel}: serviceSelectors must be an object`);
    return;
  }

  const expectedSelectors = requiredServiceSelectorValues.get(serviceId) ?? {};
  for (const [selector, expected] of Object.entries(expectedSelectors)) {
    if (serviceSelectors[selector] !== expected) {
      violations.push(`${serviceLabel}: serviceSelectors.${selector} must be ${expected}`);
    }
  }
  rejectForbiddenSelectorValues(serviceSelectors, `${serviceLabel}.serviceSelectors`);
}

function rejectForbiddenSelectorValues(selectors, label) {
  for (const [selector, value] of Object.entries(selectors)) {
    const normalizedValue = String(value ?? '').toLowerCase();
    if (['in-memory', 'noop'].includes(normalizedValue)) {
      violations.push(`${label}.${selector} must not be ${value}`);
    }
    if (selector === 'SOCIAL_MONITOR_USER_AUTH_MODE' && normalizedValue === 'disabled') {
      violations.push(`${label}.${selector} must not disable auth`);
    }
    if (selector === 'EVENT_RELAY_LOOP' && normalizedValue === 'disabled') {
      violations.push(`${label}.${selector} must not disable event relay`);
    }
    if (selector === 'DELIVERY_SUMMARY_READY_EVENT_READER' && normalizedValue === 'disabled') {
      violations.push(`${label}.${selector} must not disable summary ready event reader`);
    }
    if (selector === 'DELIVERY_SUMMARY_READY_EVENT_DRAIN_LOOP' && normalizedValue === 'disabled') {
      violations.push(`${label}.${selector} must not disable summary ready event drain loop`);
    }
    if (selector === 'DELIVERY_ENABLED_CHANNELS' && /\b(?:email|in_app)\b/.test(normalizedValue)) {
      violations.push(`${label}.${selector} must not enable fake email or in_app delivery in beta`);
    }
  }
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

function validateArtifactRollup(rollup, path) {
  if (rollup === null || typeof rollup !== 'object' || Array.isArray(rollup)) {
    violations.push(`${path}: rollup must be an object`);
    return;
  }
  if (rollup.allServicesDurable !== true) {
    violations.push(`${path}: rollup.allServicesDurable must be true`);
  }
  if (rollup.forbiddenSelectorsFound !== false) {
    violations.push(`${path}: rollup.forbiddenSelectorsFound must be false`);
  }
  if (rollup.runtimeProfile !== 'beta') {
    violations.push(`${path}: rollup.runtimeProfile must be beta`);
  }
}

function validateBaselineWiring() {
  const artifactPaths = new Set((baseline.trackedArtifacts ?? []).map((artifact) => artifact.path));
  if (!artifactPaths.has(proofPath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${proofPath}`);
  }
  if (!artifactPaths.has(proof.stagingRuntimeEvidenceSchema?.exampleArtifact)) {
    violations.push(`${baselinePath}: trackedArtifacts must include durable runtime selector artifact example`);
  }
}

function validateCaptureScriptWiring() {
  const captureSource = readFileSync(dockerDurableRuntimeCapturePath, 'utf8');
  if (!String(scripts['capture:docker-durable-runtime-proof'] ?? '').includes(dockerDurableRuntimeCapturePath)) {
    violations.push(`${packagePath}: capture:docker-durable-runtime-proof must run ${dockerDurableRuntimeCapturePath}`);
  }
  for (const marker of [
    'writeEvidenceEnvFile',
    'validateEvidenceEnvFilePath',
    'DURABLE_RUNTIME_SELECTOR_ENV_PATH',
    'DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH',
    'API_BASE_URL',
    'STAGING_ENVIRONMENT_ID',
    'BACKEND_IMAGE_DIGEST',
    'mode: 0o600',
  ]) {
    if (!captureSource.includes(marker)) {
      violations.push(`${dockerDurableRuntimeCapturePath}: capture must include ${marker}`);
    }
  }
  for (const marker of [
    'must not write release evidence into the git workspace',
    'must not point to fixture or example paths',
  ]) {
    if (!captureSource.includes(marker)) {
      violations.push(`${dockerDurableRuntimeCapturePath}: capture must reject unsafe artifact paths`);
    }
  }
}

function requireExistingPath(path, label) {
  if (typeof path !== 'string' || path.trim().length === 0 || !existsSync(path)) {
    violations.push(`${proofPath}: ${label} must reference an existing path`);
  }
}

function requireEnvWhenArtifactIsPresent(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    violations.push(`DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH requires ${name}`);
    return undefined;
  }

  return value;
}

function isIsoDateString(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function isHttpUrlWithoutCredentials(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}
