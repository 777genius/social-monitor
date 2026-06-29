import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Summary request flow (e2e)', () => {
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

  it('creates topic summary request idempotently', async () => {
    const first = await request(app.getHttpServer())
      .post('/interests/topic-summary-e2e/summary-requests')
      .set('x-tenant-id', 'tenant-summary-e2e')
      .set('x-workspace-id', 'workspace-summary-e2e')
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'summary-request-1')
      .set('idempotency-key', 'summary-request-1')
      .expect(201);

    expect(first.body).toEqual({
      summaryJobId: expect.any(String),
      status: 'requested',
      created: true,
    });

    const second = await request(app.getHttpServer())
      .post('/interests/topic-summary-e2e/summary-requests')
      .set('x-tenant-id', 'tenant-summary-e2e')
      .set('x-workspace-id', 'workspace-summary-e2e')
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'summary-request-1')
      .set('idempotency-key', 'summary-request-1')
      .expect(201);

    expect(second.body).toEqual({
      summaryJobId: first.body.summaryJobId,
      status: 'requested',
      created: false,
    });
  });
});
