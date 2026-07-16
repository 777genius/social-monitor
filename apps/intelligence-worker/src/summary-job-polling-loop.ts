import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import { WorkerCommandIdFactory } from '@social-monitor/platform-worker';
import { ExecuteSummaryJobCommandHandler } from '@social-monitor/summary/interfaces/queue/execute-summary-job-command.handler';
import { SUMMARY_JOB_REPOSITORY } from '@social-monitor/summary/interfaces/rest/summary-provider-tokens';
import type { SummaryJobRepositoryPort } from '@social-monitor/summary/ports';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  INTELLIGENCE_SUMMARY_JOB_LOOP_OPTIONS,
  type IntelligenceSummaryJobLoopOptions,
} from './intelligence-worker-provider-tokens';

@Injectable()
export class SummaryJobPollingLoop implements OnModuleInit, OnModuleDestroy {
  private readonly logger: StructuredLogger = new NestStructuredLogger(SummaryJobPollingLoop.name);
  private timer: NodeJS.Timeout | undefined;
  private currentTick: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    private readonly handler: ExecuteSummaryJobCommandHandler,
    @Inject(SUMMARY_JOB_REPOSITORY)
    private readonly summaryJobs: SummaryJobRepositoryPort,
    @Inject(INTELLIGENCE_SUMMARY_JOB_LOOP_OPTIONS)
    private readonly options: IntelligenceSummaryJobLoopOptions,
    private readonly commandIds: WorkerCommandIdFactory = WorkerCommandIdFactory.system(),
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      this.logger.info('summary job polling loop disabled', { worker: 'intelligence-worker' });
      return;
    }

    if (this.options.runOnStart) {
      await this.runTick('startup');
    }

    this.timer = setInterval(() => {
      void this.runTick('interval');
    }, this.options.intervalMs);

    this.logger.info('summary job polling loop started', {
      intervalMs: this.options.intervalMs,
      limit: this.options.limit,
      scoped: this.options.tenantId !== undefined,
      worker: 'intelligence-worker',
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

    await this.currentTick;
    this.logger.info('summary job polling loop stopped', { worker: 'intelligence-worker' });
  }

  onApplicationShutdown(signal?: string): Promise<void> {
    void signal;
    return this.onModuleDestroy();
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
      const jobs = await this.summaryJobs.findRequested({
        limit: this.options.limit,
        ...(this.options.tenantId === undefined
          ? {}
          : {
              tenantId: tenantId(this.options.tenantId),
              workspaceId: workspaceId(this.options.workspaceId ?? ''),
            }),
      });
      let completed = 0;
      let failed = 0;

      for (const job of jobs) {
        const snapshot = job.toSnapshot();

        try {
          await this.handler.handle({
            commandId: this.commandIds.next('summary-job-poller', [snapshot.id]),
            commandType: 'summary.job.execute',
            schemaVersion: 1,
            correlationId: this.commandIds.next('summary-job-poller', [trigger]),
            payload: {
              tenantId: snapshot.tenantId,
              workspaceId: snapshot.workspaceId,
              summaryJobId: snapshot.id,
            },
          });
          completed += 1;
        } catch (error) {
          failed += 1;
          this.logger.error('summary job polling loop item failed', {
            summaryJobId: snapshot.id,
            trigger,
            error: error instanceof Error ? error.message : String(error),
            worker: 'intelligence-worker',
          });
        }
      }

      this.logger.info('summary job polling loop tick completed', {
        trigger,
        evaluated: jobs.length,
        completed,
        failed,
        worker: 'intelligence-worker',
      });
    } catch (error) {
      this.logger.error('summary job polling loop tick failed', {
        trigger,
        error: error instanceof Error ? error.message : String(error),
        worker: 'intelligence-worker',
      });
    }
  }
}
