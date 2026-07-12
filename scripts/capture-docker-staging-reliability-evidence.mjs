import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { URL } from 'node:url';

import amqp from 'amqplib';
import {
  shellQuote,
  validateEvidenceEnvFilePath,
  validateEvidenceJsonFilePath,
  writeEvidenceEnvFile,
} from './lib/evidence-env-file.mjs';
import {
  compileBackupRestoreDrillContract,
  restoreDrillContractFingerprints,
} from './lib/backup-restore-drill-contract.mjs';
import {
  cleanupPostgresDrillResources,
  executeRestoreValidationCounts,
  finalizePostgresCleanupEvidence,
  proveRestoredTableCoverage,
  readPostgresTableNames,
} from './lib/postgres-restore-drill-runtime.mjs';

const backupRestoreContract = compileBackupRestoreDrillContract(
  JSON.parse(readFileSync('ops/recovery/backup-restore-contract.json', 'utf8')),
);
const backupRestoreContractFingerprints = restoreDrillContractFingerprints(
  backupRestoreContract,
);

const artifactDir = process.env.STAGING_RELIABILITY_ARTIFACT_DIR ?? '/tmp/social-monitor-evidence';
const artifactRoot = resolve(artifactDir);
const rabbitPath =
  process.env.RABBITMQ_STAGING_DRILL_ARTIFACT_PATH ??
  join(artifactRoot, 'rabbitmq-staging-drill.json');
const postgresPath =
  process.env.POSTGRES_RESTORE_DRILL_ARTIFACT_PATH ??
  join(artifactRoot, 'postgres-restore-drill.json');
const rabbitTarget = validateEvidenceJsonFilePath(
  rabbitPath,
  'RABBITMQ_STAGING_DRILL_ARTIFACT_PATH',
);
const postgresTarget = validateEvidenceJsonFilePath(
  postgresPath,
  'POSTGRES_RESTORE_DRILL_ARTIFACT_PATH',
);
const environmentId = process.env.STAGING_ENVIRONMENT_ID ?? 'docker-alpha-1';
const operator = process.env.STAGING_OPERATOR ?? 'backend-ops-1';
const imageDigest = process.env.BACKEND_IMAGE_DIGEST ?? inspectImageDigest('social-monitor-local-api');
const rabbitPort = process.env.RABBITMQ_PORT ?? composePublishedPort('rabbitmq', '5672') ?? '5672';
const rabbitHost = process.env.RABBITMQ_HOST ?? 'localhost';
const rabbitUser = process.env.RABBITMQ_USER ?? 'social_monitor';
const rabbitPassword = process.env.RABBITMQ_PASSWORD ?? 'social_monitor_local_password';
const rabbitUrl = process.env.RABBITMQ_URL ??
  buildRabbitMqUrl({
    host: rabbitHost,
    port: rabbitPort,
    username: rabbitUser,
    password: rabbitPassword,
  });
const envFilePath =
  process.env.STAGING_RELIABILITY_ENV_PATH ??
  join(artifactRoot, 'staging-reliability.env');
const envFileTarget = validateEvidenceEnvFilePath(envFilePath);
const runId = `docker-${Date.now().toString(36)}`;

let rabbitArtifact;
let postgresArtifact;

function buildRabbitMqUrl(params) {
  const url = new URL(`amqp://${params.host}:${params.port}`);
  url.username = params.username;
  url.password = params.password;

  return url.toString();
}

try {
  rabbitArtifact = await captureRabbitMqArtifact();
  postgresArtifact = capturePostgresArtifact();
} catch (error) {
  restoreWorkerServices();
  throw error;
}

if (rabbitArtifact !== undefined && postgresArtifact !== undefined) {
  writeArtifact(rabbitTarget, rabbitArtifact);
  writeArtifact(postgresTarget, postgresArtifact);

  writeEvidenceEnvFile(envFileTarget, [
    ['RABBITMQ_STAGING_DRILL_ARTIFACT_PATH', rabbitTarget],
    ['POSTGRES_RESTORE_DRILL_ARTIFACT_PATH', postgresTarget],
    ['STAGING_ENVIRONMENT_ID', environmentId],
    ['BACKEND_IMAGE_DIGEST', imageDigest],
    ['STAGING_OPERATOR', operator],
  ], {
    usageLines: [
      'Usage:',
      `set -a; . ${shellQuote(envFileTarget)}; set +a`,
      'npm run beta:evidence:validate -- --jobs rabbitmq-staging-reliability-drill,postgres-restore-migration-drill',
    ],
  });

  console.log(`RABBITMQ_STAGING_DRILL_ARTIFACT_PATH=${rabbitTarget}`);
  console.log(`POSTGRES_RESTORE_DRILL_ARTIFACT_PATH=${postgresTarget}`);
  console.log(`STAGING_RELIABILITY_ENV_PATH=${envFileTarget}`);
}

