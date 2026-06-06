import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Delivery read tenant scope guard (e2e)', () => {
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

  it('returns controlled tenant.scope_missing problem for delivery attempt read without tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/delivery/attempts/attempt-1')
      .set('x-workspace-id', workspaceId('workspace-delivery-read-scope-e2e'))
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'tenant.scope_missing',
      detail: 'x-tenant-id header is required',
    });
  });

  it('returns controlled tenant.scope_missing problem for digest read without workspace', async () => {
    const response = await request(app.getHttpServer())
      .get('/delivery/digests/digest-1')
      .set('x-tenant-id', tenantId('tenant-delivery-read-scope-e2e'))
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'tenant.scope_missing',
      detail: 'x-workspace-id header is required',
    });
  });

  it('returns controlled tenant.scope_missing problem for realtime replay without workspace', async () => {
    const response = await request(app.getHttpServer())
      .get('/realtime/events')
      .query({ channel: 'workspace' })
      .set('x-tenant-id', tenantId('tenant-realtime-read-scope-e2e'))
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'tenant.scope_missing',
      detail: 'x-workspace-id header is required',
    });
  });
});
