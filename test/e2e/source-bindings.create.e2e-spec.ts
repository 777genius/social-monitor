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
      .post('/topics')
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
      .post(`/topics/${topic.body.topicId}/source-bindings`)
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
      .post(`/topics/${topic.body.topicId}/source-bindings`)
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
      .get(`/topics/${topic.body.topicId}/source-bindings/overview`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(overview.body).toEqual({
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
          topicId: topic.body.topicId,
          created: true,
        },
      }),
    ]);
    expect(JSON.stringify(auditRecords.records)).not.toContain('config');
  });

  it('rejects deferred providers before creating bindings or audit success records', async () => {
    const tenant = tenantId('tenant-source-deferred-e2e');
    const workspace = workspaceId('workspace-source-deferred-e2e');
    const topic = await request(app.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-source-deferred-topic')
      .set('idempotency-key', 'create-source-deferred-topic')
      .send({
        name: 'Deferred Source Monitoring',
        query: 'x twitter launch monitoring',
      })
      .expect(201);

    const rejected = await request(app.getHttpServer())
      .post(`/topics/${topic.body.topicId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-source-bind-deferred')
      .set('idempotency-key', 'bind-x-twitter-deferred')
      .send({
        providerKey: 'x-twitter',
        config: { query: 'x twitter launch monitoring' },
      })
      .expect(400);

    expect(rejected.body).toMatchObject({
      code: 'validation.failed',
      detail: 'Source provider is not available for production-safe MVP scans',
      details: {
        providerKey: 'x-twitter',
      },
    });

    const bindings = await request(app.getHttpServer())
      .get(`/topics/${topic.body.topicId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(bindings.body.sourceBindings).toEqual([]);

    const auditRecords = await app.get(InMemoryPublicApiAuditLog).list({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 10,
    });

    expect(auditRecords.records.filter((record) => record.action === 'source_binding.created')).toEqual([]);
  });
});
