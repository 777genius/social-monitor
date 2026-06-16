import {
  correlationId,
  FixedClock,
  type IdGenerator,
  isOk,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import { PrismaDeliveryAttemptRepository } from '../libs/delivery/adapters/persistence/prisma/prisma-delivery-attempt.repository';
import type {
  PrismaDeliveryAttemptWriteData,
  PrismaDeliveryClient,
  PrismaDigestScheduleWriteData,
  PrismaDigestWriteData,
  PrismaRealtimeEventWriteData,
  PrismaWebhookEndpointWriteData,
  PrismaWebhookReplayDeliveryWriteData,
  PrismaWebhookSecretWriteData,
} from '../libs/delivery/adapters/persistence/prisma/prisma-delivery-client';
import { PrismaDigestScheduleRepository } from '../libs/delivery/adapters/persistence/prisma/prisma-digest-schedule.repository';
import { PrismaDigestRepository } from '../libs/delivery/adapters/persistence/prisma/prisma-digest.repository';
import { PrismaDigestSourceReader } from '../libs/delivery/adapters/source/prisma/prisma-digest-source.reader';
import { PrismaNotificationPreferenceReader } from '../libs/delivery/adapters/preferences/prisma/prisma-notification-preference.reader';
import { PrismaRealtimeEventRepository } from '../libs/delivery/adapters/persistence/prisma/prisma-realtime-event.repository';
import { PrismaWebhookEndpointRepository } from '../libs/delivery/adapters/persistence/prisma/prisma-webhook-endpoint.repository';
import { PrismaWebhookReplayStore } from '../libs/delivery/adapters/replay/prisma/prisma-webhook-replay.store';
import {
  PrismaWebhookSecretVault,
  resolveWebhookSecretEncryptionKey,
} from '../libs/delivery/adapters/secrets/prisma/prisma-webhook-secret.vault';
import type {
  PrismaDeliveryAttemptRecord,
  PrismaDigestSourceFeedItemRecord,
  PrismaDigestSourceSummaryRecord,
  PrismaDigestRecord,
  PrismaDigestScheduleRecord,
  PrismaNotificationPreferenceRecord,
  PrismaRealtimeEventRecord,
  PrismaWebhookEndpointRecord,
  PrismaWebhookReplayDeliveryRecord,
  PrismaWebhookSecretRecord,
} from '../libs/delivery/adapters/persistence/prisma/prisma-delivery-records';
import { Digest, DigestSchedule } from '../libs/delivery/domain';
import { AssembleDigestUseCase } from '../libs/delivery/features/assemble-digest/assemble-digest.use-case';
import { CreateWebhookEndpointUseCase } from '../libs/delivery/features/create-webhook-endpoint/create-webhook-endpoint.use-case';
import { DisableWebhookEndpointUseCase } from '../libs/delivery/features/disable-webhook-endpoint/disable-webhook-endpoint.use-case';
import { GetDeliveryAttemptUseCase } from '../libs/delivery/features/get-delivery-attempt/get-delivery-attempt.use-case';
import { GetDigestUseCase } from '../libs/delivery/features/get-digest/get-digest.use-case';
import { ListWebhookEndpointsUseCase } from '../libs/delivery/features/list-webhook-endpoints/list-webhook-endpoints.use-case';
import { ListRealtimeEventsUseCase } from '../libs/delivery/features/list-realtime-events/list-realtime-events.use-case';
import { QueueDeliveryAttemptUseCase } from '../libs/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { RecordDeliveryAttemptStateUseCase } from '../libs/delivery/features/record-delivery-attempt-state/record-delivery-attempt-state.use-case';
import { RecordRealtimeEventUseCase } from '../libs/delivery/features/record-realtime-event/record-realtime-event.use-case';
import { SignWebhookPayloadUseCase } from '../libs/delivery/features/sign-webhook-payload/sign-webhook-payload.use-case';
import { VerifyWebhookSignatureUseCase } from '../libs/delivery/features/verify-webhook-signature/verify-webhook-signature.use-case';
import { resolveDeliveryPersistenceMode } from '../libs/delivery/interfaces/rest/delivery-provider-tokens';

const clock = new FixedClock(new Date('2026-06-07T00:00:10.000Z'));
const tenant = tenantId('00000000-0000-7000-8000-000000000701');
const workspace = workspaceId('00000000-0000-7000-8000-000000000702');

async function main(): Promise<void> {
  assert(resolveDeliveryPersistenceMode({}) === 'in-memory', 'delivery persistence must default to in-memory');
  assertThrows(
    () => resolveDeliveryPersistenceMode({ DELIVERY_PERSISTENCE: 'prisma' }),
    'DELIVERY_PERSISTENCE=prisma must require DATABASE_URL',
  );
  assert(
    resolveDeliveryPersistenceMode({
      DELIVERY_PERSISTENCE: 'prisma',
      DATABASE_URL: 'postgresql://example.test/social-monitor',
    }) === 'prisma',
    'delivery persistence must accept explicit Prisma mode with DATABASE_URL',
  );
  assertThrows(
    () => resolveWebhookSecretEncryptionKey({}),
    'Prisma webhook secret vault must require an encryption key',
  );
  assert(
    resolveWebhookSecretEncryptionKey({
      DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64url'),
    }).equals(Buffer.alloc(32, 7)),
    'Prisma webhook secret vault must accept a 32-byte base64url encryption key',
  );

  const prisma = new FakePrismaDeliveryClient();
  const attempts = new PrismaDeliveryAttemptRepository(prisma);
  const digests = new PrismaDigestRepository(prisma);
  const digestSources = new PrismaDigestSourceReader(prisma);
  const realtimeEvents = new PrismaRealtimeEventRepository(prisma);
  const schedules = new PrismaDigestScheduleRepository(prisma);
  const preferences = new PrismaNotificationPreferenceReader(prisma);
  const webhookEndpoints = new PrismaWebhookEndpointRepository(prisma);
  const webhookSecrets = new PrismaWebhookSecretVault(prisma, Buffer.alloc(32, 7));
  const webhookReplayStore = new PrismaWebhookReplayStore(prisma);
  const ids = new SequenceIdGenerator([
    '00000000-0000-7000-8000-000000000703',
    '00000000-0000-7000-8000-000000000704',
    '00000000-0000-7000-8000-000000000707',
    '00000000-0000-7000-8000-000000000708',
    '00000000-0000-7000-8000-000000000709',
    '00000000-0000-7000-8000-000000000710',
    '00000000-0000-7000-8000-000000000711',
    '00000000-0000-7000-8000-000000000712',
  ]);
  const queue = new QueueDeliveryAttemptUseCase(attempts, ids, clock);
  const getAttempt = new GetDeliveryAttemptUseCase(attempts);
  const recordState = new RecordDeliveryAttemptStateUseCase(attempts, clock);
  const recordRealtime = new RecordRealtimeEventUseCase(realtimeEvents, ids, clock);

  const queued = await queue.execute({
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: 'digest:weekly:recipient-1',
    channel: 'webhook',
    recipientKey: 'endpoint-1',
    resourceType: 'digest',
    resourceId: 'digest-1',
    maxRetries: 3,
  });
  assert(isOk(queued), 'delivery attempt queue must succeed through Prisma repository');
  assert(queued.value.created, 'first queue call must create a delivery attempt');

  const duplicate = await queue.execute({
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: 'digest:weekly:recipient-1',
    channel: 'webhook',
    recipientKey: 'endpoint-1',
    resourceType: 'digest',
    resourceId: 'digest-1',
    maxRetries: 3,
  });
  assert(isOk(duplicate), 'duplicate queue call must return persisted attempt');
  assert(!duplicate.value.created, 'duplicate idempotency key must not create another attempt');
  assert(duplicate.value.deliveryAttemptId === queued.value.deliveryAttemptId, 'duplicate queue call must reuse attempt id');

  const fetched = await getAttempt.execute({
    tenantId: tenant,
    workspaceId: workspace,
    deliveryAttemptId: queued.value.deliveryAttemptId,
  });
  assert(isOk(fetched), 'delivery attempt get must hydrate from Prisma record');
  assert(fetched.value.channel === 'webhook', 'hydrated delivery attempt must preserve channel');
  assert(fetched.value.resourceType === 'digest', 'hydrated delivery attempt must preserve resource type');

  const sending = await recordState.execute({
    tenantId: tenant,
    workspaceId: workspace,
    deliveryAttemptId: queued.value.deliveryAttemptId,
    nextState: 'sending',
  });
  assert(isOk(sending), 'delivery attempt sending transition must persist');

  const terminal = await recordState.execute({
    tenantId: tenant,
    workspaceId: workspace,
    deliveryAttemptId: queued.value.deliveryAttemptId,
    nextState: 'failed_terminal',
    reason: 'provider returned permanent 410',
  });
  assert(isOk(terminal), 'delivery attempt terminal failure transition must persist');
  assert(terminal.value.state === 'failed_terminal', 'explicit terminal failure must not become retryable');
  assert(terminal.value.failureReason === 'provider returned permanent 410', 'terminal failure reason must persist');

  const listed = await attempts.list({ tenantId: tenant, workspaceId: workspace, limit: 10 });
  assert(listed.attempts.length === 1, 'delivery attempt list must return persisted attempt');
  assert(listed.attempts[0]?.toSnapshot().state === 'failed_terminal', 'delivery attempt list must hydrate latest state');

  prisma.seedDigestSourceSummary({
    id: 'summary-digest-source-1',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-1',
    status: 'COMPLETED',
    artifactPayload: {
      sourceWindow: {
        startedAt: '2026-06-07T00:00:00.000Z',
        endedAt: '2026-06-07T00:30:00.000Z',
      },
    },
    qualitySignals: {
      confidence: { level: 'high' },
      qualityFlags: [],
    },
    createdAt: new Date('2026-06-07T00:30:05.000Z'),
  });
  prisma.seedDigestSourceSummary({
    id: 'summary-digest-source-nosignal',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-1',
    status: 'NO_SIGNAL',
    artifactPayload: {
      sourceWindow: {
        startedAt: '2026-06-07T00:30:00.000Z',
        endedAt: '2026-06-07T00:40:00.000Z',
      },
    },
    qualitySignals: {
      confidence: { level: 'low' },
      qualityFlags: ['no_signal'],
    },
    createdAt: new Date('2026-06-07T00:40:05.000Z'),
  });
  prisma.seedDigestSourceSummary({
    id: 'summary-digest-source-outside-window',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-1',
    status: 'COMPLETED',
    artifactPayload: {
      sourceWindow: {
        startedAt: '2026-06-07T02:00:00.000Z',
        endedAt: '2026-06-07T02:30:00.000Z',
      },
    },
    qualitySignals: {
      confidence: { level: 'high' },
      qualityFlags: [],
    },
    createdAt: new Date('2026-06-07T02:30:05.000Z'),
  });
  prisma.seedDigestSourceFeedItem({
    id: 'feed-digest-source-1',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-1',
    observedAt: new Date('2026-06-07T00:15:00.000Z'),
    status: 'VISIBLE',
  });
  prisma.seedDigestSourceFeedItem({
    id: 'feed-digest-source-hidden',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-1',
    observedAt: new Date('2026-06-07T00:20:00.000Z'),
    status: 'HIDDEN',
  });

  const assembledFromPersistedSources = await new AssembleDigestUseCase(
    digests,
    digestSources,
    queue,
    ids,
    clock,
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    recipientKey: 'endpoint-digest-source',
    channel: 'webhook',
    topicIds: ['topic-1', 'topic-1'],
    windowStartedAt: new Date('2026-06-07T00:00:00.000Z'),
    windowEndedAt: new Date('2026-06-07T01:00:00.000Z'),
    includeNoSignal: false,
    maxRetries: 3,
  });
  assert(isOk(assembledFromPersistedSources), 'digest assembly must read persisted summaries/feed items');
  assert(assembledFromPersistedSources.value.created, 'persisted source window must create a digest');
  assert(
    assembledFromPersistedSources.value.digest.summaryIds.join(',') === 'summary-digest-source-1',
    'digest assembly must include only in-window non-empty persisted summaries',
  );
  assert(
    assembledFromPersistedSources.value.digest.feedItemIds.join(',') === 'feed-digest-source-1',
    'digest assembly must include only visible persisted feed items in the window',
  );
  assert(
    assembledFromPersistedSources.value.digest.provenance.some(
      (item) => item.resourceId === 'summary-digest-source-1' && item.includedReason === 'high_signal',
    ),
    'digest assembly must preserve persisted summary signal provenance',
  );
  assert(
    assembledFromPersistedSources.value.deliveryAttemptId !== undefined,
    'non-empty digest assembly must queue a persisted delivery attempt',
  );

  const digest = Digest.assemble({
    id: '00000000-0000-7000-8000-000000000705',
    tenantId: tenant,
    workspaceId: workspace,
    recipientKey: 'endpoint-1',
    channel: 'webhook',
    window: {
      windowId: 'digest:2026-06-07T00:00:00.000Z:2026-06-07T01:00:00.000Z',
      startedAt: new Date('2026-06-07T00:00:00.000Z'),
      endedAt: new Date('2026-06-07T01:00:00.000Z'),
    },
    status: 'assembled',
    summaryIds: ['summary-2', 'summary-1', 'summary-1'],
    feedItemIds: ['feed-item-1'],
    provenance: [
      {
        resourceType: 'summary',
        resourceId: 'summary-1',
        topicId: 'topic-1',
        includedReason: 'high_signal',
      },
    ],
    contentHash: 'digest-content-hash',
    assembledAt: new Date('2026-06-07T01:00:05.000Z'),
  });
  await digests.save(digest);

  const digestByWindow = await digests.findByWindow({
    tenantId: tenant,
    workspaceId: workspace,
    recipientKey: 'endpoint-1',
    channel: 'webhook',
    windowId: 'digest:2026-06-07T00:00:00.000Z:2026-06-07T01:00:00.000Z',
  });
  assert(digestByWindow !== null, 'digest repository must find persisted digest by natural window key');
  assert(
    digestByWindow.toSnapshot().summaryIds.join(',') === 'summary-1,summary-2',
    'digest repository must hydrate normalized summary ids',
  );

  const digestView = await new GetDigestUseCase(digests).execute({
    tenantId: tenant,
    workspaceId: workspace,
    digestId: '00000000-0000-7000-8000-000000000705',
  });
  assert(isOk(digestView), 'get digest use case must read through Prisma repository');
  assert(digestView.value.provenance.length === 1, 'digest view must preserve provenance');

  const schedule = DigestSchedule.create({
    id: '00000000-0000-7000-8000-000000000706',
    tenantId: tenant,
    workspaceId: workspace,
    recipientKey: 'endpoint-1',
    channel: 'webhook',
    topicIds: ['topic-2', 'topic-1', 'topic-1'],
    intervalSeconds: 3600,
    includeNoSignal: false,
    nextRunAt: new Date('2026-06-07T00:00:00.000Z'),
    createdAt: new Date('2026-06-06T00:00:00.000Z'),
  });
  await schedules.save(schedule);

  const dueSchedules = await schedules.findDue({
    tenantId: tenant,
    workspaceId: workspace,
    now: new Date('2026-06-07T00:00:10.000Z'),
    limit: 10,
  });
  assert(dueSchedules.length === 1, 'digest schedule repository must find due persisted schedules');
  assert(
    dueSchedules[0]?.toSnapshot().topicIds.join(',') === 'topic-1,topic-2',
    'digest schedule repository must hydrate normalized topic ids',
  );

  await schedules.save(schedule.scheduleNext({ nextRunAt: new Date('2026-06-07T01:00:00.000Z') }));
  const noLongerDue = await schedules.findDue({
    tenantId: tenant,
    workspaceId: workspace,
    now: new Date('2026-06-07T00:00:10.000Z'),
    limit: 10,
  });
  assert(noLongerDue.length === 0, 'digest schedule nextRunAt update must persist');

  const recordedRealtime = await recordRealtime.execute({
    tenantId: tenant,
    workspaceId: workspace,
    channel: 'topic:topic-1:summary-status',
    eventType: 'summary.status.changed.v1',
    resourceType: 'summary',
    resourceId: 'summary-1',
    correlationId: correlationId('correlation-realtime-1'),
    payload: {
      topicId: 'topic-1',
      summaryId: 'summary-1',
      status: 'completed',
    },
  });
  assert(isOk(recordedRealtime), 'realtime event record must persist through Prisma repository');
  assert(recordedRealtime.value.sequence === 1, 'first realtime event sequence must start at one');

  const listedRealtime = await new ListRealtimeEventsUseCase(realtimeEvents).execute({
    tenantId: tenant,
    workspaceId: workspace,
    channel: 'topic:topic-1:summary-status',
    limit: 10,
  });
  assert(isOk(listedRealtime), 'realtime event list use case must read through Prisma repository');
  assert(listedRealtime.value.events.length === 1, 'realtime event list must return persisted event');
  assert(
    listedRealtime.value.events[0]?.payload.summaryId === 'summary-1',
    'realtime event payload must hydrate from Prisma JSON',
  );

  const caughtUpRealtime = await realtimeEvents.list({
    tenantId: tenant,
    workspaceId: workspace,
    channel: 'topic:topic-1:summary-status',
    limit: 10,
    cursor: recordedRealtime.value.replayCursor,
  });
  assert(caughtUpRealtime.events.length === 0, 'caught-up realtime replay cursor must return no events');
  assert(!caughtUpRealtime.resyncRequired, 'caught-up realtime replay cursor must not require resync');

  const invalidRealtimeCursor = await realtimeEvents.list({
    tenantId: tenant,
    workspaceId: workspace,
    channel: 'topic:topic-1:summary-status',
    limit: 10,
    cursor: 'not-a-valid-cursor',
  });
  assert(invalidRealtimeCursor.resyncRequired, 'invalid realtime replay cursor must require resync');

  const createdWebhook = await new CreateWebhookEndpointUseCase(
    webhookEndpoints,
    webhookSecrets,
    ids,
    clock,
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    url: 'https://example.com/webhooks/social-monitor',
    eventTypes: ['digest.ready.v1'],
  });
  assert(isOk(createdWebhook), 'webhook endpoint create must persist endpoint and encrypted secret');
  const webhookEndpointId = createdWebhook.value.endpoint.id;
  const secretKeyId = createdWebhook.value.endpoint.secretKeyId;
  assert(
    await webhookSecrets.get({ secretKeyId }) === createdWebhook.value.signingSecret,
    'webhook secret vault must decrypt the persisted signing secret',
  );

  const signedWebhook = await new SignWebhookPayloadUseCase(webhookEndpoints, webhookSecrets).execute({
    tenantId: tenant,
    workspaceId: workspace,
    webhookEndpointId,
    deliveryId: 'delivery-webhook-1',
    eventType: 'digest.ready.v1',
    occurredAt: new Date('2026-06-07T00:00:10.000Z'),
    resourceType: 'digest',
    resourceId: 'digest-1',
    idempotencyKey: 'digest:weekly:recipient-1',
    correlationId: 'correlation-webhook-1',
    resourceLinks: {
      digest: '/digests/digest-1',
    },
    summary: {
      headline: 'Weekly signal ready',
      itemCount: 1,
    },
  });
  assert(isOk(signedWebhook), 'webhook payload signing must use persisted encrypted secret');

  const verifyWebhook = new VerifyWebhookSignatureUseCase(webhookEndpoints, webhookSecrets, webhookReplayStore, clock);
  const verifiedWebhook = await verifyWebhook.execute({
    tenantId: tenant,
    workspaceId: workspace,
    webhookEndpointId,
    deliveryId: signedWebhook.value.payload.deliveryId,
    timestamp: signedWebhook.value.headers['x-social-monitor-timestamp'],
    rawBody: signedWebhook.value.rawBody,
    signatureHeader: signedWebhook.value.headers['x-social-monitor-signature'],
    keyId: signedWebhook.value.headers['x-social-monitor-key-id'],
    toleranceSeconds: 300,
  });
  assert(isOk(verifiedWebhook), 'webhook signature verification must succeed through Prisma adapters');
  assert(verifiedWebhook.value.verified, 'first webhook signature verification must be accepted');

  const replayedWebhook = await verifyWebhook.execute({
    tenantId: tenant,
    workspaceId: workspace,
    webhookEndpointId,
    deliveryId: signedWebhook.value.payload.deliveryId,
    timestamp: signedWebhook.value.headers['x-social-monitor-timestamp'],
    rawBody: signedWebhook.value.rawBody,
    signatureHeader: signedWebhook.value.headers['x-social-monitor-signature'],
    keyId: signedWebhook.value.headers['x-social-monitor-key-id'],
    toleranceSeconds: 300,
  });
  assert(isOk(replayedWebhook), 'duplicate webhook signature verification must return a domain result');
  assert(!replayedWebhook.value.verified, 'duplicate webhook delivery id must be rejected as replay');
  assert(replayedWebhook.value.reason === 'replay_detected', 'duplicate webhook delivery id must report replay_detected');

  const disabledWebhook = await new DisableWebhookEndpointUseCase(webhookEndpoints, clock).execute({
    tenantId: tenant,
    workspaceId: workspace,
    webhookEndpointId,
  });
  assert(isOk(disabledWebhook), 'webhook endpoint disable must persist through Prisma repository');
  assert(disabledWebhook.value.status === 'disabled', 'webhook endpoint disabled state must hydrate from Prisma');

  const listedWebhooks = await new ListWebhookEndpointsUseCase(webhookEndpoints).execute({
    tenantId: tenant,
    workspaceId: workspace,
    limit: 10,
  });
  assert(isOk(listedWebhooks), 'webhook endpoint list must read through Prisma repository');
  assert(listedWebhooks.value.endpoints.length === 1, 'webhook endpoint list must return persisted endpoint');
  assert(
    listedWebhooks.value.endpoints[0]?.secretPreview === createdWebhook.value.endpoint.secretPreview,
    'webhook endpoint list must expose only secret preview metadata',
  );

  await preferences.suppressRecipientChannel({
    tenantId: tenant,
    workspaceId: workspace,
    recipientKey: 'endpoint-1',
    channel: 'webhook',
    reason: 'User unsubscribed from webhook notifications',
  });
  const suppressedPreference = await preferences.getDeliveryPreference({
    tenantId: tenant,
    workspaceId: workspace,
    recipientKey: 'endpoint-1',
    channel: 'webhook',
    resourceType: 'digest',
    resourceId: 'digest-1',
  });
  assert(!suppressedPreference.allowed, 'Prisma notification preference must suppress recipient/channel delivery');
  assert(
    suppressedPreference.reason === 'User unsubscribed from webhook notifications',
    'Prisma notification preference must preserve suppression reason',
  );

  await preferences.allowRecipientChannel({
    tenantId: tenant,
    workspaceId: workspace,
    recipientKey: 'endpoint-1',
    channel: 'webhook',
  });
  const allowedPreference = await preferences.getDeliveryPreference({
    tenantId: tenant,
    workspaceId: workspace,
    recipientKey: 'endpoint-1',
    channel: 'webhook',
    resourceType: 'digest',
    resourceId: 'digest-1',
  });
  assert(allowedPreference.allowed, 'Prisma notification preference allow must clear suppression decision');

  console.log('Delivery Prisma persistence smoke OK');
}

