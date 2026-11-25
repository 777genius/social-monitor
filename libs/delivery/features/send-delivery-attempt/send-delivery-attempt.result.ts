import type { DeliveryAttemptView } from '../shared/delivery-attempt-presenter';

export type SendDeliveryAttemptResult = {
  readonly attempt: DeliveryAttemptView;
  readonly providerMessageId?: string;
};
