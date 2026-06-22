import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { UserRelevanceProfile } from '../../domain';
import type { UserRelevanceProfileRepositoryPort } from '../../ports';
import { UpsertUserRelevanceProfileUseCase } from './upsert-user-relevance-profile.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `profile-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

describe('UpsertUserRelevanceProfileUseCase', () => {
  it('creates and updates normalized user relevance weights', async () => {
    const profiles = new FakeUserRelevanceProfileRepository();
    const useCase = new UpsertUserRelevanceProfileUseCase(
      profiles,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-22T10:00:00.000Z')),
    );
    const tenant = tenantId('tenant-relevance-profile');
    const workspace = workspaceId('workspace-relevance-profile');

    const created = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: ' user-1 ',
      topicWeights: [{ key: 'AI', weight: 1.25 }],
      sourceWeights: [{ key: 'Reddit', weight: 0.75 }],
      keywordWeights: [{ key: 'Kubernetes', weight: 1 }],
      mutedKeywords: ['giveaway'],
    });

    expect(created.ok && created.value).toEqual({
      created: true,
      profile: expect.objectContaining({
        id: 'profile-1',
        userId: 'user-1',
        topicWeights: [{ key: 'ai', weight: 1.25 }],
        sourceWeights: [{ key: 'reddit', weight: 0.75 }],
        keywordWeights: [{ key: 'kubernetes', weight: 1 }],
        mutedKeywords: ['giveaway'],
      }),
    });

    const updated = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      blockedProviderKeys: ['reddit'],
    });

    expect(updated.ok && updated.value.created).toBe(false);
    expect(updated.ok && updated.value.profile).toEqual(expect.objectContaining({
      id: 'profile-1',
      blockedProviderKeys: ['reddit'],
    }));
  });

  it('rejects invalid weights without saving a profile', async () => {
    const profiles = new FakeUserRelevanceProfileRepository();
    const useCase = new UpsertUserRelevanceProfileUseCase(
      profiles,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-22T10:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-relevance-profile-invalid'),
      workspaceId: workspaceId('workspace-relevance-profile-invalid'),
      userId: 'user-invalid',
      sourceWeights: [{ key: 'reddit', weight: 4 }],
    });

    expect(result.ok).toBe(false);
    expect(profiles.all()).toHaveLength(0);
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

  all(): readonly UserRelevanceProfile[] {
    return [...this.profiles.values()];
  }
}
