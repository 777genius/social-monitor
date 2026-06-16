import {
  type Clock,
  DomainError,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import type { DeliveryAttemptState } from '../../domain';
import type {
  DeliveryAttemptDispatchQueuePort,
  DeliveryAttemptRepositoryPort,
  DeliveryContent,
} from '../../ports';
import type { EnqueueDeliveryAttemptDispatchCommand } from './enqueue-delivery-attempt-dispatch.command';
import type { EnqueueDeliveryAttemptDispatchResult } from './enqueue-delivery-attempt-dispatch.result';

type EnqueueDeliveryAttemptDispatchFailure = DomainError | Error;

export class EnqueueDeliveryAttemptDispatchUseCase {
  constructor(
    private readonly deliveryAttempts: DeliveryAttemptRepositoryPort,
    private readonly dispatchQueue: DeliveryAttemptDispatchQueuePort,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: EnqueueDeliveryAttemptDispatchCommand,
  ): Promise<Result<EnqueueDeliveryAttemptDispatchResult, EnqueueDeliveryAttemptDispatchFailure>> {
    if (command.deliveryAttemptId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Delivery attempt id must be non-empty'));
    }

    if (command.correlationId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Delivery dispatch correlation id must be non-empty'));
    }

    const attempt = await this.deliveryAttempts.findById(command);

    if (attempt === null) {
      return err(new DomainError('resource.not_found', 'Delivery attempt not found', {
        deliveryAttemptId: command.deliveryAttemptId,
      }));
    }

    const snapshot = attempt.toSnapshot();

    if (snapshot.state === 'assembling') {
      return ok({
        deliveryAttemptId: snapshot.id,
        state: snapshot.state,
        enqueued: false,
        reason: 'already_in_flight',
      });
    }

    if (!isDispatchable(snapshot.state)) {
      return ok({
        deliveryAttemptId: snapshot.id,
        state: snapshot.state,
        enqueued: false,
        reason: 'not_dispatchable',
      });
    }

    const queuedCommand = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      deliveryAttemptId: snapshot.id,
      content: defaultDeliveryContent(snapshot.resourceType, snapshot.resourceId),
      commandId: `delivery-attempt-dispatch:${snapshot.id}:${this.clock.now().getTime()}`,
      correlationId: command.correlationId,
      causationId: command.causationId,
    };

    if (!(await this.dispatchQueue.canAccept(queuedCommand))) {
      return err(new DomainError('operation.backpressure', 'Delivery attempt dispatch queue is full', {
        deliveryAttemptId: snapshot.id,
      }));
    }

    await this.dispatchQueue.enqueue(queuedCommand);

    const assemblingAttempt = attempt.markAssembling({ assemblingAt: this.clock.now() });
    await this.deliveryAttempts.save(assemblingAttempt);
    const assemblingSnapshot = assemblingAttempt.toSnapshot();

    return ok({
      deliveryAttemptId: assemblingSnapshot.id,
      state: assemblingSnapshot.state,
      enqueued: true,
    });
  }
}

const isDispatchable = (state: DeliveryAttemptState): boolean =>
  state === 'queued' || state === 'failed_retryable';

const defaultDeliveryContent = (
  resourceType: 'summary' | 'digest' | 'scan' | 'feed',
  resourceId: string,
): DeliveryContent => ({
  subject: `${resourceType} ready`,
  body: `Delivery resource ${resourceType}:${resourceId} is ready.`,
});
