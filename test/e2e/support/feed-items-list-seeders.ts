import type { JsonObject } from '@social-monitor/shared-kernel';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { InMemoryFeedItemReadRepository } from
  '../../../libs/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { FeedItem } from '../../../libs/feed/domain';

export const createFeedItemsListSeeders = (
  repository: () => InMemoryFeedItemReadRepository,
) => {
  const seedFeedItem = (params: {
    readonly id: string;
    readonly sourceItemId: string;
    readonly tenant: string;
    readonly workspace: string;
    readonly interestId?: string;
    readonly sourceBindingId?: string;
    readonly providerKey?: string;
    readonly canonicalUrl?: string;
    readonly publishedAt: Date;
    readonly observedAt?: Date;
    readonly providerMetadata?: JsonObject;
  }): void => {
    repository().upsert(FeedItem.publish({
      id: params.id,
      tenantId: tenantId(params.tenant),
      workspaceId: workspaceId(params.workspace),
      interestId: params.interestId ?? 'topic-feed-e2e',
      sourceItemId: params.sourceItemId,
      sourceBindingId: params.sourceBindingId ?? 'binding-feed-e2e',
      providerKey: params.providerKey ?? 'rss',
      canonicalUrl: params.canonicalUrl ?? `https://example.test/${params.id}`,
      title: `Title ${params.id}`,
      bodyPreview: `Body ${params.id}`,
      authorHandle: 'author',
      publishedAt: params.publishedAt,
      observedAt: params.observedAt ?? params.publishedAt,
      providerMetadata: params.providerMetadata,
    }));
  };

  const seedRedditItems = (params: {
    readonly tenant: string;
    readonly workspace: string;
    readonly interestId: string;
    readonly subreddit: string;
    readonly publishedAt: Date;
    readonly samples: readonly (readonly [string, number])[];
  }): void => {
    for (const [id, score] of params.samples) seedFeedItem({
      id,
      sourceItemId: `source-${id}`,
      tenant: params.tenant,
      workspace: params.workspace,
      interestId: params.interestId,
      sourceBindingId: `reddit-${params.subreddit}`,
      providerKey: 'reddit',
      canonicalUrl: `https://reddit.test/r/${params.subreddit}/comments/${id}`,
      publishedAt: params.publishedAt,
      providerMetadata: {
        subreddit: params.subreddit,
        score,
        numComments: 10,
        upvoteRatio: 0.9,
      },
    });
  };

  const seedHackerNewsItem = (params: {
    readonly id: string;
    readonly tenant: string;
    readonly workspace: string;
    readonly interestId: string;
    readonly points: number;
    readonly comments: number;
    readonly publishedAt: Date;
  }): void => seedFeedItem({
    id: params.id,
    sourceItemId: `source-${params.id}`,
    tenant: params.tenant,
    workspace: params.workspace,
    interestId: params.interestId,
    sourceBindingId: 'hacker-news-front-page',
    providerKey: 'hacker-news',
    canonicalUrl: `https://news.ycombinator.test/item?id=${params.id}`,
    publishedAt: params.publishedAt,
    providerMetadata: {
      kind: 'hacker_news_story',
      source: 'front_page',
      points: params.points,
      comments: params.comments,
    },
  });

  return { seedFeedItem, seedRedditItems, seedHackerNewsItem };
};

export const githubRepositoryTrendMetadata = (params: {
  readonly stars: number;
  readonly forks: number;
  readonly stars24h: number;
  readonly stars7d: number;
  readonly stars30d: number;
  readonly stars90d: number;
  readonly primaryWindow: '24h' | '48h' | '7d' | '30d' | '90d';
}): JsonObject => ({
  kind: 'github_repository_trend',
  repository: {
    fullName: 'openai/codex', language: 'TypeScript',
    topics: ['ai', 'agents', 'developer-tools'], forksCount: params.forks,
  },
  trend: {
    totalStars: params.stars,
    stars24h: params.stars24h,
    stars48h: params.stars24h * 2,
    stars7d: params.stars7d,
    stars30d: params.stars30d,
    stars90d: params.stars90d,
    primaryWindow: params.primaryWindow,
  },
  sourceCohort: { topics: ['ai', 'agents'], languages: ['TypeScript'] },
});
