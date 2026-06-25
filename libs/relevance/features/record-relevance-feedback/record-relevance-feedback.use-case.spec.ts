import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  RelevanceFeedbackSignal,
  type RelevanceMemoryProjection,
  type UserRelevanceProfile,
} from '../../domain';
import type {
  RelevanceFeedbackLearningStorePort,
  RelevanceFeedbackLearningUnitOfWorkPort,
} from '../../ports';
import { RecordRelevanceFeedbackUseCase } from './record-relevance-feedback.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `relevance-feedback-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

describe('RecordRelevanceFeedbackUseCase', () => {
  it('records idempotent feedback and updates learning weights once', async () => {
    const learning = new FakeRelevanceFeedbackLearningStore();
    const useCase = new RecordRelevanceFeedbackUseCase(
      learning,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-22T10:00:00.000Z')),
    );
    const command = {
      tenantId: tenantId('tenant-feedback-learning'),
      workspaceId: workspaceId('workspace-feedback-learning'),
      userId: 'user-feedback-learning',
      idempotencyKey: 'feedback-learning-1',
      action: 'less_like_this' as const,
      rating: 2,
      target: {
        feedItemId: 'feed-learning-1',
        topicId: 'topic-noisy',
        providerKey: 'reddit',
        title: 'Noisy crypto launch dominates discussion',
        bodyPreview: 'The user marked this item as low relevance.',
        canonicalUrl: 'https://reddit.example/r/crypto/comments/1',
      },
    };

    const created = await useCase.execute(command);
    const replayed = await useCase.execute(command);

    expect(created.ok && created.value).toEqual(expect.objectContaining({
      created: true,
      learningDirection: 'negative',
    }));
    expect(replayed.ok && replayed.value).toEqual(expect.objectContaining({
      created: false,
      learningDirection: 'negative',
    }));

    const profile = await learning.findProfileByUser({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      userId: command.userId,
    });

    expect(profile?.sourceWeight('reddit')).toBe(-0.35);
    expect(profile?.topicWeight('topic-noisy')).toBe(-0.35);
    expect(learning.allFeedback()).toHaveLength(1);
    expect(learning.allMemoryProjections()).toHaveLength(1);
  });

  it('persists explicit reader feedback reason into feedback and memory projection targets', async () => {
    const learning = new FakeRelevanceFeedbackLearningStore();
    const useCase = new RecordRelevanceFeedbackUseCase(
      learning,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-22T10:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-feedback-reason'),
      workspaceId: workspaceId('workspace-feedback-reason'),
      userId: 'user-feedback-reason',
      idempotencyKey: 'feedback-reason-1',
      action: 'less_like_this',
      rating: 2,
      target: {
        topicId: 'topic-ai',
        providerKey: 'reddit',
        title: 'Same title but unrelated event',
        feedbackReason: 'not_same_story',
      },
    });

    expect(result.ok && result.value.feedback.target.feedbackReason).toBe('not_same_story');
    expect(learning.allFeedback()[0]?.toSnapshot().target.feedbackReason).toBe('not_same_story');
    expect(learning.allMemoryProjections()[0]?.toSnapshot().target.feedbackReason).toBe('not_same_story');
  });

  it('can block a provider from future ranking', async () => {
    const learning = new FakeRelevanceFeedbackLearningStore();
    const useCase = new RecordRelevanceFeedbackUseCase(
      learning,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-22T10:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-feedback-block'),
      workspaceId: workspaceId('workspace-feedback-block'),
      userId: 'user-feedback-block',
      idempotencyKey: 'feedback-block-source',
      action: 'hide_source',
      target: {
        topicId: 'topic-ai',
        providerKey: 'spam-source',
        title: 'Spam source item',
      },
    });

    expect(result.ok && result.value.learningDirection).toBe('block_provider');
    expect(result.ok && result.value.profile.blockedProviderKeys).toEqual(['spam-source']);
  });

  it('repairs a missing profile projection on an idempotent replay', async () => {
    const learning = new FakeRelevanceFeedbackLearningStore();
    const now = new Date('2026-06-22T10:00:00.000Z');
    const tenant = tenantId('tenant-feedback-repair');
    const workspace = workspaceId('workspace-feedback-repair');
    const userId = 'user-feedback-repair';

    await learning.saveFeedbackForSetup(RelevanceFeedbackSignal.record({
      id: 'cached-feedback-repair',
      tenantId: tenant,
      workspaceId: workspace,
      userId,
      idempotencyKey: 'feedback-repair-1',
      action: 'more_like_this',
      rating: 5,
      target: {
        feedItemId: 'feed-repair-1',
        topicId: 'topic-ai-tooling',
        providerKey: 'github',
        title: 'Trending AI developer library',
        bodyPreview: 'Developers are adopting a useful AI automation package.',
      },
      createdAt: now,
    }));

    const useCase = new RecordRelevanceFeedbackUseCase(
      learning,
      new SequenceIdGenerator(),
      new FixedClock(now),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId,
      idempotencyKey: 'feedback-repair-1',
      action: 'more_like_this',
      rating: 5,
      target: {
        feedItemId: 'feed-repair-1',
        topicId: 'topic-ai-tooling',
        providerKey: 'github',
        title: 'Trending AI developer library',
        bodyPreview: 'Developers are adopting a useful AI automation package.',
      },
    });

    const profile = await learning.findProfileByUser({
      tenantId: tenant,
      workspaceId: workspace,
      userId,
    });

    expect(result.ok && result.value).toEqual(expect.objectContaining({
      created: false,
      learningDirection: 'positive',
    }));
    expect(profile?.topicWeight('topic-ai-tooling')).toBe(0.25);
    expect(profile?.sourceWeight('github')).toBe(0.25);
    expect(learning.allFeedback()).toHaveLength(1);
    expect(learning.allMemoryProjections()).toHaveLength(1);
  });

  it('rejects an idempotency replay owned by another user', async () => {
    const learning = new FakeRelevanceFeedbackLearningStore();
    const tenant = tenantId('tenant-feedback-user-mismatch');
    const workspace = workspaceId('workspace-feedback-user-mismatch');

    await learning.saveFeedbackForSetup(RelevanceFeedbackSignal.record({
      id: 'cached-feedback-user-mismatch',
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'original-user',
      idempotencyKey: 'feedback-user-mismatch',
      action: 'less_like_this',
      target: {
        topicId: 'topic-noisy',
        providerKey: 'reddit',
        title: 'Noisy item',
      },
      createdAt: new Date('2026-06-22T10:00:00.000Z'),
    }));

    const useCase = new RecordRelevanceFeedbackUseCase(
      learning,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-22T10:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'another-user',
      idempotencyKey: 'feedback-user-mismatch',
      action: 'less_like_this',
      target: {
        topicId: 'topic-noisy',
        providerKey: 'reddit',
        title: 'Noisy item',
      },
    });

    expect(result.ok).toBe(false);
    expect(await learning.findProfileByUser({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'another-user',
    })).toBeNull();
  });
});

