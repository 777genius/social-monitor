import type {
  OutboxPort,
  ScanDispatchPort,
  ScanJobRepositoryPort,
  ScanQueuePort,
} from '../../ports';

export class DirectScanDispatchAdapter implements ScanDispatchPort {
  constructor(
    private readonly scanJobs: ScanJobRepositoryPort,
    private readonly scanQueue: ScanQueuePort,
    private readonly outbox: OutboxPort,
  ) {}

  async storeEnqueuedScan(
    params: Parameters<ScanDispatchPort['storeEnqueuedScan']>[0],
  ): Promise<void> {
    await this.scanJobs.save(params.job);
    if (params.event !== undefined) {
      await this.outbox.append(params.event);
    }
    await this.scanQueue.enqueue(params.command);
  }
}
