import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Create interest flow (e2e)', () => {
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

  it('creates an interest through REST and makes duplicate command idempotent', async () => {
    const first = await request(app.getHttpServer())
      .post('/interests')
      .set('x-tenant-id', deterministicTestUuid('tenant-e2e'))
      .set('x-workspace-id', deterministicTestUuid('workspace-e2e'))
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-e2e')
      .set('idempotency-key', 'create-interest-e2e')
      .send({
        name: 'AI Monitoring',
        query: 'openai monitoring',
      })
      .expect(201);

    expect(first.body).toEqual({
      interestId: expect.any(String),
      created: true,
    });

    const second = await request(app.getHttpServer())
      .post('/interests')
      .set('x-tenant-id', deterministicTestUuid('tenant-e2e'))
      .set('x-workspace-id', deterministicTestUuid('workspace-e2e'))
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-e2e')
      .set('idempotency-key', 'create-interest-e2e')
      .send({
        name: 'AI Monitoring',
        query: 'openai monitoring',
      })
      .expect(201);

    expect(second.body).toEqual({
      interestId: first.body.interestId,
      created: false,
    });
  });
});
