import { type Clock, DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { DeliveryAttemptRepositoryPort } from '../../ports';
import { presentDeliveryAttempt } from '../shared/delivery-attempt-presenter';
import type { ApplyDeliverySuppressionCommand } from './apply-delivery-suppression.command';
import type { ApplyDeliverySuppressionResult } from './apply-delivery-suppression.result';

type ApplyDeliverySuppressionFailure = DomainError | Error;

export class ApplyDeliverySuppressionUseCase {
  constructor(
    private readonly deliveryAttempts: DeliveryAttemptRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: ApplyDeliverySuppressionCommand,
  ): Promise<Result<ApplyDeliverySuppressionResult, ApplyDeliverySuppressionFailure>> {
    const attempt = await this.deliveryAttempts.findById(command);

    if (attempt === null) {
      return err(new DomainError('resource.not_found', 'Delivery attempt not found', {
        deliveryAttemptId: command.deliveryAttemptId,
      }));
    }

    const reason = suppressionReason(command);

    if (reason === null) {
      return ok({
        suppressed: false,
        attempt: presentDeliveryAttempt(attempt),
      });
    }

    const suppressedAttempt = attempt.suppress({
      suppressedAt: this.clock.now(),
      suppressionReason: reason,
    });
    await this.deliveryAttempts.save(suppressedAttempt);

    return ok({
      suppressed: true,
      attempt: presentDeliveryAttempt(suppressedAttempt),
    });
  }
}

const suppressionReason = (command: ApplyDeliverySuppressionCommand): string | null => {
  if (command.policy.repeatedFailureSuppressed) {
    return 'Repeated delivery failures are suppressed by policy';
  }

  if (command.resourceSignal === 'no_signal' && !command.policy.allowNoSignal) {
    return 'No-signal resource suppressed by preference';
  }

  if (command.policy.highSignalOnly && (command.resourceSignal === 'low' || command.resourceSignal === 'normal')) {
    return 'Resource signal below high-signal preference threshold';
  }

  return null;
};
