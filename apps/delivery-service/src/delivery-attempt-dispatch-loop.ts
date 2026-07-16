import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { NestStructuredLogger, type StructuredLogger } from '@social-monitor/platform-logging';
import { WorkerCommandIdFactory } from '@social-monitor/platform-worker';
import type { DeliveryAttemptProps } from '@social-monitor/delivery/domain';
import { EnqueueDeliveryAttemptDispatchUseCase } from '@social-monitor/delivery/features/enqueue-delivery-attempt-dispatch/enqueue-delivery-attempt-dispatch.use-case';
import { SendDeliveryAttemptCommandHandler } from '@social-monitor/delivery/interfaces/queue/send-delivery-attempt-command.handler';
import { DELIVERY_ATTEMPT_REPOSITORY } from '@social-monitor/delivery/interfaces/rest/delivery-provider-tokens';
import type { DeliveryAttemptRepositoryPort } from '@social-monitor/delivery/ports';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  DELIVERY_ATTEMPT_DISPATCH_LOOP_OPTIONS,
  type DeliveryAttemptDispatchLoopOptions,
} from './delivery-service-provider-tokens';

@Injectable()
export class DeliveryAttemptDispatchLoop implements OnModuleInit, OnModuleDestroy {
  private readonly logger: StructuredLogger = new NestStructuredLogger(DeliveryAttemptDispatchLoop.name);
  private timer: NodeJS.Timeout | undefined;
  private currentTick: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    private readonly handler: SendDeliveryAttemptCommandHandler,
    @Inject(DELIVERY_ATTEMPT_REPOSITORY)
    private readonly deliveryAttempts: DeliveryAttemptRepositoryPort,
    @Inject(DELIVERY_ATTEMPT_DISPATCH_LOOP_OPTIONS)
    private readonly options: DeliveryAttemptDispatchLoopOptions,
    private readonly enqueueDispatch?: EnqueueDeliveryAttemptDispatchUseCase,
    private readonly commandIds: WorkerCommandIdFactory = WorkerCommandIdFactory.system(),
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      this.logger.info('delivery attempt dispatch loop disabled', { worker: 'delivery-service' });
      return;
    }

    if (this.options.runOnStart) {
      await this.runTick('startup');
    }

    this.timer = setInterval(() => {
      void this.runTick('interval');
    }, this.options.intervalMs);

    this.logger.info('delivery attempt dispatch loop started', {
      intervalMs: this.options.intervalMs,
      limit: this.options.limit,
      target: this.options.target ?? 'direct',
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
    this.logger.info('delivery attempt dispatch loop stopped', { worker: 'delivery-service' });
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
      const attempts = await this.deliveryAttempts.findQueued({
        limit: this.options.limit,
        ...(this.options.tenantId === undefined
          ? {}
          : {
              tenantId: tenantId(this.options.tenantId),
              workspaceId: workspaceId(this.options.workspaceId ?? ''),
            }),
      });
      let dispatched = 0;
      let failed = 0;

      for (const attempt of attempts) {
        const snapshot = attempt.toSnapshot();

        try {
          if ((this.options.target ?? 'direct') === 'queue') {
            await this.enqueueQueuedAttempt(snapshot, trigger);
          } else {
            await this.handler.handle({
              commandId: this.commandIds.next('delivery-attempt-dispatch', [snapshot.id]),
              commandType: 'delivery.attempt.send',
              schemaVersion: 1,
              correlationId: this.commandIds.next('delivery-attempt-dispatch', [trigger]),
              payload: {
                tenantId: snapshot.tenantId,
                workspaceId: snapshot.workspaceId,
                deliveryAttemptId: snapshot.id,
                content: {
                  subject: `${snapshot.resourceType} ready`,
                  body: `Delivery resource ${snapshot.resourceType}:${snapshot.resourceId} is ready.`,
                },
              },
            });
          }
          dispatched += 1;
        } catch (error) {
          failed += 1;
          this.logger.error('delivery attempt dispatch loop item failed', {
            deliveryAttemptId: snapshot.id,
            trigger,
            error: error instanceof Error ? error.message : String(error),
            worker: 'delivery-service',
          });
        }
      }

      this.logger.info('delivery attempt dispatch loop tick completed', {
        trigger,
        evaluated: attempts.length,
        dispatched,
        failed,
        worker: 'delivery-service',
      });
    } catch (error) {
      this.logger.error('delivery attempt dispatch loop tick failed', {
        trigger,
        error: error instanceof Error ? error.message : String(error),
        worker: 'delivery-service',
      });
    }
  }

  private async enqueueQueuedAttempt(
    snapshot: DeliveryAttemptProps,
    trigger: 'startup' | 'interval',
  ): Promise<void> {
    if (this.enqueueDispatch === undefined) {
      throw new Error('Delivery attempt dispatch queue target requires EnqueueDeliveryAttemptDispatchUseCase');
    }

    const result = await this.enqueueDispatch.execute({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      deliveryAttemptId: snapshot.id,
      correlationId: this.commandIds.next('delivery-attempt-dispatch', [trigger]),
      causationId: `delivery-attempt-dispatch-loop:${snapshot.id}`,
    });

    if (!result.ok) {
      throw result.error;
    }
  }
}