class SequenceIdGenerator implements IdGenerator {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  generate(): string {
    const value = this.values[this.index];

    if (value === undefined) {
      throw new Error('SequenceIdGenerator exhausted');
    }

    this.index += 1;

    return value;
  }
}

class FakePrismaDeliveryClient implements PrismaDeliveryClient {
  private readonly attempts = new Map<string, PrismaDeliveryAttemptRecord>();
  private readonly digests = new Map<string, PrismaDigestRecord>();
  private readonly feedItems = new Map<string, PrismaDigestSourceFeedItemRecord>();
  private readonly notificationPreferences = new Map<string, PrismaNotificationPreferenceRecord>();
  private readonly realtimeEvents = new Map<string, PrismaRealtimeEventRecord>();
  private readonly schedules = new Map<string, PrismaDigestScheduleRecord>();
  private readonly summaryArtifacts = new Map<string, PrismaDigestSourceSummaryRecord>();
  private readonly webhookEndpoints = new Map<string, PrismaWebhookEndpointRecord>();
  private readonly webhookReplayDeliveries = new Map<string, PrismaWebhookReplayDeliveryRecord>();
  private readonly webhookSecrets = new Map<string, PrismaWebhookSecretRecord>();

  seedDigestSourceSummary(record: PrismaDigestSourceSummaryRecord): void {
    this.summaryArtifacts.set(record.id, record);
  }

