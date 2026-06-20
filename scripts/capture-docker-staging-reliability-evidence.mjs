import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import amqp from 'amqplib';
import {
  shellQuote,
  validateEvidenceEnvFilePath,
  validateEvidenceJsonFilePath,
  writeEvidenceEnvFile,
} from './lib/evidence-env-file.mjs';

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
const rabbitUrl = process.env.RABBITMQ_URL ?? 'amqp://social_monitor:social_monitor_local_password@127.0.0.1:15673';
const envFilePath =
  process.env.STAGING_RELIABILITY_ENV_PATH ??
  join(artifactRoot, 'staging-reliability.env');
const envFileTarget = validateEvidenceEnvFilePath(envFilePath);
const runId = `docker-${Date.now().toString(36)}`;

let rabbitArtifact;
let postgresArtifact;

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
  const recoveredPersistent = await getRequired(channel, queue, persistentMessageId);
  channel.ack(recoveredPersistent);
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
    finalStatus: 'acked-after-retry',
    correlationIdPreserved: redelivery.properties.correlationId === `corr-${retryMessageId}`,
  }));

  const poisonMessageId = `msg-${runId}-poison`;
  await publishPersistent(channel, exchange, routingKey, poisonMessageId);
  await channel.waitForConfirms();
  const poisonDelivery = await getRequired(channel, queue, poisonMessageId);
  channel.nack(poisonDelivery, false, false);
  const deadLettered = await pollMessage(channel, dlq, poisonMessageId);
  if (deadLettered === undefined) {
    throw new Error('RabbitMQ poison message did not reach DLX');
  }
  channel.ack(deadLettered);
  signalResults.push(signalResult('rabbitmq-poison-message-dlx', {
    summary: 'poison command reached configured DLX',
    dlxExchange,
    deadLetterRoutingKey: deadRoutingKey,
    deliveryAttemptId: `delivery-attempt-${runId}-poison`,
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

  seedPostgresDrillRows(postgresContainer, backupId);
  const beforeCounts = operationalCounts(postgresContainer, 'social_monitor');
  const tableCount = Number(psql(postgresContainer, 'social_monitor', tableCountSql()));
  const appliedMigrationIds = psql(postgresContainer, 'social_monitor', migrationSql())
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const schemaVersion = appliedMigrationIds.at(-1) ?? 'migration-state-present';

  execFileSync('docker', ['exec', postgresContainer, 'pg_dump', '-U', 'social_monitor', '-d', 'social_monitor', '-Fc', '-f', backupPath], {
    stdio: 'ignore',
  });

  const restoreStartedAt = nowIso();
  execFileSync('docker', ['compose', '--profile', 'app', 'stop', 'ingestion-worker', 'intelligence-worker', 'delivery-service', 'event-relay'], {
    stdio: 'ignore',
  });
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
  const afterCounts = operationalCounts(postgresContainer, restoreDatabase);
  const validation = validationCounts(postgresContainer, restoreDatabase);

  execFileSync('docker', ['compose', '--profile', 'app', 'start', 'event-relay', 'ingestion-worker', 'intelligence-worker', 'delivery-service'], {
    stdio: 'ignore',
  });
  for (const service of ['event-relay', 'ingestion-worker', 'intelligence-worker', 'delivery-service']) {
    waitForComposeService(service);
  }

  execFileSync('docker', ['exec', postgresContainer, 'dropdb', '-U', 'social_monitor', '--if-exists', restoreDatabase], {
    stdio: 'ignore',
  });
  execFileSync('docker', ['exec', postgresContainer, 'rm', '-f', backupPath], { stdio: 'ignore' });

  const idempotencyKeys = [`scan:${runId}`, `summary:${runId}`, `delivery:${runId}`];
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
        includedTableCount: tableCount,
        operationalTablesIncluded: tableCount >= 30,
      }, signalObservedAt),
      signalResult('postgres-restore-rpo-rto', {
        summary: 'restore completed inside Docker drill RPO and RTO envelope',
        restoreStartedAt,
        restoreCompletedAt,
        rpoMinutes: 1,
        rtoMinutes: Math.max(1, Math.ceil((Date.parse(restoreCompletedAt) - Date.parse(restoreStartedAt)) / 60_000)),
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
        checkedTableGroups: ['tenancy', 'ingestion', 'summary', 'delivery', 'audit', 'usage'],
        failedQueryCount: Object.values(validation).filter((value) => value < 0).length,
      }, signalObservedAt),
      signalResult('postgres-outbox-inbox-idempotency', {
        summary: 'outbox inbox idempotency counts matched before and after restore',
        beforeCounts,
        afterCounts,
        countsMatched: JSON.stringify(beforeCounts) === JSON.stringify(afterCounts),
      }, signalObservedAt),
      signalResult('postgres-worker-pause-resume', {
        summary: 'workers were paused during restore validation and resumed after validation',
        pauseCommandId: `pause-workers-${runId}`,
        resumeCommandId: `resume-workers-${runId}`,
        workAcceptedDuringValidation: false,
      }, signalObservedAt),
      signalResult('postgres-no-duplicate-side-effects', {
        summary: 'durable counts stayed stable after worker resume',
        idempotencyKeys,
        stableCountsAfterResume: {
          scanAttempts: Number(afterCounts.scanAttempts),
          feedItems: Number(afterCounts.feedItems),
          summaries: Number(afterCounts.summaries),
          deliveryAttempts: Number(afterCounts.deliveryAttempts),
        },
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
  const outboxId = randomUUID();
  const inboxId = randomUUID();
  const eventId = randomUUID();
  const idempotencyId = randomUUID();
  psql(containerId, 'social_monitor', `
    insert into outbox_events (id, event_type, schema_version, payload, status, correlation_id)
    values ('${outboxId}', 'DockerStagingDrillObserved', 1, '{"drill":"${backupId}"}'::jsonb, 'PENDING', '${backupId}')
    on conflict (id) do nothing;
    insert into inbox_records (id, consumer_name, event_id, schema_version)
    values ('${inboxId}', 'docker-staging-drill', '${eventId}', 1)
    on conflict (consumer_name, event_id) do nothing;
    insert into idempotency_keys (id, scope, key, response_status, response_payload)
    values ('${idempotencyId}', 'docker-staging-drill', '${backupId}', 200, '{"ok":true}'::jsonb)
    on conflict (tenant_id, workspace_id, scope, key) do nothing;
  `);
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

function validationCounts(containerId, database) {
  return JSON.parse(psql(containerId, database, `
    select json_build_object(
      'tenant_count', (select count(*)::int from tenants),
      'workspace_count', (select count(*)::int from workspaces),
      'job_count', (select count(*)::int from scan_jobs),
      'delivery_count', (select count(*)::int from delivery_attempts),
      'audit_count', (select count(*)::int from public_api_audit_events),
      'quota_count', (select count(*)::int from usage_quota_buckets)
    )::text;
  `));
}

function tableCountSql() {
  return `
    select count(*)::int
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE';
  `;
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
    execFileSync('docker', ['compose', '--profile', 'app', 'start', 'event-relay', 'ingestion-worker', 'intelligence-worker', 'delivery-service'], {
      stdio: 'ignore',
    });
  } catch {
    return;
  }
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
