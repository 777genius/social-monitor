import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { SummaryArtifactRepositoryPort, SummaryFeedbackRepositoryPort } from '../../ports';
import { presentSummaryFeedback } from '../shared/summary-feedback-presenter';
import type { ListSummaryFeedbackQuery } from './list-summary-feedback.query';
import type { ListSummaryFeedbackResult } from './list-summary-feedback.result';

type ListSummaryFeedbackFailure = DomainError;

const MAX_LIMIT = 100;

export class ListSummaryFeedbackUseCase {
  constructor(
    private readonly summaries: SummaryArtifactRepositoryPort,
    private readonly feedback: SummaryFeedbackRepositoryPort,
  ) {}

  async execute(
    query: ListSummaryFeedbackQuery,
  ): Promise<Result<ListSummaryFeedbackResult, ListSummaryFeedbackFailure>> {
    if (query.summaryId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Summary id must be non-empty'));
    }

    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > MAX_LIMIT) {
      return err(new DomainError('validation.failed', 'Summary feedback page limit must be between 1 and 100', {
        limit: query.limit,
      }));
    }

    const summary = await this.summaries.findById({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      summaryId: query.summaryId,
    });

    if (summary === null) {
      return err(new DomainError('resource.not_found', 'Summary not found', {
        summaryId: query.summaryId,
      }));
    }

    const result = await this.feedback.list(query);

    return ok({
      items: result.items.map(presentSummaryFeedback),
      nextCursor: result.nextCursor,
    });
  }
}
