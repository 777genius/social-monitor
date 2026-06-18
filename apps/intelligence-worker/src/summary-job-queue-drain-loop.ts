import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import { ExecuteSummaryJobCommandHandler } from '@social-monitor/summary/interfaces/queue/execute-summary-job-command.handler';

import {
  INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS,
  type IntelligenceSummaryQueueDrainLoopOptions,
} from './intelligence-worker-provider-tokens';
import {
  INTELLIGENCE_SUMMARY_JOB_QUEUE_READER,
  type SummaryJobQueueReaderPort,
} from './summary-job-queue-reader';

@Injectable()
export class SummaryJobQueueDrainLoop implements OnModuleInit, OnApplicationShutdown {
  private readonly logger: StructuredLogger = new NestStructuredLogger(SummaryJobQueueDrainLoop.name);
  private timer: NodeJS.Timeout | undefined;
  private currentTick: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    @Inject(INTELLIGENCE_SUMMARY_JOB_QUEUE_READER)
    private readonly queue: SummaryJobQueueReaderPort,
    private readonly handler: ExecuteSummaryJobCommandHandler,
    @Inject(INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP_OPTIONS)
    private readonly options: IntelligenceSummaryQueueDrainLoopOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      this.logger.info('summary queue drain loop disabled', { worker: 'intelligence-worker' });
      return;
    }

    if (this.options.runOnStart) {
      await this.runTick('startup');
    }

    this.timer = setInterval(() => {
      void this.runTick('interval');
    }, this.options.intervalMs);

    this.logger.info('summary queue drain loop started', {
      intervalMs: this.options.intervalMs,
      limit: this.options.limit,
      worker: 'intelligence-worker',
    });
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.shuttingDown = true;

    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await this.currentTick;
    this.logger.info('summary queue drain loop stopped', { signal, worker: 'intelligence-worker' });
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
    const deliveries = await this.queue.drain({
      commandType: 'summary.job.execute',
      limit: this.options.limit,
    });
    let completed = 0;
    let failed = 0;

    for (const delivery of deliveries) {
      const { command } = delivery;
      try {
        await this.handler.handle(command);
        await delivery.ack();
        completed += 1;
      } catch (error) {
        await delivery.nack({ requeue: false });
        failed += 1;
        this.logger.error('summary queue drain loop item failed', {
          commandId: command.commandId,
          trigger,
          error: error instanceof Error ? error.message : String(error),
          redelivered: delivery.diagnostics.redelivered,
          deadLetterCount: delivery.diagnostics.deadLetterCount,
          deadLetterReason: delivery.diagnostics.deadLetterReason,
          deadLetterQueue: delivery.diagnostics.deadLetterQueue,
          worker: 'intelligence-worker',
        });
      }
    }

    this.logger.info('summary queue drain loop tick completed', {
      trigger,
      evaluated: deliveries.length,
      completed,
      failed,
      worker: 'intelligence-worker',
    });
  }
}
