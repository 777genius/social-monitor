import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import { queueCommandDeliveryLagSeconds } from '@social-monitor/platform-queue';
import { SendDeliveryAttemptCommandHandler } from '@social-monitor/delivery/interfaces/queue/send-delivery-attempt-command.handler';
import type { Clock } from '@social-monitor/shared-kernel';

import {
  DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP_OPTIONS,
  type DeliveryAttemptQueueDrainLoopOptions,
} from './delivery-service-provider-tokens';
import {
  DELIVERY_ATTEMPT_COMMAND_QUEUE_READER,
  type DeliveryAttemptQueueReaderPort,
} from './delivery-attempt-queue-reader';

@Injectable()
export class DeliveryAttemptQueueDrainLoop implements OnModuleInit, OnApplicationShutdown {
  private readonly logger: StructuredLogger = new NestStructuredLogger(DeliveryAttemptQueueDrainLoop.name);
  private timer: NodeJS.Timeout | undefined;
  private currentTick: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    @Inject(DELIVERY_ATTEMPT_COMMAND_QUEUE_READER)
    private readonly queue: DeliveryAttemptQueueReaderPort,
    private readonly handler: SendDeliveryAttemptCommandHandler,
    @Inject(DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP_OPTIONS)
    private readonly options: DeliveryAttemptQueueDrainLoopOptions,
    private readonly metrics: MetricsRecorderPort,
    private readonly clock: Clock,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      this.logger.info('delivery attempt queue drain loop disabled', { worker: 'delivery-service' });
      return;
    }

    if (this.options.runOnStart) {
      await this.runTick('startup');
    }

    this.timer = setInterval(() => {
      void this.runTick('interval');
    }, this.options.intervalMs);

    this.logger.info('delivery attempt queue drain loop started', {
      intervalMs: this.options.intervalMs,
      limit: this.options.limit,
      worker: 'delivery-service',
    });
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.shuttingDown = true;

    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await this.currentTick;
    this.logger.info('delivery attempt queue drain loop stopped', { signal, worker: 'delivery-service' });
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
      commandType: 'delivery.attempt.send',
      limit: this.options.limit,
    });
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
        this.logger.error('delivery attempt queue drain loop item failed', {
          commandId: command.commandId,
          trigger,
          error: error instanceof Error ? error.message : String(error),
          redelivered: delivery.diagnostics.redelivered,
          deadLetterCount: delivery.diagnostics.deadLetterCount,
          deadLetterReason: delivery.diagnostics.deadLetterReason,
          deadLetterQueue: delivery.diagnostics.deadLetterQueue,
          worker: 'delivery-service',
        });
      }
    }

    this.logger.info('delivery attempt queue drain loop tick completed', {
      trigger,
      evaluated: deliveries.length,
      completed,
      failed,
      worker: 'delivery-service',
    });
  }

  private recordDeliveryLag(delivery: Awaited<ReturnType<DeliveryAttemptQueueReaderPort['drain']>>[number]): void {
    const lagSeconds = queueCommandDeliveryLagSeconds(delivery.diagnostics, this.clock.now());

    if (lagSeconds === undefined) {
      return;
    }

    this.metrics.recordGauge({
      name: 'queue_command_delivery_lag_seconds',
      value: lagSeconds,
      labels: {
        command_type: delivery.command.commandType,
        queue: 'delivery',
        worker: 'delivery-service',
      },
    });
  }
}
