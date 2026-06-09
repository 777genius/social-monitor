import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Webhook endpoint public API rate limit (e2e)', () => {
  let app: INestApplication;
  let previousLimit: string | undefined;

  beforeAll(async () => {
    previousLimit = process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE;
    process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE = '2';
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
    if (previousLimit === undefined) {
      delete process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE;
    } else {
      process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE = previousLimit;
    }
    await app.close();
  });

  it('returns 429 after an API key exceeds the webhook management rate limit', async () => {
    const tenant = tenantId('tenant-webhook-rate-limit-e2e');
    const workspace = workspaceId('workspace-webhook-rate-limit-e2e');
    const apiKey = await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .send({
        name: 'Webhook endpoint manager',
        scopes: ['write:webhook_endpoints'],
      })
      .expect(201);
    const authorization = `Bearer ${apiKey.body.secret}`;

    await createWebhookEndpoint(tenant, workspace, authorization, 'first').expect(201);
    await createWebhookEndpoint(tenant, workspace, authorization, 'second').expect(201);

    const limited = await createWebhookEndpoint(tenant, workspace, authorization, 'third').expect(429);

    expect(limited.body).toMatchObject({
      code: 'operation.rate_limited',
      details: {
        operation: 'webhook_endpoints.manage',
        limit: 2,
        remaining: 0,
        retryAfterSeconds: expect.any(Number),
        resetAt: expect.any(String),
      },
    });
  });

  const createWebhookEndpoint = (
    tenant: string,
    workspace: string,
    authorization: string,
    suffix: string,
  ): request.Test => request(app.getHttpServer())
    .post('/delivery/webhook-endpoints')
    .set('x-tenant-id', tenant)
    .set('x-workspace-id', workspace)
    .set('x-workspace-role', 'admin')
    .set('Authorization', authorization)
    .send({
      url: `https://example.com/webhooks/rate-limit-${suffix}`,
      eventTypes: ['digest.ready.v1'],
    });
});
