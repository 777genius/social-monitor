export const scheduledScanIdempotencyKey = (
  scanPolicyId: string,
  dueAt: Date,
): string => `scheduled:${scanPolicyId}:${dueAt.toISOString()}`;

export const nextScanPolicyRunAfterDecision = (params: {
  readonly dueAt: Date;
  readonly intervalSeconds: number;
  readonly now: Date;
  readonly backoffUntil: Date | null;
}): Date => {
  const intervalMs = params.intervalSeconds * 1000;
  const intervalNextRunAt = new Date(params.dueAt.getTime() + intervalMs);

  if (params.backoffUntil !== null) {
    const backoffNextRunAt =
      params.backoffUntil.getTime() > intervalNextRunAt.getTime()
        ? params.backoffUntil
        : intervalNextRunAt;

    if (backoffNextRunAt.getTime() > params.now.getTime()) {
      return backoffNextRunAt;
    }
  }

  const elapsedMs = Math.max(0, params.now.getTime() - params.dueAt.getTime());
  const elapsedIntervals = Math.floor(elapsedMs / intervalMs) + 1;

  return new Date(params.dueAt.getTime() + elapsedIntervals * intervalMs);
};
