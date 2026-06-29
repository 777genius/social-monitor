import { FeedItem } from '@social-monitor/feed/domain';
import type { FeedItemReadRepositoryPort, ListFeedItemsQuery, ListFeedItemsResult } from '@social-monitor/feed/ports';
import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { UserRelevanceProfile, type UserRelevanceProfile as UserRelevanceProfileEntity } from '../../domain';
import type { UserRelevanceProfileRepositoryPort } from '../../ports';
import { RankFeedItemsUseCase } from '../rank-feed-items/rank-feed-items.use-case';
import { BuildPersonalizedDigestUseCase } from './build-personalized-digest.use-case';

describe('BuildPersonalizedDigestUseCase', () => {
  it('builds a high-signal daily digest candidate set from ranked interests', async () => {
    const tenant = tenantId('tenant-personalized-digest');
    const workspace = workspaceId('workspace-personalized-digest');
    const interestId = 'topic-ai-platforms';
    const feedItems = new FakeFeedItemReadRepository();
    const profiles = new FakeUserRelevanceProfileRepository();
    const now = new Date('2026-06-22T10:00:00.000Z');

    await profiles.save(UserRelevanceProfile.create({
      id: 'profile-digest',
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-digest',
      interestWeights: [{ key: interestId, weight: 1 }],
      sourceWeights: [{ key: 'github', weight: 1 }],
      keywordWeights: [{ key: 'agents', weight: 1 }],
      mutedKeywords: [],
      blockedProviderKeys: [],
      createdAt: now,
      updatedAt: now,
    }));
    feedItems.upsert(FeedItem.publish({
      id: 'feed-digest-1',
      tenantId: tenant,
      workspaceId: workspace,
      interestId,
      sourceItemId: 'source-digest-1',
      sourceBindingId: 'github-binding',
      providerKey: 'github',
      canonicalUrl: 'https://github.com/example/agents/releases/1',
      title: 'Agents runtime release improves orchestration',
      bodyPreview: 'Maintainers describe safer agent orchestration.',
      publishedAt: new Date('2026-06-22T08:00:00.000Z'),
      observedAt: new Date('2026-06-22T08:01:00.000Z'),
    }));

    const result = await new BuildPersonalizedDigestUseCase(
      new RankFeedItemsUseCase(feedItems, profiles, new FixedClock(now)),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-digest',
      interestIds: [interestId],
      windowStartedAt: new Date('2026-06-22T00:00:00.000Z'),
      windowEndedAt: new Date('2026-06-23T00:00:00.000Z'),
      limit: 5,
    });

    expect(result.ok && result.value).toEqual(expect.objectContaining({
      status: 'assembled',
      memoryGuidance: expect.objectContaining({
        status: 'disabled',
        applied: false,
        signals: ['memory_guidance_disabled'],
      }),
      highSignalFeedItemIds: ['feed-digest-1'],
    }));
  });
});

class FakeFeedItemReadRepository implements FeedItemReadRepositoryPort {
  private readonly items: FeedItem[] = [];

  upsert(item: FeedItem): void {
    this.items.push(item);
  }

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    return {
      items: this.items
        .filter((item) => {
          const snapshot = item.toSnapshot();

          return (
            snapshot.tenantId === query.tenantId &&
            snapshot.workspaceId === query.workspaceId &&
            (query.observedAfter === undefined || snapshot.observedAt.getTime() > query.observedAfter.getTime())
          );
        })
        .slice(0, query.limit),
    };
  }

  async findById(): Promise<FeedItem | null> {
    return null;
  }
}

class FakeUserRelevanceProfileRepository implements UserRelevanceProfileRepositoryPort {
  private readonly profiles = new Map<string, UserRelevanceProfileEntity>();

  async save(profile: UserRelevanceProfileEntity): Promise<void> {
    const snapshot = profile.toSnapshot();
    this.profiles.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.userId}`, profile);
  }

  async findByUser(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly userId: string;
  }): Promise<UserRelevanceProfileEntity | null> {
    return this.profiles.get(`${params.tenantId}:${params.workspaceId}:${params.userId}`) ?? null;
  }
}
