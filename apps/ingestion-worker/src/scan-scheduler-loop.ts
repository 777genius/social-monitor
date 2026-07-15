import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import { WorkerCommandIdFactory } from '@social-monitor/platform-worker';

import { ScheduleDueScansCommandHandler } from '@social-monitor/monitoring/interfaces/queue/schedule-due-scans-command.handler';

import {
  INGESTION_SCAN_SCHEDULER_LOOP_OPTIONS,
  type IngestionScanSchedulerLoopOptions,
} from './ingestion-worker-provider-tokens';

@Injectable()
export class ScanSchedulerLoop implements OnModuleInit, OnApplicationShutdown {
  private readonly logger: StructuredLogger = new NestStructuredLogger(ScanSchedulerLoop.name);
  private timer: NodeJS.Timeout | undefined;
  private currentTick: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    private readonly handler: ScheduleDueScansCommandHandler,
    @Inject(INGESTION_SCAN_SCHEDULER_LOOP_OPTIONS)
    private readonly options: IngestionScanSchedulerLoopOptions,
    private readonly commandIds: WorkerCommandIdFactory = WorkerCommandIdFactory.system(),
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      this.logger.info('scan scheduler loop disabled', { worker: 'ingestion-worker' });
      return;
    }

    if (this.options.runOnStart) {
      await this.runTick('startup');
    }

    this.timer = setInterval(() => {
      void this.runTick('interval');
    }, this.options.intervalMs);

    this.logger.info('scan scheduler loop started', {
      intervalMs: this.options.intervalMs,
      limit: this.options.limit,
      scoped: this.options.tenantId !== undefined,
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
    this.logger.info('scan scheduler loop stopped', { signal, worker: 'ingestion-worker' });
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
    try {
      const result = await this.handler.handle({
        commandId: this.commandIds.next('scan-scheduler'),
        commandType: 'monitoring.scans.schedule_due',
        schemaVersion: 1,
        correlationId: this.commandIds.next('scan-scheduler', [trigger]),
        payload: {
          limit: this.options.limit,
          ...(this.options.tenantId === undefined
            ? {}
            : {
                tenantId: this.options.tenantId,
                workspaceId: this.options.workspaceId,
              }),
        },
      });

      this.logger.info('scan scheduler tick completed', {
        trigger,
        evaluated: result.evaluated,
        enqueued: result.enqueued,
        skipped: result.skipped,
        skippedActiveScan: result.skippedByReason.active_scan,
        skippedDuplicateWindow: result.skippedByReason.duplicate_window,
        skippedFreshSuccess: result.skippedByReason.fresh_success,
        skippedProviderFailureBackoff: result.skippedByReason.provider_failure_backoff,
        skippedQueueBackpressure: result.skippedByReason.queue_backpressure,
        skippedRateLimitBackoff: result.skippedByReason.rate_limit_backoff,
        skippedSourceUnavailable: result.skippedByReason.source_unavailable,
        worker: 'ingestion-worker',
      });
    } catch (error) {
      this.logger.error('scan scheduler tick failed', {
        trigger,
        error: error instanceof Error ? error.message : String(error),
        worker: 'ingestion-worker',
      });
    }
  }
}