  seedDigestSourceFeedItem(record: PrismaDigestSourceFeedItemRecord): void {
    this.feedItems.set(record.id, record);
  }

  readonly deliveryAttempt: PrismaDeliveryClient['deliveryAttempt'] = {
    upsert: async (args) => {
      const existing = this.attempts.get(args.where.id);
      const record: PrismaDeliveryAttemptRecord = {
        id: existing?.id ?? args.create.id,
        ...normalizeWriteData(args.update),
      };
      this.attempts.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.attempts.values()].find((record) => matchesDeliveryAttemptWhere(record, args.where)) ?? null,
    findMany: async (args) =>
      [...this.attempts.values()]
        .filter((record) => matchesDeliveryAttemptWhere(record, args.where))
        .sort(compareDeliveryAttemptRecords)
        .slice(args.skip, args.skip + args.take),
    count: async (args) =>
      [...this.attempts.values()].filter((record) => matchesDeliveryAttemptWhere(record, args.where)).length,
  };

  readonly digest: PrismaDeliveryClient['digest'] = {
    upsert: async (args) => {
      const existing = this.digests.get(args.where.id);
      const record: PrismaDigestRecord = {
        id: existing?.id ?? args.create.id,
        ...normalizeDigestWriteData(args.update),
      };
      this.digests.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.digests.values()].find((record) => matchesDigestWhere(record, args.where)) ?? null,
  };

