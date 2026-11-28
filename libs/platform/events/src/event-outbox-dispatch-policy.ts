export type OutboxDispatcherOptions = {
  readonly leaseMs?: number;
  readonly maxAttempts?: number;
  readonly retryBaseMs?: number;
  readonly retryMaxMs?: number;
};

export type EventOutboxDispatchPolicy = Required<OutboxDispatcherOptions>;

export const eventOutboxDispatchPolicy = (
  options: OutboxDispatcherOptions,
): EventOutboxDispatchPolicy => {
  const policy = {
    leaseMs: options.leaseMs ?? 30_000,
    maxAttempts: options.maxAttempts ?? 10,
    retryBaseMs: options.retryBaseMs ?? 1_000,
    retryMaxMs: options.retryMaxMs ?? 300_000,
  };
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
      throw new Error(`Event outbox ${name} must be a positive bounded integer`);
    }
  }
  if (policy.retryMaxMs < policy.retryBaseMs) {
    throw new Error('Event outbox retry maximum must not be below its base delay');
  }
  return policy;
};

export const eventOutboxRetryDelay = (
  policy: EventOutboxDispatchPolicy,
  attempt: number,
): number => Math.min(
  policy.retryMaxMs,
  policy.retryBaseMs * 2 ** Math.max(0, Math.min(attempt - 1, 30)),
);

export const assertEventOutboxBatchLimit = (limit: number): void => {
  if (!Number.isInteger(limit) || limit < 0 || limit > 500) {
    throw new Error('Event outbox batch limit must be an integer between 0 and 500');
  }
};

export const eventOutboxLeaseDuration = (params: {
  readonly now: Date;
  readonly leasedUntil: Date;
  readonly leaseOwner: string;
}): number => {
  const duration = params.leasedUntil.getTime() - params.now.getTime();
  if (!Number.isSafeInteger(duration) || duration <= 0 || params.leaseOwner.trim().length === 0) {
    throw new Error('Invalid event outbox lease');
  }
  return duration;
};
