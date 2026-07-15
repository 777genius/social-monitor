import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import { queueCommandDeliveryLagSeconds } from '@social-monitor/platform-queue';
import { SendDeliveryAttemptCommandHandler } from '@social-monitor/delivery/interfaces/queue/send-delivery-attempt-command.handler';
import { DomainError, type Clock } from '@social-monitor/shared-kernel';

import {
  DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP_OPTIONS,
  type DeliveryAttemptQueueDrainLoopOptions,
} from './delivery-service-provider-tokens';
import {
  DELIVERY_ATTEMPT_COMMAND_QUEUE_READER,
  type DeliveryAttemptQueueReaderPort,
} from './delivery-attempt-queue-reader';

@Injectable()
export class DeliveryAttemptQueueDrainLoop implements OnModuleInit, OnModuleDestroy {
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
      this.logger.error('delivery attempt queue drain failed while stopping; RabbitMQ will requeue unacknowledged deliveries on channel close', {
        error: error instanceof Error ? error.message : String(error),
        worker: 'delivery-service',
      });
    }
    this.logger.info('delivery attempt queue drain loop stopped', { worker: 'delivery-service' });
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
    const deliveries = await this.queue.drain({
      commandType: 'delivery.attempt.send',
      limit: this.options.limit,
    });
    let completed = 0;
    let failed = 0;
    let requeued = 0;

    for (const delivery of deliveries) {
      const { command } = delivery;
      if (this.shuttingDown) {
        await delivery.nack({ requeue: true });
        requeued += 1;
        continue;
      }
      this.recordDeliveryLag(delivery);
      try {
        await this.handler.handle(command);
        await delivery.ack();
        completed += 1;
      } catch (error) {
        const requeue =
          this.shuttingDown ||
          (error instanceof DomainError &&
            error.code === 'operation.backpressure');
        await delivery.nack({ requeue });
        if (requeue) {
          requeued += 1;
          continue;
        }
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
      requeued,
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
