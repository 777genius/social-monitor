import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryPublicApiAuditLog } from '@social-monitor/usage/adapters/audit/in-memory-public-api-audit-log';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { MonitoringRestModule } from '../../libs/monitoring/interfaces/rest/monitoring-rest.module';

describe('Write surfaces API key scope enforcement (e2e)', () => {
  let app: INestApplication;
  let queue: InMemoryQueuePublisher;
  let auditLog: InMemoryPublicApiAuditLog;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    queue = moduleRef.select(MonitoringRestModule).get(InMemoryQueuePublisher, { strict: true });
    auditLog = moduleRef.get(InMemoryPublicApiAuditLog);
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

  it('allows a scoped headless monitoring API key to create topic, bind source and enqueue scan', async () => {
    const tenant = tenantId('tenant-write-monitoring-api-key-e2e');
    const workspace = workspaceId('workspace-write-monitoring-api-key-e2e');
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };
    const workflowSecret = await createApiKey({
      tenant,
      workspace,
      name: 'Headless monitoring writer',
      scopes: ['read:interests', 'write:interests', 'write:source_bindings', 'write:scan_requests'],
    });
    const readOnlySecret = await createApiKey({
      tenant,
      workspace,
      name: 'Read-only feed key',
      scopes: ['read:feed'],
    });

    const topic = await request(app.getHttpServer())
      .post('/interests')
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-monitoring-api-key-topic')
      .set('idempotency-key', 'write-monitoring-api-key-topic')
      .send({
        name: 'Write API key monitoring topic',
        query: 'write api key monitoring',
      })
      .expect(201);

    expect(topic.body).toMatchObject({
      interestId: expect.any(String),
      created: true,
    });

    const binding = await request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-monitoring-api-key-binding')
      .set('idempotency-key', 'write-monitoring-api-key-binding')
      .send({
        providerKey: 'fake-source',
        config: {
          query: 'write api key monitoring',
        },
      })
      .expect(201);

    expect(binding.body).toMatchObject({
      sourceBindingId: expect.any(String),
      created: true,
    });

    await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-monitoring-api-key-policy')
      .set('idempotency-key', 'write-monitoring-api-key-policy')
      .send({
        intervalSeconds: 900,
        freshnessSeconds: 3600,
        retryBudget: 2,
      })
      .expect(201);

    const scan = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-monitoring-api-key-scan')
      .set('x-correlation-id', 'write-monitoring-api-key-correlation')
      .set('idempotency-key', 'write-monitoring-api-key-scan')
      .expect(201);

    expect(scan.body).toMatchObject({
      status: 'enqueued',
      created: true,
    });
    expect(queue.all()).toEqual([
      expect.objectContaining({
        commandType: 'ingestion.scan.execute',
        correlationId: 'write-monitoring-api-key-correlation',
        payload: expect.objectContaining({
          scanJobId: scan.body.scanJobId,
          interestId: topic.body.interestId,
          sourceBindingId: binding.body.sourceBindingId,
        }),
      }),
    ]);

    await request(app.getHttpServer())
      .get(`/scan-requests/${scan.body.scanJobId}/status`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/interests')
      .set(headers)
      .set('Authorization', `Bearer ${readOnlySecret}`)
      .set('idempotency-key', 'write-monitoring-api-key-read-only-denied')
      .send({
        name: 'Forbidden topic',
        query: 'forbidden',
      })
      .expect(403);

    const auditRecords = await auditLog.list({
      tenantId: tenant,
      workspaceId: workspace,
      actorType: 'api_key',
      action: 'interests.create',
      outcome: 'succeeded',
      resourceType: 'public_api_request',
      limit: 10,
    });

    expect(auditRecords.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metadata: expect.objectContaining({
          requiredScope: 'write:interests',
        }),
      }),
    ]));
    expect(JSON.stringify(auditRecords.records)).not.toContain(workflowSecret);
  });

  it('allows a scoped summary API key to manage policy and request summary jobs', async () => {
    const tenant = tenantId('tenant-write-summary-api-key-e2e');
    const workspace = workspaceId('workspace-write-summary-api-key-e2e');
    const interestId = 'topic-write-summary-api-key-e2e';
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };
    const workflowSecret = await createApiKey({
      tenant,
      workspace,
      name: 'Headless summary writer',
      scopes: ['read:summaries', 'write:summaries'],
    });
    const readOnlySecret = await createApiKey({
      tenant,
      workspace,
      name: 'Read-only summary key',
      scopes: ['read:summaries'],
    });

    const policy = await request(app.getHttpServer())
      .put(`/interests/${interestId}/summary-policy`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-summary-api-key-policy')
      .send({
        language: 'en',
        format: 'bullet_digest',
        tone: 'concise',
        maxKeyPoints: 5,
        includeRisks: true,
        includeSourceHighlights: true,
      })
      .expect(200);

    expect(policy.body.policy).toMatchObject({
      interestId,
      language: 'en',
      maxKeyPoints: 5,
    });

    await request(app.getHttpServer())
      .get(`/interests/${interestId}/summary-policy`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .expect(200);

    const summary = await request(app.getHttpServer())
      .post(`/interests/${interestId}/summary-requests`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-summary-api-key-request')
      .set('idempotency-key', 'write-summary-api-key-request')
      .expect(201);

    expect(summary.body).toMatchObject({
      summaryJobId: expect.any(String),
      created: true,
    });

    await request(app.getHttpServer())
      .get(`/summary-jobs/${summary.body.summaryJobId}/status`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .expect(200);

    const readerSummary = await request(app.getHttpServer())
      .post('/reader-summary-requests')
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-summary-api-key-reader-summary-request')
      .set('idempotency-key', 'write-summary-api-key-reader-summary-request')
      .send({
        scope: {
          type: 'interest',
          interestId,
        },
        userId: 'write-summary-api-key-user',
      })
      .expect(201);

    expect(readerSummary.body).toMatchObject({
      readerSummaryJobId: expect.any(String),
      created: true,
    });

    await request(app.getHttpServer())
      .get(`/reader-summary-jobs/${readerSummary.body.readerSummaryJobId}/status`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .expect(200);

    const relevanceProfile = await request(app.getHttpServer())
      .put('/relevance/users/write-summary-api-key-user/profile')
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-summary-api-key-relevance-profile')
      .send({
        sourceWeights: [
          {
            key: 'github',
            weight: 2,
          },
        ],
        mutedKeywords: ['giveaway'],
      })
      .expect(200);

    expect(relevanceProfile.body.profile).toMatchObject({
      userId: 'write-summary-api-key-user',
      sourceWeights: [
        {
          key: 'github',
          weight: 2,
        },
      ],
    });

    const relevanceFeedback = await request(app.getHttpServer())
      .post('/relevance/users/write-summary-api-key-user/feedback')
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-summary-api-key-relevance-feedback')
      .send({
        idempotencyKey: 'write-summary-api-key-relevance-feedback',
        action: 'less_like_this',
        rating: 2,
        interestId,
        providerKey: 'rss',
        title: 'Low quality source',
        bodyPreview: 'The user does not want more of this source.',
        reason: 'low_quality_source',
      })
      .expect(201);

    expect(relevanceFeedback.body).toMatchObject({
      created: true,
      learningDirection: 'negative',
      feedback: {
        userId: 'write-summary-api-key-user',
        action: 'less_like_this',
      },
    });

    await request(app.getHttpServer())
      .put(`/interests/${interestId}/summary-policy`)
      .set(headers)
      .set('Authorization', `Bearer ${readOnlySecret}`)
      .set('x-request-id', 'write-summary-api-key-read-only-denied')
      .send({
        language: 'en',
        format: 'bullet_digest',
        tone: 'concise',
        maxKeyPoints: 4,
        includeRisks: true,
        includeSourceHighlights: true,
      })
      .expect(403);

    await request(app.getHttpServer())
      .post('/reader-summary-requests')
      .set(headers)
      .set('Authorization', `Bearer ${readOnlySecret}`)
      .set('idempotency-key', 'write-summary-api-key-reader-summary-read-only-denied')
      .send({
        scope: {
          type: 'interest',
          interestId,
        },
      })
      .expect(403);

    await request(app.getHttpServer())
      .put('/relevance/users/write-summary-api-key-user/profile')
      .set(headers)
      .set('Authorization', `Bearer ${readOnlySecret}`)
      .send({
        keywordWeights: [
          {
            key: 'agents',
            weight: 1,
          },
        ],
      })
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
