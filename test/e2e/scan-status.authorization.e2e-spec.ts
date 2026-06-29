import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Scan status workspace authorization (e2e)', () => {
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

  it('requires any workspace role before reading scan job status', async () => {
    const tenant = tenantId('tenant-scan-status-authorization-e2e');
    const workspace = workspaceId('workspace-scan-status-authorization-e2e');
    const topic = await request(app.getHttpServer())
      .post('/interests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'scan-status-auth-topic')
      .set('idempotency-key', 'scan-status-auth-topic')
      .send({
        name: 'Scan Status Authorization',
        query: 'scan status authorization',
      })
      .expect(201);
    const binding = await request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'scan-status-auth-binding')
      .set('idempotency-key', 'scan-status-auth-binding')
      .send({
        providerKey: 'fake-source',
        config: { query: 'scan status authorization' },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'scan-status-auth-policy')
      .set('idempotency-key', 'scan-status-auth-policy')
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
      .set('x-request-id', 'scan-status-auth-request')
      .set('idempotency-key', 'scan-status-auth-request')
      .expect(201);

    const missingRole = await request(app.getHttpServer())
      .get(`/scan-requests/${scan.body.scanJobId}/status`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'scan_jobs.read',
      },
    });

    const viewer = await request(app.getHttpServer())
      .get(`/scan-requests/${scan.body.scanJobId}/status`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(viewer.body).toMatchObject({
      scanJobId: scan.body.scanJobId,
      status: 'enqueued',
    });
  });
});
