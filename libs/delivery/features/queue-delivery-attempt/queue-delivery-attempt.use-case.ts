import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { DeliveryAttempt } from '../../domain';
import type { DeliveryAttemptRepositoryPort } from '../../ports';
import type { QueueDeliveryAttemptCommand } from './queue-delivery-attempt.command';
import type { QueueDeliveryAttemptResult } from './queue-delivery-attempt.result';

type QueueDeliveryAttemptFailure = DomainError | Error;

export class QueueDeliveryAttemptUseCase {
  constructor(
    private readonly deliveryAttempts: DeliveryAttemptRepositoryPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: QueueDeliveryAttemptCommand,
  ): Promise<Result<QueueDeliveryAttemptResult, QueueDeliveryAttemptFailure>> {
    if (command.idempotencyKey.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Delivery idempotency key must be non-empty'));
    }

    const existing = await this.deliveryAttempts.findByIdempotencyKey({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      idempotencyKey: command.idempotencyKey,
    });

    if (existing !== null) {
      const snapshot = existing.toSnapshot();

      return ok({
        deliveryAttemptId: snapshot.id,
        state: snapshot.state,
        created: false,
      });
    }

    const attempt = DeliveryAttempt.queue({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      idempotencyKey: command.idempotencyKey,
      channel: command.channel,
      recipientKey: command.recipientKey,
      resourceType: command.resourceType,
      resourceId: command.resourceId,
      queuedAt: this.clock.now(),
      maxRetries: command.maxRetries ?? 3,
    });
    await this.deliveryAttempts.save(attempt);
    const snapshot = attempt.toSnapshot();

    return ok({
      deliveryAttemptId: snapshot.id,
      state: snapshot.state,
      created: true,
    });
  }
}
