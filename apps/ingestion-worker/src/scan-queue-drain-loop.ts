import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import { InMemoryQueuePublisher, type QueueCommandEnvelope } from '@social-monitor/platform-queue';
import { ExecuteScanCommandHandler } from '@social-monitor/ingestion/interfaces/queue/execute-scan-command.handler';
import type { RetryScanCommand, ScanRetryQueuePort } from '@social-monitor/ingestion/ports';

import {
  INGESTION_SCAN_FAILURE_QUEUE,
  INGESTION_SCAN_QUEUE_DRAIN_LOOP_OPTIONS,
  type IngestionScanQueueDrainLoopOptions,
} from './ingestion-worker-provider-tokens';

@Injectable()
export class ScanQueueDrainLoop implements OnModuleInit, OnApplicationShutdown {
  private readonly logger: StructuredLogger = new NestStructuredLogger(ScanQueueDrainLoop.name);
  private timer: NodeJS.Timeout | undefined;
  private currentTick: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    private readonly queue: InMemoryQueuePublisher,
    private readonly handler: ExecuteScanCommandHandler,
    @Inject(INGESTION_SCAN_FAILURE_QUEUE)
    private readonly retryQueue: ScanRetryQueuePort,
    @Inject(INGESTION_SCAN_QUEUE_DRAIN_LOOP_OPTIONS)
    private readonly options: IngestionScanQueueDrainLoopOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      this.logger.info('scan queue drain loop disabled', { worker: 'ingestion-worker' });
      return;
    }

    if (this.options.runOnStart) {
      await this.runTick('startup');
    }

    this.timer = setInterval(() => {
      void this.runTick('interval');
    }, this.options.intervalMs);

    this.logger.info('scan queue drain loop started', {
      intervalMs: this.options.intervalMs,
      limit: this.options.limit,
      worker: 'ingestion-worker',
    });
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.shuttingDown = true;

    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await this.currentTick;
    this.logger.info('scan queue drain loop stopped', { signal, worker: 'ingestion-worker' });
  }

  private async runTick(trigger: 'startup' | 'interval'): Promise<void> {
    if (this.shuttingDown || this.currentTick !== undefined) {
      return;
    }

    this.currentTick = this.executeTick(trigger).finally(() => {
      this.currentTick = undefined;
    });
    await this.currentTick;
  }

  private async executeTick(trigger: 'startup' | 'interval'): Promise<void> {
    const { commands, primaryCount, retryCount } = await this.drainExecutableCommands();
    let completed = 0;
    let failed = 0;

    for (const command of commands) {
      try {
        await this.handler.handle(command);
        completed += 1;
      } catch (error) {
        failed += 1;
        this.logger.error('scan queue drain loop item failed', {
          commandId: command.commandId,
          trigger,
          error: error instanceof Error ? error.message : String(error),
          worker: 'ingestion-worker',
        });
      }
    }

    this.logger.info('scan queue drain loop tick completed', {
      trigger,
      evaluated: commands.length,
      primary: primaryCount,
      retry: retryCount,
      completed,
      failed,
      worker: 'ingestion-worker',
    });
  }

  private async drainExecutableCommands(): Promise<{
    readonly commands: readonly QueueCommandEnvelope<Readonly<Record<string, unknown>>>[];
    readonly primaryCount: number;
    readonly retryCount: number;
  }> {
    const primaryLimit = Math.max(1, Math.ceil(this.options.limit / 2));
    const primary = this.queue.drain({
      commandType: 'ingestion.scan.execute',
      limit: primaryLimit,
    });
    const retryLimit = this.options.limit - primary.length;
    const retries = retryLimit > 0
      ? await this.retryQueue.drainRetries({ limit: retryLimit })
      : [];
    const spareLimit = this.options.limit - primary.length - retries.length;
    const extraPrimary = spareLimit > 0
      ? this.queue.drain({
          commandType: 'ingestion.scan.execute',
          limit: spareLimit,
        })
      : [];

    return {
      commands: [
        ...primary,
        ...retries.map(retryToQueueCommand),
        ...extraPrimary,
      ],
      primaryCount: primary.length + extraPrimary.length,
      retryCount: retries.length,
    };
  }
}

const retryToQueueCommand = (
  command: RetryScanCommand,
): QueueCommandEnvelope<Readonly<Record<string, unknown>>> => ({
  commandId: `${command.scanJobId}:retry:${command.nextAttemptNumber}`,
  commandType: 'ingestion.scan.execute',
  schemaVersion: 1,
  correlationId: command.correlationId,
  causationId: command.causationId,
  payload: {
    tenantId: command.tenantId,
    workspaceId: command.workspaceId,
    scanJobId: command.scanJobId,
    topicId: command.topicId,
    sourceBindingId: command.sourceBindingId,
    scanPolicyId: command.scanPolicyId,
    providerKey: command.providerKey,
    sourceQuery: command.sourceQuery,
    attemptNumber: command.nextAttemptNumber,
    retryBudget: command.retryBudget,
  },
});
