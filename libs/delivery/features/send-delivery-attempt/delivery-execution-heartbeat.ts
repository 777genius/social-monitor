import type { Clock } from '@social-monitor/shared-kernel';

import type { DeliveryAttemptExecutionStore, DeliveryAttemptScope } from '../../application/contracts/delivery-attempt-workflow';

/** Keeps slow preference/signing/provider work owned without an open transaction. */
export const withDeliveryExecutionHeartbeat = async <T>(params: {
  readonly store: DeliveryAttemptExecutionStore;
  readonly scope: DeliveryAttemptScope;
  readonly token: string;
  readonly clock: Clock;
  readonly leaseMs: number;
  readonly operation: (signal: AbortSignal) => Promise<T>;
}): Promise<{ readonly owned: true; readonly value: T } | { readonly owned: false }> => {
  const controller = new AbortController();
  let renewal: Promise<void> | undefined;
  let ownershipLost = false;
  const timer = setInterval(() => {
    if (renewal !== undefined || ownershipLost) {
      return;
    }
    const now = params.clock.now();
    renewal = params.store.renew({
      ...params.scope, token: params.token, now,
      expiresAt: new Date(now.getTime() + params.leaseMs),
    }).then((owned) => {
      if (!owned) {
        ownershipLost = true;
        controller.abort();
      }
    }, () => {
      ownershipLost = true;
      controller.abort();
    }).finally(() => { renewal = undefined; });
  }, Math.max(1, Math.floor(params.leaseMs / 3)));
  timer.unref();
  try {
    const result = await params.operation(controller.signal);
    await renewal;
    if (ownershipLost) {
      return { owned: false };
    }
    return { owned: true, value: result };
  } catch (error) {
    if (ownershipLost) {
      return { owned: false };
    }
    throw error;
  } finally {
    clearInterval(timer);
    await renewal;
  }
};
