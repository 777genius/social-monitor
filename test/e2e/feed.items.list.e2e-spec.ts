import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type JsonObject, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { FeedItem } from '../../libs/feed/domain';
import { InMemoryFeedItemReadRepository } from '../../libs/feed/adapters/persistence/in-memory-feed-item-read.repository';

describe('Feed items list (e2e)', () => {
  let app: INestApplication;
  let repository: InMemoryFeedItemReadRepository;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    repository = moduleRef.get(InMemoryFeedItemReadRepository);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns tenant-scoped paginated feed items ordered by publish time', async () => {
    seedFeedItem({
      id: 'feed-1',
      sourceItemId: 'source-1',
      tenant: 'tenant-feed-e2e',
      workspace: 'workspace-feed-e2e',
      publishedAt: new Date('2026-06-05T10:00:00.000Z'),
    });
    seedFeedItem({
      id: 'feed-2',
      sourceItemId: 'source-2',
      tenant: 'tenant-feed-e2e',
      workspace: 'workspace-feed-e2e',
      publishedAt: new Date('2026-06-05T11:00:00.000Z'),
    });
    seedFeedItem({
      id: 'feed-3',
      sourceItemId: 'source-3',
      tenant: 'other-tenant',
      workspace: 'workspace-feed-e2e',
      publishedAt: new Date('2026-06-05T12:00:00.000Z'),
    });

    const missingRole = await request(app.getHttpServer())
      .get('/feed/items')
      .query({ limit: 1 })
      .set('x-tenant-id', 'tenant-feed-e2e')
      .set('x-workspace-id', 'workspace-feed-e2e')
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'feed.read',
      },
    });

    const firstPage = await request(app.getHttpServer())
      .get('/feed/items')
      .query({ limit: 1 })
      .set('x-tenant-id', 'tenant-feed-e2e')
      .set('x-workspace-id', 'workspace-feed-e2e')
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(firstPage.body).toEqual({
      items: [
        expect.objectContaining({
          id: 'feed-2',
          sourceItemId: 'source-2',
          canonicalUrl: 'https://example.test/feed-2',
          publishedAt: '2026-06-05T11:00:00.000Z',
        }),
      ],
      nextCursor: expect.any(String),
    });

    const secondPage = await request(app.getHttpServer())
      .get('/feed/items')
      .query({ limit: 10, cursor: firstPage.body.nextCursor })
      .set('x-tenant-id', 'tenant-feed-e2e')
      .set('x-workspace-id', 'workspace-feed-e2e')
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(secondPage.body).toEqual({
      items: [
        expect.objectContaining({
          id: 'feed-1',
          sourceItemId: 'source-1',
        }),
      ],
    });

    const search = await request(app.getHttpServer())
      .get('/feed/items')
      .query({ limit: 10, q: 'Title feed-1' })
      .set('x-tenant-id', 'tenant-feed-e2e')
      .set('x-workspace-id', 'workspace-feed-e2e')
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(search.body).toEqual({
      items: [
        expect.objectContaining({
          id: 'feed-1',
          sourceItemId: 'source-1',
        }),
      ],
    });

    const crossTenantSearch = await request(app.getHttpServer())
      .get('/feed/items')
      .query({ limit: 10, q: 'feed-3' })
      .set('x-tenant-id', 'tenant-feed-e2e')
      .set('x-workspace-id', 'workspace-feed-e2e')
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(crossTenantSearch.body).toEqual({
      items: [],
    });

    seedFeedItem({
      id: 'feed-other-topic',
      sourceItemId: 'source-other-topic',
      tenant: 'tenant-feed-e2e',
      workspace: 'workspace-feed-e2e',
      topicId: 'topic-feed-other-e2e',
      publishedAt: new Date('2026-06-05T12:30:00.000Z'),
    });
    const topicFiltered = await request(app.getHttpServer())
      .get('/feed/items')
      .query({ limit: 10, topicId: 'topic-feed-e2e' })
      .set('x-tenant-id', 'tenant-feed-e2e')
      .set('x-workspace-id', 'workspace-feed-e2e')
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(topicFiltered.body.items).toEqual([
      expect.objectContaining({ id: 'feed-2', topicId: 'topic-feed-e2e' }),
      expect.objectContaining({ id: 'feed-1', topicId: 'topic-feed-e2e' }),
    ]);

    const detail = await request(app.getHttpServer())
      .get('/feed/items/feed-1')
      .set('x-tenant-id', 'tenant-feed-e2e')
      .set('x-workspace-id', 'workspace-feed-e2e')
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(detail.body).toEqual(expect.objectContaining({
      id: 'feed-1',
      sourceItemId: 'source-1',
      canonicalUrl: 'https://example.test/feed-1',
    }));

    await request(app.getHttpServer())
      .get('/feed/items/feed-3')
      .set('x-tenant-id', 'tenant-feed-e2e')
      .set('x-workspace-id', 'workspace-feed-e2e')
      .set('x-workspace-role', 'viewer')
      .expect(404)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: 404,
          code: 'resource.not_found',
          detail: 'Feed item not found',
        });
      });

    await request(app.getHttpServer())
      .get('/feed/items')
      .query({ limit: 0 })
      .set('x-tenant-id', 'tenant-feed-e2e')
      .set('x-workspace-id', 'workspace-feed-e2e')
      .set('x-workspace-role', 'viewer')
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: 400,
          code: 'validation.failed',
          detail: 'Feed page limit must be between 1 and 100',
        });
      });
  });

  it('dedupes tenant feed items by normalized canonical URL', async () => {
    seedFeedItem({
      id: 'feed-dedupe-1',
      sourceItemId: 'source-dedupe-1',
      tenant: 'tenant-feed-dedupe-e2e',
      workspace: 'workspace-feed-dedupe-e2e',
      canonicalUrl: 'https://Example.test/articles/story?utm_source=newsletter&b=2&a=1#comments',
      publishedAt: new Date('2026-06-05T10:00:00.000Z'),
    });
    seedFeedItem({
      id: 'feed-dedupe-2',
      sourceItemId: 'source-dedupe-2',
      tenant: 'tenant-feed-dedupe-e2e',
      workspace: 'workspace-feed-dedupe-e2e',
      canonicalUrl: 'https://example.test/articles/story?a=1&b=2',
      publishedAt: new Date('2026-06-05T11:00:00.000Z'),
    });
    seedFeedItem({
      id: 'feed-dedupe-other-tenant',
      sourceItemId: 'source-dedupe-other-tenant',
      tenant: 'tenant-feed-dedupe-other',
      workspace: 'workspace-feed-dedupe-e2e',
      canonicalUrl: 'https://example.test/articles/story?a=1&b=2',
      publishedAt: new Date('2026-06-05T12:00:00.000Z'),
    });

    const response = await request(app.getHttpServer())
      .get('/feed/items')
      .query({ limit: 10 })
      .set('x-tenant-id', 'tenant-feed-dedupe-e2e')
      .set('x-workspace-id', 'workspace-feed-dedupe-e2e')
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(response.body).toEqual({
      items: [
        expect.objectContaining({
          id: 'feed-dedupe-1',
          canonicalUrl: 'https://Example.test/articles/story?utm_source=newsletter&b=2&a=1#comments',
        }),
      ],
    });
  });

  it('returns raw provider metrics and cohort-normalized signal', async () => {
    const tenant = 'tenant-feed-signal-e2e';
    const workspace = 'workspace-feed-signal-e2e';
    const topicId = 'topic-feed-signal-e2e';
    const publishedAt = new Date(Date.now() - 4 * 60 * 60 * 1000);

    seedRedditItems({
      tenant,
      workspace,
      topicId,
      subreddit: 'tiny-saas',
      publishedAt,
      samples: [
        ['feed-signal-tiny-1', 3],
        ['feed-signal-tiny-2', 8],
        ['feed-signal-tiny-3', 10],
        ['feed-signal-tiny-4', 12],
        ['feed-signal-tiny-5', 40],
        ['feed-signal-tiny-target', 55],
      ],
    });
    seedRedditItems({
      tenant,
      workspace,
      topicId,
      subreddit: 'programming',
      publishedAt,
      samples: [
        ['feed-signal-programming-1', 200],
        ['feed-signal-programming-2', 400],
        ['feed-signal-programming-target', 550],
        ['feed-signal-programming-3', 600],
        ['feed-signal-programming-4', 1000],
        ['feed-signal-programming-5', 2500],
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/feed/items')
      .query({ limit: 20, topicId })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    const tinyTarget = response.body.items.find((item: { readonly id: string }) =>
      item.id === 'feed-signal-tiny-target');
    const programmingTarget = response.body.items.find((item: { readonly id: string }) =>
      item.id === 'feed-signal-programming-target');

    expect(tinyTarget).toMatchObject({
      providerKey: 'reddit',
      providerMetrics: {
        kind: 'reddit_post',
        providerKey: 'reddit',
        sourceKey: 'r/tiny-saas',
        contentType: 'post',
        score: 55,
        comments: 10,
        upvoteRatio: 0.9,
      },
      normalizedSignal: {
        basis: 'cohort_baseline_v1',
        band: expect.stringMatching(/high|breakout/),
        confidence: expect.any(Number),
        cohort: {
          providerKey: 'reddit',
          sourceKey: 'r/tiny-saas',
          contentType: 'post',
          baselineWindow: '30d',
          sampleSize: 6,
          fallback: 'exact',
        },
      },
    });
    expect(programmingTarget).toMatchObject({
      providerMetrics: {
        kind: 'reddit_post',
        score: 550,
        sourceKey: 'r/programming',
      },
      normalizedSignal: {
        basis: 'cohort_baseline_v1',
        cohort: {
          sourceKey: 'r/programming',
          baselineWindow: '30d',
          sampleSize: 6,
          fallback: 'exact',
        },
      },
    });
    expect(tinyTarget.providerMetrics.score).toBeLessThan(programmingTarget.providerMetrics.score);
    expect(tinyTarget.normalizedSignal.score).toBeGreaterThan(programmingTarget.normalizedSignal.score);
    expect(tinyTarget.normalizedSignal.confidence).toBeGreaterThan(0);
    expect(tinyTarget.normalizedSignal.confidence).toBeLessThanOrEqual(0.98);

    const detail = await request(app.getHttpServer())
      .get('/feed/items/feed-signal-tiny-target')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(detail.body).toMatchObject({
      id: 'feed-signal-tiny-target',
      providerMetrics: {
        kind: 'reddit_post',
        score: 55,
        sourceKey: 'r/tiny-saas',
      },
      normalizedSignal: {
        basis: 'cohort_baseline_v1',
        cohort: {
          fallback: 'exact',
          baselineWindow: '30d',
          sampleSize: 6,
        },
      },
    });
  });

  it('returns provider-specific raw metrics for GitHub, Hacker News and X posts', async () => {
    const tenant = 'tenant-feed-provider-metrics-e2e';
    const workspace = 'workspace-feed-provider-metrics-e2e';
    const topicId = 'topic-feed-provider-metrics-e2e';
    const publishedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);

    seedFeedItem({
      id: 'feed-provider-github',
      sourceItemId: 'source-provider-github',
      tenant,
      workspace,
      topicId,
      providerKey: 'github-repo-radar',
      canonicalUrl: 'https://github.test/openai/codex',
      publishedAt,
      providerMetadata: githubRepositoryTrendMetadata({
        stars: 54000,
        forks: 6100,
        stars24h: 210,
        stars7d: 1200,
        stars30d: 4800,
        stars90d: 11000,
        primaryWindow: '24h',
      }),
    });
    seedFeedItem({
      id: 'feed-provider-hn',
      sourceItemId: 'source-provider-hn',
      tenant,
      workspace,
      topicId,
      providerKey: 'hacker-news',
      canonicalUrl: 'https://news.ycombinator.test/item?id=42',
      publishedAt,
      providerMetadata: {
        kind: 'hacker_news_story',
        source: 'front_page',
        points: 128,
        comments: 37,
      },
    });
    seedFeedItem({
      id: 'feed-provider-x',
      sourceItemId: 'source-provider-x',
      tenant,
      workspace,
      topicId,
      providerKey: 'x-twitter',
      canonicalUrl: 'https://x.test/post/42',
      publishedAt,
      providerMetadata: {
        kind: 'x_post',
        accountHandle: 'OpenAI',
        public_metrics: {
          like_count: 1200,
          retweet_count: 340,
          reply_count: 75,
          quote_count: 42,
          bookmark_count: 88,
          impression_count: 90000,
        },
      },
    });

    const response = await request(app.getHttpServer())
      .get('/feed/items')
      .query({ limit: 10, topicId })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    const github = response.body.items.find((item: { readonly id: string }) =>
      item.id === 'feed-provider-github');
    const hn = response.body.items.find((item: { readonly id: string }) =>
      item.id === 'feed-provider-hn');
    const x = response.body.items.find((item: { readonly id: string }) =>
      item.id === 'feed-provider-x');

    expect(github).toMatchObject({
      providerMetrics: {
        kind: 'github_repository',
        providerKey: 'github-repo-radar',
        sourceKey: 'repo-trending:24h',
        contentType: 'repository',
        stars: 54000,
        forks: 6100,
        trendingDelta: {
          window: '24h',
          value: 210,
        },
        trendDeltas: [
          { window: '24h', value: 210 },
          { window: '48h', value: 420 },
          { window: '7d', value: 1200 },
          { window: '30d', value: 4800 },
          { window: '90d', value: 11000 },
        ],
      },
      normalizedSignal: {
        basis: 'cohort_baseline_v1',
        cohort: {
          providerKey: 'github-repo-radar',
          sourceKey: 'repo-trending:24h',
          contentType: 'repository',
          baselineWindow: '30d',
        },
      },
    });
    expect(hn).toMatchObject({
      providerMetrics: {
        kind: 'hacker_news_story',
        providerKey: 'hacker-news',
        sourceKey: 'hn:front_page',
        contentType: 'story',
        points: 128,
        comments: 37,
      },
      normalizedSignal: {
        basis: 'cohort_baseline_v1',
        cohort: {
          providerKey: 'hacker-news',
          sourceKey: 'hn:front_page',
          contentType: 'story',
          baselineWindow: '30d',
        },
      },
    });
    expect(x).toMatchObject({
      providerMetrics: {
        kind: 'x_post',
        providerKey: 'x-twitter',
        sourceKey: 'account:openai',
        contentType: 'post',
        likes: 1200,
        reposts: 340,
        replies: 75,
        quotes: 42,
        bookmarks: 88,
        impressions: 90000,
      },
      normalizedSignal: {
        basis: 'cohort_baseline_v1',
        cohort: {
          providerKey: 'x-twitter',
          sourceKey: 'account:openai',
          contentType: 'post',
          baselineWindow: '30d',
        },
      },
    });
  });

  it('omits normalized signal when a provider has no comparable raw metrics', async () => {
    const tenant = 'tenant-feed-no-signal-e2e';
    const workspace = 'workspace-feed-no-signal-e2e';
    const topicId = 'topic-feed-no-signal-e2e';

    seedFeedItem({
      id: 'feed-no-signal-rss',
      sourceItemId: 'source-no-signal-rss',
      tenant,
      workspace,
      topicId,
      providerKey: 'rss',
      publishedAt: new Date(Date.now() - 60 * 60 * 1000),
      providerMetadata: {
        rawScore: 9999,
      },
    });

    const response = await request(app.getHttpServer())
      .get('/feed/items')
      .query({ limit: 10, topicId })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(response.body.items).toEqual([
      expect.objectContaining({
        id: 'feed-no-signal-rss',
        providerKey: 'rss',
        providerMetadata: {
          rawScore: 9999,
        },
      }),
    ]);
    expect(response.body.items[0].providerMetrics).toBeUndefined();
    expect(response.body.items[0].normalizedSignal).toBeUndefined();
  });

  it('keeps cohorts topic-scoped and lowers confidence when exact baseline is too small', async () => {
    const tenant = 'tenant-feed-signal-fallback-e2e';
    const workspace = 'workspace-feed-signal-fallback-e2e';
    const topicId = 'topic-feed-signal-fallback-e2e';
    const otherTopicId = 'topic-feed-signal-fallback-other-e2e';
    const now = Date.now();

    seedHackerNewsItem({
      id: 'feed-signal-hn-target',
      tenant,
      workspace,
      topicId,
      points: 40,
      comments: 12,
      publishedAt: new Date(now - 30 * 60 * 1000),
    });
    seedHackerNewsItem({
      id: 'feed-signal-hn-same-age',
      tenant,
      workspace,
      topicId,
      points: 25,
      comments: 8,
      publishedAt: new Date(now - 45 * 60 * 1000),
    });
    seedHackerNewsItem({
      id: 'feed-signal-hn-older-1',
      tenant,
      workspace,
      topicId,
      points: 5,
      comments: 1,
      publishedAt: new Date(now - 2 * 60 * 60 * 1000),
    });
    seedHackerNewsItem({
      id: 'feed-signal-hn-older-2',
      tenant,
      workspace,
      topicId,
      points: 10,
      comments: 3,
      publishedAt: new Date(now - 4 * 60 * 60 * 1000),
    });
    seedHackerNewsItem({
      id: 'feed-signal-hn-older-3',
      tenant,
      workspace,
      topicId,
      points: 15,
      comments: 5,
      publishedAt: new Date(now - 8 * 60 * 60 * 1000),
    });
    for (const index of [1, 2, 3, 4, 5, 6]) {
      seedHackerNewsItem({
        id: `feed-signal-hn-other-topic-${index}`,
        tenant,
        workspace,
        topicId: otherTopicId,
        points: 1000 + index,
        comments: 100 + index,
        publishedAt: new Date(now - 30 * 60 * 1000),
      });
    }

    const response = await request(app.getHttpServer())
      .get('/feed/items')
      .query({ limit: 10, topicId })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    const target = response.body.items.find((item: { readonly id: string }) =>
      item.id === 'feed-signal-hn-target');

    expect(target).toMatchObject({
      providerMetrics: {
        kind: 'hacker_news_story',
        sourceKey: 'hn:front_page',
        points: 40,
        comments: 12,
      },
      normalizedSignal: {
        basis: 'cohort_baseline_v1',
        cohort: {
          sourceKey: 'hn:front_page',
          baselineWindow: '30d',
          sampleSize: 5,
          fallback: 'source',
        },
      },
    });
    expect(target.normalizedSignal.confidence).toBeLessThan(0.5);
    expect(response.body.items.some((item: { readonly topicId: string }) =>
      item.topicId === otherTopicId)).toBe(false);
  });

  const seedFeedItem = (params: {
    readonly id: string;
    readonly sourceItemId: string;
    readonly tenant: string;
    readonly workspace: string;
    readonly topicId?: string;
    readonly sourceBindingId?: string;
    readonly providerKey?: string;
    readonly canonicalUrl?: string;
    readonly publishedAt: Date;
    readonly providerMetadata?: JsonObject;
  }): void => {
    repository.upsert(
      FeedItem.publish({
        id: params.id,
        tenantId: tenantId(params.tenant),
        workspaceId: workspaceId(params.workspace),
        topicId: params.topicId ?? 'topic-feed-e2e',
        sourceItemId: params.sourceItemId,
        sourceBindingId: params.sourceBindingId ?? 'binding-feed-e2e',
        providerKey: params.providerKey ?? 'rss',
        canonicalUrl: params.canonicalUrl ?? `https://example.test/${params.id}`,
        title: `Title ${params.id}`,
        bodyPreview: `Body ${params.id}`,
        authorHandle: 'author',
        publishedAt: params.publishedAt,
        observedAt: new Date('2026-06-05T12:00:00.000Z'),
        providerMetadata: params.providerMetadata,
      }),
    );
  };

  const seedRedditItems = (params: {
    readonly tenant: string;
    readonly workspace: string;
    readonly topicId: string;
    readonly subreddit: string;
    readonly publishedAt: Date;
    readonly samples: readonly (readonly [string, number])[];
  }): void => {
    for (const [id, score] of params.samples) {
      seedFeedItem({
        id,
        sourceItemId: `source-${id}`,
        tenant: params.tenant,
        workspace: params.workspace,
        topicId: params.topicId,
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
    }
  };

  const seedHackerNewsItem = (params: {
    readonly id: string;
    readonly tenant: string;
    readonly workspace: string;
    readonly topicId: string;
    readonly points: number;
    readonly comments: number;
    readonly publishedAt: Date;
  }): void => {
    seedFeedItem({
      id: params.id,
      sourceItemId: `source-${params.id}`,
      tenant: params.tenant,
      workspace: params.workspace,
      topicId: params.topicId,
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
  };

  const githubRepositoryTrendMetadata = (params: {
    readonly stars: number;
    readonly forks: number;
    readonly stars24h: number;
    readonly stars7d: number;
    readonly stars30d: number;
    readonly stars90d: number;
    readonly primaryWindow: '24h' | '48h';
  }): JsonObject => ({
    kind: 'github_repository_trend',
    repository: {
      fullName: 'openai/codex',
      forksCount: params.forks,
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
  });
});
