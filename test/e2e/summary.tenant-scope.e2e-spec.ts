import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Summary tenant scope guard (e2e)', () => {
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

  it('returns controlled tenant.scope_missing problem for summary request without tenant', async () => {
    const response = await request(app.getHttpServer())
      .post('/interests/topic-summary-scope-e2e/summary-requests')
      .set('x-workspace-id', workspaceId('workspace-summary-scope-e2e'))
      .set('idempotency-key', 'summary-scope-request-1')
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'tenant.scope_missing',
      detail: 'x-tenant-id header is required',
    });
  });

  it('returns controlled tenant.scope_missing problem for summary list without workspace', async () => {
    const response = await request(app.getHttpServer())
      .get('/summaries')
      .set('x-tenant-id', tenantId('tenant-summary-scope-e2e'))
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'tenant.scope_missing',
      detail: 'x-workspace-id header is required',
    });
  });

  it('returns controlled tenant.scope_missing problem for summary get without tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/summaries/summary-scope-e2e')
      .set('x-workspace-id', workspaceId('workspace-summary-scope-e2e'))
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'tenant.scope_missing',
      detail: 'x-tenant-id header is required',
    });
  });

  it('returns controlled tenant.scope_missing problem for summary regeneration without workspace', async () => {
    const response = await request(app.getHttpServer())
      .post('/summaries/summary-scope-e2e/regenerations')
      .set('x-tenant-id', tenantId('tenant-summary-scope-e2e'))
      .set('idempotency-key', 'summary-scope-regeneration-1')
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'tenant.scope_missing',
      detail: 'x-workspace-id header is required',
    });
  });

  it('returns controlled tenant.scope_missing problem for summary job status without workspace', async () => {
    const response = await request(app.getHttpServer())
      .get('/summary-jobs/summary-job-scope-e2e/status')
      .set('x-tenant-id', tenantId('tenant-summary-scope-e2e'))
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'tenant.scope_missing',
      detail: 'x-workspace-id header is required',
    });
  });
});
