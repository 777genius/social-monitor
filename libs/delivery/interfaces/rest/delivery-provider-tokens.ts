import { assertRuntimeProfileAllowsMode, resolveRuntimeProfile } from '@social-monitor/platform-config';

import { allDeliveryChannels, betaDeliveryChannels, type DeliveryChannel } from '../../domain';
import type {
  DeliveryAttemptRepositoryPort,
  DigestRepositoryPort,
  DigestScheduleRepositoryPort,
  DigestSourceReaderPort,
  NotificationPreferenceManagementPort,
  NotificationPreferenceReaderPort,
  RealtimeFanoutPort,
  RealtimeEventRepositoryPort,
  WebhookEndpointRepositoryPort,
  WebhookReplayStorePort,
  WebhookSecretVaultPort,
} from '../../ports';

export type DeliveryPersistenceMode = 'in-memory' | 'prisma';

export const DELIVERY_PERSISTENCE_MODE = Symbol('DELIVERY_PERSISTENCE_MODE');
export const DELIVERY_ENABLED_CHANNELS = Symbol('DELIVERY_ENABLED_CHANNELS');
export const DELIVERY_PRISMA_CLIENT = Symbol('DELIVERY_PRISMA_CLIENT');
export const DELIVERY_ATTEMPT_REPOSITORY = Symbol('DELIVERY_ATTEMPT_REPOSITORY');
export const DELIVERY_DIGEST_REPOSITORY = Symbol('DELIVERY_DIGEST_REPOSITORY');
export const DELIVERY_DIGEST_SCHEDULE_REPOSITORY = Symbol('DELIVERY_DIGEST_SCHEDULE_REPOSITORY');
export const DELIVERY_DIGEST_SOURCE_READER = Symbol('DELIVERY_DIGEST_SOURCE_READER');
export const DELIVERY_REALTIME_EVENT_REPOSITORY = Symbol('DELIVERY_REALTIME_EVENT_REPOSITORY');
export const DELIVERY_REALTIME_FANOUT = Symbol('DELIVERY_REALTIME_FANOUT');
export const DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY = Symbol('DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY');
export const DELIVERY_WEBHOOK_SECRET_VAULT = Symbol('DELIVERY_WEBHOOK_SECRET_VAULT');
export const DELIVERY_WEBHOOK_REPLAY_STORE = Symbol('DELIVERY_WEBHOOK_REPLAY_STORE');
export const DELIVERY_NOTIFICATION_PREFERENCE_READER = Symbol('DELIVERY_NOTIFICATION_PREFERENCE_READER');
export const DELIVERY_NOTIFICATION_PREFERENCE_MANAGER = Symbol('DELIVERY_NOTIFICATION_PREFERENCE_MANAGER');

export type DeliveryProviderTokenMap = {
  readonly [DELIVERY_PERSISTENCE_MODE]: DeliveryPersistenceMode;
  readonly [DELIVERY_ENABLED_CHANNELS]: readonly DeliveryChannel[];
  readonly [DELIVERY_PRISMA_CLIENT]: unknown;
  readonly [DELIVERY_ATTEMPT_REPOSITORY]: DeliveryAttemptRepositoryPort;
  readonly [DELIVERY_DIGEST_REPOSITORY]: DigestRepositoryPort;
  readonly [DELIVERY_DIGEST_SCHEDULE_REPOSITORY]: DigestScheduleRepositoryPort;
  readonly [DELIVERY_DIGEST_SOURCE_READER]: DigestSourceReaderPort;
  readonly [DELIVERY_REALTIME_EVENT_REPOSITORY]: RealtimeEventRepositoryPort;
  readonly [DELIVERY_REALTIME_FANOUT]: RealtimeFanoutPort;
  readonly [DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY]: WebhookEndpointRepositoryPort;
  readonly [DELIVERY_WEBHOOK_SECRET_VAULT]: WebhookSecretVaultPort;
  readonly [DELIVERY_WEBHOOK_REPLAY_STORE]: WebhookReplayStorePort;
  readonly [DELIVERY_NOTIFICATION_PREFERENCE_READER]: NotificationPreferenceReaderPort;
  readonly [DELIVERY_NOTIFICATION_PREFERENCE_MANAGER]: NotificationPreferenceManagementPort;
};

export const resolveDeliveryPersistenceMode = (env: NodeJS.ProcessEnv): DeliveryPersistenceMode => {
  const value = env.DELIVERY_PERSISTENCE ?? 'in-memory';

  if (value === 'in-memory') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'DELIVERY_PERSISTENCE',
      selectedMode: value,
      durableModes: ['prisma'],
    });

    return 'in-memory';
  }

  if (value === 'prisma') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'DELIVERY_PERSISTENCE',
      selectedMode: value,
      durableModes: ['prisma'],
    });

    if ((env.DATABASE_URL ?? '').trim().length === 0) {
      throw new Error('DELIVERY_PERSISTENCE=prisma requires DATABASE_URL');
    }

    return 'prisma';
  }

  throw new Error('DELIVERY_PERSISTENCE must be "in-memory" or "prisma"');
};

export const resolveDeliveryWebhookProviderMode = (env: NodeJS.ProcessEnv): 'in-memory' | 'http' => {
  const value = env.DELIVERY_WEBHOOK_PROVIDER ?? 'in-memory';

  if (value === 'in-memory' || value === 'http') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'DELIVERY_WEBHOOK_PROVIDER',
      selectedMode: value,
      durableModes: ['http'],
    });

    return value;
  }

  throw new Error('DELIVERY_WEBHOOK_PROVIDER must be "in-memory" or "http"');
};

export const resolveDeliveryEnabledChannels = (env: NodeJS.ProcessEnv): readonly DeliveryChannel[] => {
  const raw = env.DELIVERY_ENABLED_CHANNELS?.trim();
  const channels = raw === undefined || raw.length === 0
    ? defaultDeliveryChannels(env)
    : parseDeliveryEnabledChannels(raw);

  if (resolveRuntimeProfile(env) === 'beta') {
    for (const channel of channels) {
      if (channel !== 'webhook') {
        throw new Error('DELIVERY_ENABLED_CHANNELS must be "webhook" when SOCIAL_MONITOR_RUNTIME_PROFILE=beta');
      }
    }
    if (!channels.includes('webhook')) {
      throw new Error('DELIVERY_ENABLED_CHANNELS must include "webhook" when SOCIAL_MONITOR_RUNTIME_PROFILE=beta');
    }
  }

  return channels;
};

const defaultDeliveryChannels = (env: NodeJS.ProcessEnv): readonly DeliveryChannel[] =>
  resolveRuntimeProfile(env) === 'beta' ? betaDeliveryChannels : allDeliveryChannels;

const parseDeliveryEnabledChannels = (raw: string): readonly DeliveryChannel[] => {
  const channels: DeliveryChannel[] = [];
  const seen = new Set<string>();

  for (const value of raw.split(',').map((item) => item.trim()).filter((item) => item.length > 0)) {
    if (!isDeliveryChannel(value)) {
      throw new Error('DELIVERY_ENABLED_CHANNELS must contain only "in_app", "email" or "webhook"');
    }
    if (!seen.has(value)) {
      seen.add(value);
      channels.push(value);
    }
  }

  if (channels.length === 0) {
    throw new Error('DELIVERY_ENABLED_CHANNELS must include at least one channel');
  }

  return channels;
};

const isDeliveryChannel = (value: string): value is DeliveryChannel =>
  (allDeliveryChannels as readonly string[]).includes(value);
