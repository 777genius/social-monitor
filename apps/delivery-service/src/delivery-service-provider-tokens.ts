import { assertRuntimeProfileAllowsMode } from '@social-monitor/platform-config';
import {
  parseRabbitMqDeadLetterExchange,
  parseRabbitMqDeliveryLimit,
  parseRabbitMqQueueType,
  type RabbitMqQueueType,
} from '@social-monitor/platform-queue/adapters/rabbitmq';

export type DeliveryDigestSchedulerLoopOptions = {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly limit: number;
  readonly runOnStart: boolean;
  readonly tenantId?: string;
  readonly workspaceId?: string;
};

export type DeliveryAttemptDispatchLoopOptions = {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly limit: number;
  readonly runOnStart: boolean;
  readonly tenantId?: string;
  readonly workspaceId?: string;
  readonly target?: DeliveryAttemptDispatchTarget;
};

export type DeliveryAttemptDispatchTarget = 'direct' | 'queue';
export type DeliveryAttemptDispatchQueueMode = 'in-memory' | 'rabbitmq';
export type DeliveryAttemptQueueReaderMode = 'in-memory' | 'rabbitmq';
export type DeliverySummaryReadyEventReaderMode = 'disabled' | 'rabbitmq';
export type DeliveryRabbitMqAttemptQueueReaderOptions = {
  readonly queue: string;
  readonly deadLetterExchange?: string;
  readonly queueType: RabbitMqQueueType;
  readonly deliveryLimit: number;
};
export type DeliverySummaryReadyEventQueueOptions = {
  readonly exchange: string;
  readonly queue: string;
  readonly routingKey: string;
  readonly deadLetterExchange?: string;
  readonly queueType: RabbitMqQueueType;
  readonly deliveryLimit: number;
};
export type DeliveryAttemptQueueDrainLoopOptions = {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly limit: number;
  readonly runOnStart: boolean;
};
export type DeliverySummaryReadyEventDrainLoopOptions = {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly limit: number;
  readonly runOnStart: boolean;
};

export const DELIVERY_DIGEST_SCHEDULER_LOOP_OPTIONS = Symbol('DELIVERY_DIGEST_SCHEDULER_LOOP_OPTIONS');
export const DELIVERY_ATTEMPT_DISPATCH_LOOP_OPTIONS = Symbol('DELIVERY_ATTEMPT_DISPATCH_LOOP_OPTIONS');
export const DELIVERY_ATTEMPT_DISPATCH_QUEUE_MODE = Symbol('DELIVERY_ATTEMPT_DISPATCH_QUEUE_MODE');
export const DELIVERY_ATTEMPT_QUEUE_READER_MODE = Symbol('DELIVERY_ATTEMPT_QUEUE_READER_MODE');
export const DELIVERY_SUMMARY_READY_EVENT_READER_MODE = Symbol('DELIVERY_SUMMARY_READY_EVENT_READER_MODE');
export const DELIVERY_RABBITMQ_ATTEMPT_QUEUE_OPTIONS = Symbol('DELIVERY_RABBITMQ_ATTEMPT_QUEUE_OPTIONS');
export const DELIVERY_RABBITMQ_ATTEMPT_QUEUE_READER_OPTIONS =
  Symbol('DELIVERY_RABBITMQ_ATTEMPT_QUEUE_READER_OPTIONS');
export const DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP_OPTIONS = Symbol('DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP_OPTIONS');
export const DELIVERY_SUMMARY_READY_EVENT_QUEUE_OPTIONS = Symbol('DELIVERY_SUMMARY_READY_EVENT_QUEUE_OPTIONS');
export const DELIVERY_SUMMARY_READY_EVENT_DRAIN_LOOP_OPTIONS =
  Symbol('DELIVERY_SUMMARY_READY_EVENT_DRAIN_LOOP_OPTIONS');

