import type { DeliveryAttemptProps, DeliveryChannel } from '../domain';

export type DeliveryContent = {
  readonly subject?: string;
  readonly body: string;
};

export type SendDeliveryRequest = {
  readonly attempt: DeliveryAttemptProps;
  readonly content: DeliveryContent;
};

export type SendDeliveryResult =
  | {
      readonly accepted: true;
      readonly providerMessageId?: string;
    }
  | {
      readonly accepted: false;
      readonly retryable: boolean;
      readonly reason: string;
    };

export interface DeliveryProviderPort {
  readonly channel: DeliveryChannel;
  send(request: SendDeliveryRequest): Promise<SendDeliveryResult>;
}
