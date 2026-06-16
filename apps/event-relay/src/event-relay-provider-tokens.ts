import type { RabbitMqEventPublisherOptions } from '@social-monitor/platform-events';

export type EventRelayLoopOptions = {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly limit: number;
  readonly runOnStart: boolean;
};

export const EVENT_RELAY_LOOP_OPTIONS = Symbol('EVENT_RELAY_LOOP_OPTIONS');
export const EVENT_RELAY_RABBITMQ_EVENT_OPTIONS = Symbol('EVENT_RELAY_RABBITMQ_EVENT_OPTIONS');

export const resolveEventRelayLoopOptions = (env: NodeJS.ProcessEnv): EventRelayLoopOptions => {
  const loopMode = env.EVENT_RELAY_LOOP ?? (env.NODE_ENV === 'test' ? 'disabled' : 'enabled');

  if (loopMode !== 'enabled' && loopMode !== 'disabled') {
    throw new Error('EVENT_RELAY_LOOP must be "enabled" or "disabled"');
  }

  return {
    enabled: loopMode === 'enabled',
    intervalMs: parseBoundedInteger(env.EVENT_RELAY_INTERVAL_MS, 2_000, 500, 3_600_000),
    limit: parseBoundedInteger(env.EVENT_RELAY_BATCH_SIZE, 50, 1, 500),
    runOnStart: parseBoolean(env.EVENT_RELAY_RUN_ON_START, true),
  };
};

export const resolveEventRelayRabbitMqEventOptions = (
  env: NodeJS.ProcessEnv,
): RabbitMqEventPublisherOptions => ({
  exchange: nonEmptyOrFallback(env.RABBITMQ_EVENT_EXCHANGE, 'social-monitor.events'),
  exchangeType: 'topic',
  durable: true,
  persistent: true,
});

export const requireEventRelayRuntimeEnv = (env: NodeJS.ProcessEnv): void => {
  if ((env.DATABASE_URL ?? '').trim().length === 0) {
    throw new Error('event-relay requires DATABASE_URL');
  }

  if ((env.RABBITMQ_URL ?? '').trim().length === 0) {
    throw new Error('event-relay requires RABBITMQ_URL');
  }
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
