import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { SummaryArtifactRepositoryPort } from '../../ports';
import { presentSummaryArtifact } from '../shared/summary-artifact-presenter';
import type { ListSummariesQuery } from './list-summaries.query';
import type { ListSummariesResult } from './list-summaries.result';

type ListSummariesFailure = DomainError;

const MAX_LIMIT = 100;

export class ListSummariesUseCase {
  constructor(private readonly summaries: SummaryArtifactRepositoryPort) {}

  async execute(query: ListSummariesQuery): Promise<Result<ListSummariesResult, ListSummariesFailure>> {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > MAX_LIMIT) {
      return err(new DomainError('validation.failed', 'Summary page limit must be between 1 and 100', {
        limit: query.limit,
      }));
    }

    if (query.topicId !== undefined && query.topicId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Summary topic filter must be non-empty'));
    }

    const result = await this.summaries.list(query);

    return ok({
      items: result.items.map(presentSummaryArtifact),
      nextCursor: result.nextCursor,
    });
  }
}
