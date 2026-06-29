import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { createApiGatewayE2eApp } from './support/api-gateway-e2e-app';

describe('API gateway public errors (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = createApiGatewayE2eApp(moduleRef);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns redacted problem details for transport validation failures', async () => {
    const response = await request(app.getHttpServer())
      .post('/interests')
      .set('x-tenant-id', 'tenant-public-error-e2e')
      .set('x-workspace-id', 'workspace-public-error-e2e')
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-public-error-e2e')
      .set('idempotency-key', 'public-error-validation')
      .send({
        name: 'AI Monitoring',
        query: 'openai monitoring',
        accessToken: 'raw-token-that-must-not-leak',
      })
      .expect(400);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toEqual(expect.objectContaining({
      type: 'https://social-monitor.local/problems/validation.failed',
      title: 'Validation failed',
      status: 400,
      code: 'validation.failed',
      requestId: 'request-public-error-e2e',
      correlationId: 'request-public-error-e2e',
      details: expect.objectContaining({
        messages: expect.arrayContaining([
          expect.stringContaining('accessToken'),
        ]),
      }),
    }));
    expect(JSON.stringify(response.body)).not.toContain('raw-token-that-must-not-leak');
  });

  it('returns problem details for framework-level not found errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/not-a-real-route')
      .set('x-request-id', 'request-public-not-found-e2e')
      .expect(404);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toEqual(expect.objectContaining({
      type: 'https://social-monitor.local/problems/resource.not_found',
      title: 'Resource not found',
      status: 404,
      code: 'resource.not_found',
      requestId: 'request-public-not-found-e2e',
      correlationId: 'request-public-not-found-e2e',
    }));
  });
});
