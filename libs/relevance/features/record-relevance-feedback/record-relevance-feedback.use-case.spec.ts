import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { RelevanceFeedbackSignal, UserRelevanceProfile } from '../../domain';
import type {
  RelevanceFeedbackRepositoryPort,
  UserRelevanceProfileRepositoryPort,
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
    const profiles = new FakeUserRelevanceProfileRepository();
    const feedback = new FakeRelevanceFeedbackRepository();
    const useCase = new RecordRelevanceFeedbackUseCase(
      profiles,
      feedback,
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

    const profile = await profiles.findByUser({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      userId: command.userId,
    });

    expect(profile?.sourceWeight('reddit')).toBe(-0.35);
    expect(profile?.topicWeight('topic-noisy')).toBe(-0.35);
    expect(feedback.all()).toHaveLength(1);
  });

  it('can block a provider from future ranking', async () => {
    const profiles = new FakeUserRelevanceProfileRepository();
    const useCase = new RecordRelevanceFeedbackUseCase(
      profiles,
      new FakeRelevanceFeedbackRepository(),
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
});

class FakeUserRelevanceProfileRepository implements UserRelevanceProfileRepositoryPort {
  private readonly profiles = new Map<string, UserRelevanceProfile>();

  async save(profile: UserRelevanceProfile): Promise<void> {
    const snapshot = profile.toSnapshot();
    this.profiles.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.userId}`, profile);
  }

  async findByUser(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly userId: string;
  }): Promise<UserRelevanceProfile | null> {
    return this.profiles.get(`${params.tenantId}:${params.workspaceId}:${params.userId}`) ?? null;
  }
}

class FakeRelevanceFeedbackRepository implements RelevanceFeedbackRepositoryPort {
  private readonly feedback = new Map<string, RelevanceFeedbackSignal>();

  async save(feedback: RelevanceFeedbackSignal): Promise<void> {
    const snapshot = feedback.toSnapshot();
    this.feedback.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`, feedback);
  }

  async findByIdempotencyKey(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly idempotencyKey: string;
  }): Promise<RelevanceFeedbackSignal | null> {
    return this.feedback.get(`${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`) ?? null;
  }

  all(): readonly RelevanceFeedbackSignal[] {
    return [...this.feedback.values()];
  }
}
