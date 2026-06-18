export type QueueCommandDeliveryDiagnostics = {
  readonly redelivered: boolean;
  readonly deadLetterCount: number;
  readonly deadLetterReason?: string;
  readonly deadLetterQueue?: string;
  readonly publishedAtEpochMs?: number;
};

export const emptyQueueCommandDeliveryDiagnostics: QueueCommandDeliveryDiagnostics = {
  redelivered: false,
  deadLetterCount: 0,
};

type RabbitMqMessageLike = {
  readonly fields?: {
    readonly redelivered?: unknown;
  };
  readonly properties?: {
    readonly headers?: unknown;
    readonly timestamp?: unknown;
  };
};

type RabbitMqDeathHeader = {
  readonly count?: unknown;
  readonly reason?: unknown;
  readonly queue?: unknown;
};

export const queueCommandDeliveryDiagnosticsFromRabbitMq = (
  message: RabbitMqMessageLike,
  queue: string,
): QueueCommandDeliveryDiagnostics => {
  const death = firstDeathHeaderForQueue(message.properties?.headers, queue);

  if (death === undefined) {
    return {
      redelivered: message.fields?.redelivered === true,
      deadLetterCount: 0,
      publishedAtEpochMs: normalizeRabbitMqTimestamp(message.properties?.timestamp),
    };
  }

  return {
    redelivered: message.fields?.redelivered === true,
    deadLetterCount: normalizeDeathCount(death.count),
    deadLetterReason: typeof death.reason === 'string' ? death.reason : undefined,
    deadLetterQueue: typeof death.queue === 'string' ? death.queue : undefined,
    publishedAtEpochMs: normalizeRabbitMqTimestamp(message.properties?.timestamp),
  };
};

export const queueCommandDeliveryLagSeconds = (
  diagnostics: QueueCommandDeliveryDiagnostics,
  now: Date,
): number | undefined => {
  if (diagnostics.publishedAtEpochMs === undefined) {
    return undefined;
  }

  return Math.max(0, (now.getTime() - diagnostics.publishedAtEpochMs) / 1000);
};

const firstDeathHeaderForQueue = (
  headers: unknown,
  queue: string,
): RabbitMqDeathHeader | undefined => {
  if (headers === null || typeof headers !== 'object' || Array.isArray(headers)) {
    return undefined;
  }

  const deaths = (headers as { readonly 'x-death'?: unknown })['x-death'];

  if (!Array.isArray(deaths)) {
    return undefined;
  }

  return deaths.find((death): death is RabbitMqDeathHeader => (
    death !== null &&
    typeof death === 'object' &&
    !Array.isArray(death) &&
    (death as RabbitMqDeathHeader).queue === queue
  ));
};

const normalizeDeathCount = (count: unknown): number => {
  if (typeof count === 'number' && Number.isInteger(count) && count > 0) {
    return count;
  }

  return 0;
};

const normalizeRabbitMqTimestamp = (timestamp: unknown): number | undefined => {
  if (typeof timestamp !== 'number' || !Number.isInteger(timestamp) || timestamp <= 0) {
    return undefined;
  }

  return timestamp * 1000;
};
