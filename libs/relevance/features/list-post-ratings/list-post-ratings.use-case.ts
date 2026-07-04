import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import { normalizePostRatingTarget, postRatingTargetKey } from '../../domain';
import type { PostRatingProjectionPort } from '../../ports';
import { presentPostRating } from '../shared/relevance-presenter';
import type { ListPostRatingsQuery } from './list-post-ratings.query';
import type { ListPostRatingsResult } from './list-post-ratings.result';

type ListPostRatingsFailure = DomainError | Error;

const maxPostRatingTargets = 100;

export class ListPostRatingsUseCase {
  constructor(private readonly ratings: PostRatingProjectionPort) {}

  async execute(
    query: ListPostRatingsQuery,
  ): Promise<Result<ListPostRatingsResult, ListPostRatingsFailure>> {
    const userId = query.userId.trim();

    if (userId.length === 0) {
      return err(new DomainError('validation.failed', 'Post ratings userId must be non-empty'));
    }

    if (query.targets.length === 0) {
      return ok({ ratings: [] });
    }

    if (query.targets.length > maxPostRatingTargets) {
      return err(new DomainError('validation.failed', 'Post rating target batch is too large'));
    }

    try {
      const targetsByKey = new Map(
        query.targets.map((target) => {
          const normalized = normalizePostRatingTarget(target);

          return [postRatingTargetKey(normalized), normalized] as const;
        }),
      );

      const ratings = await this.ratings.listLatestByTargets({
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        userId,
        targets: [...targetsByKey.values()],
      });

      return ok({
        ratings: ratings.map(presentPostRating),
      });
    } catch (error: unknown) {
      return err(toListPostRatingsFailure(error));
    }
  }
}

const toListPostRatingsFailure = (error: unknown): ListPostRatingsFailure => {
  if (error instanceof DomainError) {
    return error;
  }

  if (error instanceof Error) {
    return new DomainError('validation.failed', error.message);
  }

  return new Error('Post ratings lookup failed');
};
