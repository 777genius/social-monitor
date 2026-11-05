import type { QueueCommandDelivery, QueueCommandReader } from '../../queue-delivery';
import type { InMemoryQueuePublisher } from './in-memory-queue-publisher';

export class InMemoryQueueCommandReader implements QueueCommandReader {
  constructor(private readonly queue: InMemoryQueuePublisher) {}

  async drain(params: { readonly commandType: string; readonly limit: number }): Promise<readonly QueueCommandDelivery[]> {
    return this.queue.reserve(params);
  }
}
