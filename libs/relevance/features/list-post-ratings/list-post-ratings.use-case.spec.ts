import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { PostRating, PostRatingTarget } from '../../domain';
import type { PostRatingProjectionPort } from '../../ports';
import { ListPostRatingsUseCase } from './list-post-ratings.use-case';

describe('ListPostRatingsUseCase', () => {
  it('deduplicates targets and returns latest post rating views', async () => {
    const projection = new FakePostRatingProjection([
      {
        feedbackId: 'rating-1',
        userId: 'user-ratings',
        rating: 3,
        learningEffect: 'neutral',
        target: {
          feedItemId: 'feed-1',
          sourceItemId: 'source-1',
          interestId: 'topic-ai',
        },
        ratedAt: new Date('2026-07-04T10:00:00.000Z'),
      },
    ]);
    const useCase = new ListPostRatingsUseCase(projection);

    const result = await useCase.execute({
      tenantId: tenantId('tenant-ratings'),
      workspaceId: workspaceId('workspace-ratings'),
      userId: 'user-ratings',
      targets: [
        {
          feedItemId: 'feed-1',
          sourceItemId: 'source-1',
          interestId: 'topic-ai',
        },
        {
          feedItemId: 'feed-1',
          sourceItemId: 'source-1',
          interestId: 'topic-ai',
        },
      ],
    });

    expect(projection.lastTargets).toHaveLength(1);
    expect(result.ok && result.value.ratings).toEqual([
      expect.objectContaining({
        feedbackId: 'rating-1',
        rating: 3,
        learningEffect: 'neutral',
        ratedAt: '2026-07-04T10:00:00.000Z',
      }),
    ]);
  });

  it('rejects targets without a concrete post identity', async () => {
    const useCase = new ListPostRatingsUseCase(new FakePostRatingProjection([]));

    const result = await useCase.execute({
      tenantId: tenantId('tenant-ratings-invalid'),
      workspaceId: workspaceId('workspace-ratings-invalid'),
      userId: 'user-ratings',
      targets: [
        {
          interestId: 'topic-ai',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.message).toContain(
      'requires feedItemId or sourceItemId',
    );
  });
});

class FakePostRatingProjection implements PostRatingProjectionPort {
  lastTargets: readonly PostRatingTarget[] = [];

  constructor(private readonly ratings: readonly PostRating[]) {}

  async listLatestByTargets(
    params: Parameters<PostRatingProjectionPort['listLatestByTargets']>[0],
  ): Promise<readonly PostRating[]> {
    this.lastTargets = params.targets;

    return this.ratings;
  }
}