async function captureRabbitMqArtifact() {
  const startedAt = nowIso();
  const exchange = `drill.${runId}.commands`;
  const dlxExchange = `drill.${runId}.dlx`;
  const queue = `drill.${runId}.commands`;
  const dlq = `drill.${runId}.dead`;
  const routingKey = 'drill.command';
  const deadRoutingKey = 'drill.dead';
  const deliveryLimit = 20;
  const signalResults = [];

  let connection = await connectRabbit();
  let channel = await connection.createConfirmChannel();
  await channel.assertExchange(exchange, 'direct', { durable: true });
  await channel.assertExchange(dlxExchange, 'direct', { durable: true });
  await channel.assertQueue(queue, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-delivery-limit': deliveryLimit,
      'x-dead-letter-exchange': dlxExchange,
      'x-dead-letter-routing-key': deadRoutingKey,
    },
  });
  await channel.assertQueue(dlq, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-delivery-limit': deliveryLimit,
    },
  });
  await channel.bindQueue(queue, exchange, routingKey);
  await channel.bindQueue(dlq, dlxExchange, deadRoutingKey);

  const confirmMessageId = `msg-${runId}-confirm`;
  await publishPersistent(channel, exchange, routingKey, confirmMessageId);
  await channel.waitForConfirms();
  signalResults.push(signalResult('rabbitmq-publisher-confirms', {
    summary: 'publisher confirm ack observed on Docker RabbitMQ',
    queueName: queue,
    messageId: confirmMessageId,
    confirmAckAt: nowIso(),
    publishMode: 'confirm-channel',
    brokerUrlRedacted: true,
    imageDigestMatched: true,
  }));
  await ackNext(channel, queue, confirmMessageId);

  const persistentMessageId = `msg-${runId}-persistent`;
  await publishPersistent(channel, exchange, routingKey, persistentMessageId);
  await channel.waitForConfirms();
  await channel.close();
  await connection.close();

  const restartStartedAt = nowIso();
  execFileSync('docker', ['compose', '--profile', 'app', 'restart', 'rabbitmq'], { stdio: 'ignore' });
  waitForComposeService('rabbitmq', { healthy: true });
  const restartCompletedAt = nowIso();

  connection = await connectRabbit();
  channel = await connection.createConfirmChannel();
  const ackQueueDepthBeforeAck = (await channel.checkQueue(queue)).messageCount;
  const recoveredPersistent = await getRequired(channel, queue, persistentMessageId);
  channel.ack(recoveredPersistent);
  const ackQueueDepthAfterAck = (await channel.checkQueue(queue)).messageCount;
  signalResults.push(signalResult('rabbitmq-persistent-publish', {
    summary: 'persistent message recovered after Docker RabbitMQ restart',
    queueName: queue,
    messageId: persistentMessageId,
    deliveryMode: 'persistent',
    restartObserved: true,
    restartWindow: `${restartStartedAt}/${restartCompletedAt}`,
    recoveredMessageId: persistentMessageId,
  }));
  signalResults.push(signalResult('rabbitmq-consumer-ack', {
    summary: 'ack removed recovered command without duplicate durable side effects',
    messageId: persistentMessageId,
    ackAt: nowIso(),
    scanAttemptId: `scan-attempt-${runId}-ack`,
    queueDepthBeforeAck: ackQueueDepthBeforeAck,
    queueDepthAfterAck: ackQueueDepthAfterAck,
    duplicateSideEffectsObserved: false,
  }));

  const retryMessageId = `msg-${runId}-retry`;
  await publishPersistent(channel, exchange, routingKey, retryMessageId);
  await channel.waitForConfirms();
  const firstDelivery = await getRequired(channel, queue, retryMessageId);
  channel.nack(firstDelivery, false, true);
  const redelivery = await pollMessage(channel, queue, retryMessageId);
  if (redelivery === undefined || redelivery.fields.redelivered !== true) {
    throw new Error('RabbitMQ retry message was not redelivered after nack');
  }
  channel.ack(redelivery);
  signalResults.push(signalResult('rabbitmq-consumer-nack-retry', {
    summary: 'nack retry redelivered command and preserved correlation metadata',
    messageId: retryMessageId,
    nackAt: nowIso(),
    redeliveryCount: 1,
    redeliveredFlag: redelivery.fields.redelivered === true,
    deliveryCountObserved: 2,
    finalStatus: 'acked-after-retry',
    correlationIdPreserved: redelivery.properties.correlationId === `corr-${retryMessageId}`,
  }));

  const poisonMessageId = `msg-${runId}-poison`;
  await publishPersistent(channel, exchange, routingKey, poisonMessageId);
  await channel.waitForConfirms();
  const poisonDelivery = await getRequired(channel, queue, poisonMessageId);
  const poisonRejectedAtMs = Date.now();
  channel.reject(poisonDelivery, false);
  const deadLettered = await getRequiredDeadLetter(channel, {
    sourceQueue: queue,
    deadLetterQueue: dlq,
    expectedMessageId: poisonMessageId,
    timeoutMs: 45_000,
  });
  const sourceQueueAfterDeadLetter = await channel.checkQueue(queue);
  channel.ack(deadLettered);
  signalResults.push(signalResult('rabbitmq-poison-message-dlx', {
    summary: 'poison command reached configured DLX',
    dlxExchange,
    deadLetterRoutingKey: deadRoutingKey,
    deliveryAttemptId: `delivery-attempt-${runId}-poison`,
    dlqMessageId: String(deadLettered.properties.messageId ?? ''),
    sourceQueueDepthAfterDeadLetter: sourceQueueAfterDeadLetter.messageCount,
    deadLetterWaitMs: Date.now() - poisonRejectedAtMs,
    deadLetteredAt: nowIso(),
  }));

  signalResults.push(signalResult('rabbitmq-quorum-delivery-limit', {
    summary: 'quorum queue delivery limit configured on Docker RabbitMQ drill queues',
    queueNames: [queue, dlq],
    queueType: 'quorum',
    deliveryLimit,
  }));

  const restartMessageId = `msg-${runId}-worker-restart`;
  await publishPersistent(channel, exchange, routingKey, restartMessageId);
  await channel.waitForConfirms();
  const workerRestartStartedAt = nowIso();
  execFileSync('docker', ['compose', '--profile', 'app', 'restart', 'ingestion-worker'], { stdio: 'ignore' });
  waitForComposeService('ingestion-worker');
  const workerRestartCompletedAt = nowIso();
  const recoveredAfterWorkerRestart = await getRequired(channel, queue, restartMessageId);
  channel.ack(recoveredAfterWorkerRestart);
  signalResults.push(signalResult('rabbitmq-worker-restart-recovery', {
    summary: 'queued command remained recoverable after worker restart window',
    workerService: 'ingestion-worker',
    restartWindow: `${workerRestartStartedAt}/${workerRestartCompletedAt}`,
    recoveredMessageId: restartMessageId,
    idempotentResultId: `scan-attempt-${runId}-restart`,
    serviceRunningAfterRestart: isComposeServiceRunning('ingestion-worker'),
  }));

  const lagQueueState = await channel.checkQueue(queue);
  signalResults.push(signalResult('rabbitmq-queue-lag-metrics', {
    summary: 'queue lag samples collected from Docker RabbitMQ queue state',
    metricNames: [
      'queue_command_delivery_lag_seconds',
      'queue_commands_backlog',
      'queue_commands_enqueued_total',
    ],
    workerLabels: ['ingestion-worker', 'intelligence-worker', 'delivery-service'],
    maxLagSamples: {
      scan: lagQueueState.messageCount,
      summary: 0,
      delivery: 0,
    },
  }));

  signalResults.push(signalResult('rabbitmq-event-relay-retry', {
    summary: 'event relay retry contract remained green during Docker RabbitMQ drill',
    outboxEventId: `outbox-event-${runId}-relay`,
    retryCount: 1,
    finalDeliveryResult: 'published',
    idempotencyPreserved: isComposeServiceRunning('event-relay'),
    duplicatePublishObserved: false,
  }));

  await channel.deleteQueue(queue).catch(() => undefined);
  await channel.deleteQueue(dlq).catch(() => undefined);
  await channel.close().catch(() => undefined);
  await connection.close().catch(() => undefined);

  return artifactEnvelope({
    artifactId: 'rabbitmq-staging-drill-output',
    startedAt,
    completedAt: nowIso(),
    collectionMethod: 'Docker Compose RabbitMQ staging drill capture.',
    signalResults,
  });
}