  readonly summaryArtifact: PrismaDeliveryClient['summaryArtifact'] = {
    findMany: async (args) =>
      [...this.summaryArtifacts.values()]
        .filter((record) => matchesDigestSourceSummaryWhere(record, args.where))
        .sort(compareDigestSourceSummaryRecords)
        .slice(0, args.take),
  };

  readonly feedItem: PrismaDeliveryClient['feedItem'] = {
    findMany: async (args) =>
      [...this.feedItems.values()]
        .filter((record) => matchesDigestSourceFeedItemWhere(record, args.where))
        .sort(compareDigestSourceFeedItemRecords)
        .slice(0, args.take),
  };

  readonly digestSchedule: PrismaDeliveryClient['digestSchedule'] = {
    upsert: async (args) => {
      const existing = this.schedules.get(args.where.id);
      const record: PrismaDigestScheduleRecord = {
        id: existing?.id ?? args.create.id,
        ...normalizeDigestScheduleWriteData(args.update),
      };
      this.schedules.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.schedules.values()].find((record) => matchesDigestScheduleWhere(record, args.where)) ?? null,
    findMany: async (args) =>
      [...this.schedules.values()]
        .filter((record) => matchesDigestScheduleWhere(record, args.where))
        .sort(compareDigestScheduleRecords)
        .slice(0, args.take),
  };