export const resolveDeliveryDigestSchedulerLoopOptions = (
  env: NodeJS.ProcessEnv,
): DeliveryDigestSchedulerLoopOptions => {
  const loopMode = env.DELIVERY_DIGEST_SCHEDULER_LOOP ?? (env.NODE_ENV === 'test' ? 'disabled' : 'enabled');

  if (loopMode !== 'enabled' && loopMode !== 'disabled') {
    throw new Error('DELIVERY_DIGEST_SCHEDULER_LOOP must be "enabled" or "disabled"');
  }

  const tenant = emptyToUndefined(env.DELIVERY_DIGEST_SCHEDULER_TENANT_ID);
  const workspace = emptyToUndefined(env.DELIVERY_DIGEST_SCHEDULER_WORKSPACE_ID);

  if ((tenant === undefined) !== (workspace === undefined)) {
    throw new Error('DELIVERY_DIGEST_SCHEDULER_TENANT_ID and DELIVERY_DIGEST_SCHEDULER_WORKSPACE_ID must be set together');
  }

  return {
    enabled: loopMode === 'enabled',
    intervalMs: parseBoundedInteger(env.DELIVERY_DIGEST_SCHEDULER_INTERVAL_MS, 60_000, 1_000, 3_600_000),
    limit: parseBoundedInteger(env.DELIVERY_DIGEST_SCHEDULER_LIMIT, 20, 1, 100),
    runOnStart: parseBoolean(env.DELIVERY_DIGEST_SCHEDULER_RUN_ON_START, true),
    tenantId: tenant,
    workspaceId: workspace,
  };
};

export const resolveDeliveryAttemptDispatchLoopOptions = (
  env: NodeJS.ProcessEnv,
): DeliveryAttemptDispatchLoopOptions => {
  const loopMode = env.DELIVERY_ATTEMPT_DISPATCH_LOOP ?? (env.NODE_ENV === 'test' ? 'disabled' : 'enabled');

  if (loopMode !== 'enabled' && loopMode !== 'disabled') {
    throw new Error('DELIVERY_ATTEMPT_DISPATCH_LOOP must be "enabled" or "disabled"');
  }

  const tenant = emptyToUndefined(env.DELIVERY_ATTEMPT_DISPATCH_TENANT_ID);
  const workspace = emptyToUndefined(env.DELIVERY_ATTEMPT_DISPATCH_WORKSPACE_ID);

  if ((tenant === undefined) !== (workspace === undefined)) {
    throw new Error('DELIVERY_ATTEMPT_DISPATCH_TENANT_ID and DELIVERY_ATTEMPT_DISPATCH_WORKSPACE_ID must be set together');
  }

  return {
    enabled: loopMode === 'enabled',
    intervalMs: parseBoundedInteger(env.DELIVERY_ATTEMPT_DISPATCH_INTERVAL_MS, 60_000, 1_000, 3_600_000),
    limit: parseBoundedInteger(env.DELIVERY_ATTEMPT_DISPATCH_LIMIT, 20, 1, 100),
    runOnStart: parseBoolean(env.DELIVERY_ATTEMPT_DISPATCH_RUN_ON_START, true),
    tenantId: tenant,
    workspaceId: workspace,
    target: resolveDeliveryAttemptDispatchTarget(env),
  };
};

export const resolveDeliveryAttemptDispatchTarget = (
  env: NodeJS.ProcessEnv,
): DeliveryAttemptDispatchTarget => {
  const defaultTarget =
    env.DELIVERY_ATTEMPT_DISPATCH_QUEUE === 'rabbitmq' || env.DELIVERY_ATTEMPT_QUEUE_READER === 'rabbitmq'
      ? 'queue'
      : 'direct';
  const value = env.DELIVERY_ATTEMPT_DISPATCH_TARGET ?? defaultTarget;

  if (value === 'direct' || value === 'queue') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'DELIVERY_ATTEMPT_DISPATCH_TARGET',
      selectedMode: value,
      durableModes: ['queue'],
    });

    return value;
  }

  throw new Error('DELIVERY_ATTEMPT_DISPATCH_TARGET must be "direct" or "queue"');
};

export const resolveDeliveryAttemptDispatchQueueMode = (
  env: NodeJS.ProcessEnv,
): DeliveryAttemptDispatchQueueMode => {
  const value = env.DELIVERY_ATTEMPT_DISPATCH_QUEUE ?? (
    env.DELIVERY_ATTEMPT_QUEUE_READER === 'rabbitmq' ? 'rabbitmq' : 'in-memory'
  );

  if (value === 'in-memory') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'DELIVERY_ATTEMPT_DISPATCH_QUEUE',
      selectedMode: value,
      durableModes: ['rabbitmq'],
    });

    return 'in-memory';
  }

  if (value === 'rabbitmq') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'DELIVERY_ATTEMPT_DISPATCH_QUEUE',
      selectedMode: value,
      durableModes: ['rabbitmq'],
    });

    if ((env.RABBITMQ_URL ?? '').trim().length === 0) {
      throw new Error('DELIVERY_ATTEMPT_DISPATCH_QUEUE=rabbitmq requires RABBITMQ_URL');
    }

    return 'rabbitmq';
  }

  throw new Error('DELIVERY_ATTEMPT_DISPATCH_QUEUE must be "in-memory" or "rabbitmq"');
};

