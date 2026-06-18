import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import { queueCommandDeliveryLagSeconds } from '@social-monitor/platform-queue';
import { ExecuteScanCommandHandler } from '@social-monitor/ingestion/interfaces/queue/execute-scan-command.handler';
import type { RetryScanCommand, ScanRetryQueuePort } from '@social-monitor/ingestion/ports';
import type { Clock } from '@social-monitor/shared-kernel';

import {
  INGESTION_SCAN_FAILURE_QUEUE,
  INGESTION_SCAN_QUEUE_DRAIN_LOOP_OPTIONS,
  type IngestionScanQueueDrainLoopOptions,
} from './ingestion-worker-provider-tokens';
import {
  INGESTION_SCAN_COMMAND_QUEUE_READER,
  type QueueCommandDelivery,
  type ScanCommandQueueReaderPort,
} from './scan-command-queue-reader';

@Injectable()
export class ScanQueueDrainLoop implements OnModuleInit, OnApplicationShutdown {
  private readonly logger: StructuredLogger = new NestStructuredLogger(ScanQueueDrainLoop.name);
  private timer: NodeJS.Timeout | undefined;
  private currentTick: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    @Inject(INGESTION_SCAN_COMMAND_QUEUE_READER)
    private readonly queue: ScanCommandQueueReaderPort,
    private readonly handler: ExecuteScanCommandHandler,
    @Inject(INGESTION_SCAN_FAILURE_QUEUE)
    private readonly retryQueue: ScanRetryQueuePort,
    @Inject(INGESTION_SCAN_QUEUE_DRAIN_LOOP_OPTIONS)
    private readonly options: IngestionScanQueueDrainLoopOptions,
    private readonly metrics: MetricsRecorderPort,
    private readonly clock: Clock,
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
    const { deliveries, primaryCount, retryCount } = await this.drainExecutableCommands();
    let completed = 0;
    let failed = 0;

    for (const delivery of deliveries) {
      const { command } = delivery;
      this.recordDeliveryLag(delivery);
      try {
        await this.handler.handle(command);
        await delivery.ack();
        completed += 1;
      } catch (error) {
        await delivery.nack({ requeue: false });
        failed += 1;
        this.logger.error('scan queue drain loop item failed', {
          commandId: command.commandId,
          trigger,
          error: error instanceof Error ? error.message : String(error),
          redelivered: delivery.diagnostics.redelivered,
          deadLetterCount: delivery.diagnostics.deadLetterCount,
          deadLetterReason: delivery.diagnostics.deadLetterReason,
          deadLetterQueue: delivery.diagnostics.deadLetterQueue,
          worker: 'ingestion-worker',
        });
      }
    }

    this.logger.info('scan queue drain loop tick completed', {
      trigger,
      evaluated: deliveries.length,
      primary: primaryCount,
      retry: retryCount,
      completed,
      failed,
      worker: 'ingestion-worker',
    });
  }

  private recordDeliveryLag(delivery: QueueCommandDelivery): void {
    const lagSeconds = queueCommandDeliveryLagSeconds(delivery.diagnostics, this.clock.now());

    if (lagSeconds === undefined) {
      return;
    }

    this.metrics.recordGauge({
      name: 'queue_command_delivery_lag_seconds',
      value: lagSeconds,
      labels: {
        command_type: delivery.command.commandType,
        queue: 'scan',
        worker: 'ingestion-worker',
      },
    });
  }

  private async drainExecutableCommands(): Promise<{
    readonly deliveries: readonly QueueCommandDelivery[];
    readonly primaryCount: number;
    readonly retryCount: number;
  }> {
    const primaryLimit = Math.max(1, Math.ceil(this.options.limit / 2));
    const primary = await this.queue.drain({
      commandType: 'ingestion.scan.execute',
      limit: primaryLimit,
    });
    const retryLimit = this.options.limit - primary.length;
    const retries = retryLimit > 0
      ? await this.retryQueue.drainRetries({ limit: retryLimit })
      : [];
    const spareLimit = this.options.limit - primary.length - retries.length;
    const extraPrimary = spareLimit > 0
      ? await this.queue.drain({
          commandType: 'ingestion.scan.execute',
          limit: spareLimit,
        })
      : [];

    return {
      deliveries: [
        ...primary,
        ...retries.map(retryToDelivery),
        ...extraPrimary,
      ],
      primaryCount: primary.length + extraPrimary.length,
      retryCount: retries.length,
    };
  }
}

const retryToDelivery = (
  command: RetryScanCommand,
): QueueCommandDelivery => ({
  command: {
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
  },
  diagnostics: {
    redelivered: false,
    deadLetterCount: 0,
  },
  ack: async () => undefined,
  nack: async () => undefined,
});
