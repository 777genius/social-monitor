import {
  resolveDeliveryAttemptDispatchQueueMode,
  resolveDeliveryAttemptDispatchTarget,
  resolveDeliveryAttemptQueueReaderMode,
} from '../apps/delivery-service/src/delivery-service-provider-tokens';
import { resolveEventRelayLoopOptions } from '../apps/event-relay/src/event-relay-provider-tokens';
import {
  resolveIngestionScanQueueReaderMode,
  resolveIngestionScanReporterMode,
  resolveIngestionWorkerPersistenceMode,
} from '../apps/ingestion-worker/src/ingestion-worker-provider-tokens';
import { resolveIntelligenceSummaryQueueReaderMode } from '../apps/intelligence-worker/src/intelligence-worker-provider-tokens';
import { resolveDeliveryPersistenceMode } from '../libs/delivery/interfaces/rest/delivery-provider-tokens';
import { resolveDeliveryWebhookProviderMode } from '../libs/delivery/interfaces/rest/delivery-rest.module';
import { resolveFeedPersistenceMode } from '../libs/feed/interfaces/rest/feed-provider-tokens';
import { resolveIdentityPersistenceMode } from '../libs/identity/interfaces/rest/identity-provider-tokens';
import { resolveIngestionSupportPersistenceMode } from '../libs/ingestion/interfaces/rest/ingestion-provider-tokens';
import {
  resolveMonitoringPersistenceMode,
  resolveMonitoringScanQueueMode,
} from '../libs/monitoring/interfaces/rest/monitoring-provider-tokens';
import {
  resolveSummaryJobQueueMode,
  resolveSummaryPersistenceMode,
} from '../libs/summary/interfaces/rest/summary-provider-tokens';
import { resolveUsagePersistenceMode } from '../libs/usage/interfaces/rest/usage-provider-tokens';

const betaEnv = {
  SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
};
const databaseEnv = {
  ...betaEnv,
  DATABASE_URL: 'postgresql://social_monitor:password@localhost:5432/social_monitor',
};
const rabbitMqEnv = {
  ...betaEnv,
  RABBITMQ_URL: 'amqp://social_monitor:password@localhost:5672',
};

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertThrows = (fn: () => unknown, message: string): void => {
  try {
    fn();
  } catch {
    return;
  }

  throw new Error(message);
};

assertThrows(
  () => resolveFeedPersistenceMode(betaEnv),
  'FEED_PERSISTENCE must reject in-memory mode in beta runtime',
);
assert(resolveFeedPersistenceMode({ ...databaseEnv, FEED_PERSISTENCE: 'prisma' }) === 'prisma', 'feed beta mode');

assertThrows(
  () => resolveMonitoringPersistenceMode(betaEnv),
  'MONITORING_PERSISTENCE must reject in-memory mode in beta runtime',
);
assert(
  resolveMonitoringPersistenceMode({ ...databaseEnv, MONITORING_PERSISTENCE: 'prisma' }) === 'prisma',
  'monitoring beta persistence',
);
assertThrows(
  () => resolveMonitoringScanQueueMode(betaEnv),
  'MONITORING_SCAN_QUEUE must reject in-memory mode in beta runtime',
);
assert(
  resolveMonitoringScanQueueMode({ ...rabbitMqEnv, MONITORING_SCAN_QUEUE: 'rabbitmq' }) === 'rabbitmq',
  'monitoring beta scan queue',
);

assertThrows(
  () => resolveIngestionSupportPersistenceMode(betaEnv),
  'INGESTION_SUPPORT_PERSISTENCE must reject in-memory mode in beta runtime',
);
assert(
  resolveIngestionSupportPersistenceMode({ ...databaseEnv, INGESTION_SUPPORT_PERSISTENCE: 'prisma' }) === 'prisma',
  'ingestion support beta persistence',
);
assertThrows(
  () => resolveIngestionWorkerPersistenceMode(betaEnv),
  'INGESTION_WORKER_PERSISTENCE must reject in-memory mode in beta runtime',
);
assert(
  resolveIngestionWorkerPersistenceMode({ ...databaseEnv, INGESTION_WORKER_PERSISTENCE: 'prisma' }) === 'prisma',
  'ingestion worker beta persistence',
);
assertThrows(
  () => resolveIngestionScanReporterMode(betaEnv),
  'INGESTION_SCAN_REPORTER must reject noop mode in beta runtime',
);
assert(
  resolveIngestionScanReporterMode({
    ...betaEnv,
    INGESTION_SCAN_REPORTER: 'monitoring',
    MONITORING_PERSISTENCE: 'prisma',
  }) === 'monitoring',
  'ingestion beta scan reporter',
);
assertThrows(
  () => resolveIngestionScanQueueReaderMode(betaEnv),
  'INGESTION_SCAN_QUEUE_READER must reject in-memory mode in beta runtime',
);
assert(
  resolveIngestionScanQueueReaderMode({ ...rabbitMqEnv, INGESTION_SCAN_QUEUE_READER: 'rabbitmq' }) === 'rabbitmq',
  'ingestion beta scan queue reader',
);