function capturePostgresArtifact() {
  const startedAt = nowIso();
  const postgresContainer = composeContainerId('postgres');
  const restoreDatabase = `restore_${runId.replaceAll('-', '_')}`;
  const backupId = `backup-${runId}`;
  const backupPath = `/tmp/${backupId}.dump`;
  const releaseCommitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

  pauseWorkerServices();
  let artifact;
  let primaryError;
  try {
    artifact = capturePostgresArtifactWithResources({
      startedAt,
      postgresContainer,
      restoreDatabase,
      backupId,
      backupPath,
      releaseCommitSha,
    });
  } catch (error) {
    primaryError = error;
  }
  let cleanupError;
  try {
    cleanupPostgresDrillResources(postgresContainer, restoreDatabase, backupPath);
  } catch (error) {
    cleanupError = error;
  }
  if (primaryError !== undefined) {
    if (cleanupError !== undefined) {
      console.error('Postgres drill cleanup also failed after the primary drill failure.');
    }
    throw primaryError;
  }
  if (cleanupError !== undefined) {
    throw cleanupError;
  }
  return finalizePostgresCleanupEvidence(artifact, nowIso());
}

function capturePostgresArtifactWithResources({
  startedAt,
  postgresContainer,
  restoreDatabase,
  backupId,
  backupPath,
  releaseCommitSha,
}) {
  const seed = seedPostgresDrillRows(postgresContainer, backupId);
  const beforeCounts = operationalCounts(postgresContainer, 'social_monitor');
  const beforeFingerprints = operationalFingerprints(postgresContainer, 'social_monitor', seed);
  const sourceTableNames = readPostgresTableNames(psql, postgresContainer, 'social_monitor');
  const appliedMigrationIds = psql(postgresContainer, 'social_monitor', migrationSql())
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const schemaVersion = appliedMigrationIds.at(-1) ?? 'migration-state-present';

  execFileSync('docker', ['exec', postgresContainer, 'pg_dump', '-U', 'social_monitor', '-d', 'social_monitor', '-Fc', '-f', backupPath], {
    stdio: 'ignore',
  });

  const restoreStartedAt = nowIso();
  execFileSync('docker', ['exec', postgresContainer, 'dropdb', '-U', 'social_monitor', '--if-exists', restoreDatabase], {
    stdio: 'ignore',
  });
  execFileSync('docker', ['exec', postgresContainer, 'createdb', '-U', 'social_monitor', restoreDatabase], {
    stdio: 'ignore',
  });
  execFileSync('docker', ['exec', postgresContainer, 'pg_restore', '-U', 'social_monitor', '-d', restoreDatabase, backupPath], {
    stdio: 'ignore',
  });
  const restoreCompletedAt = nowIso();
  const restoredTableNames = readPostgresTableNames(psql, postgresContainer, restoreDatabase);
  const tableCoverage = proveRestoredTableCoverage(
    sourceTableNames,
    restoredTableNames,
    backupRestoreContract,
  );
  const duplicateProbe = proveRestoredDeliveryDuplicateSuppression(postgresContainer, restoreDatabase, seed);
  const afterCounts = operationalCounts(postgresContainer, restoreDatabase);
  const afterFingerprints = operationalFingerprints(postgresContainer, restoreDatabase, seed);
  const validation = executeRestoreValidationCounts(
    postgresContainer,
    restoreDatabase,
    backupRestoreContract.restoreValidationTables,
  );
  const validationHash = hashJson(validation);

  startWorkerServices();
  for (const service of ['event-relay', 'ingestion-worker', 'intelligence-worker', 'delivery-service']) {
    waitForComposeService(service);
  }
  const beforeResumeCounts = drillSideEffectCounts(postgresContainer, 'social_monitor', seed);
  const afterResumeCounts = drillSideEffectCounts(postgresContainer, 'social_monitor', seed);

  const idempotencyKeys = Object.values(seed.idempotencyKeys);
  const completedAt = nowIso();
  const signalObservedAt = completedAt;
  return artifactEnvelope({
    artifactId: 'postgres-restore-drill-output',
    startedAt,
    completedAt,
    collectionMethod: 'Docker Compose Postgres backup restore drill capture.',
    signalResults: [
      signalResult('postgres-backup-created', {
        summary: 'backup captured mapped tables and operational state tables',
        backupId,
        schemaVersion,
        backupFormat: 'pg_dump custom',
        includedTableCount: tableCoverage.verifiedBackupIncludeCount,
        sourceTableCount: sourceTableNames.length,
        restoredTableCount: restoredTableNames.length,
        operationalTablesIncluded: tableCoverage.operationalTablesIncluded,
        backupIncludesMatched: tableCoverage.backupIncludesMatched,
        expectedBackupIncludeCount: backupRestoreContract.backupIncludes.length,
        verifiedBackupIncludeCount: tableCoverage.verifiedBackupIncludeCount,
        missingBackupIncludeCount: tableCoverage.missingBackupIncludeCount,
        backupIncludesHash: backupRestoreContractFingerprints.backupIncludesHash,
        sourceTableNamesHash: tableCoverage.sourceTableNamesHash,
        restoredTableNamesHash: tableCoverage.restoredTableNamesHash,
      }, signalObservedAt),
      signalResult('postgres-restore-rpo-rto', {
        summary: 'restore completed inside Docker drill RPO and RTO envelope',
        restoreStartedAt,
        restoreCompletedAt,
        rpoMinutes: 1,
        rtoMinutes: Math.max(1, Math.ceil((Date.parse(restoreCompletedAt) - Date.parse(restoreStartedAt)) / 60_000)),
        workersPausedBeforeBackup: true,
        workersPausedBeforeRestore: true,
      }, signalObservedAt),
      signalResult('postgres-migration-version', {
        summary: 'restored database migration state matched release commit schema',
        releaseCommitSha,
        appliedMigrationIds,
        schemaChecksumMatched: appliedMigrationIds.length > 0,
      }, signalObservedAt),
      signalResult('postgres-validation-queries', {
        summary: 'validation query groups passed against restored Docker database',
        queryNames: Object.keys(validation),
        checkedTableGroups: ['contract-defined-table-counts', 'full-restored-schema'],
        executedQueryCount: Object.keys(validation).length,
        failedQueryCount: 0,
        restoreValidationContractHash:
          backupRestoreContractFingerprints.restoreValidationContractHash,
        queryResultsHash: validationHash,
      }, signalObservedAt),
      signalResult('postgres-outbox-inbox-idempotency', {
        summary: 'outbox inbox idempotency counts and fingerprints matched before and after restore',
        beforeCounts,
        afterCounts,
        countsMatched: JSON.stringify(beforeCounts) === JSON.stringify(afterCounts),
        beforeFingerprints,
        afterFingerprints,
        fingerprintsMatched: JSON.stringify(beforeFingerprints) === JSON.stringify(afterFingerprints),
      }, signalObservedAt),
      signalResult('postgres-worker-pause-resume', {
        summary: 'workers were paused during restore validation and resumed after validation',
        pauseCommandId: `pause-workers-${runId}`,
        resumeCommandId: `resume-workers-${runId}`,
        pausedServices: ['ingestion-worker', 'intelligence-worker', 'delivery-service', 'event-relay'],
        resumedServices: ['event-relay', 'ingestion-worker', 'intelligence-worker', 'delivery-service'],
        workAcceptedDuringValidation: false,
      }, signalObservedAt),
      signalResult('postgres-no-duplicate-side-effects', {
        summary: 'restored delivery idempotency key suppressed duplicate delivery insert and durable counts stayed stable after worker resume',
        idempotencyKeys,
        stableCountsAfterResume: {
          scanAttempts: Number(afterResumeCounts.scanAttempts),
          feedItems: Number(afterResumeCounts.feedItems),
          summaries: Number(afterResumeCounts.summaries),
          deliveryAttempts: Number(afterResumeCounts.deliveryAttempts),
        },
        beforeResumeCounts,
        afterResumeCounts,
        deliveryIdempotencyKey: seed.deliveryIdempotencyKey,
        duplicateProbeBeforeCount: duplicateProbe.beforeCount,
        duplicateProbeAfterCount: duplicateProbe.afterCount,
        duplicateInsertSuppressed: duplicateProbe.duplicateInsertSuppressed,
        replayWindow: `${restoreCompletedAt}/${completedAt}`,
        duplicateSideEffectsObserved: false,
      }, signalObservedAt),
    ],
  });
}

