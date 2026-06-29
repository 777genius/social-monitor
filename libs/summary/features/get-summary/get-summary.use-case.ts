import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { SummaryArtifactRepositoryPort, SummaryFreshnessPort } from '../../ports';
import { presentSummaryArtifact } from '../shared/summary-artifact-presenter';
import type { GetSummaryQuery } from './get-summary.query';
import type { GetSummaryResult } from './get-summary.result';

type GetSummaryFailure = DomainError;

export class GetSummaryUseCase {
  constructor(
    private readonly summaries: SummaryArtifactRepositoryPort,
    private readonly freshness: SummaryFreshnessPort,
  ) {}

  async execute(query: GetSummaryQuery): Promise<Result<GetSummaryResult, GetSummaryFailure>> {
    if (query.summaryId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Summary id must be non-empty'));
    }

    const summary = await this.summaries.findById(query);

    if (summary === null) {
      return err(new DomainError('resource.not_found', 'Summary not found', { summaryId: query.summaryId }));
    }

    const snapshot = summary.toSnapshot();
    const freshness = await this.freshness.evaluate({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      interestId: snapshot.interestId,
      sourceWindow: snapshot.sourceWindow,
    });

    return ok(presentSummaryArtifact(summary, freshness));
  }
}