assertThrows(
  () => resolveSummaryPersistenceMode(betaEnv),
  'SUMMARY_PERSISTENCE must reject in-memory mode in beta runtime',
);
assert(
  resolveSummaryPersistenceMode({ ...databaseEnv, SUMMARY_PERSISTENCE: 'prisma' }) === 'prisma',
  'summary beta persistence',
);
assertThrows(
  () => resolveSummaryJobQueueMode(betaEnv),
  'SUMMARY_JOB_QUEUE_MODE must reject in-memory mode in beta runtime',
);
assert(
  resolveSummaryJobQueueMode({ ...rabbitMqEnv, SUMMARY_JOB_QUEUE_MODE: 'rabbitmq' }) === 'rabbitmq',
  'summary beta job queue',
);
assertThrows(
  () => resolveIntelligenceSummaryQueueReaderMode(betaEnv),
  'INTELLIGENCE_SUMMARY_QUEUE_READER must reject in-memory mode in beta runtime',
);
assert(
  resolveIntelligenceSummaryQueueReaderMode({
    ...rabbitMqEnv,
    INTELLIGENCE_SUMMARY_QUEUE_READER: 'rabbitmq',
  }) === 'rabbitmq',
  'intelligence beta queue reader',
);

assertThrows(
  () => resolveIdentityPersistenceMode(betaEnv),
  'IDENTITY_PERSISTENCE must reject in-memory mode in beta runtime',
);
assert(
  resolveIdentityPersistenceMode({ ...databaseEnv, IDENTITY_PERSISTENCE: 'prisma' }) === 'prisma',
  'identity beta persistence',
);
assertThrows(
  () => resolveUsagePersistenceMode(betaEnv),
  'USAGE_PERSISTENCE must reject in-memory mode in beta runtime',
);
assert(
  resolveUsagePersistenceMode({ ...databaseEnv, USAGE_PERSISTENCE: 'prisma' }) === 'prisma',
  'usage beta persistence',
);

assertThrows(
  () => resolveDeliveryPersistenceMode(betaEnv),
  'DELIVERY_PERSISTENCE must reject in-memory mode in beta runtime',
);
assert(
  resolveDeliveryPersistenceMode({ ...databaseEnv, DELIVERY_PERSISTENCE: 'prisma' }) === 'prisma',
  'delivery beta persistence',
);
assertThrows(
  () => resolveDeliveryWebhookProviderMode(betaEnv),
  'DELIVERY_WEBHOOK_PROVIDER must reject in-memory mode in beta runtime',
);
assert(
  resolveDeliveryWebhookProviderMode({ ...betaEnv, DELIVERY_WEBHOOK_PROVIDER: 'http' }) === 'http',
  'delivery beta webhook provider',
);
assertThrows(
  () => resolveDeliveryAttemptDispatchTarget(betaEnv),
  'DELIVERY_ATTEMPT_DISPATCH_TARGET must reject direct mode in beta runtime',
);
assert(
  resolveDeliveryAttemptDispatchTarget({ ...betaEnv, DELIVERY_ATTEMPT_DISPATCH_TARGET: 'queue' }) === 'queue',
  'delivery beta dispatch target',
);
assertThrows(
  () => resolveDeliveryAttemptDispatchQueueMode(betaEnv),
  'DELIVERY_ATTEMPT_DISPATCH_QUEUE must reject in-memory mode in beta runtime',
);
assert(
  resolveDeliveryAttemptDispatchQueueMode({
    ...rabbitMqEnv,
    DELIVERY_ATTEMPT_DISPATCH_QUEUE: 'rabbitmq',
  }) === 'rabbitmq',
  'delivery beta dispatch queue',
);
assertThrows(
  () => resolveDeliveryAttemptQueueReaderMode(betaEnv),
  'DELIVERY_ATTEMPT_QUEUE_READER must reject in-memory mode in beta runtime',
);
assert(
  resolveDeliveryAttemptQueueReaderMode({ ...rabbitMqEnv, DELIVERY_ATTEMPT_QUEUE_READER: 'rabbitmq' }) === 'rabbitmq',
  'delivery beta queue reader',
);

assert(
  resolveEventRelayLoopOptions(betaEnv).enabled,
  'EVENT_RELAY_LOOP must default to enabled in beta runtime',
);
assertThrows(
  () => resolveEventRelayLoopOptions({ ...betaEnv, EVENT_RELAY_LOOP: 'disabled' }),
  'EVENT_RELAY_LOOP must reject disabled mode in beta runtime',
);

console.log('Runtime profile guards OK');
