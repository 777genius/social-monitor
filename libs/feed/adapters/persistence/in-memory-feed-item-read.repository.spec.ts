import { tenantId, workspaceId, type JsonObject } from '@social-monitor/shared-kernel';

import { FeedItem } from '../../domain';
import { InMemoryFeedItemReadRepository } from './in-memory-feed-item-read.repository';

const makeItem = (params: {
  readonly id: string;
  readonly sourceItemId: string;
  readonly tenant?: string;
  readonly topicId?: string;
  readonly providerKey?: string;
  readonly providerMetadata?: JsonObject;
  readonly canonicalUrl: string;
  readonly publishedAt?: Date;
  readonly observedAt?: Date;
}) =>
  FeedItem.publish({
    id: params.id,
    tenantId: tenantId(params.tenant ?? 'tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    topicId: params.topicId ?? 'topic-1',
    sourceItemId: params.sourceItemId,
    sourceBindingId: 'binding-1',
    providerKey: params.providerKey ?? 'rss',
    canonicalUrl: params.canonicalUrl,
    title: `Title ${params.id}`,
    bodyPreview: `Body ${params.id}`,
    authorHandle: 'author',
    publishedAt: params.publishedAt ?? new Date('2026-06-05T00:00:00.000Z'),
    observedAt: params.observedAt ?? new Date('2026-06-05T00:01:00.000Z'),
    providerMetadata: params.providerMetadata,
  });

describe('InMemoryFeedItemReadRepository', () => {
  it('dedupes feed items by normalized canonical URL inside tenant scope', async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(makeItem({
      id: 'feed-1',
      sourceItemId: 'source-1',
      canonicalUrl: 'https://Example.test/story?utm_source=email&b=2&a=1#comments',
    }));
    repository.upsert(makeItem({
      id: 'feed-2',
      sourceItemId: 'source-2',
      canonicalUrl: 'https://example.test/story?a=1&b=2',
    }));
    repository.upsert(makeItem({
      id: 'feed-3',
      sourceItemId: 'source-3',
      tenant: 'tenant-2',
      canonicalUrl: 'https://example.test/story?a=1&b=2',
    }));

    await expect(repository.list({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
    })).resolves.toEqual({
      items: [
        expect.objectContaining({
          toSnapshot: expect.any(Function),
        }),
      ],
      nextCursor: undefined,
    });
    await expect(repository.list({
      tenantId: tenantId('tenant-2'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
    })).resolves.toEqual({
      items: [
        expect.objectContaining({
          toSnapshot: expect.any(Function),
        }),
      ],
      nextCursor: undefined,
    });
  });

  it('dedupes canonical URLs inside topic scope but keeps the same URL for another topic', async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(makeItem({
      id: 'topic-1-feed-1',
      sourceItemId: 'topic-1-source-1',
      topicId: 'topic-1',
      canonicalUrl: 'https://example.test/story?utm_source=email&a=1',
    }));
    repository.upsert(makeItem({
      id: 'topic-1-feed-2',
      sourceItemId: 'topic-1-source-2',
      topicId: 'topic-1',
      canonicalUrl: 'https://example.test/story?a=1',
    }));
    repository.upsert(makeItem({
      id: 'topic-2-feed-1',
      sourceItemId: 'topic-2-source-1',
      topicId: 'topic-2',
      canonicalUrl: 'https://example.test/story?a=1',
    }));

    await expect(repository.list({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      limit: 10,
    })).resolves.toEqual({
      items: [
        expect.objectContaining({
          toSnapshot: expect.any(Function),
        }),
      ],
      nextCursor: undefined,
    });
    await expect(repository.list({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-2',
      limit: 10,
    })).resolves.toEqual({
      items: [
        expect.objectContaining({
          toSnapshot: expect.any(Function),
        }),
      ],
      nextCursor: undefined,
    });
  });

  it('dedupes enriched articles by semantic fingerprint across different source URLs', async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(makeItem({
      id: 'reddit-feed',
      sourceItemId: 'reddit-source',
      providerKey: 'reddit',
      canonicalUrl: 'https://www.reddit.com/r/OpenAI/comments/demo',
      providerMetadata: {
        articleContent: {
          status: 'enriched',
          semanticFingerprint: 'feedfacecafebeef',
          contentHash: 'content-hash-1',
        },
      },
    }));
    repository.upsert(makeItem({
      id: 'rss-feed',
      sourceItemId: 'rss-source',
      providerKey: 'rss',
      canonicalUrl: 'https://example.test/same-article?utm_source=rss',
      providerMetadata: {
        articleContent: {
          status: 'enriched',
          semanticFingerprint: 'feedfacecafebeef',
          contentHash: 'content-hash-1',
        },
      },
    }));

    const result = await repository.list({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.toSnapshot().id).toBe('reddit-feed');
  });

  it('filters repository radar items by provider and trend metadata', async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(makeItem({
      id: 'feed-codex',
      sourceItemId: 'source-codex',
      providerKey: 'github-repo-radar',
      canonicalUrl: 'https://github.com/openai/codex',
      providerMetadata: {
        kind: 'github_repository_trend',
        repository: {
          fullName: 'openai/codex',
          url: 'https://github.com/openai/codex',
          language: 'TypeScript',
          topics: ['ai', 'agents'],
        },
        trend: {
          primaryWindow: '24h',
        },
      },
    }));
    repository.upsert(makeItem({
      id: 'feed-rust',
      sourceItemId: 'source-rust',
      providerKey: 'github-repo-radar',
      canonicalUrl: 'https://github.com/astral-sh/uv',
      providerMetadata: {
        kind: 'github_repository_trend',
        repository: {
          fullName: 'astral-sh/uv',
          url: 'https://github.com/astral-sh/uv',
          language: 'Rust',
          topics: ['python'],
        },
        trend: {
          primaryWindow: '7d',
        },
      },
    }));
    repository.upsert(makeItem({
      id: 'feed-reddit',
      sourceItemId: 'source-reddit',
      providerKey: 'reddit',
      canonicalUrl: 'https://reddit.com/comments/demo',
    }));

    const result = await repository.list({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      providerKey: 'github-repo-radar',
      repositoryTrendWindow: '24h',
      repositoryLanguage: 'typescript',
      repositoryTopic: 'Agents',
      limit: 10,
    });

    expect(result.items.map((item) => item.toSnapshot().id)).toEqual(['feed-codex']);
  });

  it('filters repository radar items by long trend windows', async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(makeItem({
      id: 'feed-codex',
      sourceItemId: 'source-codex',
      providerKey: 'github-repo-radar',
      canonicalUrl: 'https://github.com/openai/codex',
      providerMetadata: {
        kind: 'github_repository_trend',
        repository: {
          fullName: 'openai/codex',
          url: 'https://github.com/openai/codex',
          language: 'TypeScript',
          topics: ['ai', 'agents'],
        },
        trend: {
          primaryWindow: '24h',
        },
      },
    }));
    repository.upsert(makeItem({
      id: 'feed-uv',
      sourceItemId: 'source-uv',
      providerKey: 'github-repo-radar',
      canonicalUrl: 'https://github.com/astral-sh/uv',
      providerMetadata: {
        kind: 'github_repository_trend',
        repository: {
          fullName: 'astral-sh/uv',
          url: 'https://github.com/astral-sh/uv',
          language: 'Rust',
          topics: ['python'],
        },
        trend: {
          primaryWindow: '7d',
        },
      },
    }));

    const result = await repository.list({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      providerKey: 'github-repo-radar',
      repositoryTrendWindow: '7d',
      limit: 10,
    });

    expect(result.items.map((item) => item.toSnapshot().id)).toEqual(['feed-uv']);
  });

  it('lists lightweight signal baseline samples scoped by topic and observed window', async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(makeItem({
      id: 'feed-reddit',
      sourceItemId: 'source-reddit',
      topicId: 'topic-1',
      providerKey: 'reddit',
      canonicalUrl: 'https://reddit.com/r/startups/comments/demo',
      providerMetadata: {
        subreddit: 'startups',
        score: 55,
        numComments: 18,
        upvoteRatio: 0.91,
      },
    }));
    repository.upsert(makeItem({
      id: 'feed-other-topic',
      sourceItemId: 'source-other-topic',
      topicId: 'topic-2',
      providerKey: 'reddit',
      canonicalUrl: 'https://reddit.com/r/startups/comments/other',
      providerMetadata: {
        subreddit: 'startups',
        score: 10,
        numComments: 1,
      },
    }));
    repository.upsert(makeItem({
      id: 'feed-rss',
      sourceItemId: 'source-rss',
      topicId: 'topic-1',
      providerKey: 'rss',
      canonicalUrl: 'https://example.test/rss',
    }));

    const samples = await repository.listSamples({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      observedAfter: new Date('2026-06-04T00:00:00.000Z'),
      limit: 10,
    });

    expect(samples).toEqual([
      {
        feedItemId: 'feed-reddit',
        topicId: 'topic-1',
        providerKey: 'reddit',
        sourceKey: 'r/startups',
        contentType: 'post',
        strength: expect.any(Number),
        publishedAt: new Date('2026-06-05T00:00:00.000Z'),
        observedAt: new Date('2026-06-05T00:01:00.000Z'),
      },
    ]);
  });

  it('filters lightweight baseline samples by exact cohort and orders them by observation time', async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(makeItem({
      id: 'feed-startups-old-published',
      sourceItemId: 'source-startups-old-published',
      topicId: 'topic-1',
      providerKey: 'reddit',
      canonicalUrl: 'https://reddit.com/r/startups/comments/old-published',
      publishedAt: new Date('2026-06-01T00:00:00.000Z'),
      observedAt: new Date('2026-06-05T00:03:00.000Z'),
      providerMetadata: {
        subreddit: 'startups',
        score: 55,
        numComments: 18,
      },
    }));
    repository.upsert(makeItem({
      id: 'feed-startups-newer-published',
      sourceItemId: 'source-startups-newer-published',
      topicId: 'topic-1',
      providerKey: 'reddit',
      canonicalUrl: 'https://reddit.com/r/startups/comments/newer-published',
      publishedAt: new Date('2026-06-05T00:00:00.000Z'),
      observedAt: new Date('2026-06-05T00:02:00.000Z'),
      providerMetadata: {
        subreddit: 'startups',
        score: 35,
        numComments: 8,
      },
    }));
    repository.upsert(makeItem({
      id: 'feed-programming',
      sourceItemId: 'source-programming',
      topicId: 'topic-1',
      providerKey: 'reddit',
      canonicalUrl: 'https://reddit.com/r/programming/comments/demo',
      observedAt: new Date('2026-06-05T00:04:00.000Z'),
      providerMetadata: {
        subreddit: 'programming',
        score: 120,
        numComments: 30,
      },
    }));

    const samples = await repository.listSamples({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      observedAfter: new Date('2026-06-04T00:00:00.000Z'),
      limit: 10,
      cohortFilters: [
        {
          providerKey: 'reddit',
          sourceKey: 'r/startups',
          contentType: 'post',
        },
      ],
    });

    expect(samples.map((sample) => sample.feedItemId)).toEqual([
      'feed-startups-old-published',
      'feed-startups-newer-published',
    ]);
  });
});