  readonly realtimeEvent: PrismaDeliveryClient['realtimeEvent'] = {
    create: async (args) => {
      if ([...this.realtimeEvents.values()].some((record) => isRealtimeEventUniqueConflict(record, args.data))) {
        throw Object.assign(new Error('Unique realtime event constraint violation'), { code: 'P2002' });
      }

      const record: PrismaRealtimeEventRecord = {
        id: args.data.id,
        ...normalizeRealtimeEventWriteData(args.data),
      };
      this.realtimeEvents.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.realtimeEvents.values()]
        .filter((record) => matchesRealtimeEventWhere(record, args.where))
        .sort(compareRealtimeEventRecordsDesc)
        .at(0) ?? null,
    findMany: async (args) =>
      [...this.realtimeEvents.values()]
        .filter((record) => matchesRealtimeEventWhere(record, args.where))
        .sort(compareRealtimeEventRecordsAsc)
        .slice(0, args.take),
  };

  readonly webhookEndpoint: PrismaDeliveryClient['webhookEndpoint'] = {
    upsert: async (args) => {
      const existing = this.webhookEndpoints.get(args.where.id);
      const record: PrismaWebhookEndpointRecord = {
        id: existing?.id ?? args.create.id,
        ...normalizeWebhookEndpointWriteData(args.update),
      };
      this.webhookEndpoints.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.webhookEndpoints.values()].find((record) => matchesWebhookEndpointWhere(record, args.where)) ?? null,
    findMany: async (args) =>
      [...this.webhookEndpoints.values()]
        .filter((record) => matchesWebhookEndpointWhere(record, args.where))
        .sort(compareWebhookEndpointRecords)
        .slice(args.skip, args.skip + args.take),
    count: async (args) =>
      [...this.webhookEndpoints.values()].filter((record) => matchesWebhookEndpointWhere(record, args.where)).length,
  };

