import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { PostRatingRecord } from '../../domain';
import type { PostRatingRepositoryPort } from '../../ports';
import { RecordPostRatingUseCase } from './record-post-rating.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `post-rating-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

describe('RecordPostRatingUseCase', () => {
  it.each([
    [1, 'negative'],
    [2, 'negative'],
    [3, 'neutral'],
    [4, 'positive'],
    [5, 'positive'],
  ] as const)('records %s-star post rating as %s without ranking learning', async (rating, effect) => {
    const repository = new FakePostRatingRepository();
    const useCase = new RecordPostRatingUseCase(
      repository,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-07-04T10:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-post-rating-record'),
      workspaceId: workspaceId('workspace-post-rating-record'),
      userId: 'user-post-rating-record',
      idempotencyKey: `rating-feed-1-${rating}`,
      rating,
      reason: rating <= 2 ? 'duplicate' : undefined,
      target: {
        feedItemId: 'feed-1',
        sourceItemId: 'source-1',
        interestId: 'topic-ai',
        providerKey: 'reddit',
        title: 'Operators discuss AI agent monitoring',
        bodyPreview: 'User rated this concrete post.',
        canonicalUrl: 'https://reddit.example/r/ai/comments/1',
      },
    });

    expect(result.ok && result.value).toEqual(expect.objectContaining({
      created: true,
      learningDirection: 'recorded',
    }));
    expect(result.ok && result.value.rating).toEqual(expect.objectContaining({
      rating,
      learningEffect: effect,
      ratedAt: '2026-07-04T10:00:00.000Z',
      reason: rating <= 2 ? 'duplicate' : undefined,
    }));
    expect(repository.records).toHaveLength(1);
  });

  it('requires a reason for 1-2 star post ratings', async () => {
    const repository = new FakePostRatingRepository();
    const useCase = new RecordPostRatingUseCase(
      repository,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-07-04T10:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-post-rating-reason-required'),
      workspaceId: workspaceId('workspace-post-rating-reason-required'),
      userId: 'user-post-rating-reason-required',
      idempotencyKey: 'rating-feed-1-1',
      rating: 1,
      target: {
        feedItemId: 'feed-1',
        interestId: 'topic-ai',
        providerKey: 'reddit',
        title: 'Low quality duplicate post',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.message).toContain(
      'reason is required',
    );
    expect(repository.records).toHaveLength(0);
  });

  it('returns cached post rating for idempotent retry without a second event', async () => {
    const repository = new FakePostRatingRepository();
    const useCase = new RecordPostRatingUseCase(
      repository,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-07-04T10:00:00.000Z')),
    );
    const command = {
      tenantId: tenantId('tenant-post-rating-idempotent'),
      workspaceId: workspaceId('workspace-post-rating-idempotent'),
      userId: 'user-post-rating-idempotent',
      idempotencyKey: 'rating-feed-1-5',
      rating: 5,
      target: {
        feedItemId: 'feed-1',
        sourceItemId: 'source-1',
        interestId: 'topic-ai',
        providerKey: 'reddit',
        title: 'Operators discuss AI agent monitoring',
      },
    };

    const created = await useCase.execute(command);
    const replayed = await useCase.execute(command);

    expect(created.ok && created.value.created).toBe(true);
    expect(replayed.ok && replayed.value).toEqual(expect.objectContaining({
      created: false,
      learningDirection: 'recorded',
    }));
    expect(repository.records).toHaveLength(1);
  });

  it('rejects an idempotency key owned by another user', async () => {
    const repository = new FakePostRatingRepository();
    const useCase = new RecordPostRatingUseCase(
      repository,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-07-04T10:00:00.000Z')),
    );

    await useCase.execute({
      tenantId: tenantId('tenant-post-rating-user-mismatch'),
      workspaceId: workspaceId('workspace-post-rating-user-mismatch'),
      userId: 'original-user',
      idempotencyKey: 'rating-feed-1-5',
      rating: 5,
      target: {
        feedItemId: 'feed-1',
        interestId: 'topic-ai',
        providerKey: 'reddit',
        title: 'Original rating',
      },
    });

    const result = await useCase.execute({
      tenantId: tenantId('tenant-post-rating-user-mismatch'),
      workspaceId: workspaceId('workspace-post-rating-user-mismatch'),
      userId: 'other-user',
      idempotencyKey: 'rating-feed-1-5',
      rating: 5,
      target: {
        feedItemId: 'feed-1',
        interestId: 'topic-ai',
        providerKey: 'reddit',
        title: 'Conflicting rating',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.message).toContain('different user');
    expect(repository.records).toHaveLength(1);
  });
});

class FakePostRatingRepository implements PostRatingRepositoryPort {
  readonly records: PostRatingRecord[] = [];

  async savePostRating(record: PostRatingRecord): Promise<void> {
    this.records.push(record);
  }

  async findPostRatingByIdempotencyKey(
    params: Parameters<PostRatingRepositoryPort['findPostRatingByIdempotencyKey']>[0],
  ): Promise<PostRatingRecord | null> {
    return this.records.find(
      (record) =>
        record.tenantId === params.tenantId &&
        record.workspaceId === params.workspaceId &&
        record.idempotencyKey === params.idempotencyKey,
    ) ?? null;
  }
}