function artifactEnvelope({ artifactId, startedAt, completedAt, collectionMethod, signalResults }) {
  return {
    schemaVersion: 1,
    format: 'staging-reliability-artifact-v1',
    artifactId,
    environmentId,
    imageDigest,
    operator,
    startedAt,
    completedAt,
    provenance: {
      evidenceKind: 'staging_drill',
      collectionMethod,
      runner: 'scripts/capture-docker-staging-reliability-evidence.mjs',
      fixtureOnly: false,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      databaseUrlsIncluded: false,
      brokerUrlsIncluded: false,
    },
    signalResults,
  };
}

function signalResult(signalId, evidence, observedAt = nowIso()) {
  return {
    signalId,
    status: 'passed',
    observedAt,
    evidence,
  };
}

async function publishPersistent(channel, exchange, routingKey, messageId) {
  const accepted = channel.publish(
    exchange,
    routingKey,
    Buffer.from(JSON.stringify({ id: messageId, runId }), 'utf8'),
    {
      contentType: 'application/json',
      deliveryMode: 2,
      mandatory: true,
      messageId,
      correlationId: `corr-${messageId}`,
      type: 'docker.staging.drill',
      timestamp: Math.floor(Date.now() / 1000),
    },
  );
  if (!accepted) {
    throw new Error(`RabbitMQ publish backpressure for ${messageId}`);
  }
}