export const resolveDeliveryAttemptQueueReaderMode = (
  env: NodeJS.ProcessEnv,
): DeliveryAttemptQueueReaderMode => {
  const value = env.DELIVERY_ATTEMPT_QUEUE_READER ?? 'in-memory';

  if (value === 'in-memory') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'DELIVERY_ATTEMPT_QUEUE_READER',
      selectedMode: value,
      durableModes: ['rabbitmq'],
    });

    return 'in-memory';
  }

  if (value === 'rabbitmq') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'DELIVERY_ATTEMPT_QUEUE_READER',
      selectedMode: value,
      durableModes: ['rabbitmq'],
    });

    if ((env.RABBITMQ_URL ?? '').trim().length === 0) {
      throw new Error('DELIVERY_ATTEMPT_QUEUE_READER=rabbitmq requires RABBITMQ_URL');
    }

    return 'rabbitmq';
  }

  throw new Error('DELIVERY_ATTEMPT_QUEUE_READER must be "in-memory" or "rabbitmq"');
};

export const resolveDeliverySummaryReadyEventReaderMode = (
  env: NodeJS.ProcessEnv,
): DeliverySummaryReadyEventReaderMode => {
  const value = env.DELIVERY_SUMMARY_READY_EVENT_READER ?? 'disabled';

  if (value === 'disabled') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'DELIVERY_SUMMARY_READY_EVENT_READER',
      selectedMode: value,
      durableModes: ['rabbitmq'],
    });

    return 'disabled';
  }

  if (value === 'rabbitmq') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'DELIVERY_SUMMARY_READY_EVENT_READER',
      selectedMode: value,
      durableModes: ['rabbitmq'],
    });

    if ((env.RABBITMQ_URL ?? '').trim().length === 0) {
      throw new Error('DELIVERY_SUMMARY_READY_EVENT_READER=rabbitmq requires RABBITMQ_URL');
    }

    return 'rabbitmq';
  }

  throw new Error('DELIVERY_SUMMARY_READY_EVENT_READER must be "disabled" or "rabbitmq"');
};

export const resolveDeliveryRabbitMqAttemptQueueOptions = (
  env: NodeJS.ProcessEnv,
) => ({
  exchange: nonEmptyOrFallback(env.RABBITMQ_DELIVERY_ATTEMPT_EXCHANGE, 'social-monitor.commands'),
  exchangeType: 'direct' as const,
  routes: {
    'delivery.attempt.send': {
      queue: nonEmptyOrFallback(env.RABBITMQ_DELIVERY_ATTEMPT_QUEUE, 'jobs.delivery.attempt.send'),
      routingKey: 'delivery.attempt.send',
      deadLetterExchange: parseRabbitMqDeadLetterExchange(env.RABBITMQ_DEAD_LETTER_EXCHANGE, {
        runtimeProfile: env.SOCIAL_MONITOR_RUNTIME_PROFILE,
        settingName: 'DELIVERY_ATTEMPT_DISPATCH_QUEUE=rabbitmq',
      }),
      queueType: parseRabbitMqQueueType(env.RABBITMQ_QUEUE_TYPE),
      deliveryLimit: parseRabbitMqDeliveryLimit(env.RABBITMQ_QUEUE_DELIVERY_LIMIT),
    },
  },
});

export const resolveDeliveryRabbitMqAttemptQueueReaderOptions = (
  env: NodeJS.ProcessEnv,
): DeliveryRabbitMqAttemptQueueReaderOptions => ({
  queue: nonEmptyOrFallback(env.RABBITMQ_DELIVERY_ATTEMPT_QUEUE, 'jobs.delivery.attempt.send'),
  deadLetterExchange: parseRabbitMqDeadLetterExchange(env.RABBITMQ_DEAD_LETTER_EXCHANGE, {
    runtimeProfile: env.SOCIAL_MONITOR_RUNTIME_PROFILE,
    settingName: 'DELIVERY_ATTEMPT_QUEUE_READER=rabbitmq',
  }),
  queueType: parseRabbitMqQueueType(env.RABBITMQ_QUEUE_TYPE),
  deliveryLimit: parseRabbitMqDeliveryLimit(env.RABBITMQ_QUEUE_DELIVERY_LIMIT),
});