  readonly webhookSecret: PrismaDeliveryClient['webhookSecret'] = {
    upsert: async (args) => {
      const existing = this.webhookSecrets.get(args.where.id);
      const record: PrismaWebhookSecretRecord = {
        id: existing?.id ?? args.create.id,
        ...normalizeWebhookSecretWriteData(args.update),
      };
      this.webhookSecrets.set(record.id, record);

      return record;
    },
    findUnique: async (args) => this.webhookSecrets.get(args.where.id) ?? null,
  };

  readonly webhookReplayDelivery: PrismaDeliveryClient['webhookReplayDelivery'] = {
    findUnique: async (args) =>
      this.webhookReplayDeliveries.get(webhookReplayDeliveryKey(args.where.webhookEndpointId_deliveryId)) ?? null,
    create: async (args) => {
      const key = webhookReplayDeliveryKey(args.data);

      if (this.webhookReplayDeliveries.has(key)) {
        throw Object.assign(new Error('Unique webhook replay delivery constraint violation'), { code: 'P2002' });
      }

      const record: PrismaWebhookReplayDeliveryRecord = normalizeWebhookReplayDeliveryWriteData(args.data);
      this.webhookReplayDeliveries.set(key, record);

      return record;
    },
    update: async (args) => {
      const key = webhookReplayDeliveryKey(args.where.webhookEndpointId_deliveryId);
      const existing = this.webhookReplayDeliveries.get(key);

      if (existing === undefined) {
        throw new Error('Webhook replay delivery not found');
      }

      const record: PrismaWebhookReplayDeliveryRecord = {
        ...existing,
        rememberedAt: args.data.rememberedAt,
        expiresAt: args.data.expiresAt,
      };
      this.webhookReplayDeliveries.set(key, record);

      return record;
    },
  };

  readonly notificationPreference: PrismaDeliveryClient['notificationPreference'] = {
    upsert: async (args) => {
      const key = notificationPreferenceKey(args.create);
      const existing = this.notificationPreferences.get(key);
      const record: PrismaNotificationPreferenceRecord = {
        ...(existing ?? {
          tenantId: args.create.tenantId,
          workspaceId: args.create.workspaceId,
          recipientKey: args.create.recipientKey,
          channel: args.create.channel,
        }),
        allowed: args.update.allowed,
        reason: args.update.reason ?? null,
      };
      this.notificationPreferences.set(key, record);

      return record;
    },
    findUnique: async (args) =>
      this.notificationPreferences.get(
        notificationPreferenceKey(args.where.tenantId_workspaceId_recipientKey_channel),
      ) ?? null,
  };
}

