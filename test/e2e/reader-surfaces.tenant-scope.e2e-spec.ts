import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { FeedItem } from '@social-monitor/feed/domain';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ExecuteReaderSummaryJobUseCase } from '@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Reader surfaces tenant scope guard (e2e)', () => {
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

  it('keeps relevance and briefing data isolated by tenant and workspace', async () => {
    const sourceTenant = tenantId('tenant-reader-scope-source-e2e');
    const otherTenant = tenantId('tenant-reader-scope-other-e2e');
    const sourceWorkspace = workspaceId('workspace-reader-scope-source-e2e');
    const topicId = 'topic-reader-scope-e2e';
    const userId = 'reader-scope-user';

    feedItems.upsert(FeedItem.publish({
      id: 'feed-reader-scope-1',
      tenantId: sourceTenant,
      workspaceId: sourceWorkspace,
      topicId,
      sourceItemId: 'source-reader-scope-1',
      sourceBindingId: 'binding-reader-scope-e2e',
      providerKey: 'reddit',
      canonicalUrl: 'https://example.test/reader-scope-feed',
      title: 'Tenant scoped reader signal',
      bodyPreview: 'This signal must not leak across tenants or workspaces.',
      authorHandle: 'reader-scope-author',
      publishedAt: new Date('2026-06-25T10:00:00.000Z'),
      observedAt: new Date('2026-06-25T10:05:00.000Z'),
    }));

    const feedKey = await createApiKey({
      tenant: sourceTenant,
      workspace: sourceWorkspace,
      name: 'Source tenant feed key',
      scopes: ['read:feed'],
    });
    const summaryKey = await createApiKey({
      tenant: sourceTenant,
      workspace: sourceWorkspace,
      name: 'Source tenant summary key',
      scopes: ['read:summaries'],
    });

    const briefingRequest = await request(app.getHttpServer())
      .post('/briefing-requests')
      .set('x-tenant-id', sourceTenant)
      .set('x-workspace-id', sourceWorkspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'reader-scope-briefing-request')
      .set('idempotency-key', 'reader-scope-briefing-request')
      .send({
        scope: {
          type: 'topic',
          topicId,
        },
        userId,
      })
      .expect(201);

    const executedBriefing = await app.get(ExecuteReaderSummaryJobUseCase).execute({
      tenantId: sourceTenant,
      workspaceId: sourceWorkspace,
      readerSummaryJobId: briefingRequest.body.briefingJobId,
    });

    if (!executedBriefing.ok || executedBriefing.value.readerSummaryId === undefined) {
      throw new Error('Expected reader scope briefing execution to produce a briefing id');
    }

    const sourceFeed = await request(app.getHttpServer())
      .get(`/relevance/users/${userId}/feed`)
      .query({ topicId, limit: 10 })
      .set('x-tenant-id', sourceTenant)
      .set('x-workspace-id', sourceWorkspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(sourceFeed.body.items).toEqual([
      expect.objectContaining({
        feedItemId: 'feed-reader-scope-1',
        topicId,
        providerKey: 'reddit',
      }),
    ]);

    const otherTenantFeed = await request(app.getHttpServer())
      .get(`/relevance/users/${userId}/feed`)
      .query({ topicId, limit: 10 })
      .set('x-tenant-id', otherTenant)
      .set('x-workspace-id', sourceWorkspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(otherTenantFeed.body.items).toEqual([]);

    const otherTenantDigest = await request(app.getHttpServer())
      .get(`/relevance/users/${userId}/digest`)
      .query({
        topicIds: topicId,
        windowStartedAt: '2026-06-25T00:00:00.000Z',
        windowEndedAt: '2026-06-26T00:00:00.000Z',
        limit: 10,
      })
      .set('x-tenant-id', otherTenant)
      .set('x-workspace-id', sourceWorkspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(otherTenantDigest.body).toMatchObject({
      status: 'empty',
      items: [],
    });

    const otherTenantBriefings = await request(app.getHttpServer())
      .get('/briefings')
      .query({ scopeType: 'topic', topicId, limit: 10 })
      .set('x-tenant-id', otherTenant)
      .set('x-workspace-id', sourceWorkspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(otherTenantBriefings.body.items).toEqual([]);

    await request(app.getHttpServer())
      .get(`/briefings/${executedBriefing.value.readerSummaryId}`)
      .set('x-tenant-id', otherTenant)
      .set('x-workspace-id', sourceWorkspace)
      .set('x-workspace-role', 'viewer')
      .expect(404);

    await request(app.getHttpServer())
      .get(`/briefing-jobs/${briefingRequest.body.briefingJobId}/status`)
      .set('x-tenant-id', otherTenant)
      .set('x-workspace-id', sourceWorkspace)
      .set('x-workspace-role', 'viewer')
      .expect(404);

    await request(app.getHttpServer())
      .get(`/relevance/users/${userId}/feed`)
      .query({ topicId, limit: 10 })
      .set('x-tenant-id', otherTenant)
      .set('x-workspace-id', sourceWorkspace)
      .set('Authorization', `Bearer ${feedKey}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/briefings/${executedBriefing.value.readerSummaryId}`)
      .set('x-tenant-id', otherTenant)
      .set('x-workspace-id', sourceWorkspace)
      .set('Authorization', `Bearer ${summaryKey}`)
      .expect(403);
  });

  it('returns controlled tenant scope errors for reader surfaces', async () => {
    await request(app.getHttpServer())
      .get('/briefings')
      .set('x-workspace-id', workspaceId('workspace-reader-scope-missing-e2e'))
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'tenant.scope_missing',
          detail: 'x-tenant-id header is required',
        });
      });

    await request(app.getHttpServer())
      .get('/briefings/briefing-reader-scope-missing')
      .set('x-tenant-id', tenantId('tenant-reader-scope-missing-e2e'))
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'tenant.scope_missing',
          detail: 'x-workspace-id header is required',
        });
      });

    await request(app.getHttpServer())
      .get('/briefing-jobs/briefing-job-reader-scope-missing/status')
      .set('x-tenant-id', tenantId('tenant-reader-scope-missing-e2e'))
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'tenant.scope_missing',
          detail: 'x-workspace-id header is required',
        });
      });

    await request(app.getHttpServer())
      .get('/relevance/users/reader-scope-missing/feed')
      .set('x-workspace-id', workspaceId('workspace-reader-scope-missing-e2e'))
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'tenant.scope_missing',
          detail: 'x-tenant-id header is required',
        });
      });

    await request(app.getHttpServer())
      .get('/relevance/users/reader-scope-missing/digest')
      .query({
        topicIds: 'topic-reader-scope-missing',
        windowStartedAt: '2026-06-25T00:00:00.000Z',
        windowEndedAt: '2026-06-26T00:00:00.000Z',
      })
      .set('x-tenant-id', tenantId('tenant-reader-scope-missing-e2e'))
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'tenant.scope_missing',
          detail: 'x-workspace-id header is required',
        });
      });
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
