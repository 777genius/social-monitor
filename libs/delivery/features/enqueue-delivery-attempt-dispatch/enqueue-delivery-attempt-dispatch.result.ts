import type { DeliveryAttemptState } from '../../domain';

export type EnqueueDeliveryAttemptDispatchResult = {
  readonly deliveryAttemptId: string;
  readonly state: DeliveryAttemptState;
  readonly enqueued: boolean;
  readonly reason?: 'already_in_flight' | 'not_dispatchable';
};
