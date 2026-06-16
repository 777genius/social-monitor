import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue';
import { ExecuteScanCommandHandler } from '@social-monitor/ingestion/interfaces/queue/execute-scan-command.handler';

import {
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
    const commands = this.queue.drain({
      commandType: 'ingestion.scan.execute',
      limit: this.options.limit,
    });
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
      completed,
      failed,
      worker: 'ingestion-worker',
    });
  }
}
