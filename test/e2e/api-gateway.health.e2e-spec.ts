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
      .expect(200)
      .expect('x-request-id', 'test-request-id')
      .expect({
        status: 'ok',
        service: 'api-gateway',
      });
  });

  it('returns readiness', async () => {
    await request(app.getHttpServer()).get('/ready').expect(200).expect({
      status: 'ok',
      service: 'api-gateway',
    });
  });
});
