import type { DeliveryAttemptView } from '../shared/delivery-attempt-presenter';

export type ApplyDeliverySuppressionResult = {
  readonly suppressed: boolean;
  readonly attempt: DeliveryAttemptView;
};
