import type { InMemoryQueuePublisher, QueueCommandEnvelope } from '@social-monitor/platform-queue';

import type { EnqueueScanCommand, ScanQueuePort } from '../../ports';

export class InMemoryScanQueueAdapter implements ScanQueuePort {
  constructor(private readonly publisher: InMemoryQueuePublisher) {}

  async enqueue(command: EnqueueScanCommand): Promise<void> {
    await this.publisher.publish({
      commandId: command.scanJobId,
      commandType: 'ingestion.scan.execute',
      schemaVersion: 1,
      correlationId: command.correlationId,
      causationId: command.causationId,
      payload: {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        scanJobId: command.scanJobId,
        sourceBindingId: command.sourceBindingId,
        scanPolicyId: command.scanPolicyId,
      },
    });
  }

  all(): readonly QueueCommandEnvelope<Readonly<Record<string, unknown>>>[] {
    return this.publisher.all();
  }
}
