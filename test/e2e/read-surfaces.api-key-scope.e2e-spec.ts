import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { FeedItem } from '@social-monitor/feed/domain';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ExecuteReaderSummaryJobUseCase } from '@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case';
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
      providerKey: 'github',
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
    const topicKey = await createApiKey({
      tenant,
      workspace,
      name: 'Topic reader key',
      scopes: ['read:topics'],
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

    const rankedFeed = await request(app.getHttpServer())
      .get('/relevance/users/read-api-key-user/feed')
      .query({ topicId, limit: 10 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${feedKey}`)
      .expect(200);

    expect(rankedFeed.body.items).toEqual([
      expect.objectContaining({
        feedItemId: 'feed-read-api-key-1',
        topicId,
        providerKey: 'github',
      }),
    ]);

    const digest = await request(app.getHttpServer())
      .get('/relevance/users/read-api-key-user/digest')
      .query({
        topicIds: topicId,
        windowStartedAt: '2026-06-06T00:00:00.000Z',
        windowEndedAt: '2026-06-07T00:00:00.000Z',
        limit: 10,
      })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${feedKey}`)
      .expect(200);

    expect(digest.body).toMatchObject({
      userId: 'read-api-key-user',
      topicIds: [topicId],
    });
    expect(digest.body.items).toEqual([
      expect.objectContaining({
        feedItemId: 'feed-read-api-key-1',
        topicId,
      }),
    ]);

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

    const monitoringTopic = await request(app.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'read-api-key-monitoring-topic')
      .set('idempotency-key', 'read-api-key-monitoring-topic')
      .send({
        name: 'Read API key monitoring topic',
        query: 'read api key monitoring',
      })
      .expect(201);

    const binding = await request(app.getHttpServer())
      .post(`/topics/${monitoringTopic.body.topicId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'read-api-key-monitoring-binding')
      .set('idempotency-key', 'read-api-key-monitoring-binding')
      .send({
        providerKey: 'fake-source',
        config: { query: 'read api key monitoring' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'read-api-key-monitoring-policy')
      .set('idempotency-key', 'read-api-key-monitoring-policy')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);

    const scan = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'read-api-key-monitoring-scan')
      .set('idempotency-key', 'read-api-key-monitoring-scan')
      .expect(201);

    const overview = await request(app.getHttpServer())
      .get(`/topics/${monitoringTopic.body.topicId}/source-bindings/overview`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${topicKey}`)
      .expect(200);

    expect(overview.body.items).toEqual([
      expect.objectContaining({
        sourceBinding: expect.objectContaining({
          id: binding.body.sourceBindingId,
          providerKey: 'fake-source',
        }),
      }),
    ]);

    const scanHistory = await request(app.getHttpServer())
      .get(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .query({ limit: 10 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${topicKey}`)
      .expect(200);

    expect(scanHistory.body.scanRequests).toEqual([
      expect.objectContaining({
        scanJobId: scan.body.scanJobId,
        sourceBindingId: binding.body.sourceBindingId,
        status: 'enqueued',
      }),
    ]);

    const dailyHistory = await request(app.getHttpServer())
      .get(`/source-bindings/${binding.body.sourceBindingId}/scan-requests/daily`)
      .query({ days: 1 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${topicKey}`)
      .expect(200);

    expect(dailyHistory.body.days).toEqual([
      expect.objectContaining({
        totalScans: 1,
        activeScans: 1,
        signals: ['active_scan_in_progress'],
      }),
    ]);

    await request(app.getHttpServer())
      .get(`/topics/${monitoringTopic.body.topicId}/source-bindings/overview`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${feedKey}`)
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

    const briefingRequest = await request(app.getHttpServer())
      .post('/briefing-requests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'read-api-key-briefing-request')
      .set('idempotency-key', 'read-api-key-briefing-request')
      .send({
        scope: {
          type: 'topic',
          topicId,
        },
        userId: 'read-api-key-user',
      })
      .expect(201);

    const executedBriefing = await app.get(ExecuteReaderSummaryJobUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: briefingRequest.body.briefingJobId,
    });

    if (!executedBriefing.ok || executedBriefing.value.readerSummaryId === undefined) {
      throw new Error('Expected briefing execution to produce a briefing id');
    }

    const briefingStatus = await request(app.getHttpServer())
      .get(`/briefing-jobs/${briefingRequest.body.briefingJobId}/status`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${summaryKey}`)
      .expect(200);

    expect(briefingStatus.body).toMatchObject({
      briefingJobId: briefingRequest.body.briefingJobId,
      briefingId: executedBriefing.value.readerSummaryId,
      status: 'completed',
    });

    const briefingList = await request(app.getHttpServer())
      .get('/briefings')
      .query({ scopeType: 'topic', topicId, limit: 10 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${summaryKey}`)
      .expect(200);

    expect(briefingList.body.items).toEqual([
      expect.objectContaining({
        briefingId: executedBriefing.value.readerSummaryId,
        scope: {
          type: 'topic',
          topicId,
        },
      }),
    ]);

    const briefingDetail = await request(app.getHttpServer())
      .get(`/briefings/${executedBriefing.value.readerSummaryId}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${summaryKey}`)
      .expect(200);

    expect(briefingDetail.body).toMatchObject({
      briefingId: executedBriefing.value.readerSummaryId,
      readerBrief: {
        sourceMix: [
          expect.objectContaining({
            providerKey: 'github',
            itemCount: 1,
            citationCount: expect.any(Number),
          }),
        ],
        topReads: [
          expect.objectContaining({
            providerKey: 'github',
            canonicalUrl: 'https://example.test/read-api-key-feed',
            citationIds: expect.arrayContaining([expect.any(String)]),
            whyNow: expect.any(String),
          }),
        ],
      },
      citations: [
        expect.objectContaining({
          providerKey: 'github',
          canonicalUrl: 'https://example.test/read-api-key-feed',
          label: expect.stringMatching(/^\[\d+\]$/),
        }),
      ],
    });
    expect(briefingDetail.body.readerBrief.topReads[0].whyNow.trim()).not.toHaveLength(0);
    expect(briefingDetail.body.readerBrief.oneLineTakeaway.trim()).not.toHaveLength(0);
    expect(briefingDetail.body.readerBrief.bullets.length).toBeGreaterThan(0);
    expect(briefingDetail.body.readerBrief.qualityState.status).toMatch(
      /^(ready|partial|limited_sources|low_confidence|no_signal|failed_provider)$/,
    );
    expect(briefingDetail.body.readerBrief.topReads[0].citationIds).toEqual(
      expect.arrayContaining([briefingDetail.body.citations[0].citationId]),
    );

    await request(app.getHttpServer())
      .get('/briefing-jobs/missing-read-api-key-briefing-job/status')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${summaryKey}`)
      .expect(404);

    await request(app.getHttpServer())
      .get('/briefings')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('Authorization', `Bearer ${feedKey}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/briefings/${executedBriefing.value.readerSummaryId}`)
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
