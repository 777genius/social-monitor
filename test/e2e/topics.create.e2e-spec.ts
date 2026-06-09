import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Create topic flow (e2e)', () => {
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

  it('creates a topic through REST and makes duplicate command idempotent', async () => {
    const first = await request(app.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', 'tenant-e2e')
      .set('x-workspace-id', 'workspace-e2e')
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-e2e')
      .set('idempotency-key', 'create-topic-e2e')
      .send({
        name: 'AI Monitoring',
        query: 'openai monitoring',
      })
      .expect(201);

    expect(first.body).toEqual({
      topicId: expect.any(String),
      created: true,
    });

    const second = await request(app.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', 'tenant-e2e')
      .set('x-workspace-id', 'workspace-e2e')
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'request-e2e')
      .set('idempotency-key', 'create-topic-e2e')
      .send({
        name: 'AI Monitoring',
        query: 'openai monitoring',
      })
      .expect(201);

    expect(second.body).toEqual({
      topicId: first.body.topicId,
      created: false,
    });
  });
});
