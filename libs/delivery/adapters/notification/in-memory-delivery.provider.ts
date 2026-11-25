import type {
  DeliveryProviderPort,
  SendDeliveryRequest,
  SendDeliveryResult,
} from '../../ports';
import type { DeliveryChannel } from '../../domain';

export class InMemoryDeliveryProvider implements DeliveryProviderPort {
  private readonly results: SendDeliveryResult[] = [];
  private readonly sentRequests: SendDeliveryRequest[] = [];

  constructor(readonly channel: DeliveryChannel) {}

  setNextResult(result: SendDeliveryResult): void {
    this.results.splice(0, this.results.length, result);
  }

  enqueueResult(result: SendDeliveryResult): void {
    this.results.push(result);
  }

  getSentRequests(): readonly SendDeliveryRequest[] {
    return [...this.sentRequests];
  }

  async send(request: SendDeliveryRequest): Promise<SendDeliveryResult> {
    this.sentRequests.push(request);

    return this.results.shift() ?? { accepted: true };
  }
}
