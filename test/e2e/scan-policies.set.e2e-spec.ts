import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Set scan policy flow (e2e)', () => {
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

  it('sets scan policy for a fake source binding and makes duplicate command idempotent', async () => {
    const topic = await request(app.getHttpServer())
      .post('/topics')
      .set('x-tenant-id', 'tenant-policy-e2e')
      .set('x-workspace-id', 'workspace-policy-e2e')
      .set('x-request-id', 'request-policy-topic')
      .set('idempotency-key', 'create-policy-topic')
      .send({
        name: 'Policy Monitoring',
        query: 'policy monitoring',
      })
      .expect(201);

    const binding = await request(app.getHttpServer())
      .post(`/topics/${topic.body.topicId}/source-bindings`)
      .set('x-tenant-id', 'tenant-policy-e2e')
      .set('x-workspace-id', 'workspace-policy-e2e')
      .set('x-request-id', 'request-policy-bind')
      .set('idempotency-key', 'bind-policy-source')
      .send({
        providerKey: 'fake-source',
        config: { query: 'policy monitoring' },
      })
      .expect(201);

    const first = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', 'tenant-policy-e2e')
      .set('x-workspace-id', 'workspace-policy-e2e')
      .set('x-request-id', 'request-policy-set')
      .set('idempotency-key', 'set-policy')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);

    expect(first.body).toEqual({
      scanPolicyId: expect.any(String),
      created: true,
    });

    const second = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', 'tenant-policy-e2e')
      .set('x-workspace-id', 'workspace-policy-e2e')
      .set('x-request-id', 'request-policy-set')
      .set('idempotency-key', 'set-policy')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);

    expect(second.body).toEqual({
      scanPolicyId: first.body.scanPolicyId,
      created: false,
    });
  });
});
