import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { DeliveryAttemptRepositoryPort } from '../../ports';
import { presentDeliveryAttempt } from '../shared/delivery-attempt-presenter';
import type { GetDeliveryAttemptQuery } from './get-delivery-attempt.query';
import type { GetDeliveryAttemptResult } from './get-delivery-attempt.result';

type GetDeliveryAttemptFailure = DomainError;

export class GetDeliveryAttemptUseCase {
  constructor(private readonly deliveryAttempts: DeliveryAttemptRepositoryPort) {}

  async execute(query: GetDeliveryAttemptQuery): Promise<Result<GetDeliveryAttemptResult, GetDeliveryAttemptFailure>> {
    if (query.deliveryAttemptId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Delivery attempt id must be non-empty'));
    }

    const attempt = await this.deliveryAttempts.findById(query);

    if (attempt === null) {
      return err(new DomainError('resource.not_found', 'Delivery attempt not found', {
        deliveryAttemptId: query.deliveryAttemptId,
      }));
    }

    return ok(presentDeliveryAttempt(attempt));
  }
}
