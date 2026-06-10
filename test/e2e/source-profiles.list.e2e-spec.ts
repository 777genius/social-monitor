import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Source profiles list (e2e)', () => {
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

  it('returns enabled fake provider and readiness-only future source profiles', async () => {
    const response = await request(app.getHttpServer())
      .get('/sources/profiles')
      .expect(200);

    expect(response.body.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerKey: 'fake-source',
          productionSafe: true,
          readinessState: 'enabled_beta',
          supportedQueryModes: expect.arrayContaining(['search']),
        }),
        expect.objectContaining({
          providerKey: 'reddit',
          productionSafe: false,
          readinessState: 'profiled',
          supportedQueryModes: [],
        }),
        expect.objectContaining({
          providerKey: 'hacker-news',
          productionSafe: true,
          readinessState: 'enabled_beta',
          supportedQueryModes: expect.arrayContaining(['search', 'listing']),
        }),
        expect.objectContaining({
          providerKey: 'rss',
          productionSafe: false,
          readinessState: 'profiled',
          supportedQueryModes: ['url'],
        }),
        expect.objectContaining({
          providerKey: 'x-twitter',
          productionSafe: false,
          readinessState: 'provider_only',
        }),
        expect.objectContaining({
          providerKey: 'telegram',
          productionSafe: false,
          readinessState: 'manual_only',
        }),
      ]),
    );
  });
});
