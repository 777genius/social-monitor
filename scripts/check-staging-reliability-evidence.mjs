import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import {
  validateEvidenceArtifactProvenance,
  validateEvidenceProvenanceRequirements,
  validateRealEvidenceIdentityStrings,
} from './lib/evidence-provenance.mjs';
import { readPrivateEvidenceJsonFile } from './lib/evidence-env-file.mjs';

const evidencePath = 'ops/drills/staging-reliability-evidence.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const dockerStagingReliabilityCapturePath = 'scripts/capture-docker-staging-reliability-evidence.mjs';
const dockerDurableBackendE2eCapturePath = 'scripts/capture-docker-durable-backend-e2e-loop.mjs';
const durableBackendE2eCapturePath = 'scripts/capture-durable-backend-e2e-loop.ts';
const currentScriptPath = fileURLToPath(import.meta.url);
const backendStagingEvidenceBundlePath = process.env.BACKEND_STAGING_EVIDENCE_BUNDLE_PATH?.trim();

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
  'backend-loop-scheduled-scan',
  'backend-loop-auto-summary-scheduler',
  'backend-loop-summary-memory',
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
      ['queueDepthBeforeAck', 'positive_integer'],
      ['queueDepthAfterAck', 'non_negative_integer'],
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
      ['redeliveredFlag', 'boolean_true'],
      ['deliveryCountObserved', 'positive_integer'],
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
      ['dlqMessageId', 'non_empty_string'],
      ['sourceQueueDepthAfterDeadLetter', 'non_negative_integer'],
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
      ['serviceRunningAfterRestart', 'boolean_true'],
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
      ['duplicatePublishObserved', 'boolean_false'],
    ],
  ],
  [
    'postgres-backup-created',
    [
      ['summary', 'non_empty_string'],
      ['backupId', 'non_empty_string'],
      ['schemaVersion', 'non_empty_string'],
      ['backupFormat', 'non_empty_string'],
      ['includedTableCount', 'positive_integer'],
      ['operationalTablesIncluded', 'boolean_true'],
      ['backupArtifactCleanedUp', 'boolean_true'],
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
      ['workersPausedBeforeRestore', 'boolean_true'],
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
      ['queryResultsHash', 'non_empty_string'],
    ],
  ],
  [
    'postgres-outbox-inbox-idempotency',
    [
      ['summary', 'non_empty_string'],
      ['beforeCounts', 'non_empty_object'],
      ['afterCounts', 'non_empty_object'],
      ['countsMatched', 'boolean_true'],
      ['beforeFingerprints', 'non_empty_object'],
      ['afterFingerprints', 'non_empty_object'],
      ['fingerprintsMatched', 'boolean_true'],
    ],
  ],
  [
    'postgres-worker-pause-resume',
    [
      ['summary', 'non_empty_string'],
      ['pauseCommandId', 'non_empty_string'],
      ['resumeCommandId', 'non_empty_string'],
      ['pausedServices', 'non_empty_string_array'],
      ['resumedServices', 'non_empty_string_array'],
      ['workAcceptedDuringValidation', 'boolean_false'],
    ],
  ],
  [
    'postgres-no-duplicate-side-effects',
    [
      ['summary', 'non_empty_string'],
      ['idempotencyKeys', 'non_empty_string_array'],
      ['stableCountsAfterResume', 'non_empty_object'],
      ['beforeResumeCounts', 'non_empty_object'],
      ['afterResumeCounts', 'non_empty_object'],
      ['deliveryIdempotencyKey', 'non_empty_string'],
      ['duplicateProbeBeforeCount', 'positive_integer'],
      ['duplicateProbeAfterCount', 'positive_integer'],
      ['duplicateInsertSuppressed', 'boolean_true'],
      ['replayWindow', 'non_empty_string'],
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
      ['providerFeedCounts', 'non_empty_object_array'],
      ['feedItemIds', 'non_empty_string_array'],
      ['summaryId', 'non_empty_string'],
      ['summaryCitationProviderKeys', 'non_empty_string_array'],
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
    'backend-loop-auto-summary-scheduler',
    [
      ['summary', 'non_empty_string'],
      ['autoSummary.summaryPolicyId', 'non_empty_string'],
      ['autoSummary.summaryJobId', 'non_empty_string'],
      ['autoSummary.summaryId', 'non_empty_string'],
      ['autoSummary.idempotencyKey', 'auto_summary_idempotency_key'],
      ['autoSummary.status', 'terminal_summary_status'],
      ['autoSummary.requestedAt', 'iso_timestamp'],
      ['autoSummary.completedAt', 'iso_timestamp'],
      ['autoSummary.latestFeedItemObservedAt', 'iso_timestamp'],
      ['autoSummary.newFeedItemCount', 'positive_integer'],
      ['manualSummaryRequestUsed', 'boolean_false'],
    ],
  ],
  [
    'backend-loop-summary-memory',
    [
      ['summary', 'non_empty_string'],
      ['summaryId', 'non_empty_string'],
      ['feedbackId', 'non_empty_string'],
      ['feedbackProviderKey', 'non_empty_string'],
      ['memory.status', 'non_empty_string'],
      ['memory.memoryBaseUrlOrigin', 'non_empty_string'],
      ['memory.topicScopeExternalRef', 'non_empty_string'],
      ['memory.providerScopeExternalRef', 'non_empty_string'],
      ['memory.sourceRefCount', 'non_negative_integer'],
      ['memory.renderedTextChars', 'positive_integer'],
      ['memory.memoryEffectMatched', 'boolean_true'],
      ['rawMemoryTextIncluded', 'boolean_false'],
    ],
  ],
  [
    'backend-loop-scheduled-scan',
    [
      ['summary', 'non_empty_string'],
      ['scheduledScan.providerKey', 'durable_provider_key'],
      ['scheduledScan.sourceBindingId', 'non_empty_string'],
      ['scheduledScan.scanPolicyId', 'non_empty_string'],
      ['scheduledScan.scanJobId', 'non_empty_string'],
      ['scheduledScan.scheduledIdempotencyKey', 'scheduled_idempotency_key'],
      ['scheduledScan.status', 'scan_status_succeeded'],
      ['scheduledScan.completedAt', 'iso_timestamp'],
      ['scheduledScan.nextRunAtAfterSchedule', 'iso_timestamp'],
      ['scheduledScan.feedItemCount', 'positive_integer'],
      ['scheduledScan.feedItemIds', 'non_empty_string_array'],
      ['manualScanIdempotencyKeyUsed', 'boolean_false'],
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
const requiredRealArtifactIdentityFields = ['environmentId', 'operator'];
const forbiddenRealArtifactMarkerPattern = /(?:^|[-_:.\s])(example|fixture|synthetic|mock|test)(?:$|[-_:.\s])/i;
const requiredSignalResultRequirementTexts = new Set([
  'every required signalId for the stagingArtifactId is present exactly once',
  'every signal result has status=passed',
  'every signal result has observedAt and non-empty evidence',
  'artifact startedAt/completedAt and signal observedAt use strict ISO-8601 timestamps',
  'every signal result observedAt is inside artifact startedAt/completedAt window',
  'every signal result evidence is an object matching signal-specific required fields',
  'artifact metadata matches the release evidence row',
  'real artifact environmentId and operator are not example, fixture, synthetic, mock or test identifiers',
  'real artifact nested evidence values do not contain example, fixture, synthetic, mock or test markers',
]);
const forbiddenArtifactFragments = [
  'bearer ',
  'basic ',
  'authorization',
  'x-api-key',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'id_token',
  'client_secret',
  'password',
  'secret_key',
  'private_key',
  'postgres://',
  'postgresql://',
  'amqp://',
  'amqps://',
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
requireCaptureScriptWiring();
validateCaptureOutputPathGuards();
validateDirectArtifactPathGuards();

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
  } else {
    const signalResultRequirements = new Set(schema.signalResultRequirements);
    for (const requirement of requiredSignalResultRequirementTexts) {
      if (!signalResultRequirements.has(requirement)) {
        violations.push(`${evidencePath}: passedArtifactContentSchema.signalResultRequirements must include "${requirement}"`);
      }
    }
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
  validateRealArtifactIdentity(artifact, `${evidencePath}: stagingEvidenceArtifacts.${artifact.artifactId}`);
}

function validatePassedArtifactContent(artifact, signals) {
  const content = readArtifactContent(artifact);
  if (content === undefined) {
    return;
  }

  validateArtifactContentEnvelope(content, artifact.path, artifact.artifactId);
  validateRealArtifactIdentity(content, artifact.path);
  validateArtifactProvenance(content.provenance, artifact.path, { allowFixture: false });
  validateNoRealArtifactFixtureMarkers(content, artifact.path);
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
      {
        artifactId,
        path: artifactLabel,
        startedAt: example.startedAt,
        completedAt: example.completedAt,
      },
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
  validateArtifactTimeWindow(content, artifactPath);
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
    let rawContent;
    try {
      rawContent = readPrivateEvidenceJsonFile(artifactPath, config.envVar);
    } catch (error) {
      violations.push(error instanceof Error ? error.message : String(error));
      continue;
    }

    const content = readArtifactContent({ path: artifactPath }, { rawContent });
    if (content === undefined) {
      continue;
    }

    const artifactLabel = `${config.envVar} (${artifactPath})`;
    validateArtifactContentEnvelope(content, artifactLabel, artifactId);
    validateArtifactProvenance(content.provenance, artifactLabel, { allowFixture: false });
    validateNoRealArtifactFixtureMarkers(content, artifactLabel);
    validateEnvArtifactMetadata(content, config, artifactLabel);
    validateRedaction(content, artifactLabel);
    validateSignalResults(
      content,
      {
        artifactId,
        path: artifactLabel,
        startedAt: content.startedAt,
        completedAt: content.completedAt,
      },
      signalsByArtifactId.get(artifactId) ?? [],
    );
  }
}

function validateEnvArtifactMetadata(content, config, artifactLabel) {
  validateRealArtifactIdentity(content, artifactLabel);
  for (const envVar of config.requiredEnv) {
    const expected = expectedEnvValueForArtifact(content, config, envVar);
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
}

function expectedEnvValueForArtifact(content, config, envVar) {
  const expected = readOptionalEnv(envVar);
  if (expected !== undefined || envVar !== 'API_BASE_URL') {
    return expected;
  }
  if (backendStagingEvidenceBundlePath === undefined || backendStagingEvidenceBundlePath.length === 0) {
    return undefined;
  }

  let bundle;
  try {
    bundle = JSON.parse(readPrivateEvidenceJsonFile(backendStagingEvidenceBundlePath, 'BACKEND_STAGING_EVIDENCE_BUNDLE_PATH'));
  } catch (error) {
    violations.push(error instanceof Error ? error.message : String(error));
    return undefined;
  }

  const artifactPath = readOptionalEnv(config.envVar);
  const bundleArtifact = (bundle.artifacts ?? [])
    .find((item) => item?.artifactId === content.artifactId);
  if (bundleArtifact?.path !== artifactPath) {
    violations.push(`BACKEND_STAGING_EVIDENCE_BUNDLE_PATH must reference ${config.envVar} to cover API_BASE_URL`);
    return undefined;
  }
  if (bundle.imageDigest !== content.imageDigest) {
    violations.push(`BACKEND_STAGING_EVIDENCE_BUNDLE_PATH imageDigest must match ${config.envVar} imageDigest`);
  }

  const apiBaseUrl = typeof content.apiBaseUrl === 'string' ? content.apiBaseUrl.trim() : '';
  return apiBaseUrl.length > 0 ? apiBaseUrl : undefined;
}

function validateRealArtifactIdentity(content, label) {
  validateRealEvidenceIdentityStrings({
    source: content,
    fields: requiredRealArtifactIdentityFields,
    label,
    violations,
    realEvidenceLabel: 'real staging artifacts',
  });
}

function validateNoRealArtifactFixtureMarkers(value, label, path = []) {
  if (typeof value === 'string') {
    const marker = forbiddenRealArtifactMarkerPattern.exec(value);
    if (marker !== null) {
      const fieldPath = path.length === 0 ? '<root>' : path.join('.');
      violations.push(`${label}: ${fieldPath} must not contain fixture marker "${marker[1]}"`);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      validateNoRealArtifactFixtureMarkers(item, label, [...path, `[${index}]`]);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    validateNoRealArtifactFixtureMarkers(item, label, [...path, key]);
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

function readArtifactContent(artifact, options = {}) {
  try {
    const rawContent = options.rawContent ?? readFileSync(artifact.path, 'utf8');
    validateNoSensitiveArtifactContent(rawContent, artifact.path);
    const content = JSON.parse(rawContent);
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

  validateNoSensitiveArtifactContent(JSON.stringify(content), artifactPath);
}

function validateNoSensitiveArtifactContent(content, artifactPath) {
  const serialized = content.toLowerCase();
  for (const fragment of forbiddenArtifactFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${artifactPath}: passed staging artifact must not contain sensitive fragment "${fragment}"`);
    }
  }
  validateNoSensitivePatterns(content, `${artifactPath}: passed staging artifact`);
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
    } else if (!matchesEvidenceType(result.observedAt, 'iso_timestamp')) {
      violations.push(`${artifact.path}: signal result "${result.signalId}" observedAt must be an ISO timestamp`);
    } else {
      validateSignalObservedAtWindow(artifact, result);
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
  if (result.signalId === 'backend-loop-scheduled-scan') {
    validateScheduledScanEvidence(artifactPath, result.evidence);
  }
  if (result.signalId === 'backend-loop-auto-summary-scheduler') {
    validateAutoSummaryEvidence(artifactPath, result.evidence);
  }
  if (result.signalId === 'backend-loop-topic-to-delivery-audit') {
    validateDurableBackendProviderCoverage(artifactPath, result.evidence);
  }
  if (result.signalId === 'rabbitmq-consumer-ack') {
    validateRabbitMqAckEvidence(artifactPath, result.evidence);
  }
  if (result.signalId === 'postgres-outbox-inbox-idempotency') {
    validatePostgresReplayStateEvidence(artifactPath, result.evidence);
  }
  if (result.signalId === 'postgres-no-duplicate-side-effects') {
    validatePostgresNoDuplicateEvidence(artifactPath, result.evidence);
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
      return isIsoTimestamp(value);
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
    case 'durable_provider_key':
      return ['github-issues', 'hacker-news', 'hn', 'reddit', 'rss'].includes(value);
    case 'scheduled_idempotency_key':
      return typeof value === 'string' && value.startsWith('scheduled:') && value.trim().length > 'scheduled:'.length;
    case 'auto_summary_idempotency_key':
      return typeof value === 'string' && value.startsWith('auto-summary:') && value.trim().length > 'auto-summary:'.length;
    case 'scan_status_succeeded':
      return value === 'SUCCEEDED';
    case 'terminal_summary_status':
      return value === 'completed' || value === 'no_signal';
    default:
      return false;
  }
}

function validateDurableBackendProviderCoverage(artifactPath, evidenceValue) {
  const values = getPath(evidenceValue, 'providerFeedCounts');
  if (!Array.isArray(values)) {
    return;
  }
  const providerKeys = new Set(values
    .map((item) => isRecord(item) ? item.providerKey : undefined)
    .filter((value) => typeof value === 'string' && value.trim().length > 0));
  for (const providerKey of ['github-issues', 'hacker-news', 'reddit', 'rss']) {
    if (!providerKeys.has(providerKey)) {
      violations.push(`${artifactPath}: signal result "backend-loop-topic-to-delivery-audit" must include ${providerKey} provider feed evidence`);
    }
  }
}

function validateScheduledScanEvidence(artifactPath, evidenceValue) {
  const completedAtMs = parseIsoTimestampMs(getPath(evidenceValue, 'scheduledScan.completedAt'));
  const nextRunAtMs = parseIsoTimestampMs(getPath(evidenceValue, 'scheduledScan.nextRunAtAfterSchedule'));
  if (completedAtMs !== undefined && nextRunAtMs !== undefined && nextRunAtMs <= completedAtMs) {
    violations.push(`${artifactPath}: signal result "backend-loop-scheduled-scan" evidence.scheduledScan.nextRunAtAfterSchedule must be after completedAt`);
  }
}

function validateAutoSummaryEvidence(artifactPath, evidenceValue) {
  const latestFeedItemObservedAtMs = parseIsoTimestampMs(getPath(evidenceValue, 'autoSummary.latestFeedItemObservedAt'));
  const requestedAtMs = parseIsoTimestampMs(getPath(evidenceValue, 'autoSummary.requestedAt'));
  const completedAtMs = parseIsoTimestampMs(getPath(evidenceValue, 'autoSummary.completedAt'));
  if (latestFeedItemObservedAtMs !== undefined && requestedAtMs !== undefined && requestedAtMs < latestFeedItemObservedAtMs) {
    violations.push(`${artifactPath}: signal result "backend-loop-auto-summary-scheduler" evidence.autoSummary.requestedAt must be after latestFeedItemObservedAt`);
  }
  if (requestedAtMs !== undefined && completedAtMs !== undefined && completedAtMs < requestedAtMs) {
    violations.push(`${artifactPath}: signal result "backend-loop-auto-summary-scheduler" evidence.autoSummary.completedAt must be after requestedAt`);
  }
}

function validateRabbitMqAckEvidence(artifactPath, evidenceValue) {
  const before = getPath(evidenceValue, 'queueDepthBeforeAck');
  const after = getPath(evidenceValue, 'queueDepthAfterAck');
  if (Number.isInteger(before) && Number.isInteger(after) && after >= before) {
    violations.push(`${artifactPath}: signal result "rabbitmq-consumer-ack" evidence.queueDepthAfterAck must be lower than queueDepthBeforeAck`);
  }
}

function validatePostgresReplayStateEvidence(artifactPath, evidenceValue) {
  if (evidenceValue.countsMatched === true && !objectsEqual(evidenceValue.beforeCounts, evidenceValue.afterCounts)) {
    violations.push(`${artifactPath}: signal result "postgres-outbox-inbox-idempotency" countsMatched=true requires beforeCounts and afterCounts to match`);
  }
  if (evidenceValue.fingerprintsMatched === true && !objectsEqual(evidenceValue.beforeFingerprints, evidenceValue.afterFingerprints)) {
    violations.push(`${artifactPath}: signal result "postgres-outbox-inbox-idempotency" fingerprintsMatched=true requires beforeFingerprints and afterFingerprints to match`);
  }
}

function validatePostgresNoDuplicateEvidence(artifactPath, evidenceValue) {
  const before = getPath(evidenceValue, 'duplicateProbeBeforeCount');
  const after = getPath(evidenceValue, 'duplicateProbeAfterCount');
  if (Number.isInteger(before) && Number.isInteger(after) && before !== after) {
    violations.push(`${artifactPath}: signal result "postgres-no-duplicate-side-effects" duplicate probe counts must remain stable`);
  }
  if (evidenceValue.duplicateInsertSuppressed === true && before !== 1) {
    violations.push(`${artifactPath}: signal result "postgres-no-duplicate-side-effects" duplicate probe must start from exactly one delivery attempt`);
  }
  if (!objectsEqual(evidenceValue.beforeResumeCounts, evidenceValue.afterResumeCounts)) {
    violations.push(`${artifactPath}: signal result "postgres-no-duplicate-side-effects" beforeResumeCounts and afterResumeCounts must match`);
  }
}

function validateArtifactTimeWindow(content, artifactPath) {
  const startedAtMs = parseIsoTimestampMs(content.startedAt);
  const completedAtMs = parseIsoTimestampMs(content.completedAt);
  if (startedAtMs === undefined || completedAtMs === undefined) {
    return;
  }
  if (completedAtMs < startedAtMs) {
    violations.push(`${artifactPath}: completedAt must be greater than or equal to startedAt`);
  }
}

function validateSignalObservedAtWindow(artifact, result) {
  const observedAtMs = parseIsoTimestampMs(result.observedAt);
  const startedAtMs = parseIsoTimestampMs(artifact.startedAt);
  const completedAtMs = parseIsoTimestampMs(artifact.completedAt);
  if (observedAtMs === undefined || startedAtMs === undefined || completedAtMs === undefined) {
    return;
  }
  if (observedAtMs < startedAtMs || observedAtMs > completedAtMs) {
    violations.push(`${artifact.path}: signal result "${result.signalId}" observedAt must be within artifact startedAt/completedAt`);
  }
}

function isIsoTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && parseIsoTimestampMs(value) !== undefined;
}

function parseIsoTimestampMs(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
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
    'durable_provider_key',
    'scheduled_idempotency_key',
    'auto_summary_idempotency_key',
    'scan_status_succeeded',
    'terminal_summary_status',
  ]).has(fieldType);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectsEqual(left, right) {
  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }

  return JSON.stringify(sortObject(left)) === JSON.stringify(sortObject(right));
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
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
  if (!String(scripts['capture:docker-staging-reliability-evidence'] ?? '').includes(dockerStagingReliabilityCapturePath)) {
    violations.push(`${packagePath}: capture:docker-staging-reliability-evidence must run ${dockerStagingReliabilityCapturePath}`);
  }
  if (!String(scripts['capture:docker-durable-backend-e2e-loop'] ?? '').includes(dockerDurableBackendE2eCapturePath)) {
    violations.push(`${packagePath}: capture:docker-durable-backend-e2e-loop must run ${dockerDurableBackendE2eCapturePath}`);
  }
  if (!String(scripts['capture:durable-backend-e2e-loop'] ?? '').includes(durableBackendE2eCapturePath)) {
    violations.push(`${packagePath}: capture:durable-backend-e2e-loop must run ${durableBackendE2eCapturePath}`);
  }

  if (!new Set(backendSafe.backendScripts ?? []).has(gateScript)) {
    violations.push(`${backendSafePath}: backend-safe verify must include ${gateScript}`);
  }
}

function requireCaptureScriptWiring() {
  const captureSource = readFileSync(dockerStagingReliabilityCapturePath, 'utf8');
  for (const marker of [
    'writeEvidenceEnvFile',
    'validateEvidenceEnvFilePath',
    'validateEvidenceJsonFilePath',
    'STAGING_RELIABILITY_ENV_PATH',
    'RABBITMQ_STAGING_DRILL_ARTIFACT_PATH',
    'POSTGRES_RESTORE_DRILL_ARTIFACT_PATH',
    'STAGING_ENVIRONMENT_ID',
    'BACKEND_IMAGE_DIGEST',
    'mode: 0o600',
    'chmodSync',
  ]) {
    if (!captureSource.includes(marker)) {
      violations.push(`${dockerStagingReliabilityCapturePath}: capture must include ${marker}`);
    }
  }

  const e2eCaptureSource = readFileSync(dockerDurableBackendE2eCapturePath, 'utf8');
  for (const marker of [
    'writeEvidenceEnvFile',
    'validateEvidenceEnvFilePath',
    'validateEvidenceJsonFilePath',
    'DURABLE_BACKEND_E2E_ENV_PATH',
    'DURABLE_BACKEND_E2E_ARTIFACT_PATH',
    'API_BASE_URL',
    'STAGING_ENVIRONMENT_ID',
    'BACKEND_IMAGE_DIGEST',
  ]) {
    if (!e2eCaptureSource.includes(marker)) {
      violations.push(`${dockerDurableBackendE2eCapturePath}: capture must include ${marker}`);
    }
  }

  const durableBackendE2eCaptureSource = readFileSync(durableBackendE2eCapturePath, 'utf8');
  for (const marker of [
    'DURABLE_BACKEND_E2E_ARTIFACT_PATH',
    'mode: 0o600',
    'chmodSync',
  ]) {
    if (!durableBackendE2eCaptureSource.includes(marker)) {
      violations.push(`${durableBackendE2eCapturePath}: capture must include ${marker}`);
    }
  }

  const selfSource = readFileSync(currentScriptPath, 'utf8');
  for (const marker of [
    'readPrivateEvidenceJsonFile',
    'validateDirectArtifactPathGuards',
    '0600-style private file permissions',
  ]) {
    if (!selfSource.includes(marker)) {
      violations.push(`${currentScriptPath}: direct staging artifact env path guard must include ${marker}`);
    }
  }
}

function validateCaptureOutputPathGuards() {
  const rabbitWorkspaceArtifactPath = resolve('rabbitmq-staging-drill-workspace-output.json');
  const rabbitResult = runDockerStagingCaptureExpectingFailure({
    RABBITMQ_STAGING_DRILL_ARTIFACT_PATH: rabbitWorkspaceArtifactPath,
    POSTGRES_RESTORE_DRILL_ARTIFACT_PATH: '/tmp/social-monitor-postgres-restore-drill-output.json',
    STAGING_RELIABILITY_ENV_PATH: '/tmp/social-monitor-staging-reliability.env',
  });
  if (rabbitResult.exitCode === 0) {
    violations.push(`${dockerStagingReliabilityCapturePath}: capture must reject workspace RABBITMQ_STAGING_DRILL_ARTIFACT_PATH`);
  } else if (!rabbitResult.output.includes('RABBITMQ_STAGING_DRILL_ARTIFACT_PATH must not write release evidence into the git workspace')) {
    violations.push(`${dockerStagingReliabilityCapturePath}: workspace RabbitMQ artifact path rejection must explain evidence path policy`);
  }
  if (existsSync(rabbitWorkspaceArtifactPath)) {
    violations.push(`${dockerStagingReliabilityCapturePath}: workspace RabbitMQ artifact path rejection must not create ${rabbitWorkspaceArtifactPath}`);
  }

  const postgresWorkspaceArtifactPath = resolve('postgres-restore-drill-workspace-output.json');
  const postgresResult = runDockerStagingCaptureExpectingFailure({
    RABBITMQ_STAGING_DRILL_ARTIFACT_PATH: '/tmp/social-monitor-rabbitmq-staging-drill-output.json',
    POSTGRES_RESTORE_DRILL_ARTIFACT_PATH: postgresWorkspaceArtifactPath,
    STAGING_RELIABILITY_ENV_PATH: '/tmp/social-monitor-staging-reliability.env',
  });
  if (postgresResult.exitCode === 0) {
    violations.push(`${dockerStagingReliabilityCapturePath}: capture must reject workspace POSTGRES_RESTORE_DRILL_ARTIFACT_PATH`);
  } else if (!postgresResult.output.includes('POSTGRES_RESTORE_DRILL_ARTIFACT_PATH must not write release evidence into the git workspace')) {
    violations.push(`${dockerStagingReliabilityCapturePath}: workspace Postgres artifact path rejection must explain evidence path policy`);
  }
  if (existsSync(postgresWorkspaceArtifactPath)) {
    violations.push(`${dockerStagingReliabilityCapturePath}: workspace Postgres artifact path rejection must not create ${postgresWorkspaceArtifactPath}`);
  }

  const durableBackendWorkspaceArtifactPath = resolve('durable-backend-e2e-workspace-output.json');
  const durableBackendResult = runDurableBackendE2eCaptureExpectingFailure({
    DURABLE_BACKEND_E2E_ARTIFACT_PATH: durableBackendWorkspaceArtifactPath,
    DURABLE_BACKEND_E2E_ENV_PATH: '/tmp/social-monitor-durable-backend-e2e.env',
  });
  if (durableBackendResult.exitCode === 0) {
    violations.push(`${dockerDurableBackendE2eCapturePath}: capture must reject workspace DURABLE_BACKEND_E2E_ARTIFACT_PATH`);
  } else if (!durableBackendResult.output.includes('DURABLE_BACKEND_E2E_ARTIFACT_PATH must not write release evidence into the git workspace')) {
    violations.push(`${dockerDurableBackendE2eCapturePath}: workspace durable backend E2E artifact path rejection must explain evidence path policy`);
  }
  if (existsSync(durableBackendWorkspaceArtifactPath)) {
    violations.push(`${dockerDurableBackendE2eCapturePath}: workspace durable backend E2E artifact path rejection must not create ${durableBackendWorkspaceArtifactPath}`);
  }
}

function runDockerStagingCaptureExpectingFailure(env) {
  try {
    execFileSync(process.execPath, [dockerStagingReliabilityCapturePath], {
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

function runDurableBackendE2eCaptureExpectingFailure(env) {
  try {
    execFileSync(process.execPath, [dockerDurableBackendE2eCapturePath], {
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

function validateDirectArtifactPathGuards() {
  if (process.env.STAGING_RELIABILITY_DIRECT_PATH_GUARD_TEST === '1') {
    return;
  }

  const requiredEnv = {
    STAGING_ENVIRONMENT_ID: 'docker-alpha-1',
    BACKEND_IMAGE_DIGEST: `sha256:${'e'.repeat(64)}`,
    API_BASE_URL: 'http://127.0.0.1:4000',
  };

  for (const config of requiredEnvArtifacts.values()) {
    const workspaceArtifactPath = resolve(`${config.envVar.toLowerCase().replaceAll('_', '-')}-direct-workspace-output.json`);
    const workspaceResult = runSelfExpectingFailure({
      ...requiredEnv,
      [config.envVar]: workspaceArtifactPath,
    });
    if (workspaceResult.exitCode === 0) {
      violations.push(`check:staging-reliability-evidence must reject workspace ${config.envVar}`);
    } else if (!workspaceResult.output.includes(`${config.envVar} must not write release evidence into the git workspace`)) {
      violations.push(`check:staging-reliability-evidence workspace ${config.envVar} rejection must explain evidence path policy`);
    }
    if (existsSync(workspaceArtifactPath)) {
      violations.push(`check:staging-reliability-evidence workspace ${config.envVar} rejection must not create ${workspaceArtifactPath}`);
    }

    const tempDirectory = mkdtempSync(join(tmpdir(), 'staging-reliability-direct-'));
    try {
      const publicArtifactPath = join(tempDirectory, 'staging-reliability-artifact.json');
      writeFileSync(publicArtifactPath, '{}\n', { mode: 0o600 });
      chmodSync(publicArtifactPath, 0o644);
      const publicModeResult = runSelfExpectingFailure({
        ...requiredEnv,
        [config.envVar]: publicArtifactPath,
      });
      if (publicModeResult.exitCode === 0) {
        violations.push(`check:staging-reliability-evidence must reject public ${config.envVar} permissions`);
      } else if (!publicModeResult.output.includes(`${config.envVar} must use 0600-style private file permissions`)) {
        violations.push(`check:staging-reliability-evidence public ${config.envVar} rejection must explain private file mode policy`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function runSelfExpectingFailure(env) {
  try {
    execFileSync(process.execPath, [currentScriptPath], {
      env: {
        ...process.env,
        STAGING_RELIABILITY_DIRECT_PATH_GUARD_TEST: '1',
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
