import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { DeliveryAttemptRepositoryPort } from '../../ports';
import type { SendDeliveryAttemptUseCase } from '../send-delivery-attempt/send-delivery-attempt.use-case';
import type { RetryDeliveryAttemptCommand } from './retry-delivery-attempt.command';
import type { RetryDeliveryAttemptResult } from './retry-delivery-attempt.result';

type RetryDeliveryAttemptFailure = DomainError | Error;

export class RetryDeliveryAttemptUseCase {
  constructor(
    private readonly deliveryAttempts: DeliveryAttemptRepositoryPort,
    private readonly sendDeliveryAttempt: SendDeliveryAttemptUseCase,
  ) {}

  async execute(
    command: RetryDeliveryAttemptCommand,
  ): Promise<Result<RetryDeliveryAttemptResult, RetryDeliveryAttemptFailure>> {
    if (command.deliveryAttemptId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Delivery attempt id must be non-empty'));
    }

    const attempt = await this.deliveryAttempts.findById(command);

    if (attempt === null) {
      return err(new DomainError('resource.not_found', 'Delivery attempt not found', {
        deliveryAttemptId: command.deliveryAttemptId,
      }));
    }

    const snapshot = attempt.toSnapshot();

    if (snapshot.state !== 'failed_retryable') {
      return err(new DomainError('operation.conflict', 'Only retryable failed delivery attempts can be retried', {
        deliveryAttemptId: command.deliveryAttemptId,
        state: snapshot.state,
      }));
    }

    const sent = await this.sendDeliveryAttempt.execute(command);

    if (!sent.ok) {
      return err(sent.error);
    }

    return ok(sent.value);
  }
}
