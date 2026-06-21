import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import { RequestCorrelationIdFactory } from '@social-monitor/platform-request-context';
import { ScheduleAutoSummariesUseCase } from '@social-monitor/summary/features/schedule-auto-summaries/schedule-auto-summaries.use-case';
import { SystemClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_OPTIONS,
  type IntelligenceAutoSummarySchedulerOptions,
} from './intelligence-worker-provider-tokens';

@Injectable()
export class AutoSummarySchedulerLoop implements OnModuleInit, OnApplicationShutdown {
  private readonly logger: StructuredLogger = new NestStructuredLogger(AutoSummarySchedulerLoop.name);
  private readonly correlationIds = new RequestCorrelationIdFactory();
  private readonly clock = new SystemClock();
  private timer: NodeJS.Timeout | undefined;
  private currentTick: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    private readonly scheduleAutoSummaries: ScheduleAutoSummariesUseCase,
    @Inject(INTELLIGENCE_AUTO_SUMMARY_SCHEDULER_OPTIONS)
    private readonly options: IntelligenceAutoSummarySchedulerOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      this.logger.info('auto-summary scheduler loop disabled', { worker: 'intelligence-worker' });
      return;
    }

    if (this.options.runOnStart) {
      await this.runTick('startup');
    }

    this.timer = setInterval(() => {
      void this.runTick('interval');
    }, this.options.intervalMs);

    this.logger.info('auto-summary scheduler loop started', {
      intervalMs: this.options.intervalMs,
      limit: this.options.limit,
      scoped: this.options.tenantId !== undefined,
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
    this.logger.info('auto-summary scheduler loop stopped', { signal, worker: 'intelligence-worker' });
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
      const result = await this.scheduleAutoSummaries.execute({
        limit: this.options.limit,
        correlationId: this.correlationIds.fromRequestId(`auto-summary-${trigger}`),
        latestFeedItemObservedBefore: new Date(this.clock.now().getTime() - this.options.minFeedAgeMs),
        ...(this.options.tenantId === undefined
          ? {}
          : {
              tenantId: tenantId(this.options.tenantId),
              workspaceId: workspaceId(this.options.workspaceId ?? ''),
            }),
      });

      if (!result.ok) {
        this.logger.error('auto-summary scheduler loop tick rejected', {
          trigger,
          error: result.error instanceof Error ? result.error.message : String(result.error),
          worker: 'intelligence-worker',
        });
        return;
      }

      this.logger.info('auto-summary scheduler loop tick completed', {
        trigger,
        evaluated: result.value.evaluated,
        scheduled: result.value.scheduled,
        existing: result.value.existing,
        failed: result.value.failed,
        worker: 'intelligence-worker',
      });
    } catch (error) {
      this.logger.error('auto-summary scheduler loop tick failed', {
        trigger,
        error: error instanceof Error ? error.message : String(error),
        worker: 'intelligence-worker',
      });
    }
  }
}