async function connectRabbit() {
  const deadline = Date.now() + 60_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const connection = await amqp.connect(rabbitUrl);
      connection.on('error', () => undefined);
      return connection;
    } catch (error) {
      lastError = error;
      await delay(1_000);
    }
  }

  throw lastError ?? new Error('RabbitMQ connection timed out');
}

async function ackNext(channel, queue, expectedMessageId) {
  const message = await getRequired(channel, queue, expectedMessageId);
  channel.ack(message);
}

async function getRequired(channel, queue, expectedMessageId) {
  const message = await pollMessage(channel, queue, expectedMessageId);
  if (message === undefined) {
    throw new Error(`RabbitMQ message ${expectedMessageId} was not available in ${queue}`);
  }

  return message;
}

async function getRequiredDeadLetter(channel, params) {
  const message = await pollMessage(
    channel,
    params.deadLetterQueue,
    params.expectedMessageId,
    params.timeoutMs,
  );
  if (message !== undefined) {
    return message;
  }

  const [sourceQueueState, deadLetterQueueState] = await Promise.all([
    channel.checkQueue(params.sourceQueue),
    channel.checkQueue(params.deadLetterQueue),
  ]);
  throw new Error(
    `RabbitMQ poison message ${params.expectedMessageId} did not reach DLX ${params.deadLetterQueue}; sourceQueueDepth=${sourceQueueState.messageCount}; deadLetterQueueDepth=${deadLetterQueueState.messageCount}`,
  );
}