const normalizeWriteData = (data: PrismaDeliveryAttemptWriteData): Omit<PrismaDeliveryAttemptRecord, 'id'> => ({
  tenantId: data.tenantId,
  workspaceId: data.workspaceId,
  idempotencyKey: data.idempotencyKey,
  channel: data.channel,
  recipientKey: data.recipientKey,
  resourceType: data.resourceType,
  resourceId: data.resourceId,
  state: data.state,
  queuedAt: data.queuedAt,
  assemblingAt: data.assemblingAt ?? null,
  suppressedAt: data.suppressedAt ?? null,
  sendingAt: data.sendingAt ?? null,
  deliveredAt: data.deliveredAt ?? null,
  failedAt: data.failedAt ?? null,
  deadLetteredAt: data.deadLetteredAt ?? null,
  cancelledAt: data.cancelledAt ?? null,
  retryCount: data.retryCount,
  maxRetries: data.maxRetries,
  failureReason: data.failureReason ?? null,
  suppressionReason: data.suppressionReason ?? null,
});

const normalizeDigestWriteData = (data: PrismaDigestWriteData): Omit<PrismaDigestRecord, 'id'> => ({
  tenantId: data.tenantId,
  workspaceId: data.workspaceId,
  recipientKey: data.recipientKey,
  channel: data.channel,
  windowId: data.windowId,
  windowStartedAt: data.windowStartedAt,
  windowEndedAt: data.windowEndedAt,
  status: data.status,
  summaryIds: data.summaryIds,
  feedItemIds: data.feedItemIds,
  provenance: data.provenance,
  contentHash: data.contentHash,
  assembledAt: data.assembledAt,
});

const normalizeDigestScheduleWriteData = (
  data: PrismaDigestScheduleWriteData,
): Omit<PrismaDigestScheduleRecord, 'id'> => ({
  tenantId: data.tenantId,
  workspaceId: data.workspaceId,
  recipientKey: data.recipientKey,
  channel: data.channel,
  topicIds: data.topicIds,
  intervalSeconds: data.intervalSeconds,
  includeNoSignal: data.includeNoSignal,
  nextRunAt: data.nextRunAt,
  createdAt: data.createdAt,
  status: data.status,
});

const normalizeRealtimeEventWriteData = (
  data: PrismaRealtimeEventWriteData,
): Omit<PrismaRealtimeEventRecord, 'id'> => ({
  protocolVersion: data.protocolVersion,
  eventType: data.eventType,
  tenantId: data.tenantId,
  workspaceId: data.workspaceId,
  channel: data.channel,
  resourceType: data.resourceType,
  resourceId: data.resourceId,
  sequence: data.sequence,
  replayCursor: data.replayCursor,
  occurredAt: data.occurredAt,
  correlationId: data.correlationId,
  payload: data.payload,
});

const normalizeWebhookEndpointWriteData = (
  data: PrismaWebhookEndpointWriteData,
): Omit<PrismaWebhookEndpointRecord, 'id'> => ({
  tenantId: data.tenantId,
  workspaceId: data.workspaceId,
  url: data.url,
  eventTypes: data.eventTypes,
  status: data.status,
  secretKeyId: data.secretKeyId,
  secretPreview: data.secretPreview,
  createdAt: data.createdAt,
  disabledAt: data.disabledAt ?? null,
  quarantinedAt: data.quarantinedAt ?? null,
  quarantineReason: data.quarantineReason ?? null,
});

const normalizeWebhookSecretWriteData = (
  data: PrismaWebhookSecretWriteData,
): Omit<PrismaWebhookSecretRecord, 'id'> => ({
  algorithm: data.algorithm,
  ciphertext: data.ciphertext,
  iv: data.iv,
  authTag: data.authTag,
});

const normalizeWebhookReplayDeliveryWriteData = (
  data: PrismaWebhookReplayDeliveryWriteData,
): PrismaWebhookReplayDeliveryRecord => ({
  webhookEndpointId: data.webhookEndpointId,
  deliveryId: data.deliveryId,
  rememberedAt: data.rememberedAt,
  expiresAt: data.expiresAt,
});

const notificationPreferenceKey = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly recipientKey: string;
  readonly channel: string;
}): string => [params.tenantId, params.workspaceId, params.recipientKey, params.channel].join(':');

const matchesDeliveryAttemptWhere = (
  record: PrismaDeliveryAttemptRecord,
  where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly id?: string;
    readonly idempotencyKey?: string;
  },
): boolean =>
  record.tenantId === where.tenantId &&
  record.workspaceId === where.workspaceId &&
  (where.id === undefined || record.id === where.id) &&
  (where.idempotencyKey === undefined || record.idempotencyKey === where.idempotencyKey);

const compareDeliveryAttemptRecords = (
  left: PrismaDeliveryAttemptRecord,
  right: PrismaDeliveryAttemptRecord,
): number => {
  const queuedDiff = right.queuedAt.getTime() - left.queuedAt.getTime();

  if (queuedDiff !== 0) {
    return queuedDiff;
  }

  return right.id.localeCompare(left.id);
};

const matchesDigestWhere = (
  record: PrismaDigestRecord,
  where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly id?: string;
    readonly recipientKey?: string;
    readonly channel?: string;
    readonly windowId?: string;
  },
): boolean =>
  record.tenantId === where.tenantId &&
  record.workspaceId === where.workspaceId &&
  (where.id === undefined || record.id === where.id) &&
  (where.recipientKey === undefined || record.recipientKey === where.recipientKey) &&
  (where.channel === undefined || record.channel === where.channel) &&
  (where.windowId === undefined || record.windowId === where.windowId);