export const resolveDeliverySummaryReadyEventQueueOptions = (
  env: NodeJS.ProcessEnv,
): DeliverySummaryReadyEventQueueOptions => ({
  exchange: nonEmptyOrFallback(env.RABBITMQ_EVENT_EXCHANGE, 'social-monitor.events'),
  queue: nonEmptyOrFallback(env.RABBITMQ_SUMMARY_READY_EVENT_QUEUE, 'events.delivery.summary.ready'),
  routingKey: nonEmptyOrFallback(env.RABBITMQ_SUMMARY_READY_EVENT_ROUTING_KEY, 'summary.ready'),
  deadLetterExchange: parseRabbitMqDeadLetterExchange(env.RABBITMQ_DEAD_LETTER_EXCHANGE, {
    runtimeProfile: env.SOCIAL_MONITOR_RUNTIME_PROFILE,
    settingName: 'DELIVERY_SUMMARY_READY_EVENT_READER=rabbitmq',
  }),
  queueType: parseRabbitMqQueueType(env.RABBITMQ_QUEUE_TYPE),
  deliveryLimit: parseRabbitMqDeliveryLimit(env.RABBITMQ_QUEUE_DELIVERY_LIMIT),
});

export const resolveDeliveryAttemptQueueDrainLoopOptions = (
  env: NodeJS.ProcessEnv,
): DeliveryAttemptQueueDrainLoopOptions => {
  const defaultMode = env.DELIVERY_ATTEMPT_QUEUE_READER === 'rabbitmq' ? 'enabled' : 'disabled';
  const loopMode = env.DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP ?? (env.NODE_ENV === 'test' ? 'disabled' : defaultMode);

  if (loopMode !== 'enabled' && loopMode !== 'disabled') {
    throw new Error('DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP must be "enabled" or "disabled"');
  }

  return {
    enabled: loopMode === 'enabled',
    intervalMs: parseBoundedInteger(env.DELIVERY_ATTEMPT_QUEUE_DRAIN_INTERVAL_MS, 5_000, 500, 3_600_000),
    limit: parseBoundedInteger(env.DELIVERY_ATTEMPT_QUEUE_DRAIN_LIMIT, 20, 1, 100),
    runOnStart: parseBoolean(env.DELIVERY_ATTEMPT_QUEUE_DRAIN_RUN_ON_START, true),
  };
};

export const resolveDeliverySummaryReadyEventDrainLoopOptions = (
  env: NodeJS.ProcessEnv,
): DeliverySummaryReadyEventDrainLoopOptions => {
  const defaultMode = env.DELIVERY_SUMMARY_READY_EVENT_READER === 'rabbitmq' ? 'enabled' : 'disabled';
  const loopMode = env.DELIVERY_SUMMARY_READY_EVENT_DRAIN_LOOP ?? (env.NODE_ENV === 'test' ? 'disabled' : defaultMode);

  if (loopMode !== 'enabled' && loopMode !== 'disabled') {
    throw new Error('DELIVERY_SUMMARY_READY_EVENT_DRAIN_LOOP must be "enabled" or "disabled"');
  }

  assertRuntimeProfileAllowsMode({
    env,
    settingName: 'DELIVERY_SUMMARY_READY_EVENT_DRAIN_LOOP',
    selectedMode: loopMode,
    durableModes: ['enabled'],
  });

  return {
    enabled: loopMode === 'enabled',
    intervalMs: parseBoundedInteger(env.DELIVERY_SUMMARY_READY_EVENT_DRAIN_INTERVAL_MS, 5_000, 500, 3_600_000),
    limit: parseBoundedInteger(env.DELIVERY_SUMMARY_READY_EVENT_DRAIN_LIMIT, 20, 1, 100),
    runOnStart: parseBoolean(env.DELIVERY_SUMMARY_READY_EVENT_DRAIN_RUN_ON_START, true),
  };
};

const emptyToUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const nonEmptyOrFallback = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error('Boolean environment values must be "true" or "false"');
};

const parseBoundedInteger = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected integer environment value between ${min} and ${max}`);
  }

  return parsed;
};
