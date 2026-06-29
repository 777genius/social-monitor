import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryPublicApiAuditLog } from '@social-monitor/usage/adapters/audit/in-memory-public-api-audit-log';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Bind source flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
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

  it('binds fake source to an existing topic and makes duplicate command idempotent', async () => {
    const tenant = tenantId('tenant-source-e2e');
    const workspace = workspaceId('workspace-source-e2e');
    const topic = await request(app.getHttpServer())
      .post('/interests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-source-topic')
      .set('idempotency-key', 'create-source-topic')
      .send({
        name: 'Source Monitoring',
        query: 'source monitoring',
      })
      .expect(201);

    const first = await request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-source-bind')
      .set('idempotency-key', 'bind-fake-source')
      .send({
        providerKey: 'fake-source',
        config: { query: 'source monitoring' },
      })
      .expect(201);

    expect(first.body).toEqual({
      sourceBindingId: expect.any(String),
      created: true,
    });

    const second = await request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-source-bind')
      .set('idempotency-key', 'bind-fake-source')
      .send({
        providerKey: 'fake-source',
        config: { query: 'source monitoring' },
      })
      .expect(201);

    expect(second.body).toEqual({
      sourceBindingId: first.body.sourceBindingId,
      created: false,
    });

    const overview = await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings/overview`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(overview.body).toEqual({
      summary: expect.objectContaining({
        totalBindings: 1,
        notConfiguredBindings: 1,
        attentionRequiredBindings: 1,
        operatorAction: 'create_scan_policy_for_source_binding',
        signals: ['source_not_configured'],
        providerBreakdown: [
          expect.objectContaining({
            providerKey: 'fake-source',
            totalBindings: 1,
            notConfiguredBindings: 1,
          }),
        ],
      }),
      items: [
        expect.objectContaining({
          sourceBinding: expect.objectContaining({
            id: first.body.sourceBindingId,
            providerKey: 'fake-source',
          }),
          healthState: 'not_configured',
          operatorAction: 'create_scan_policy_for_source_binding',
          evaluatedAt: expect.any(String),
          recentWindow: expect.objectContaining({
            providerHealthState: 'unknown',
            totalScans: 0,
            signals: ['no_recent_scans'],
          }),
        }),
      ],
    });

    const auditRecords = await app.get(InMemoryPublicApiAuditLog).list({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 10,
    });

    expect(auditRecords.records.filter((record) => record.action === 'source_binding.created')).toEqual([
      expect.objectContaining({
        actorType: 'system',
        actorId: 'monitoring.source-bindings',
        action: 'source_binding.created',
        outcome: 'succeeded',
        resourceType: 'source_binding',
        resourceId: first.body.sourceBindingId,
        metadata: {
          providerKey: 'fake-source',
          interestId: topic.body.interestId,
          created: true,
        },
      }),
    ]);
    expect(JSON.stringify(auditRecords.records)).not.toContain('config');
  });

  it('filters source binding list and overview by provider and status', async () => {
    const tenant = tenantId('tenant-source-filter-e2e');
    const workspace = workspaceId('workspace-source-filter-e2e');
    const topic = await request(app.getHttpServer())
      .post('/interests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-source-filter-topic')
      .set('idempotency-key', 'create-source-filter-topic')
      .send({
        name: 'Source Filter Monitoring',
        query: 'source filter monitoring',
      })
      .expect(201);

    const fake = await request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-source-filter-fake')
      .set('idempotency-key', 'bind-source-filter-fake')
      .send({
        providerKey: 'fake-source',
        config: { query: 'source filter monitoring' },
      })
      .expect(201);

    const rss = await request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-source-filter-rss')
      .set('idempotency-key', 'bind-source-filter-rss')
      .send({
        providerKey: 'rss',
        config: { feedUrl: 'https://example.test/filter-feed.xml' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/interests/${topic.body.interestId}/source-bindings/${rss.body.sourceBindingId}/status`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-source-filter-pause-rss')
      .set('idempotency-key', 'pause-source-filter-rss')
      .send({ status: 'paused' })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings`)
      .query({ providerKey: 'rss', status: 'paused' })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          sourceBindings: [
            expect.objectContaining({
              id: rss.body.sourceBindingId,
              providerKey: 'rss',
              status: 'paused',
            }),
          ],
        });
      });

    await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings`)
      .query({ status: 'enabled' })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200)
      .expect((response) => {
        expect(response.body.sourceBindings).toEqual([
          expect.objectContaining({
            id: fake.body.sourceBindingId,
            status: 'enabled',
          }),
        ]);
      });

    await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings/overview`)
      .query({ providerKey: 'rss', status: 'paused' })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          summary: {
            totalBindings: 1,
            pausedBindings: 1,
            providerBreakdown: [
              expect.objectContaining({
                providerKey: 'rss',
                totalBindings: 1,
                pausedBindings: 1,
              }),
            ],
          },
          items: [
            expect.objectContaining({
              sourceBinding: expect.objectContaining({
                id: rss.body.sourceBindingId,
                providerKey: 'rss',
                status: 'paused',
              }),
              healthState: 'paused',
            }),
          ],
        });
      });
  });

  it('binds canonical X/Twitter as a production-safe source and records audit success', async () => {
    const tenant = tenantId('tenant-source-x-e2e');
    const workspace = workspaceId('workspace-source-x-e2e');
    const topic = await request(app.getHttpServer())
      .post('/interests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-source-x-interest')
      .set('idempotency-key', 'create-source-x-interest')
      .send({
        name: 'X Source Monitoring',
        query: 'x twitter launch monitoring',
      })
      .expect(201);

    const bound = await request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-source-bind-x')
      .set('idempotency-key', 'bind-x-twitter')
      .send({
        providerKey: 'x-twitter',
        config: { query: 'x twitter launch monitoring' },
      })
      .expect(201);

    expect(bound.body).toEqual({
      sourceBindingId: expect.any(String),
      created: true,
    });

    const bindings = await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(bindings.body.sourceBindings).toEqual([
      expect.objectContaining({
        id: bound.body.sourceBindingId,
        providerKey: 'x-twitter',
      }),
    ]);

    const auditRecords = await app.get(InMemoryPublicApiAuditLog).list({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 10,
    });

    expect(auditRecords.records.filter((record) => record.action === 'source_binding.created')).toEqual([
      expect.objectContaining({
        action: 'source_binding.created',
        outcome: 'succeeded',
        resourceId: bound.body.sourceBindingId,
        metadata: {
          providerKey: 'x-twitter',
          interestId: topic.body.interestId,
          created: true,
        },
      }),
    ]);
  });
});
