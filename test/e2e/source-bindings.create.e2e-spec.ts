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

    const auditRecords = await app.get(InMemoryPublicApiAuditLog).list({
      tenantId: tenant,
      workspaceId: workspace,
    });

    expect(auditRecords.filter((record) => record.action === 'source_binding.created')).toEqual([
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
    expect(JSON.stringify(auditRecords)).not.toContain('config');
  });
});
