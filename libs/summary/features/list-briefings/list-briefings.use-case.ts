import {
  DomainError,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { assertBriefingScope } from '../../domain';
import type {
  BriefingArtifactRepositoryPort,
  BriefingFreshnessProbePort,
} from '../../ports';
import { presentBriefingArtifact } from '../shared/briefing-artifact-presenter';
import type { ListBriefingsQuery } from './list-briefings.query';
import type { ListBriefingsResult } from './list-briefings.result';

type ListBriefingsFailure = DomainError;

const MAX_LIMIT = 100;

export class ListBriefingsUseCase {
  constructor(
    private readonly briefings: BriefingArtifactRepositoryPort,
    private readonly freshness: BriefingFreshnessProbePort,
  ) {}

  async execute(
    query: ListBriefingsQuery,
  ): Promise<Result<ListBriefingsResult, ListBriefingsFailure>> {
    if (
      !Number.isInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > MAX_LIMIT
    ) {
      return err(
        new DomainError(
          'validation.failed',
          'Briefing page limit must be between 1 and 100',
          {
            limit: query.limit,
          },
        ),
      );
    }

    if (query.scope !== undefined) {
      try {
        assertBriefingScope(query.scope);
      } catch (error) {
        return err(
          new DomainError(
            'validation.failed',
            error instanceof Error ? error.message : 'Invalid summary scope',
          ),
        );
      }
    }

    const result = await this.briefings.list(query);
    const items = await Promise.all(
      result.items.map(async (briefing) => {
        const snapshot = briefing.toSnapshot();
        const freshness = await this.freshness.evaluate({
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          scope: snapshot.scope,
          sourceWindow: snapshot.sourceWindow,
        });

        return presentBriefingArtifact(briefing, freshness);
      }),
    );

    return ok({
      items,
      nextCursor: result.nextCursor,
    });
  }
}
