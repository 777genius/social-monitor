import { FakePrismaDeliveryClient, SequenceIdGenerator } from './lib/fake-prisma-delivery-client';
import {
  correlationId,
  FixedClock,
  isOk,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import { PrismaDeliveryAttemptRepository } from '../libs/delivery/adapters/persistence/prisma/prisma-delivery-attempt.repository';
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
import { DeliveryAttempt, Digest, DigestSchedule } from '../libs/delivery/domain';
import { AssembleDigestUseCase } from '../libs/delivery/features/assemble-digest/assemble-digest.use-case';
import { CreateDigestScheduleUseCase } from '../libs/delivery/features/create-digest-schedule/create-digest-schedule.use-case';
import { CreateWebhookEndpointUseCase } from '../libs/delivery/features/create-webhook-endpoint/create-webhook-endpoint.use-case';
import { ContractWebhookEventCatalogAdapter } from '../libs/delivery/adapters/events/contract-webhook-event-catalog.adapter';
import { DisableWebhookEndpointUseCase } from '../libs/delivery/features/disable-webhook-endpoint/disable-webhook-endpoint.use-case';
import { GetDeliveryAttemptUseCase } from '../libs/delivery/features/get-delivery-attempt/get-delivery-attempt.use-case';
import { GetDigestUseCase } from '../libs/delivery/features/get-digest/get-digest.use-case';
import { GetDigestScheduleUseCase } from '../libs/delivery/features/get-digest-schedule/get-digest-schedule.use-case';
import { ListDigestSchedulesUseCase } from '../libs/delivery/features/list-digest-schedules/list-digest-schedules.use-case';
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
  const webhookEventCatalog = new ContractWebhookEventCatalogAdapter();
  const ids = new SequenceIdGenerator([
    '00000000-0000-7000-8000-000000000703',
    '00000000-0000-7000-8000-000000000704',
    '00000000-0000-7000-8000-000000000707',
    '00000000-0000-7000-8000-000000000708',
    '00000000-0000-7000-8000-000000000709',
    '00000000-0000-7000-8000-000000000710',
    '00000000-0000-7000-8000-000000000711',
    '00000000-0000-7000-8000-000000000712',
    '00000000-0000-7000-8000-000000000713',
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

  const retryableAttemptId = '00000000-0000-7000-8000-000000000720';
  await attempts.save(DeliveryAttempt.queue({
    id: retryableAttemptId,
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: 'digest:weekly:recipient-1:retryable',
    channel: 'webhook',
    recipientKey: 'endpoint-1',
    resourceType: 'digest',
    resourceId: 'digest-1',
    queuedAt: clock.now(),
    maxRetries: 3,
  }).markSending({
    sendingAt: clock.now(),
  }).fail({
    failedAt: clock.now(),
    failureReason: 'provider returned retryable 503',
    retryable: true,
  }));

  const dispatchableAttempts = await attempts.findQueued({ tenantId: tenant, workspaceId: workspace, limit: 10 });
  const dispatchableIds = dispatchableAttempts.map((attempt) => attempt.toSnapshot().id);
  assert(
    dispatchableIds.includes(retryableAttemptId),
    'delivery attempt dispatch query must include retryable failed attempts',
  );
  assert(
    !dispatchableIds.includes(queued.value.deliveryAttemptId),
    'delivery attempt dispatch query must exclude terminal failed attempts',
  );

  prisma.seedDigestSourceSummary({
    id: 'summary-digest-source-1',
    tenantId: tenant,
    workspaceId: workspace,
    interestId: 'interest-1',
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
    interestId: 'interest-1',
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
    interestId: 'interest-1',
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
    interestId: 'interest-1',
    observedAt: new Date('2026-06-07T00:15:00.000Z'),
    status: 'VISIBLE',
  });
  prisma.seedDigestSourceFeedItem({
    id: 'feed-digest-source-hidden',
    tenantId: tenant,
    workspaceId: workspace,
    interestId: 'interest-1',
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
    interestIds: ['interest-1', 'interest-1'],
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
        interestId: 'interest-1',
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
    interestIds: ['interest-2', 'interest-1', 'interest-1'],
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
    dueSchedules[0]?.toSnapshot().interestIds.join(',') === 'interest-1,interest-2',
    'digest schedule repository must hydrate normalized interest ids',
  );

  await schedules.save(schedule.scheduleNext({ nextRunAt: new Date('2026-06-07T01:00:00.000Z') }));
  const noLongerDue = await schedules.findDue({
    tenantId: tenant,
    workspaceId: workspace,
    now: new Date('2026-06-07T00:00:10.000Z'),
    limit: 10,
  });
  assert(noLongerDue.length === 0, 'digest schedule nextRunAt update must persist');

  const createdSchedule = await new CreateDigestScheduleUseCase(schedules, ids, clock).execute({
    tenantId: tenant,
    workspaceId: workspace,
    recipientKey: 'endpoint-2',
    channel: 'email',
    interestIds: ['interest-3', 'interest-1', 'interest-1'],
    intervalSeconds: 7200,
    includeNoSignal: true,
    nextRunAt: new Date('2026-06-07T02:00:00.000Z'),
  });
  assert(isOk(createdSchedule), 'create digest schedule use case must persist through Prisma repository');
  assert(createdSchedule.value.schedule.interestIds.join(',') === 'interest-1,interest-3', 'created schedule interest ids must normalize');

  const scheduleView = await new GetDigestScheduleUseCase(schedules).execute({
    tenantId: tenant,
    workspaceId: workspace,
    digestScheduleId: createdSchedule.value.schedule.id,
  });
  assert(isOk(scheduleView), 'get digest schedule use case must read through Prisma repository');
  assert(scheduleView.value.recipientKey === 'endpoint-2', 'get digest schedule must preserve recipient key');

  const scheduleList = await new ListDigestSchedulesUseCase(schedules).execute({
    tenantId: tenant,
    workspaceId: workspace,
    limit: 10,
  });
  assert(isOk(scheduleList), 'list digest schedules use case must read through Prisma repository');
  assert(scheduleList.value.schedules.length === 2, 'list digest schedules must include manual and created schedules');
  assert(
    scheduleList.value.schedules.some((item) => item.id === createdSchedule.value.schedule.id),
    'list digest schedules must include the newly created schedule',
  );

  const recordedRealtime = await recordRealtime.execute({
    tenantId: tenant,
    workspaceId: workspace,
    channel: 'interest:interest-1:summary-status',
    eventType: 'summary.status.changed.v1',
    resourceType: 'summary',
    resourceId: 'summary-1',
    correlationId: correlationId('correlation-realtime-1'),
    payload: {
      interestId: 'interest-1',
      summaryId: 'summary-1',
      status: 'completed',
    },
  });
  assert(isOk(recordedRealtime), 'realtime event record must persist through Prisma repository');
  assert(recordedRealtime.value.sequence === 1, 'first realtime event sequence must start at one');

  const listedRealtime = await new ListRealtimeEventsUseCase(realtimeEvents).execute({
    tenantId: tenant,
    workspaceId: workspace,
    channel: 'interest:interest-1:summary-status',
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
    channel: 'interest:interest-1:summary-status',
    limit: 10,
    cursor: recordedRealtime.value.replayCursor,
  });
  assert(caughtUpRealtime.events.length === 0, 'caught-up realtime replay cursor must return no events');
  assert(!caughtUpRealtime.resyncRequired, 'caught-up realtime replay cursor must not require resync');

  const invalidRealtimeCursor = await realtimeEvents.list({
    tenantId: tenant,
    workspaceId: workspace,
    channel: 'interest:interest-1:summary-status',
    limit: 10,
    cursor: 'not-a-valid-cursor',
  });
  assert(invalidRealtimeCursor.resyncRequired, 'invalid realtime replay cursor must require resync');

  const createdWebhook = await new CreateWebhookEndpointUseCase(
    webhookEndpoints,
    webhookSecrets,
    ids,
    clock,
    webhookEventCatalog,
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
    await webhookSecrets.get({
      tenantId: tenant,
      workspaceId: workspace,
      secretKeyId,
    }) === createdWebhook.value.signingSecret,
    'webhook secret vault must decrypt the persisted signing secret',
  );

  const signedWebhook = await new SignWebhookPayloadUseCase(
    webhookEndpoints,
    webhookSecrets,
    webhookEventCatalog,
  ).execute({
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

  const managedSuppression = await preferences.setRecipientChannelPreference({
    tenantId: tenant,
    workspaceId: workspace,
    recipientKey: 'endpoint-2',
    channel: 'email',
    allowed: false,
    reason: 'User disabled email notifications',
  });
  assert(!managedSuppression.allowed, 'Prisma notification preference manager must suppress delivery');
  const managedSuppressionView = await preferences.getRecipientChannelPreference({
    tenantId: tenant,
    workspaceId: workspace,
    recipientKey: 'endpoint-2',
    channel: 'email',
  });
  assert(
    managedSuppressionView?.reason === 'User disabled email notifications',
    'Prisma notification preference manager must preserve suppression reason',
  );

  const managedAllow = await preferences.setRecipientChannelPreference({
    tenantId: tenant,
    workspaceId: workspace,
    recipientKey: 'endpoint-2',
    channel: 'email',
    allowed: true,
  });
  assert(managedAllow.allowed, 'Prisma notification preference manager must allow delivery');
  const managedAllowView = await preferences.getRecipientChannelPreference({
    tenantId: tenant,
    workspaceId: workspace,
    recipientKey: 'endpoint-2',
    channel: 'email',
  });
  assert(
    managedAllowView?.allowed === true && managedAllowView.reason === undefined,
    'Prisma notification preference manager must clear stale suppression reason',
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
