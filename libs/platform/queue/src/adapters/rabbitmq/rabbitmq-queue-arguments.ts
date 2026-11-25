export type RabbitMqFieldValue = string | number | boolean;
export type RabbitMqQueueType = 'classic' | 'quorum';

export type RabbitMqDurableQueueArgumentsOptions = {
  readonly deadLetterExchange?: string;
  readonly headers?: Readonly<Record<string, RabbitMqFieldValue>>;
  readonly queueType?: RabbitMqQueueType;
  readonly deliveryLimit?: number;
};

export const DEFAULT_RABBITMQ_QUEUE_TYPE: RabbitMqQueueType = 'quorum';
export const DEFAULT_RABBITMQ_DELIVERY_LIMIT = 20;

export const rabbitMqDurableQueueArguments = (
  options: RabbitMqDurableQueueArgumentsOptions = {},
): Readonly<Record<string, RabbitMqFieldValue>> => {
  const queueType = options.queueType ?? DEFAULT_RABBITMQ_QUEUE_TYPE;
  const queueArguments: Record<string, RabbitMqFieldValue> = {
    ...options.headers,
    'x-queue-type': queueType,
  };

  if (options.deadLetterExchange !== undefined) {
    queueArguments['x-dead-letter-exchange'] = options.deadLetterExchange;
  }

  if (queueType === 'quorum') {
    queueArguments['x-delivery-limit'] = normalizeRabbitMqDeliveryLimit(options.deliveryLimit);
  }

  return queueArguments;
};

export const parseRabbitMqQueueType = (
  value: string | undefined,
  fallback: RabbitMqQueueType = DEFAULT_RABBITMQ_QUEUE_TYPE,
): RabbitMqQueueType => {
  const normalized = value?.trim();

  if (normalized === undefined || normalized.length === 0) {
    return fallback;
  }

  if (normalized === 'classic' || normalized === 'quorum') {
    return normalized;
  }

  throw new Error('RABBITMQ_QUEUE_TYPE must be "classic" or "quorum"');
};

export const parseRabbitMqDeliveryLimit = (
  value: string | undefined,
  fallback: number = DEFAULT_RABBITMQ_DELIVERY_LIMIT,
): number => {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  return normalizeRabbitMqDeliveryLimit(Number(value));
};

export const parseRabbitMqDeadLetterExchange = (
  value: string | undefined,
  params: {
    readonly runtimeProfile?: string;
    readonly settingName: string;
  },
): string | undefined => {
  const trimmed = value?.trim();

  if (trimmed !== undefined && trimmed.length > 0) {
    return trimmed;
  }

  if (params.runtimeProfile === 'beta') {
    throw new Error(`${params.settingName} requires RABBITMQ_DEAD_LETTER_EXCHANGE in beta runtime`);
  }

  return undefined;
};

const normalizeRabbitMqDeliveryLimit = (value: number | undefined): number => {
  const resolved = value ?? DEFAULT_RABBITMQ_DELIVERY_LIMIT;

  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 1_000) {
    throw new Error('RabbitMQ quorum queue delivery limit must be an integer between 1 and 1000');
  }

  return resolved;
};
