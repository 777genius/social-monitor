import type { DeliveryAttempt, DeliveryAttemptProps } from '../../domain';

export type DeliveryAttemptView = Omit<
  DeliveryAttemptProps,
  | 'queuedAt'
  | 'assemblingAt'
  | 'suppressedAt'
  | 'sendingAt'
  | 'deliveredAt'
  | 'failedAt'
  | 'deadLetteredAt'
  | 'cancelledAt'
> & {
  readonly queuedAt: string;
  readonly assemblingAt?: string;
  readonly suppressedAt?: string;
  readonly sendingAt?: string;
  readonly deliveredAt?: string;
  readonly failedAt?: string;
  readonly deadLetteredAt?: string;
  readonly cancelledAt?: string;
};

export const presentDeliveryAttempt = (attempt: DeliveryAttempt): DeliveryAttemptView => {
  const snapshot = attempt.toSnapshot();

  return {
    ...snapshot,
    queuedAt: snapshot.queuedAt.toISOString(),
    assemblingAt: snapshot.assemblingAt?.toISOString(),
    suppressedAt: snapshot.suppressedAt?.toISOString(),
    sendingAt: snapshot.sendingAt?.toISOString(),
    deliveredAt: snapshot.deliveredAt?.toISOString(),
    failedAt: snapshot.failedAt?.toISOString(),
    deadLetteredAt: snapshot.deadLetteredAt?.toISOString(),
    cancelledAt: snapshot.cancelledAt?.toISOString(),
  };
};
