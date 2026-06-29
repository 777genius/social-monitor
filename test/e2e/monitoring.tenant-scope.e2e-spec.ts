import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Monitoring tenant scope guard (e2e)', () => {
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

  it('returns controlled tenant.scope_missing problem for topic create without tenant', async () => {
    const response = await request(app.getHttpServer())
      .post('/interests')
      .set('x-workspace-id', workspaceId('workspace-monitoring-scope-e2e'))
      .set('idempotency-key', 'monitoring-scope-topic-1')
      .send({
        name: 'Scope Monitoring',
        query: 'scope monitoring',
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'tenant.scope_missing',
      detail: 'x-tenant-id header is required',
    });
  });

  it('returns controlled tenant.scope_missing problem for source binding without workspace', async () => {
    const response = await request(app.getHttpServer())
      .post('/interests/topic-monitoring-scope-e2e/source-bindings')
      .set('x-tenant-id', tenantId('tenant-monitoring-scope-e2e'))
      .set('idempotency-key', 'monitoring-scope-binding-1')
      .send({
        providerKey: 'fake-source',
        config: { query: 'scope monitoring' },
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'tenant.scope_missing',
      detail: 'x-workspace-id header is required',
    });
  });

  it('returns controlled tenant.scope_missing problem for scan policy without tenant', async () => {
    const response = await request(app.getHttpServer())
      .post('/source-bindings/source-binding-monitoring-scope-e2e/scan-policy')
      .set('x-workspace-id', workspaceId('workspace-monitoring-scope-e2e'))
      .set('idempotency-key', 'monitoring-scope-policy-1')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'tenant.scope_missing',
      detail: 'x-tenant-id header is required',
    });
  });

  it('returns controlled tenant.scope_missing problem for scan request without workspace', async () => {
    const response = await request(app.getHttpServer())
      .post('/source-bindings/source-binding-monitoring-scope-e2e/scan-requests')
      .set('x-tenant-id', tenantId('tenant-monitoring-scope-e2e'))
      .set('idempotency-key', 'monitoring-scope-scan-1')
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'tenant.scope_missing',
      detail: 'x-workspace-id header is required',
    });
  });

  it('returns controlled tenant.scope_missing problem for scan status without workspace', async () => {
    const response = await request(app.getHttpServer())
      .get('/scan-requests/scan-job-monitoring-scope-e2e/status')
      .set('x-tenant-id', tenantId('tenant-monitoring-scope-e2e'))
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'tenant.scope_missing',
      detail: 'x-workspace-id header is required',
    });
  });
});
