import type {
  OutboxPort,
  ScanDispatchPort,
  ScanJobRepositoryPort,
  ScanQueuePort,
} from '../../ports';
import type { ScanJob } from '../../domain';

type RollbackCapableScanJobRepository = ScanJobRepositoryPort & {
  restoreScanJob(params: {
    readonly tenantId: Parameters<ScanJobRepositoryPort['findById']>[0]['tenantId'];
    readonly workspaceId: Parameters<ScanJobRepositoryPort['findById']>[0]['workspaceId'];
    readonly scanJobId: string;
    readonly previous: ScanJob | null;
  }): Promise<void>;
};

type RollbackCapableScanQueue = ScanQueuePort & {
  assertDirectDispatchRollbackSupported(): void;
  enqueueCheckpoint(scanJobId: string): number;
  rollbackEnqueue(scanJobId: string, checkpoint: number): Promise<void>;
};

type RollbackCapableOutbox = OutboxPort & {
  appendCheckpoint(eventId: string): number;
  rollbackAppend(eventId: string, checkpoint: number): Promise<void>;
};

export class DirectScanDispatchAdapter implements ScanDispatchPort {
  private readonly scanJobs: RollbackCapableScanJobRepository;
  private readonly scanQueue: RollbackCapableScanQueue;
  private readonly outbox: RollbackCapableOutbox;

  constructor(
    scanJobs: ScanJobRepositoryPort,
    scanQueue: ScanQueuePort,
    outbox: OutboxPort,
  ) {
    this.scanJobs = requireScanJobRollback(scanJobs);
    this.scanQueue = requireScanQueueRollback(scanQueue);
    this.outbox = requireOutboxRollback(outbox);
  }

  async storeEnqueuedScan(
    params: Parameters<ScanDispatchPort['storeEnqueuedScan']>[0],
  ): Promise<void> {
    const snapshot = params.job.toSnapshot();
    const previous = await this.scanJobs.findById({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scanJobId: snapshot.id,
    });
    const queueCheckpoint = this.scanQueue.enqueueCheckpoint(
      params.command.scanJobId,
    );
    const eventCheckpoint = params.event === undefined
      ? undefined
      : this.outbox.appendCheckpoint(params.event.eventId);
    let jobWriteStarted = false;
    let eventWriteStarted = false;
    let queueWriteStarted = false;

    try {
      jobWriteStarted = true;
      await this.scanJobs.save(params.job);
      if (params.event !== undefined) {
        eventWriteStarted = true;
        await this.outbox.append(params.event);
      }
      queueWriteStarted = true;
      await this.scanQueue.enqueue(params.command);
    } catch (error) {
      if (queueWriteStarted) {
        await this.rollbackOrThrow({
          effect: "queue command",
          rollback: this.scanQueue.rollbackEnqueue(
            params.command.scanJobId,
            queueCheckpoint,
          ),
          dispatchError: error,
        });
      }
      if (
        eventWriteStarted &&
        params.event !== undefined &&
        eventCheckpoint !== undefined
      ) {
        await this.rollbackOrThrow({
          effect: "outbox event",
          rollback: this.outbox.rollbackAppend(
            params.event.eventId,
            eventCheckpoint,
          ),
          dispatchError: error,
        });
      }
      if (jobWriteStarted) {
        await this.rollbackOrThrow({
          effect: "scan job",
          rollback: this.scanJobs.restoreScanJob({
            tenantId: snapshot.tenantId,
            workspaceId: snapshot.workspaceId,
            scanJobId: snapshot.id,
            previous,
          }),
          dispatchError: error,
        });
      }
      throw error;
    }
  }

  private async rollbackOrThrow(params: {
    readonly effect: string;
    readonly rollback: Promise<void>;
    readonly dispatchError: unknown;
  }): Promise<void> {
    try {
      await params.rollback;
    } catch (rollbackError) {
      throw new Error(
        `Direct scan dispatch ${params.effect} rollback failed after dispatch error: ${errorMessage(params.dispatchError)}; rollback error: ${errorMessage(rollbackError)}`,
      );
    }
  }
}

const requireScanJobRollback = (
  value: ScanJobRepositoryPort,
): RollbackCapableScanJobRepository => {
  if (
    'restoreScanJob' in value &&
    typeof value.restoreScanJob === 'function'
  ) {
    return value as RollbackCapableScanJobRepository;
  }

  throw new Error('Direct scan dispatch requires rollback-capable scan job storage');
};

const requireScanQueueRollback = (
  value: ScanQueuePort,
): RollbackCapableScanQueue => {
  if (
    'assertDirectDispatchRollbackSupported' in value &&
    typeof value.assertDirectDispatchRollbackSupported === 'function' &&
    'enqueueCheckpoint' in value &&
    typeof value.enqueueCheckpoint === 'function' &&
    'rollbackEnqueue' in value &&
    typeof value.rollbackEnqueue === 'function'
  ) {
    const rollbackCapable = value as RollbackCapableScanQueue;
    rollbackCapable.assertDirectDispatchRollbackSupported();
    return rollbackCapable;
  }

  throw new Error('Direct scan dispatch requires rollback-capable scan queue');
};

const requireOutboxRollback = (
  value: OutboxPort,
): RollbackCapableOutbox => {
  if (
    'appendCheckpoint' in value &&
    typeof value.appendCheckpoint === 'function' &&
    'rollbackAppend' in value &&
    typeof value.rollbackAppend === 'function'
  ) {
    return value as RollbackCapableOutbox;
  }

  throw new Error('Direct scan dispatch requires rollback-capable outbox');
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
