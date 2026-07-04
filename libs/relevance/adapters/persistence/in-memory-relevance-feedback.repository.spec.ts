import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { RelevanceFeedbackSignal } from '../../domain';
import { InMemoryRelevanceFeedbackRepository } from './in-memory-relevance-feedback.repository';

describe('InMemoryRelevanceFeedbackRepository post rating projection', () => {
  it('returns the latest rating for a concrete post identity without mixing interests', async () => {
    const repository = new InMemoryRelevanceFeedbackRepository();
    const tenant = tenantId('tenant-post-rating-projection');
    const workspace = workspaceId('workspace-post-rating-projection');
    const userId = 'user-post-rating-projection';

    await repository.save(ratingSignal({
      id: 'rating-old',
      tenantId: tenant,
      workspaceId: workspace,
      userId,
      idempotencyKey: 'rating-feed-1-2',
      rating: 2,
      interestId: 'topic-ai',
      createdAt: new Date('2026-07-04T09:00:00.000Z'),
    }));
    await repository.save(ratingSignal({
      id: 'rating-new',
      tenantId: tenant,
      workspaceId: workspace,
      userId,
      idempotencyKey: 'rating-feed-1-5',
      rating: 5,
      interestId: 'topic-ai',
      createdAt: new Date('2026-07-04T10:00:00.000Z'),
    }));
    await repository.save(ratingSignal({
      id: 'rating-other-interest',
      tenantId: tenant,
      workspaceId: workspace,
      userId,
      idempotencyKey: 'rating-feed-1-other-interest',
      rating: 1,
      interestId: 'topic-crypto',
      createdAt: new Date('2026-07-04T11:00:00.000Z'),
    }));
    await repository.save(RelevanceFeedbackSignal.record({
      id: 'not-rating',
      tenantId: tenant,
      workspaceId: workspace,
      userId,
      idempotencyKey: 'feedback-feed-1',
      action: 'more_like_this',
      rating: 5,
      target: {
        feedItemId: 'feed-1',
        sourceItemId: 'source-1',
        interestId: 'topic-ai',
        providerKey: 'reddit',
        title: 'Not a post rating',
      },
      createdAt: new Date('2026-07-04T12:00:00.000Z'),
    }));

    const ratings = await repository.listLatestByTargets({
      tenantId: tenant,
      workspaceId: workspace,
      userId,
      targets: [
        {
          feedItemId: 'feed-1',
          sourceItemId: 'source-1',
          interestId: 'topic-ai',
        },
      ],
    });

    expect(ratings).toHaveLength(1);
    expect(ratings[0]).toEqual(expect.objectContaining({
      feedbackId: 'rating-new',
      rating: 5,
      learningEffect: 'positive',
    }));
  });
});

const ratingSignal = (props: {
  readonly id: string;
  readonly tenantId: ReturnType<typeof tenantId>;
  readonly workspaceId: ReturnType<typeof workspaceId>;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly rating: number;
  readonly interestId: string;
  readonly createdAt: Date;
}): RelevanceFeedbackSignal =>
  RelevanceFeedbackSignal.record({
    id: props.id,
    tenantId: props.tenantId,
    workspaceId: props.workspaceId,
    userId: props.userId,
    idempotencyKey: props.idempotencyKey,
    action: 'rate_post',
    rating: props.rating,
    target: {
      feedItemId: 'feed-1',
      sourceItemId: 'source-1',
      interestId: props.interestId,
      providerKey: 'reddit',
      title: 'Operators discuss AI agent monitoring',
    },
    createdAt: props.createdAt,
  });
