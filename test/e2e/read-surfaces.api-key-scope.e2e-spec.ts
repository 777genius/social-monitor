import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { FeedItem } from '@social-monitor/feed/domain';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Read surfaces API key scope enforcement (e2e)', () => {
  let app: INestApplication;
  let feedItems: InMemoryFeedItemReadRepository;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    feedItems = moduleRef.get(InMemoryFeedItemReadRepository);
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

  it('allows scoped API keys to read feed and summary surfaces without workspace role headers', async () => {
    const tenant = tenantId('tenant-read-api-key-e2e');
    const workspace = workspaceId('workspace-read-api-key-e2e');
    const topicId = 'topic-read-api-key-e2e';

    feedItems.upsert(FeedItem.publish({
      id: 'feed-read-api-key-1',
      tenantId: tenant,
      workspaceId: workspace,
      topicId,
      sourceItemId: 'source-read-api-key-1',
      sourceBindingId: 'binding-read-api-key-e2e',
      canonicalUrl: 'https://example.test/read-api-key-feed',
      title: 'API key feed read surface',
      bodyPreview: 'Feed read should be available through read:feed API key scope.',
      authorHandle: 'author',
      publishedAt: new Date('2026-06-06T10:00:00.000Z'),
      observedAt: new Date('2026-06-06T10:05:00.000Z'),
    }));

    const feedKey = await createApiKey({
      tenant,
      workspace,
      name: 'Feed reader key',
      scopes: ['read:feed'],
    });
    const summaryKey = await createApiKey({
      tenant,
      workspace,
      name: 'Summary reader key',
      scopes: ['read:summaries'],
    });
    const otherWorkspaceFeedKey = await createApiKey({
      tenant,
      workspace: workspaceId('workspace-read-api-key-other-e2e'),
      name: 'Other workspace feed reader key',
      scopes: ['read:feed'],
    });

    const feedList = await request(app.getHttpServer())
      .get('/feed/items')
      .query({ topicId, limit: 10 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${feedKey}`)
      .expect(200);

    expect(feedList.body.items).toEqual([
      expect.objectContaining({
        id: 'feed-read-api-key-1',
        topicId,
        sourceBindingId: 'binding-read-api-key-e2e',
        title: 'API key feed read surface',
      }),
    ]);

    await request(app.getHttpServer())
      .get('/feed/items/feed-read-api-key-1')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${feedKey}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/feed/items')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${summaryKey}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/feed/items')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${otherWorkspaceFeedKey}`)
      .expect(403);

    const summaryRequest = await request(app.getHttpServer())
      .post(`/topics/${topicId}/summary-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'read-api-key-summary-request')
      .set('idempotency-key', 'read-api-key-summary-request')
      .expect(201);
    const executed = await app.get(ExecuteSummaryJobUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: summaryRequest.body.summaryJobId,
    });

    if (!executed.ok || executed.value.summaryId === undefined) {
      throw new Error('Expected summary execution to produce a summary id');
    }

    const summaryDetail = await request(app.getHttpServer())
      .get(`/summaries/${executed.value.summaryId}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${summaryKey}`)
      .expect(200);

    expect(summaryDetail.body).toMatchObject({
      summaryId: executed.value.summaryId,
      tenantId: tenant,
      workspaceId: workspace,
      topicId,
    });

    await request(app.getHttpServer())
      .get(`/summaries?topicId=${topicId}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${summaryKey}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/summaries/${executed.value.summaryId}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${feedKey}`)
      .expect(403);
  });

  const createApiKey = async (params: {
    readonly tenant: string;
    readonly workspace: string;
    readonly name: string;
    readonly scopes: readonly string[];
  }): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set('x-tenant-id', params.tenant)
      .set('x-workspace-id', params.workspace)
      .set('x-workspace-role', 'admin')
      .send({
        name: params.name,
        scopes: params.scopes,
      })
      .expect(201);

    return response.body.secret;
  };
});