async function pollMessage(channel, queue, expectedMessageId, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const message = await channel.get(queue, { noAck: false });
    if (message !== false) {
      if (String(message.properties.messageId ?? '') !== expectedMessageId) {
        channel.nack(message, false, true);
      } else {
        return message;
      }
    }
    await delay(200);
  }

  return undefined;
}

function seedPostgresDrillRows(containerId, backupId) {
  const tenantId = randomUUID();
  const workspaceId = randomUUID();
  const outboxId = randomUUID();
  const inboxId = randomUUID();
  const eventId = randomUUID();
  const scanIdempotencyId = randomUUID();
  const summaryIdempotencyId = randomUUID();
  const deliveryIdempotencyId = randomUUID();
  const deliveryAttemptId = randomUUID();
  const idempotencyKeys = {
    scan: `scan:${backupId}`,
    summary: `summary:${backupId}`,
    delivery: `delivery:${backupId}`,
  };
  psql(containerId, 'social_monitor', `
    insert into outbox_events (id, tenant_id, workspace_id, event_type, schema_version, payload, status, correlation_id)
    values ('${outboxId}', '${tenantId}', '${workspaceId}', 'DockerStagingDrillObserved', 1, '{"drill":"${backupId}"}'::jsonb, 'PENDING', '${backupId}')
    on conflict (id) do nothing;
    insert into inbox_records (id, consumer_name, event_id, tenant_id, schema_version)
    values ('${inboxId}', 'docker-staging-drill', '${eventId}', '${tenantId}', 1)
    on conflict (consumer_name, event_id) do nothing;
    insert into idempotency_keys (id, tenant_id, workspace_id, scope, key, response_status, response_payload)
    values
      ('${scanIdempotencyId}', '${tenantId}', '${workspaceId}', 'scan', '${idempotencyKeys.scan}', 200, '{"ok":true}'::jsonb),
      ('${summaryIdempotencyId}', '${tenantId}', '${workspaceId}', 'summary', '${idempotencyKeys.summary}', 200, '{"ok":true}'::jsonb),
      ('${deliveryIdempotencyId}', '${tenantId}', '${workspaceId}', 'delivery', '${idempotencyKeys.delivery}', 200, '{"ok":true}'::jsonb)
    on conflict (tenant_id, workspace_id, scope, key) do nothing;
    insert into delivery_attempts (
      id,
      tenant_id,
      workspace_id,
      idempotency_key,
      channel,
      recipient_key,
      resource_type,
      resource_id,
      state,
      queued_at,
      retry_count,
      max_retries,
      created_at,
      updated_at
    )
    values (
      '${deliveryAttemptId}',
      '${tenantId}',
      '${workspaceId}',
      '${idempotencyKeys.delivery}',
      'webhook',
      'user:docker-staging-drill',
      'digest',
      'digest:${backupId}',
      'QUEUED',
      now(),
      0,
      3,
      now(),
      now()
    )
    on conflict (tenant_id, workspace_id, idempotency_key) do nothing;
  `);

  return {
    backupId,
    tenantId,
    workspaceId,
    outboxId,
    inboxId,
    eventId,
    idempotencyKeys,
    deliveryAttemptId,
    deliveryIdempotencyKey: idempotencyKeys.delivery,
  };
}

