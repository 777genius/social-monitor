import type { DeliveryAttemptState } from '../../domain';

export type QueueDeliveryAttemptResult = {
  readonly deliveryAttemptId: string;
  readonly state: DeliveryAttemptState;
  readonly created: boolean;
};
