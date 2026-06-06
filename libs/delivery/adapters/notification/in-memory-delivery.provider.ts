import type {
  DeliveryProviderPort,
  SendDeliveryRequest,
  SendDeliveryResult,
} from '../../ports';
import type { DeliveryChannel } from '../../domain';

export class InMemoryDeliveryProvider implements DeliveryProviderPort {
  private nextResult: SendDeliveryResult = { accepted: true };
  private readonly sentRequests: SendDeliveryRequest[] = [];

  constructor(readonly channel: DeliveryChannel) {}

  setNextResult(result: SendDeliveryResult): void {
    this.nextResult = result;
  }

  getSentRequests(): readonly SendDeliveryRequest[] {
    return [...this.sentRequests];
  }

  async send(request: SendDeliveryRequest): Promise<SendDeliveryResult> {
    this.sentRequests.push(request);
    const result = this.nextResult;

    this.nextResult = { accepted: true };

    return result;
  }
}
