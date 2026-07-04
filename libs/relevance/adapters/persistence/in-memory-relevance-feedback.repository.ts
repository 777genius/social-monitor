import {
  createPostRating,
  postRatingRecordFromFeedbackSignal,
  postRatingTargetKey,
  postRatingTargetsMatch,
  type PostRating,
  type PostRatingRecord,
  RelevanceFeedbackSignal,
} from '../../domain';
import type {
  PostRatingProjectionPort,
  PostRatingRepositoryPort,
  RelevanceFeedbackRepositoryPort,
} from '../../ports';

export class InMemoryRelevanceFeedbackRepository implements
  RelevanceFeedbackRepositoryPort,
  PostRatingProjectionPort,
  PostRatingRepositoryPort {
  private readonly feedbackByIdempotencyKey = new Map<string, RelevanceFeedbackSignal>();

  async save(feedback: RelevanceFeedbackSignal): Promise<void> {
    const snapshot = feedback.toSnapshot();

    this.feedbackByIdempotencyKey.set(this.key({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      idempotencyKey: snapshot.idempotencyKey,
    }), feedback);
  }

  async findByIdempotencyKey(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly idempotencyKey: string;
  }): Promise<RelevanceFeedbackSignal | null> {
    return this.feedbackByIdempotencyKey.get(this.key(params)) ?? null;
  }

  async findPostRatingByIdempotencyKey(
    params: Parameters<PostRatingRepositoryPort['findPostRatingByIdempotencyKey']>[0],
  ): Promise<PostRatingRecord | null> {
    const signal = await this.findByIdempotencyKey(params);

    return signal === null ? null : postRatingRecordFromFeedbackSignal(signal);
  }

  async savePostRating(record: PostRatingRecord): Promise<void> {
    await this.save(RelevanceFeedbackSignal.record({
      id: record.feedbackId,
      tenantId: record.tenantId,
      workspaceId: record.workspaceId,
      userId: record.userId,
      idempotencyKey: record.idempotencyKey,
      action: 'rate_post',
      rating: record.rating,
      target: {
        ...record.target,
        postRatingReason: record.reason,
      },
      createdAt: record.ratedAt,
    }));
  }

  all(): readonly RelevanceFeedbackSignal[] {
    return [...this.feedbackByIdempotencyKey.values()];
  }

  async listLatestByTargets(params: Parameters<PostRatingProjectionPort['listLatestByTargets']>[0]): Promise<readonly PostRating[]> {
    const latestByTargetKey = new Map<string, PostRating>();
    const targets = params.targets.map((target) => ({
      key: postRatingTargetKey(target),
      target,
    }));

    const signals = [...this.feedbackByIdempotencyKey.values()]
      .filter((signal) => {
        const snapshot = signal.toSnapshot();

        return snapshot.tenantId === params.tenantId &&
          snapshot.workspaceId === params.workspaceId &&
          snapshot.userId === params.userId &&
          snapshot.action === 'rate_post' &&
          snapshot.rating !== undefined;
      })
      .sort((left, right) => {
        const leftSnapshot = left.toSnapshot();
        const rightSnapshot = right.toSnapshot();
        const createdDiff = rightSnapshot.createdAt.getTime() - leftSnapshot.createdAt.getTime();

        return createdDiff !== 0 ? createdDiff : rightSnapshot.id.localeCompare(leftSnapshot.id);
      });

    for (const signal of signals) {
      const snapshot = signal.toSnapshot();
      for (const target of targets) {
        if (latestByTargetKey.has(target.key) || !postRatingTargetsMatch(target.target, snapshot.target)) {
          continue;
        }

        latestByTargetKey.set(target.key, createPostRating({
          feedbackId: snapshot.id,
          userId: snapshot.userId,
          rating: snapshot.rating ?? 3,
          reason: snapshot.target.postRatingReason,
          target: {
            feedItemId: snapshot.target.feedItemId,
            sourceItemId: snapshot.target.sourceItemId,
            interestId: snapshot.target.interestId,
          },
          ratedAt: snapshot.createdAt,
        }));
      }
    }

    return [...latestByTargetKey.values()];
  }

  private key(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly idempotencyKey: string;
  }): string {
    return [
      params.tenantId,
      params.workspaceId,
      params.idempotencyKey.trim(),
    ].join(':');
  }
}
