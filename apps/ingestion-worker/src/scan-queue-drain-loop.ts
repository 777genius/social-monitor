import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import { QueueDeliveryBatch, queueCommandDeliveryLagSeconds } from '@social-monitor/platform-queue';
import { classifyWorkerRuntimeFailure } from '@social-monitor/platform-worker';
import { ExecuteScanCommandHandler } from '@social-monitor/ingestion/interfaces/queue/execute-scan-command.handler';
import type { ScanRetryQueuePort } from '@social-monitor/ingestion/ports';
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
import { ScanRetryDeliveryBatch, SCAN_RETRY_VISIBILITY_SECONDS } from './scan-retry-delivery-batch';
import { decideFailedScanDeliveryAction } from './scan-delivery-settlement-policy';

@Injectable()
export class ScanQueueDrainLoop implements OnModuleInit, OnModuleDestroy {
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

  async onModuleDestroy(): Promise<void> {
    if (this.shuttingDown) {
      await this.currentTick;
      return;
    }
    this.shuttingDown = true;

    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    try {
      await this.currentTick;
    } catch (error) {
      this.logger.error('scan queue drain failed while stopping; RabbitMQ will requeue unacknowledged deliveries on channel close', {
        error: error instanceof Error ? error.message : String(error),
        worker: 'ingestion-worker',
      });
    }
    this.logger.info('scan queue drain loop stopped', { worker: 'ingestion-worker' });
  }

  onApplicationShutdown(signal?: string): Promise<void> {
    void signal;
    return this.onModuleDestroy();
  }

  private async runTick(trigger: 'startup' | 'interval'): Promise<void> {
    if (this.shuttingDown || this.currentTick !== undefined) {
      return;
    }

    this.currentTick = this.executeTick(trigger).catch((error: unknown) => {
      // Startup remains fail-fast; a transient interval failure must not become
      // an unhandled rejection or prevent the next scheduled recovery attempt.
      if (trigger === 'startup') throw error;
      const failure = classifyWorkerRuntimeFailure(error);
      this.logger.error('queue drain loop tick failed', {
        trigger,
        error: failure.message,
        errorClassification: failure.classification,
        errorCode: failure.code,
        worker: 'ingestion-worker',
      });
    }).finally(() => {
      this.currentTick = undefined;
    });
    await this.currentTick;
  }

  private async executeTick(trigger: 'startup' | 'interval'): Promise<void> {
    const { deliveries, primaryCount, retryCount, retryBatch } = await this.drainExecutableCommands();
    let completed = 0;
    let failed = 0;
    let requeued = 0;
    const batch = new QueueDeliveryBatch(deliveries);

    try {
      for (const delivery of deliveries) {
        const { command } = delivery;
        if (this.shuttingDown || !retryBatch.owns(delivery)) {
          await batch.nack(delivery, { requeue: true });
          requeued += 1;
          continue;
        }
        this.recordDeliveryLag(delivery);
        let handlerFailed = false;
        let handlerError: unknown;
        try {
          await this.handler.handle(command);
        } catch (error) {
          handlerFailed = true;
          handlerError = error;
        }
        if (!handlerFailed) {
          await batch.ack(delivery);
          completed += 1;
          continue;
        }
        const action = decideFailedScanDeliveryAction(handlerError, this.shuttingDown);
        if (action === 'acknowledge') {
          await batch.ack(delivery);
          failed += 1;
          continue;
        }
        const requeue = action === 'requeue';
        await batch.nack(delivery, { requeue });
        if (requeue) {
          requeued += 1;
          continue;
        }
        failed += 1;
        const failure = classifyWorkerRuntimeFailure(handlerError);
        this.logger.error('scan queue drain loop item failed', {
          commandId: command.commandId, trigger,
          error: failure.message, errorClassification: failure.classification, errorCode: failure.code,
          redelivered: delivery.diagnostics.redelivered,
          deadLetterCount: delivery.diagnostics.deadLetterCount,
          deadLetterReason: delivery.diagnostics.deadLetterReason,
          deadLetterQueue: delivery.diagnostics.deadLetterQueue,
          worker: 'ingestion-worker',
        });
      }

      this.logger.info('scan queue drain loop tick completed', {
        trigger,
        evaluated: deliveries.length,
        primary: primaryCount,
        retry: retryCount,
        completed,
        failed,
        requeued,
        worker: 'ingestion-worker',
      });
    } finally {
      await retryBatch.stopRenewal();
      this.reportReleaseFailures(await batch.releaseUnsettled());
    }
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
    readonly retryBatch: ScanRetryDeliveryBatch;
  }> {
    const primaryLimit = Math.max(1, Math.ceil(this.options.limit / 2));
    const primary = await this.queue.drain({
      commandType: 'ingestion.scan.execute',
      limit: primaryLimit,
    });
    let retryBatch: ScanRetryDeliveryBatch | undefined;
    try {
      const retryLimit = this.options.limit - primary.length;
      const retries = retryLimit > 0
        ? await this.retryQueue.claimRetries({ limit: retryLimit, now: this.clock.now(),
            visibilityTimeoutSeconds: SCAN_RETRY_VISIBILITY_SECONDS })
        : [];
      retryBatch = new ScanRetryDeliveryBatch(retries, this.clock, this.logger);
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
          ...retryBatch.deliveries,
          ...extraPrimary,
        ],
        primaryCount: primary.length + extraPrimary.length,
        retryCount: retries.length,
        retryBatch,
      };
    } catch (error) {
      await this.releaseOnAbort(primary, retryBatch);
      throw error;
    }
  }

  private async releaseOnAbort(primary: readonly QueueCommandDelivery[], retryBatch?: ScanRetryDeliveryBatch): Promise<void> {
    const outcomes = await Promise.allSettled([
      new QueueDeliveryBatch(primary).releaseUnsettled(),
      ...(retryBatch === undefined ? [] : [retryBatch.releaseUnsettled()]),
    ]);
    const failures = outcomes.flatMap((outcome) => outcome.status === 'rejected'
      ? [outcome.reason as unknown]
      : outcome.value ?? []);
    this.reportReleaseFailures(failures);
  }

  private reportReleaseFailures(failures: readonly unknown[]): void {
    for (const error of failures) {
      const failure = classifyWorkerRuntimeFailure(error);
      this.logger.error('scan delivery release failed; reader recovery or retry claim expiry must recover it', {
        error: failure.message, errorClassification: failure.classification,
        errorCode: failure.code, worker: 'ingestion-worker',
      });
    }
  }
}
