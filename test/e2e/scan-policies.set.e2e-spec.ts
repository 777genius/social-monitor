import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryPublicApiAuditLog } from '@social-monitor/usage/adapters/audit/in-memory-public-api-audit-log';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Set scan policy flow (e2e)', () => {
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

  it('sets scan policy for a fake source binding and makes duplicate command idempotent', async () => {
    const tenant = tenantId('tenant-policy-e2e');
    const workspace = workspaceId('workspace-policy-e2e');
    const topic = await request(app.getHttpServer())
      .post('/interests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-policy-topic')
      .set('idempotency-key', 'create-policy-topic')
      .send({
        name: 'Policy Monitoring',
        query: 'policy monitoring',
      })
      .expect(201);

    const binding = await request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-policy-bind')
      .set('idempotency-key', 'bind-policy-source')
      .send({
        providerKey: 'fake-source',
        config: { query: 'policy monitoring' },
      })
      .expect(201);

    const first = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-policy-set')
      .set('idempotency-key', 'set-policy')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);

    expect(first.body).toEqual({
      scanPolicyId: expect.any(String),
      created: true,
      updated: false,
    });

    const second = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-policy-set')
      .set('idempotency-key', 'set-policy')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);

    expect(second.body).toEqual({
      scanPolicyId: first.body.scanPolicyId,
      created: false,
      updated: false,
    });

    const auditRecords = await app.get(InMemoryPublicApiAuditLog).list({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 10,
    });

    expect(auditRecords.records.filter((record) => record.action === 'scan_policy.created')).toEqual([
      expect.objectContaining({
        actorType: 'system',
        actorId: 'monitoring.scan-policies',
        action: 'scan_policy.created',
        outcome: 'succeeded',
        resourceType: 'scan_policy',
        resourceId: first.body.scanPolicyId,
        metadata: {
          sourceBindingId: binding.body.sourceBindingId,
          intervalSeconds: 300,
          freshnessSeconds: 900,
          retryBudget: 3,
          created: true,
          updated: false,
        },
      }),
    ]);
  });

  it('rejects scan policy intervals below provider cadence minimum', async () => {
    const tenant = tenantId('tenant-policy-cadence-e2e');
    const workspace = workspaceId('workspace-policy-cadence-e2e');
    const topic = await request(app.getHttpServer())
      .post('/interests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-policy-cadence-topic')
      .set('idempotency-key', 'create-policy-cadence-topic')
      .send({
        name: 'Repo Radar Cadence',
        query: 'repo radar cadence',
      })
      .expect(201);

    const binding = await request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-policy-cadence-bind')
      .set('idempotency-key', 'bind-policy-cadence-source')
      .send({
        providerKey: 'github-repo-radar',
        config: { query: 'agent tooling', windows: ['24h', '7d'] },
      })
      .expect(201);

    const rejected = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-policy-cadence-set')
      .set('x-correlation-id', 'correlation-policy-cadence-set')
      .set('idempotency-key', 'set-policy-cadence-too-fast')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(400);

    expect(rejected.headers['x-request-id']).toBe('request-policy-cadence-set');
    expect(rejected.headers['x-correlation-id']).toBe('correlation-policy-cadence-set');
    expect(rejected.body).toMatchObject({
      code: 'validation.failed',
      requestId: 'request-policy-cadence-set',
      correlationId: 'correlation-policy-cadence-set',
      details: {
        providerKey: 'github-repo-radar',
        intervalSeconds: 300,
        minimumIntervalSeconds: 21_600,
      },
    });

    const auditRecords = await app.get(InMemoryPublicApiAuditLog).list({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 10,
    });

    expect(auditRecords.records.filter((record) => record.action === 'scan_policy.created')).toHaveLength(0);
  });
});