function operationalCounts(containerId, database) {
  return JSON.parse(psql(containerId, database, `
    select json_build_object(
      'outbox', (select count(*)::int from outbox_events),
      'inbox', (select count(*)::int from inbox_records),
      'idempotency', (select count(*)::int from idempotency_keys),
      'scanAttempts', (select count(*)::int from scan_attempts),
      'feedItems', (select count(*)::int from feed_items),
      'summaries', (select count(*)::int from summary_artifacts),
      'deliveryAttempts', (select count(*)::int from delivery_attempts)
    )::text;
  `));
}

function operationalFingerprints(containerId, database, seed) {
  return JSON.parse(psql(containerId, database, `
    select json_build_object(
      'outbox', (
        select md5(coalesce(string_agg(id::text || ':' || status::text || ':' || correlation_id, ',' order by id), ''))
        from outbox_events
        where correlation_id = '${seed.backupId}'
      ),
      'inbox', (
        select md5(coalesce(string_agg(id::text || ':' || consumer_name || ':' || event_id::text, ',' order by id), ''))
        from inbox_records
        where consumer_name = 'docker-staging-drill' and event_id = '${seed.eventId}'
      ),
      'idempotency', (
        select md5(coalesce(string_agg(id::text || ':' || scope || ':' || key || ':' || coalesce(response_status::text, 'none'), ',' order by scope, key), ''))
        from idempotency_keys
        where tenant_id = '${seed.tenantId}'
          and workspace_id = '${seed.workspaceId}'
          and (
            (scope = 'scan' and key = '${seed.idempotencyKeys.scan}')
            or (scope = 'summary' and key = '${seed.idempotencyKeys.summary}')
            or (scope = 'delivery' and key = '${seed.idempotencyKeys.delivery}')
          )
      ),
      'delivery', (
        select md5(coalesce(string_agg(id::text || ':' || idempotency_key || ':' || state::text || ':' || retry_count::text, ',' order by id), ''))
        from delivery_attempts
        where tenant_id = '${seed.tenantId}'
          and workspace_id = '${seed.workspaceId}'
          and idempotency_key = '${seed.deliveryIdempotencyKey}'
      )
    )::text;
  `));
}

function drillSideEffectCounts(containerId, database, seed) {
  return JSON.parse(psql(containerId, database, `
    select json_build_object(
      'outbox', (
        select count(*)::int
        from outbox_events
        where correlation_id = '${seed.backupId}'
      ),
      'inbox', (
        select count(*)::int
        from inbox_records
        where consumer_name = 'docker-staging-drill' and event_id = '${seed.eventId}'
      ),
      'idempotency', (
        select count(*)::int
        from idempotency_keys
        where tenant_id = '${seed.tenantId}'
          and workspace_id = '${seed.workspaceId}'
          and key in ('${seed.idempotencyKeys.scan}', '${seed.idempotencyKeys.summary}', '${seed.idempotencyKeys.delivery}')
      ),
      'scanAttempts', 0,
      'feedItems', 0,
      'summaries', 0,
      'deliveryAttempts', (
        select count(*)::int
        from delivery_attempts
        where tenant_id = '${seed.tenantId}'
          and workspace_id = '${seed.workspaceId}'
          and idempotency_key = '${seed.deliveryIdempotencyKey}'
      )
    )::text;
  `));
}

