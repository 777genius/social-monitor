import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('API gateway health (e2e)', () => {
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

  it('returns liveness and correlation header', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'test-request-id')
      .set('x-correlation-id', 'test-correlation-id')
      .set('x-causation-id', 'test-causation-id')
      .expect(200)
      .expect('x-request-id', 'test-request-id')
      .expect('x-correlation-id', 'test-correlation-id')
      .expect('x-causation-id', 'test-causation-id')
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({
          status: 'ok',
          service: 'api-gateway',
          checkedAt: expect.any(String),
          uptimeSeconds: expect.any(Number),
        }));
      });
  });

  it('keeps /healthz as a liveness alias', async () => {
    const response = await request(app.getHttpServer())
      .get('/healthz')
      .set('x-request-id', 'test-healthz-request-id')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('test-healthz-request-id');
    expect(response.body).toEqual(expect.objectContaining({
      status: 'ok',
      service: 'api-gateway',
      checkedAt: expect.any(String),
      uptimeSeconds: expect.any(Number),
    }));
  });

  it('returns readiness', async () => {
    const response = await request(app.getHttpServer()).get('/ready').expect(200);

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.headers['x-correlation-id']).toBe(response.headers['x-request-id']);
    expect(response.body).toEqual(expect.objectContaining({
      status: 'ok',
      service: 'api-gateway',
      checkedAt: expect.any(String),
      uptimeSeconds: expect.any(Number),
      checks: expect.arrayContaining([
        expect.objectContaining({ name: 'api_gateway', status: 'ok' }),
      ]),
      capabilities: expect.objectContaining({
        rest: 'enabled',
      }),
      runtime: expect.objectContaining({
        nodeEnv: 'test',
      }),
    }));
  });

  it('keeps /health/ready as a readiness alias', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200);

    expect(response.body).toEqual(expect.objectContaining({
      status: 'ok',
      service: 'api-gateway',
      checks: expect.arrayContaining([
        expect.objectContaining({ name: 'api_gateway', status: 'ok' }),
      ]),
      capabilities: expect.objectContaining({
        rest: 'enabled',
      }),
    }));
  });

  it('drops unsafe context headers and falls back to generated safe ids', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', '   ')
      .set('x-correlation-id', 'bad value with spaces')
      .set('x-causation-id', 'x'.repeat(129))
      .expect(200);

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.headers['x-correlation-id']).toBe(response.headers['x-request-id']);
    expect(response.headers['x-causation-id']).toBeUndefined();
  });
});
