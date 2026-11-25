import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { InterestRepositoryPort } from '../../ports';
import { presentInterest } from '../shared/interest-presenter';
import type { ListInterestsQuery } from './list-interests.query';
import type { ListInterestsResult } from './list-interests.result';

type ListInterestsFailure = DomainError;

export class ListInterestsUseCase {
  constructor(private readonly interests: InterestRepositoryPort) {}

  async execute(query: ListInterestsQuery): Promise<Result<ListInterestsResult, ListInterestsFailure>> {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) {
      return err(new DomainError('validation.failed', 'Interest list limit must be between 1 and 100'));
    }

    const result = await this.interests.list(query);

    return ok({
      interests: result.interests.map(presentInterest),
      nextCursor: result.nextCursor,
    });
  }
}
