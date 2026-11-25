import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('API key listing (e2e)', () => {
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

  it('lists API keys without raw secrets or hashes', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-api-key-list-e2e'));
    const workspace = workspaceId(deterministicTestUuid('workspace-api-key-list-e2e'));
    const first = await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .send({
        name: 'First key',
        scopes: ['read:summaries'],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .send({
        name: 'Second key',
        scopes: ['read:delivery_status'],
      })
      .expect(201);

    const listed = await request(app.getHttpServer())
      .get('/identity/api-keys?limit=10')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .expect(200);

    expect(listed.body.apiKeys).toHaveLength(2);
    expect(listed.body.apiKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: first.body.apiKey.id,
          name: 'First key',
          status: 'active',
          keyPrefix: first.body.apiKey.keyPrefix,
        }),
      ]),
    );
    expect(JSON.stringify(listed.body)).not.toContain(first.body.secret);
    expect(JSON.stringify(listed.body)).not.toContain('secretHash');
  });
});
