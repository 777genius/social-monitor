import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { DeliveryAttemptRepositoryPort } from '../../ports';
import { presentDeliveryAttempt } from '../shared/delivery-attempt-presenter';
import type { ListDeliveryAttemptsQuery } from './list-delivery-attempts.query';
import type { ListDeliveryAttemptsResult } from './list-delivery-attempts.result';

type ListDeliveryAttemptsFailure = DomainError;

export class ListDeliveryAttemptsUseCase {
  constructor(private readonly deliveryAttempts: DeliveryAttemptRepositoryPort) {}

  async execute(
    query: ListDeliveryAttemptsQuery,
  ): Promise<Result<ListDeliveryAttemptsResult, ListDeliveryAttemptsFailure>> {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) {
      return err(new DomainError('validation.failed', 'Delivery attempt list limit must be between 1 and 100'));
    }

    const result = await this.deliveryAttempts.list(query);

    return ok({
      attempts: result.attempts.map(presentDeliveryAttempt),
      nextCursor: result.nextCursor,
    });
  }
}
