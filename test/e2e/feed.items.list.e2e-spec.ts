import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
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

  const seedFeedItem = (params: {
    readonly id: string;
    readonly sourceItemId: string;
    readonly tenant: string;
    readonly workspace: string;
    readonly topicId?: string;
    readonly canonicalUrl?: string;
    readonly publishedAt: Date;
  }): void => {
    repository.upsert(
      FeedItem.publish({
        id: params.id,
        tenantId: tenantId(params.tenant),
        workspaceId: workspaceId(params.workspace),
        topicId: params.topicId ?? 'topic-feed-e2e',
        sourceItemId: params.sourceItemId,
        sourceBindingId: 'binding-feed-e2e',
        providerKey: 'rss',
        canonicalUrl: params.canonicalUrl ?? `https://example.test/${params.id}`,
        title: `Title ${params.id}`,
        bodyPreview: `Body ${params.id}`,
        authorHandle: 'author',
        publishedAt: params.publishedAt,
        observedAt: new Date('2026-06-05T12:00:00.000Z'),
      }),
    );
  };
});