class FakeRelevanceFeedbackLearningStore implements RelevanceFeedbackLearningStorePort {
  private readonly profiles = new Map<string, UserRelevanceProfile>();
  private readonly feedback = new Map<string, RelevanceFeedbackSignal>();
  private readonly projections = new Map<string, RelevanceMemoryProjection>();

  async runLearningTransaction<TValue>(
    operation: (unitOfWork: RelevanceFeedbackLearningUnitOfWorkPort) => Promise<TValue>,
  ): Promise<TValue> {
    const profiles = new Map(this.profiles);
    const feedback = new Map(this.feedback);
    const projections = new Map(this.projections);
    const profileChanges = new Map<string, UserRelevanceProfile>();
    const feedbackChanges = new Map<string, RelevanceFeedbackSignal>();
    const projectionChanges = new Map<string, RelevanceMemoryProjection>();

    const result = await operation({
      saveFeedback: async (signal) => {
        const key = feedbackKey(signal);
        feedback.set(key, signal);
        feedbackChanges.set(key, signal);
      },
      saveMemoryProjection: async (projection) => {
        const key = memoryProjectionKey(projection);
        if (!projections.has(key)) {
          projections.set(key, projection);
          projectionChanges.set(key, projection);
        }
      },
      saveProfile: async (profile) => {
        const key = profileKey(profile);
        profiles.set(key, profile);
        profileChanges.set(key, profile);
      },
      findFeedbackByIdempotencyKey: async (params) => feedback.get(feedbackKey(params)) ?? null,
      findProfileByUser: async (params) => profiles.get(profileKey(params)) ?? null,
    });

    for (const [key, signal] of feedbackChanges.entries()) {
      this.feedback.set(key, signal);
    }

    for (const [key, profile] of profileChanges.entries()) {
      this.profiles.set(key, profile);
    }

    for (const [key, projection] of projectionChanges.entries()) {
      this.projections.set(key, projection);
    }

    return result;
  }

  async saveFeedbackForSetup(signal: RelevanceFeedbackSignal): Promise<void> {
    this.feedback.set(feedbackKey(signal), signal);
  }

  async findProfileByUser(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly userId: string;
  }): Promise<UserRelevanceProfile | null> {
    return this.profiles.get(profileKey(params)) ?? null;
  }

  allFeedback(): readonly RelevanceFeedbackSignal[] {
    return [...this.feedback.values()];
  }

  allMemoryProjections(): readonly RelevanceMemoryProjection[] {
    return [...this.projections.values()];
  }
}

const profileKey = (
  value: UserRelevanceProfile | { readonly tenantId: string; readonly workspaceId: string; readonly userId: string },
): string => {
  if (value instanceof Object && 'toSnapshot' in value) {
    const snapshot = value.toSnapshot();

    return [snapshot.tenantId, snapshot.workspaceId, snapshot.userId].join(':');
  }

  return [value.tenantId, value.workspaceId, value.userId.trim()].join(':');
};

const feedbackKey = (
  value: RelevanceFeedbackSignal | {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly idempotencyKey: string;
  },
): string => {
  if (value instanceof Object && 'toSnapshot' in value) {
    const snapshot = value.toSnapshot();

    return [snapshot.tenantId, snapshot.workspaceId, snapshot.idempotencyKey].join(':');
  }

  return [value.tenantId, value.workspaceId, value.idempotencyKey.trim()].join(':');
};

const memoryProjectionKey = (projection: RelevanceMemoryProjection): string => {
  const snapshot = projection.toSnapshot();

  return [snapshot.tenantId, snapshot.workspaceId, snapshot.feedbackId].join(':');
};