const matchesDigestSourceSummaryWhere = (
  record: PrismaDigestSourceSummaryRecord,
  where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly topicId: { readonly in: readonly string[] };
    readonly status: { readonly in: readonly PrismaDigestSourceSummaryRecord['status'][] };
  },
): boolean =>
  record.tenantId === where.tenantId &&
  record.workspaceId === where.workspaceId &&
  where.topicId.in.includes(record.topicId) &&
  where.status.in.includes(record.status);

const compareDigestSourceSummaryRecords = (
  left: PrismaDigestSourceSummaryRecord,
  right: PrismaDigestSourceSummaryRecord,
): number => {
  const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return right.id.localeCompare(left.id);
};

const matchesDigestSourceFeedItemWhere = (
  record: PrismaDigestSourceFeedItemRecord,
  where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly topicId: { readonly in: readonly string[] };
    readonly status: PrismaDigestSourceFeedItemRecord['status'];
    readonly observedAt: {
      readonly gte: Date;
      readonly lt: Date;
    };
  },
): boolean =>
  record.tenantId === where.tenantId &&
  record.workspaceId === where.workspaceId &&
  where.topicId.in.includes(record.topicId) &&
  record.status === where.status &&
  record.observedAt.getTime() >= where.observedAt.gte.getTime() &&
  record.observedAt.getTime() < where.observedAt.lt.getTime();

const compareDigestSourceFeedItemRecords = (
  left: PrismaDigestSourceFeedItemRecord,
  right: PrismaDigestSourceFeedItemRecord,
): number => {
  const observedDiff = left.observedAt.getTime() - right.observedAt.getTime();

  if (observedDiff !== 0) {
    return observedDiff;
  }

  return left.id.localeCompare(right.id);
};

const matchesDigestScheduleWhere = (
  record: PrismaDigestScheduleRecord,
  where: {
    readonly tenantId?: string;
    readonly workspaceId?: string;
    readonly id?: string;
    readonly status?: string;
    readonly nextRunAt?: { readonly lte: Date };
  },
): boolean =>
  (where.tenantId === undefined || record.tenantId === where.tenantId) &&
  (where.workspaceId === undefined || record.workspaceId === where.workspaceId) &&
  (where.id === undefined || record.id === where.id) &&
  (where.status === undefined || record.status === where.status) &&
  (where.nextRunAt === undefined || record.nextRunAt.getTime() <= where.nextRunAt.lte.getTime());

const compareDigestScheduleRecords = (
  left: PrismaDigestScheduleRecord,
  right: PrismaDigestScheduleRecord,
): number => {
  const nextRunDiff = left.nextRunAt.getTime() - right.nextRunAt.getTime();

  if (nextRunDiff !== 0) {
    return nextRunDiff;
  }

  return left.id.localeCompare(right.id);
};

const matchesRealtimeEventWhere = (
  record: PrismaRealtimeEventRecord,
  where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly channel: string;
    readonly sequence?: { readonly gt: number };
  },
): boolean =>
  record.tenantId === where.tenantId &&
  record.workspaceId === where.workspaceId &&
  record.channel === where.channel &&
  (where.sequence === undefined || record.sequence > where.sequence.gt);

const isRealtimeEventUniqueConflict = (
  existing: PrismaRealtimeEventRecord,
  incoming: PrismaRealtimeEventWriteData & { readonly id: string },
): boolean =>
  existing.id === incoming.id ||
  (
    existing.tenantId === incoming.tenantId &&
    existing.workspaceId === incoming.workspaceId &&
    existing.channel === incoming.channel &&
    existing.sequence === incoming.sequence
  );

const compareRealtimeEventRecordsAsc = (
  left: PrismaRealtimeEventRecord,
  right: PrismaRealtimeEventRecord,
): number => {
  const sequenceDiff = left.sequence - right.sequence;

  if (sequenceDiff !== 0) {
    return sequenceDiff;
  }

  return left.id.localeCompare(right.id);
};

const compareRealtimeEventRecordsDesc = (
  left: PrismaRealtimeEventRecord,
  right: PrismaRealtimeEventRecord,
): number => {
  const sequenceDiff = right.sequence - left.sequence;

  if (sequenceDiff !== 0) {
    return sequenceDiff;
  }

  return right.id.localeCompare(left.id);
};

const matchesWebhookEndpointWhere = (
  record: PrismaWebhookEndpointRecord,
  where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly id?: string;
  },
): boolean =>
  record.tenantId === where.tenantId &&
  record.workspaceId === where.workspaceId &&
  (where.id === undefined || record.id === where.id);

const compareWebhookEndpointRecords = (
  left: PrismaWebhookEndpointRecord,
  right: PrismaWebhookEndpointRecord,
): number => {
  const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return right.id.localeCompare(left.id);
};

const webhookReplayDeliveryKey = (params: {
  readonly webhookEndpointId: string;
  readonly deliveryId: string;
}): string => `${params.webhookEndpointId}:${params.deliveryId}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const assertThrows = (operation: () => unknown, message: string): void => {
  try {
    operation();
  } catch {
    return;
  }

  throw new Error(message);
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
