import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { URL } from 'node:url';
import {
  validateEvidenceArtifactProvenance,
  validateEvidenceProvenanceRequirements,
} from './lib/evidence-provenance.mjs';

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
const stagingArtifactFormat = 'staging-reliability-artifact-v1';
const stagingArtifactEvidenceKind = 'staging_drill';
const allowedStatuses = new Set(['pending_staging_evidence', 'passed']);
const requiredArtifactIds = new Set([
  'rabbitmq-staging-drill-output',
  'postgres-restore-drill-output',
  'durable-backend-e2e-output',
]);
const requiredEnvArtifacts = new Map([
  ['rabbitmq-staging-drill-output', {
    envVar: 'RABBITMQ_STAGING_DRILL_ARTIFACT_PATH',
    requiredEnv: ['STAGING_ENVIRONMENT_ID', 'BACKEND_IMAGE_DIGEST'],
  }],
  ['postgres-restore-drill-output', {
    envVar: 'POSTGRES_RESTORE_DRILL_ARTIFACT_PATH',
    requiredEnv: ['STAGING_ENVIRONMENT_ID', 'BACKEND_IMAGE_DIGEST'],
  }],
  ['durable-backend-e2e-output', {
    envVar: 'DURABLE_BACKEND_E2E_ARTIFACT_PATH',
    requiredEnv: ['STAGING_ENVIRONMENT_ID', 'BACKEND_IMAGE_DIGEST', 'API_BASE_URL'],
  }],
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
const requiredEvidenceShapeBySignalId = new Map([
  [
    'rabbitmq-publisher-confirms',
    [
      ['summary', 'non_empty_string'],
      ['queueName', 'non_empty_string'],
      ['messageId', 'non_empty_string'],
      ['confirmAckAt', 'iso_timestamp'],
      ['publishMode', 'non_empty_string'],
      ['brokerUrlRedacted', 'boolean_true'],
      ['imageDigestMatched', 'boolean_true'],
    ],
  ],
  [
    'rabbitmq-persistent-publish',
    [
      ['summary', 'non_empty_string'],
      ['queueName', 'non_empty_string'],
      ['messageId', 'non_empty_string'],
      ['deliveryMode', 'non_empty_string'],
      ['restartObserved', 'boolean_true'],
      ['recoveredMessageId', 'non_empty_string'],
    ],
  ],
  [
    'rabbitmq-consumer-ack',
    [
      ['summary', 'non_empty_string'],
      ['messageId', 'non_empty_string'],
      ['ackAt', 'iso_timestamp'],
      ['scanAttemptId', 'non_empty_string'],
      ['duplicateSideEffectsObserved', 'boolean_false'],
    ],
  ],
  [
    'rabbitmq-consumer-nack-retry',
    [
      ['summary', 'non_empty_string'],
      ['messageId', 'non_empty_string'],
      ['nackAt', 'iso_timestamp'],
      ['redeliveryCount', 'positive_integer'],
      ['finalStatus', 'non_empty_string'],
      ['correlationIdPreserved', 'boolean_true'],
    ],
  ],
  [
    'rabbitmq-poison-message-dlx',
    [
      ['summary', 'non_empty_string'],
      ['dlxExchange', 'non_empty_string'],
      ['deadLetterRoutingKey', 'non_empty_string'],
      ['deliveryAttemptId', 'non_empty_string'],
      ['deadLetteredAt', 'iso_timestamp'],
    ],
  ],
  [
    'rabbitmq-quorum-delivery-limit',
    [
      ['summary', 'non_empty_string'],
      ['queueNames', 'non_empty_string_array'],
      ['queueType', 'non_empty_string'],
      ['deliveryLimit', 'positive_integer'],
    ],
  ],
  [
    'rabbitmq-worker-restart-recovery',
    [
      ['summary', 'non_empty_string'],
      ['workerService', 'non_empty_string'],
      ['restartWindow', 'non_empty_string'],
      ['recoveredMessageId', 'non_empty_string'],
      ['idempotentResultId', 'non_empty_string'],
    ],
  ],
  [
    'rabbitmq-queue-lag-metrics',
    [
      ['summary', 'non_empty_string'],
      ['metricNames', 'non_empty_string_array'],
      ['workerLabels', 'non_empty_string_array'],
      ['maxLagSamples', 'non_empty_object'],
    ],
  ],
  [
    'rabbitmq-event-relay-retry',
    [
      ['summary', 'non_empty_string'],
      ['outboxEventId', 'non_empty_string'],
      ['retryCount', 'positive_integer'],
      ['finalDeliveryResult', 'non_empty_string'],
      ['idempotencyPreserved', 'boolean_true'],
    ],
  ],
  [
    'postgres-backup-created',
    [
      ['summary', 'non_empty_string'],
      ['backupId', 'non_empty_string'],
      ['schemaVersion', 'non_empty_string'],
      ['includedTableCount', 'positive_integer'],
      ['operationalTablesIncluded', 'boolean_true'],
    ],
  ],
  [
    'postgres-restore-rpo-rto',
    [
      ['summary', 'non_empty_string'],
      ['restoreStartedAt', 'iso_timestamp'],
      ['restoreCompletedAt', 'iso_timestamp'],
      ['rpoMinutes', 'positive_integer'],
      ['rtoMinutes', 'positive_integer'],
    ],
  ],
  [
    'postgres-migration-version',
    [
      ['summary', 'non_empty_string'],
      ['releaseCommitSha', 'non_empty_string'],
      ['appliedMigrationIds', 'non_empty_string_array'],
      ['schemaChecksumMatched', 'boolean_true'],
    ],
  ],
  [
    'postgres-validation-queries',
    [
      ['summary', 'non_empty_string'],
      ['queryNames', 'non_empty_string_array'],
      ['checkedTableGroups', 'non_empty_string_array'],
      ['failedQueryCount', 'non_negative_integer'],
    ],
  ],
  [
    'postgres-outbox-inbox-idempotency',
    [
      ['summary', 'non_empty_string'],
      ['beforeCounts', 'non_empty_object'],
      ['afterCounts', 'non_empty_object'],
      ['countsMatched', 'boolean_true'],
    ],
  ],
  [
    'postgres-worker-pause-resume',
    [
      ['summary', 'non_empty_string'],
      ['pauseCommandId', 'non_empty_string'],
      ['resumeCommandId', 'non_empty_string'],
      ['workAcceptedDuringValidation', 'boolean_false'],
    ],
  ],
  [
    'postgres-no-duplicate-side-effects',
    [
      ['summary', 'non_empty_string'],
      ['idempotencyKeys', 'non_empty_string_array'],
      ['stableCountsAfterResume', 'non_empty_object'],
      ['duplicateSideEffectsObserved', 'boolean_false'],
    ],
  ],
  [
    'backend-loop-topic-to-delivery-audit',
    [
      ['summary', 'non_empty_string'],
      ['topicId', 'non_empty_string'],
      ['sourceBindingId', 'non_empty_string'],
      ['scanId', 'non_empty_string'],
      ['feedItemIds', 'non_empty_string_array'],
      ['summaryId', 'non_empty_string'],
      ['feedbackId', 'non_empty_string'],
      ['digestId', 'non_empty_string'],
      ['webhookDeliveryAttemptId', 'non_empty_string'],
      ['realtimeEventId', 'non_empty_string'],
      ['auditEventIds', 'non_empty_string_array'],
    ],
  ],
  [
    'backend-loop-tenant-isolation',
    [
      ['summary', 'non_empty_string'],
      ['negativeChecks', 'non_empty_object_array'],
      ['wrongTenantStatus', 'positive_integer'],
      ['wrongWorkspaceStatus', 'positive_integer'],
      ['leakageObserved', 'boolean_false'],
    ],
  ],
  [
    'backend-loop-idempotency',
    [
      ['summary', 'non_empty_string'],
      ['idempotencyKeys', 'non_empty_string_array'],
      ['responseIds', 'non_empty_string_array'],
      ['stableDurableCounts', 'non_empty_object'],
      ['duplicateSideEffectsObserved', 'boolean_false'],
    ],
  ],
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

validatePassedArtifactContentSchema();
validateSignalEvidenceSchemaMap();

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
const signalsByArtifactId = new Map();
let hasPendingSignal = false;
for (const signal of evidence.requiredSignals ?? []) {
  if (signalIds.has(signal.signalId)) {
    violations.push(`${evidencePath}: duplicate signal "${signal.signalId}"`);
  }
  signalIds.add(signal.signalId);
  const artifactSignals = signalsByArtifactId.get(signal.stagingArtifactId) ?? [];
  artifactSignals.push(signal);
  signalsByArtifactId.set(signal.stagingArtifactId, artifactSignals);

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

validateExampleArtifactFixtures(signalsByArtifactId);
validateEnvironmentArtifacts(signalsByArtifactId);

for (const [artifactId, signals] of signalsByArtifactId.entries()) {
  const artifact = artifactById.get(artifactId);
  if (artifact === undefined || artifact.status !== 'passed') {
    continue;
  }

  const pendingSignals = signals.filter((signal) => signal.status !== 'passed').map((signal) => signal.signalId);
  if (pendingSignals.length > 0) {
    violations.push(`${evidencePath}: passed artifact "${artifactId}" requires passed signals ${pendingSignals.join(', ')}`);
  }

  validatePassedArtifactContent(artifact, signals);
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

function validatePassedArtifactContentSchema() {
  const schema = evidence.passedArtifactContentSchema;
  if (!isRecord(schema)) {
    violations.push(`${evidencePath}: passedArtifactContentSchema must define the required passed artifact format`);
    return;
  }
  if (schema.schemaVersion !== 1) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.schemaVersion must be 1`);
  }
  if (schema.format !== stagingArtifactFormat) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.format must be ${stagingArtifactFormat}`);
  }
  if (typeof schema.exampleArtifactPath !== 'string' || schema.exampleArtifactPath.trim().length === 0) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.exampleArtifactPath must reference fixture examples`);
  } else if (!existsSync(schema.exampleArtifactPath)) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.exampleArtifactPath does not exist`);
  }

  const requiredTopLevelFields = new Set(schema.requiredTopLevelFields ?? []);
  for (const field of [
    'schemaVersion',
    'format',
    'artifactId',
    'environmentId',
    'imageDigest',
    'operator',
    'startedAt',
    'completedAt',
    'provenance',
    'redaction',
    'signalResults',
  ]) {
    if (!requiredTopLevelFields.has(field)) {
      violations.push(`${evidencePath}: passedArtifactContentSchema.requiredTopLevelFields must include ${field}`);
    }
  }

  const redactionRequirements = new Set(schema.redactionRequirements ?? []);
  for (const requirement of [
    'secretsIncluded=false',
    'rawProviderPayloadsIncluded=false',
    'databaseUrlsIncluded=false',
    'brokerUrlsIncluded=false',
  ]) {
    if (!redactionRequirements.has(requirement)) {
      violations.push(`${evidencePath}: passedArtifactContentSchema.redactionRequirements must include ${requirement}`);
    }
  }

  if (!Array.isArray(schema.signalResultRequirements) || schema.signalResultRequirements.length < 4) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.signalResultRequirements must describe signal coverage`);
  }
  validateProvenanceRequirements(schema.provenanceRequirements);
  validateEnvArtifactValidation(schema.envArtifactValidation);
}

function validateProvenanceRequirements(requirements) {
  validateEvidenceProvenanceRequirements({
    requirements,
    expectedEvidenceKind: stagingArtifactEvidenceKind,
    label: 'passedArtifactContentSchema.provenanceRequirements',
    sourcePath: evidencePath,
    violations,
  });
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

function validatePassedArtifactContent(artifact, signals) {
  const content = readArtifactContent(artifact);
  if (content === undefined) {
    return;
  }

  validateArtifactContentEnvelope(content, artifact.path, artifact.artifactId);
  validateArtifactProvenance(content.provenance, artifact.path, { allowFixture: false });
  for (const field of ['artifactId', 'environmentId', 'imageDigest', 'operator', 'startedAt', 'completedAt']) {
    if (content[field] !== artifact[field]) {
      violations.push(`${artifact.path}: ${field} must match ${evidencePath} artifact metadata`);
    }
  }

  validateRedaction(content, artifact.path);
  validateSignalResults(content, artifact, signals);
}

function validateExampleArtifactFixtures(signalsByArtifactId) {
  const examplePath = evidence.passedArtifactContentSchema?.exampleArtifactPath;
  if (typeof examplePath !== 'string' || examplePath.trim().length === 0 || !existsSync(examplePath)) {
    return;
  }

  const fixture = readJson(examplePath);
  if (fixture.schemaVersion !== 1) {
    violations.push(`${examplePath}: schemaVersion must be 1`);
  }
  if (fixture.fixtureOnly !== true) {
    violations.push(`${examplePath}: fixtureOnly must be true`);
  }
  if (!Array.isArray(fixture.examples)) {
    violations.push(`${examplePath}: examples must be an array`);
    return;
  }

  const examplesByArtifactId = new Map();
  for (const example of fixture.examples) {
    if (!isRecord(example)) {
      violations.push(`${examplePath}: every example must be an object`);
      continue;
    }
    if (examplesByArtifactId.has(example.artifactId)) {
      violations.push(`${examplePath}: duplicate example artifactId "${example.artifactId}"`);
    }
    examplesByArtifactId.set(example.artifactId, example);
  }

  for (const artifactId of requiredArtifactIds) {
    const example = examplesByArtifactId.get(artifactId);
    if (example === undefined) {
      violations.push(`${examplePath}: missing example for "${artifactId}"`);
      continue;
    }

    const artifactLabel = `${examplePath}#${artifactId}`;
    validateArtifactContentEnvelope(example, artifactLabel, artifactId);
    validateArtifactProvenance(example.provenance, artifactLabel, { allowFixture: true });
    validateRedaction(example, artifactLabel);
    validateSignalResults(
      example,
      { artifactId, path: artifactLabel },
      signalsByArtifactId.get(artifactId) ?? [],
    );
  }
}

function validateArtifactContentEnvelope(content, artifactPath, artifactId) {
  if (content.schemaVersion !== 1) {
    violations.push(`${artifactPath}: schemaVersion must be 1`);
  }
  if (content.format !== stagingArtifactFormat) {
    violations.push(`${artifactPath}: format must be ${stagingArtifactFormat}`);
  }
  if (content.artifactId !== artifactId) {
    violations.push(`${artifactPath}: artifactId must be ${artifactId}`);
  }
  if (typeof content.environmentId !== 'string' || content.environmentId.trim().length === 0) {
    violations.push(`${artifactPath}: environmentId must be non-empty`);
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(String(content.imageDigest ?? ''))) {
    violations.push(`${artifactPath}: imageDigest must be immutable sha256:<64 hex chars>`);
  }
  for (const field of ['operator', 'startedAt', 'completedAt']) {
    if (typeof content[field] !== 'string' || content[field].trim().length === 0) {
      violations.push(`${artifactPath}: ${field} must be non-empty`);
    }
  }
  for (const field of ['startedAt', 'completedAt']) {
    if (!matchesEvidenceType(content[field], 'iso_timestamp')) {
      violations.push(`${artifactPath}: ${field} must be an ISO timestamp`);
    }
  }
}

function validateArtifactProvenance(provenance, artifactPath, options) {
  validateEvidenceArtifactProvenance({
    provenance,
    label: artifactPath,
    expectedEvidenceKind: stagingArtifactEvidenceKind,
    allowFixture: options.allowFixture === true,
    violations,
    realEvidenceLabel: 'staging evidence artifacts',
  });
}

function validateEnvironmentArtifacts(signalsByArtifactId) {
  for (const [artifactId, config] of requiredEnvArtifacts.entries()) {
    const artifactPath = readOptionalEnv(config.envVar);
    if (artifactPath === undefined) {
      continue;
    }
    if (!existsSync(artifactPath)) {
      violations.push(`${config.envVar}: must reference an existing staging reliability artifact`);
      continue;
    }

    const content = readArtifactContent({ path: artifactPath });
    if (content === undefined) {
      continue;
    }

    const artifactLabel = `${config.envVar} (${artifactPath})`;
    validateArtifactContentEnvelope(content, artifactLabel, artifactId);
    validateArtifactProvenance(content.provenance, artifactLabel, { allowFixture: false });
    validateEnvArtifactMetadata(content, config, artifactLabel);
    validateRedaction(content, artifactLabel);
    validateSignalResults(
      content,
      { artifactId, path: artifactLabel },
      signalsByArtifactId.get(artifactId) ?? [],
    );
  }
}

function validateEnvArtifactMetadata(content, config, artifactLabel) {
  for (const envVar of config.requiredEnv) {
    const expected = readOptionalEnv(envVar);
    if (expected === undefined) {
      violations.push(`${config.envVar}: requires ${envVar}`);
      continue;
    }
    if (envVar === 'STAGING_ENVIRONMENT_ID' && content.environmentId !== expected) {
      violations.push(`${artifactLabel}: environmentId must match STAGING_ENVIRONMENT_ID`);
    }
    if (envVar === 'BACKEND_IMAGE_DIGEST' && content.imageDigest !== expected) {
      violations.push(`${artifactLabel}: imageDigest must match BACKEND_IMAGE_DIGEST`);
    }
    if (envVar === 'API_BASE_URL') {
      if (content.apiBaseUrl !== expected) {
        violations.push(`${artifactLabel}: apiBaseUrl must match API_BASE_URL`);
      }
      if (!isHttpUrlWithoutCredentials(content.apiBaseUrl)) {
        violations.push(`${artifactLabel}: apiBaseUrl must be an http(s) URL without credentials`);
      }
    }
  }
  if (String(content.environmentId ?? '').includes('example')) {
    violations.push(`${artifactLabel}: real staging artifact environmentId must not be example-like`);
  }
}

function validateEnvArtifactValidation(validationRules) {
  if (!Array.isArray(validationRules)) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.envArtifactValidation must be an array`);
    return;
  }

  const seenRules = new Set();
  for (const [index, rule] of validationRules.entries()) {
    const label = `passedArtifactContentSchema.envArtifactValidation[${index}]`;
    if (!isRecord(rule)) {
      violations.push(`${evidencePath}: ${label} must be an object`);
      continue;
    }
    const expected = requiredEnvArtifacts.get(rule.artifactId);
    if (expected === undefined) {
      violations.push(`${evidencePath}: ${label}.artifactId is unsupported`);
      continue;
    }
    seenRules.add(rule.artifactId);
    if (rule.envVar !== expected.envVar) {
      violations.push(`${evidencePath}: ${label}.envVar must be ${expected.envVar}`);
    }
    if (rule.format !== stagingArtifactFormat) {
      violations.push(`${evidencePath}: ${label}.format must be ${stagingArtifactFormat}`);
    }
    for (const envVar of expected.requiredEnv) {
      if (!rule.requiredEnv?.includes(envVar)) {
        violations.push(`${evidencePath}: ${label}.requiredEnv must include ${envVar}`);
      }
    }
  }

  for (const artifactId of requiredEnvArtifacts.keys()) {
    if (!seenRules.has(artifactId)) {
      violations.push(`${evidencePath}: envArtifactValidation must include ${artifactId}`);
    }
  }
}

function readArtifactContent(artifact) {
  try {
    const content = JSON.parse(readFileSync(artifact.path, 'utf8'));
    if (!isRecord(content)) {
      violations.push(`${artifact.path}: passed staging artifact must be a JSON object`);
      return undefined;
    }

    return content;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    violations.push(`${artifact.path}: passed staging artifact must be valid JSON (${message})`);
    return undefined;
  }
}

function validateRedaction(content, artifactPath) {
  if (!isRecord(content.redaction)) {
    violations.push(`${artifactPath}: redaction must be an object`);
    return;
  }

  for (const field of ['secretsIncluded', 'rawProviderPayloadsIncluded', 'databaseUrlsIncluded', 'brokerUrlsIncluded']) {
    if (content.redaction[field] !== false) {
      violations.push(`${artifactPath}: redaction.${field} must be false`);
    }
  }

  const serialized = JSON.stringify(content).toLowerCase();
  for (const fragment of [
    'bearer ',
    'basic ',
    'access_token',
    'refresh_token',
    'private_key',
    'postgres://',
    'postgresql://',
    'amqp://',
    'amqps://',
    'smk_',
    'whsec_',
  ]) {
    if (serialized.includes(fragment)) {
      violations.push(`${artifactPath}: passed staging artifact must not contain sensitive fragment "${fragment}"`);
    }
  }
}

function validateSignalResults(content, artifact, signals) {
  if (!Array.isArray(content.signalResults)) {
    violations.push(`${artifact.path}: signalResults must be an array`);
    return;
  }

  const expectedSignalIds = new Set(signals.map((signal) => signal.signalId));
  const resultBySignalId = new Map();
  for (const result of content.signalResults) {
    if (!isRecord(result)) {
      violations.push(`${artifact.path}: every signalResults item must be an object`);
      continue;
    }
    if (resultBySignalId.has(result.signalId)) {
      violations.push(`${artifact.path}: duplicate signal result "${result.signalId}"`);
    }
    resultBySignalId.set(result.signalId, result);
    if (!expectedSignalIds.has(result.signalId)) {
      violations.push(`${artifact.path}: unsupported signal result "${result.signalId}" for ${artifact.artifactId}`);
    }
    if (result.status !== 'passed') {
      violations.push(`${artifact.path}: signal result "${result.signalId}" must have status=passed`);
    }
    if (typeof result.observedAt !== 'string' || result.observedAt.trim().length === 0) {
      violations.push(`${artifact.path}: signal result "${result.signalId}" must define observedAt`);
    }
    if (!hasNonEmptyEvidence(result.evidence)) {
      violations.push(`${artifact.path}: signal result "${result.signalId}" must include non-empty evidence`);
    } else {
      validateSignalEvidenceShape(artifact.path, result);
    }
  }

  for (const signal of signals) {
    if (!resultBySignalId.has(signal.signalId)) {
      violations.push(`${artifact.path}: missing signal result "${signal.signalId}" for ${artifact.artifactId}`);
    }
  }
}

function hasNonEmptyEvidence(evidenceValue) {
  if (typeof evidenceValue === 'string') {
    return evidenceValue.trim().length > 0;
  }
  if (Array.isArray(evidenceValue)) {
    return evidenceValue.length > 0;
  }
  if (isRecord(evidenceValue)) {
    return Object.keys(evidenceValue).length > 0;
  }

  return false;
}

function validateSignalEvidenceSchemaMap() {
  for (const signalId of requiredSignalIds) {
    const shape = requiredEvidenceShapeBySignalId.get(signalId);
    if (!Array.isArray(shape) || shape.length === 0) {
      violations.push(`${evidencePath}: missing signal-specific evidence schema for "${signalId}"`);
      continue;
    }

    const seenFields = new Set();
    for (const [fieldPath, fieldType] of shape) {
      if (typeof fieldPath !== 'string' || fieldPath.trim().length === 0) {
        violations.push(`${evidencePath}: evidence schema for "${signalId}" has an empty field path`);
      }
      if (seenFields.has(fieldPath)) {
        violations.push(`${evidencePath}: evidence schema for "${signalId}" duplicates field "${fieldPath}"`);
      }
      seenFields.add(fieldPath);
      if (!isSupportedEvidenceType(fieldType)) {
        violations.push(`${evidencePath}: evidence schema for "${signalId}" uses unsupported type "${fieldType}"`);
      }
    }
  }

  for (const signalId of requiredEvidenceShapeBySignalId.keys()) {
    if (!requiredSignalIds.has(signalId)) {
      violations.push(`${evidencePath}: evidence schema references unsupported signal "${signalId}"`);
    }
  }
}

function validateSignalEvidenceShape(artifactPath, result) {
  const shape = requiredEvidenceShapeBySignalId.get(result.signalId);
  if (shape === undefined) {
    violations.push(`${artifactPath}: signal result "${result.signalId}" has no evidence schema`);
    return;
  }
  if (!isRecord(result.evidence)) {
    violations.push(`${artifactPath}: signal result "${result.signalId}" evidence must be an object`);
    return;
  }

  for (const [fieldPath, fieldType] of shape) {
    const value = getPath(result.evidence, fieldPath);
    if (value === undefined) {
      violations.push(`${artifactPath}: signal result "${result.signalId}" evidence must include ${fieldPath}`);
      continue;
    }
    if (!matchesEvidenceType(value, fieldType)) {
      violations.push(
        `${artifactPath}: signal result "${result.signalId}" evidence.${fieldPath} must be ${fieldType}`,
      );
    }
  }
}

function getPath(value, path) {
  let current = value;
  for (const segment of path.split('.')) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

function matchesEvidenceType(value, fieldType) {
  switch (fieldType) {
    case 'non_empty_string':
      return typeof value === 'string' && value.trim().length > 0;
    case 'iso_timestamp':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value));
    case 'boolean_true':
      return value === true;
    case 'boolean_false':
      return value === false;
    case 'positive_integer':
      return Number.isInteger(value) && value > 0;
    case 'non_negative_integer':
      return Number.isInteger(value) && value >= 0;
    case 'non_empty_string_array':
      return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim().length > 0);
    case 'non_empty_object':
      return isRecord(value) && Object.keys(value).length > 0;
    case 'non_empty_object_array':
      return Array.isArray(value) && value.length > 0 && value.every((item) => isRecord(item) && Object.keys(item).length > 0);
    default:
      return false;
  }
}

function isSupportedEvidenceType(fieldType) {
  return new Set([
    'non_empty_string',
    'iso_timestamp',
    'boolean_true',
    'boolean_false',
    'positive_integer',
    'non_negative_integer',
    'non_empty_string_array',
    'non_empty_object',
    'non_empty_object_array',
  ]).has(fieldType);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalEnv(name) {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
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
  const examplePath = evidence.passedArtifactContentSchema?.exampleArtifactPath;
  if (typeof examplePath === 'string' && !(baseline.trackedArtifacts ?? []).some((artifact) => artifact.path === examplePath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${examplePath}`);
  }
}
