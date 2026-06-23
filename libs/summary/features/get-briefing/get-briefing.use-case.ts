import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { BriefingArtifactRepositoryPort, BriefingFreshnessProbePort } from '../../ports';
import { presentBriefingArtifact } from '../shared/briefing-artifact-presenter';
import type { GetBriefingQuery } from './get-briefing.query';
import type { GetBriefingResult } from './get-briefing.result';

type GetBriefingFailure = DomainError;

export class GetBriefingUseCase {
  constructor(
    private readonly briefings: BriefingArtifactRepositoryPort,
    private readonly freshness: BriefingFreshnessProbePort,
  ) {}

  async execute(query: GetBriefingQuery): Promise<Result<GetBriefingResult, GetBriefingFailure>> {
    if (query.briefingId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Briefing id must be non-empty'));
    }

    const briefing = await this.briefings.findById(query);

    if (briefing === null) {
      return err(new DomainError('resource.not_found', 'Briefing not found', { briefingId: query.briefingId }));
    }

    const snapshot = briefing.toSnapshot();
    const freshness = await this.freshness.evaluate({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scope: snapshot.scope,
      sourceWindow: snapshot.sourceWindow,
    });

    return ok(presentBriefingArtifact(briefing, freshness));
  }
}
