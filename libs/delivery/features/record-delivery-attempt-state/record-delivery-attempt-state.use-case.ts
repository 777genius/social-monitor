import { type Clock, DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { DeliveryAttempt } from '../../domain';
import type { DeliveryAttemptRepositoryPort } from '../../ports';
import { presentDeliveryAttempt } from '../shared/delivery-attempt-presenter';
import type { RecordDeliveryAttemptStateCommand } from './record-delivery-attempt-state.command';
import type { RecordDeliveryAttemptStateResult } from './record-delivery-attempt-state.result';

type RecordDeliveryAttemptStateFailure = DomainError | Error;

export class RecordDeliveryAttemptStateUseCase {
  constructor(
    private readonly deliveryAttempts: DeliveryAttemptRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: RecordDeliveryAttemptStateCommand,
  ): Promise<Result<RecordDeliveryAttemptStateResult, RecordDeliveryAttemptStateFailure>> {
    if (command.deliveryAttemptId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Delivery attempt id must be non-empty'));
    }

    const attempt = await this.deliveryAttempts.findById(command);

    if (attempt === null) {
      return err(new DomainError('resource.not_found', 'Delivery attempt not found', {
        deliveryAttemptId: command.deliveryAttemptId,
      }));
    }

    const nextAttempt = this.transition(attempt, command);
    await this.deliveryAttempts.save(nextAttempt);

    return ok(presentDeliveryAttempt(nextAttempt));
  }

  private transition(attempt: DeliveryAttempt, command: RecordDeliveryAttemptStateCommand): DeliveryAttempt {
    const now = this.clock.now();

    switch (command.nextState) {
      case 'assembling':
        return attempt.markAssembling({ assemblingAt: now });
      case 'sending':
        return attempt.markSending({ sendingAt: now });
      case 'delivered':
        return attempt.markDelivered({ deliveredAt: now });
      case 'failed_retryable':
      case 'failed_terminal':
        return attempt.fail({
          failedAt: now,
          failureReason: command.reason ?? 'Delivery attempt failed',
        });
      case 'dead_lettered':
        return attempt.deadLetter({
          deadLetteredAt: now,
          failureReason: command.reason ?? 'Delivery retry budget exhausted',
        });
      case 'suppressed':
        return attempt.suppress({
          suppressedAt: now,
          suppressionReason: command.reason ?? 'Delivery suppressed by policy',
        });
      case 'cancelled':
        return attempt.cancel({
          cancelledAt: now,
          failureReason: command.reason ?? 'Delivery cancelled',
        });
    }
  }
}
