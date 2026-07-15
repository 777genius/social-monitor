import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import { OutboxDispatcher } from '@social-monitor/platform-events';

import {
  EVENT_RELAY_LOOP_OPTIONS,
  type EventRelayLoopOptions,
} from './event-relay-provider-tokens';

@Injectable()
export class OutboxRelayLoop implements OnModuleInit, OnModuleDestroy {
  private readonly logger: StructuredLogger = new NestStructuredLogger(OutboxRelayLoop.name);
  private timer: NodeJS.Timeout | undefined;
  private currentTick: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    private readonly dispatcher: OutboxDispatcher,
    @Inject(EVENT_RELAY_LOOP_OPTIONS)
    private readonly options: EventRelayLoopOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      this.logger.info('outbox relay loop disabled', { worker: 'event-relay' });
      return;
    }

    if (this.options.runOnStart) {
      await this.runTick('startup');
    }

    this.timer = setInterval(() => {
      void this.runTick('interval');
    }, this.options.intervalMs);

    this.logger.info('outbox relay loop started', {
      intervalMs: this.options.intervalMs,
      limit: this.options.limit,
      worker: 'event-relay',
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
    this.logger.info('outbox relay loop stopped', { worker: 'event-relay' });
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
      const result = await this.dispatcher.dispatchBatch(this.options.limit);
      this.logger.info('outbox relay loop tick completed', {
        trigger,
        published: result.published,
        failed: result.failed,
        worker: 'event-relay',
      });
    } catch (error) {
      this.logger.error('outbox relay loop tick failed', {
        trigger,
        error: error instanceof Error ? error.message : String(error),
        worker: 'event-relay',
      });
    }
  }
}