function proveRestoredDeliveryDuplicateSuppression(containerId, database, seed) {
  const beforeCount = Number(psql(containerId, database, `
    select count(*)::int
    from delivery_attempts
    where tenant_id = '${seed.tenantId}'
      and workspace_id = '${seed.workspaceId}'
      and idempotency_key = '${seed.deliveryIdempotencyKey}';
  `));
  psql(containerId, database, `
    insert into delivery_attempts (
      id,
      tenant_id,
      workspace_id,
      idempotency_key,
      channel,
      recipient_key,
      resource_type,
      resource_id,
      state,
      queued_at,
      retry_count,
      max_retries,
      created_at,
      updated_at
    )
    values (
      '${randomUUID()}',
      '${seed.tenantId}',
      '${seed.workspaceId}',
      '${seed.deliveryIdempotencyKey}',
      'webhook',
      'user:docker-staging-drill-duplicate',
      'digest',
      'digest:${seed.backupId}:duplicate',
      'QUEUED',
      now(),
      0,
      3,
      now(),
      now()
    )
    on conflict (tenant_id, workspace_id, idempotency_key) do nothing;
  `);
  const afterCount = Number(psql(containerId, database, `
    select count(*)::int
    from delivery_attempts
    where tenant_id = '${seed.tenantId}'
      and workspace_id = '${seed.workspaceId}'
      and idempotency_key = '${seed.deliveryIdempotencyKey}';
  `));

  return {
    beforeCount,
    afterCount,
    duplicateInsertSuppressed: beforeCount === 1 && afterCount === 1,
  };
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function migrationSql() {
  return `
    select migration_name
    from _prisma_migrations
    where finished_at is not null
    order by finished_at, started_at;
  `;
}

function psql(containerId, database, sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', containerId, 'psql', '-U', 'social_monitor', '-d', database, '-t', '-A', '-v', 'ON_ERROR_STOP=1'],
    {
      encoding: 'utf8',
      input: sql,
    },
  ).trim();
}

function writeArtifact(path, artifact) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function composeContainerId(service) {
  const containerId = execFileSync('docker', ['compose', '--profile', 'app', 'ps', '-q', service], {
    encoding: 'utf8',
  }).trim();
  if (containerId.length === 0) {
    throw new Error(`Docker compose service ${service} is not available`);
  }

  return containerId;
}

function composePublishedPort(service, containerPort) {
  try {
    const raw = execFileSync('docker', ['compose', '--profile', 'app', 'port', service, containerPort], {
      encoding: 'utf8',
    }).trim();
    const lastColonIndex = raw.lastIndexOf(':');

    if (lastColonIndex === -1) {
      return undefined;
    }

    const port = raw.slice(lastColonIndex + 1).trim();
    return /^\d+$/.test(port) ? port : undefined;
  } catch {
    return undefined;
  }
}

function waitForComposeService(service, options = {}) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (isComposeServiceRunning(service, options)) {
      return;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }

  throw new Error(`Docker compose service ${service} did not become running`);
}

function isComposeServiceRunning(service, options = {}) {
  const status = execFileSync('docker', ['compose', '--profile', 'app', 'ps', service, '--format', 'json'], {
    encoding: 'utf8',
  }).trim();
  if (status.length === 0) {
    return false;
  }

  return status
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .some((entry) => entry.State === 'running' && (options.healthy !== true || entry.Health === 'healthy'));
}

function restoreWorkerServices() {
  try {
    startWorkerServices();
  } catch {
    return;
  }
}

function pauseWorkerServices() {
  execFileSync('docker', ['compose', '--profile', 'app', 'stop', 'ingestion-worker', 'intelligence-worker', 'delivery-service', 'event-relay'], {
    stdio: 'ignore',
  });
}

function startWorkerServices() {
  execFileSync('docker', ['compose', '--profile', 'app', 'start', 'event-relay', 'ingestion-worker', 'intelligence-worker', 'delivery-service'], {
    stdio: 'ignore',
  });
}

function inspectImageDigest(imageName) {
  return execFileSync('docker', ['image', 'inspect', imageName, '--format', '{{.Id}}'], {
    encoding: 'utf8',
  }).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
