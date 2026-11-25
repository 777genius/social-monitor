import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ScheduleDueDigestsCommandHandler } from '@social-monitor/delivery/interfaces/queue/schedule-due-digests-command.handler';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import { WorkerCommandIdFactory } from '@social-monitor/platform-worker';

import {
  DELIVERY_DIGEST_SCHEDULER_LOOP_OPTIONS,
  type DeliveryDigestSchedulerLoopOptions,
} from './delivery-service-provider-tokens';

@Injectable()
export class DigestSchedulerLoop implements OnModuleInit, OnModuleDestroy {
  private readonly logger: StructuredLogger = new NestStructuredLogger(DigestSchedulerLoop.name);
  private timer: NodeJS.Timeout | undefined;
  private currentTick: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    private readonly handler: ScheduleDueDigestsCommandHandler,
    @Inject(DELIVERY_DIGEST_SCHEDULER_LOOP_OPTIONS)
    private readonly options: DeliveryDigestSchedulerLoopOptions,
    private readonly commandIds: WorkerCommandIdFactory = WorkerCommandIdFactory.system(),
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      this.logger.info('digest scheduler loop disabled', { worker: 'delivery-service' });
      return;
    }

    if (this.options.runOnStart) {
      await this.runTick('startup');
    }

    this.timer = setInterval(() => {
      void this.runTick('interval');
    }, this.options.intervalMs);

    this.logger.info('digest scheduler loop started', {
      intervalMs: this.options.intervalMs,
      limit: this.options.limit,
      scoped: this.options.tenantId !== undefined,
      worker: 'delivery-service',
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
    this.logger.info('digest scheduler loop stopped', { worker: 'delivery-service' });
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
      const result = await this.handler.handle({
        commandId: this.commandIds.next('digest-scheduler'),
        commandType: 'delivery.digests.schedule_due',
        schemaVersion: 1,
        correlationId: this.commandIds.next('digest-scheduler', [trigger]),
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

      this.logger.info('digest scheduler tick completed', {
        trigger,
        evaluated: result.evaluated,
        assembled: result.assembled,
        skipped: result.skipped,
        worker: 'delivery-service',
      });
    } catch (error) {
      this.logger.error('digest scheduler tick failed', {
        trigger,
        error: error instanceof Error ? error.message : String(error),
        worker: 'delivery-service',
      });
    }
  }
}
