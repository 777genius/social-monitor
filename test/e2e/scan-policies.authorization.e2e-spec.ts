import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Scan policy workspace authorization (e2e)', () => {
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

  it('requires an owner or admin workspace role to set scan policies', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-scan-policy-authorization-e2e'));
    const workspace = workspaceId(deterministicTestUuid('workspace-scan-policy-authorization-e2e'));
    const topic = await request(app.getHttpServer())
      .post('/interests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'owner')
      .set('x-request-id', 'scan-policy-auth-topic')
      .set('idempotency-key', 'scan-policy-auth-topic')
      .send({
        name: 'Scan policy auth topic',
        query: 'scan policy auth topic',
      })
      .expect(201);

    const binding = await request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'owner')
      .set('x-request-id', 'scan-policy-auth-binding')
      .set('idempotency-key', 'scan-policy-auth-binding')
      .send({
        providerKey: 'fake-source',
        config: { query: 'scan policy auth binding' },
      })
      .expect(201);

    const missingRole = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'scan-policy-auth-missing-role')
      .set('idempotency-key', 'scan-policy-auth-missing-role')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'scan_policies.set',
      },
    });

    const viewer = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('x-request-id', 'scan-policy-auth-viewer')
      .set('idempotency-key', 'scan-policy-auth-viewer')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(403);

    expect(viewer.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is not allowed for this action',
      details: {
        action: 'scan_policies.set',
        requiredRoles: ['owner', 'admin'],
      },
    });

    const owner = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'owner')
      .set('x-request-id', 'scan-policy-auth-owner')
      .set('idempotency-key', 'scan-policy-auth-owner')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);

    expect(owner.body).toEqual({
      scanPolicyId: expect.any(String),
      created: true,
      updated: false,
    });
  });
});
