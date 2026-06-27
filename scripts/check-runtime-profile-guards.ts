import {
  resolveDeliveryRabbitMqAttemptQueueOptions,
  resolveDeliveryRabbitMqAttemptQueueReaderOptions,
  resolveDeliveryAttemptDispatchQueueMode,
  resolveDeliveryAttemptDispatchTarget,
  resolveDeliveryAttemptQueueReaderMode,
} from '../apps/delivery-service/src/delivery-service-provider-tokens';
import { resolveEventRelayLoopOptions } from '../apps/event-relay/src/event-relay-provider-tokens';
import {
  resolveIngestionRabbitMqScanQueueReaderOptions,
  resolveIngestionScanQueueReaderMode,
  resolveIngestionScanReporterMode,
  resolveIngestionWorkerPersistenceMode,
} from '../apps/ingestion-worker/src/ingestion-worker-provider-tokens';
import {
  resolveIntelligenceRabbitMqSummaryQueueReaderOptions,
  resolveIntelligenceSummaryQueueReaderMode,
} from '../apps/intelligence-worker/src/intelligence-worker-provider-tokens';
import {
  resolveDeliveryEnabledChannels,
  resolveDeliveryPersistenceMode,
  resolveDeliveryWebhookProviderMode,
} from '../libs/delivery/interfaces/rest/delivery-provider-tokens';
import { resolveFeedPersistenceMode } from '../libs/feed/interfaces/rest/feed-provider-tokens';
import {
  resolveIdentityPersistenceMode,
  resolveIdentityUserAccessTokenConfig,
} from '../libs/identity/interfaces/rest/identity-provider-tokens';
import { resolveIngestionSupportPersistenceMode } from '../libs/ingestion/interfaces/rest/ingestion-provider-tokens';
import {
  resolveMonitoringPersistenceMode,
  resolveMonitoringScanQueueMode,
} from '../libs/monitoring/interfaces/rest/monitoring-provider-tokens';
import {
  resolveRelevanceMemoryProjectionMode,
  resolveRelevancePersistenceMode,
} from '../libs/relevance/interfaces/rest/relevance-provider-tokens';
import {
  resolveSummaryJobQueueMode,
  resolveSummaryMemoryMode,
  resolveSummaryModelProviderMode,
  resolveSummaryRabbitMqJobQueueOptions,
  resolveSummaryPersistenceMode,
  resolveReaderSummaryModelProviderMode,
  resolveSummaryYoutubeVideoSummaryProviderMode,
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
  RABBITMQ_DEAD_LETTER_EXCHANGE: 'social-monitor.commands.dlx',
  RABBITMQ_QUEUE_TYPE: 'quorum',
  RABBITMQ_QUEUE_DELIVERY_LIMIT: '20',
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
  () => resolveRelevancePersistenceMode(betaEnv),
  'RELEVANCE_PERSISTENCE must reject in-memory mode in beta runtime',
);
assert(
  resolveRelevancePersistenceMode({ ...databaseEnv, RELEVANCE_PERSISTENCE: 'prisma' }) === 'prisma',
  'relevance beta persistence',
);
assert(resolveRelevanceMemoryProjectionMode(betaEnv) === 'disabled', 'relevance memory projection defaults disabled');
assertThrows(
  () => resolveRelevanceMemoryProjectionMode({ ...betaEnv, RELEVANCE_MEMORY_PROJECTION_MODE: 'memo-stack' }),
  'RELEVANCE_MEMORY_PROJECTION_MODE=memo-stack must require memo-stack URL and token',
);
assert(
  resolveRelevanceMemoryProjectionMode({
    ...betaEnv,
    RELEVANCE_MEMORY_PROJECTION_MODE: 'memo-stack',
    INFINITY_CONTEXT_URL: 'https://memory.example.test',
    INFINITY_CONTEXT_TOKEN: 'test-token',
  }) === 'memo-stack',
  'relevance memory projection accepts explicit memo-stack mode',
);

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
assert(
  resolveIngestionRabbitMqScanQueueReaderOptions(rabbitMqEnv).deadLetterExchange === 'social-monitor.commands.dlx',
  'ingestion beta RabbitMQ reader must carry DLX',
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
  () => resolveSummaryModelProviderMode(betaEnv),
  'SUMMARY_MODEL_PROVIDER must reject deterministic mode in beta runtime',
);
assert(
  resolveSummaryModelProviderMode({ ...betaEnv, SUMMARY_MODEL_PROVIDER: 'openai-responses' }) === 'openai-responses',
  'summary beta model provider',
);
assertThrows(
  () => resolveReaderSummaryModelProviderMode(betaEnv),
  'READER_SUMMARY_MODEL_PROVIDER must reject deterministic mode in beta runtime',
);
assert(
  resolveReaderSummaryModelProviderMode({ ...betaEnv, READER_SUMMARY_MODEL_PROVIDER: 'openai-responses' }) ===
    'openai-responses',
  'reader summary beta model provider',
);
assert(
  resolveReaderSummaryModelProviderMode({ ...betaEnv, BRIEFING_MODEL_PROVIDER: 'openai-responses' }) ===
    'openai-responses',
  'legacy briefing beta model provider',
);
assert(
  resolveSummaryRabbitMqJobQueueOptions(rabbitMqEnv).routes?.['summary.job.execute']?.queueType === 'quorum',
  'summary beta RabbitMQ publisher must carry quorum queue type',
);
assert(resolveSummaryMemoryMode(betaEnv) === 'disabled', 'summary memory must default to disabled');
assertThrows(
  () => resolveSummaryMemoryMode({ ...betaEnv, SUMMARY_MEMORY_MODE: 'memo-stack' }),
  'SUMMARY_MEMORY_MODE=memo-stack must require memo-stack URL and token',
);
assert(
  resolveSummaryMemoryMode({
    ...betaEnv,
    SUMMARY_MEMORY_MODE: 'memo-stack',
    INFINITY_CONTEXT_URL: 'https://memory.example.test',
    INFINITY_CONTEXT_TOKEN: 'test-token',
  }) === 'memo-stack',
  'summary memory must accept explicit memo-stack mode with URL and token',
);
assert(
  resolveSummaryYoutubeVideoSummaryProviderMode(betaEnv) === 'disabled',
  'summary YouTube provider may stay disabled in beta runtime',
);
assertThrows(
  () => resolveSummaryYoutubeVideoSummaryProviderMode({
    ...betaEnv,
    SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER: 'deterministic',
  }),
  'SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER must reject deterministic mode in beta runtime',
);
assert(
  resolveSummaryYoutubeVideoSummaryProviderMode({
    ...betaEnv,
    SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER: 'google-gemini',
  }) === 'google-gemini',
  'summary YouTube provider accepts google-gemini in beta runtime',
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
assert(
  resolveIntelligenceRabbitMqSummaryQueueReaderOptions(rabbitMqEnv).deliveryLimit === 20,
  'intelligence beta RabbitMQ reader must carry delivery limit',
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
  () => resolveIdentityUserAccessTokenConfig(betaEnv),
  'SOCIAL_MONITOR_USER_AUTH_MODE must reject disabled mode in beta runtime',
);
assert(
  resolveIdentityUserAccessTokenConfig({
    ...betaEnv,
    SOCIAL_MONITOR_USER_AUTH_MODE: 'oidc-jwt',
    SOCIAL_MONITOR_OIDC_ISSUER: 'https://auth.example.test',
    SOCIAL_MONITOR_OIDC_AUDIENCE: 'social-monitor-api',
    SOCIAL_MONITOR_OIDC_JWKS_JSON: '{"keys":[{"kty":"RSA","kid":"test","n":"x","e":"AQAB"}]}',
  }).mode === 'oidc-jwt',
  'identity beta user auth',
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
assert(
  resolveDeliveryEnabledChannels(betaEnv).join(',') === 'webhook',
  'delivery beta enabled channels must default to webhook only',
);
assert(
  resolveDeliveryEnabledChannels({ ...betaEnv, DELIVERY_ENABLED_CHANNELS: 'webhook' }).join(',') === 'webhook',
  'delivery beta enabled channels must allow webhook',
);
assertThrows(
  () => resolveDeliveryEnabledChannels({ ...betaEnv, DELIVERY_ENABLED_CHANNELS: 'email,webhook' }),
  'DELIVERY_ENABLED_CHANNELS must reject fake email delivery in beta runtime',
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
assert(
  resolveDeliveryRabbitMqAttemptQueueOptions(rabbitMqEnv).routes['delivery.attempt.send']?.deadLetterExchange ===
    'social-monitor.commands.dlx',
  'delivery beta RabbitMQ publisher must carry DLX',
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
  resolveDeliveryRabbitMqAttemptQueueReaderOptions(rabbitMqEnv).queueType === 'quorum',
  'delivery beta RabbitMQ reader must carry quorum queue type',
);
assertThrows(
  () => resolveSummaryRabbitMqJobQueueOptions({
    ...rabbitMqEnv,
    RABBITMQ_DEAD_LETTER_EXCHANGE: '',
  }),
  'RabbitMQ beta queue options must reject missing DLX',
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
