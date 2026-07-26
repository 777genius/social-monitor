import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Webhook endpoint tenant scope guard (e2e)', () => {
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

  it('returns controlled tenant.scope_missing problem when tenant header is absent', async () => {
    const workspace = workspaceId(deterministicTestUuid('workspace-webhook-tenant-scope-e2e'));
    const response = await request(app.getHttpServer())
      .get('/delivery/webhook-endpoints')
      .set('x-workspace-id', workspace)
      .set('Authorization', 'Bearer invalid')
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'tenant.scope_missing',
      detail: 'x-tenant-id header is required',
    });
  });

  it('returns controlled tenant.scope_missing problem when workspace header is absent', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-webhook-tenant-scope-e2e'));
    const response = await request(app.getHttpServer())
      .get('/delivery/webhook-endpoints')
      .set('x-tenant-id', tenant)
      .set('Authorization', 'Bearer invalid')
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'tenant.scope_missing',
      detail: 'x-workspace-id header is required',
    });
  });
});
