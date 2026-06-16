import type { DeliveryAttemptView } from '../shared/delivery-attempt-presenter';

export type ListDeliveryAttemptsResult = {
  readonly attempts: readonly DeliveryAttemptView[];
  readonly nextCursor?: string;
};
