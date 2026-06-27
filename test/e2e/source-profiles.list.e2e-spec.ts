import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

jest.setTimeout(120_000);

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

  it('returns beta providers, fixture-only fake provider and readiness-only future source profiles', async () => {
    const response = await request(app.getHttpServer())
      .get('/sources/profiles')
      .expect(200);

    expect(response.body.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerKey: 'fake-source',
          productionSafe: true,
          readinessState: 'certification_ready',
          runtimeReadiness: 'fixture_ready',
          liveBetaBlockers: expect.arrayContaining(['Synthetic provider is not a real external source.']),
          supportedQueryModes: expect.arrayContaining(['search']),
        }),
        expect.objectContaining({
          providerKey: 'reddit',
          productionSafe: true,
          readinessState: 'enabled_beta',
          supportedQueryModes: expect.arrayContaining(['search', 'listing']),
        }),
        expect.objectContaining({
          providerKey: 'hacker-news',
          productionSafe: true,
          readinessState: 'enabled_beta',
          supportedQueryModes: expect.arrayContaining(['search', 'listing']),
        }),
        expect.objectContaining({
          providerKey: 'rss',
          productionSafe: true,
          readinessState: 'enabled_beta',
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

  it('exposes X/Twitter capability when x-collector runtime is configured', async () => {
    const previousEnabled = process.env.X_COLLECTOR_ENABLED;
    const previousAddress = process.env.X_COLLECTOR_GRPC_ADDRESS;
    process.env.X_COLLECTOR_ENABLED = '1';
    process.env.X_COLLECTOR_GRPC_ADDRESS = '127.0.0.1:50051';

    let runtimeApp: INestApplication | undefined;
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      runtimeApp = moduleRef.createNestApplication();
      runtimeApp.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await runtimeApp.init();

      const response = await request(runtimeApp.getHttpServer())
        .get('/sources/profiles')
        .expect(200);

      expect(response.body.sources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            providerKey: 'x-twitter',
            displayName: 'X/Twitter',
            productionSafe: true,
            readinessState: 'enabled_beta',
            runtimeReadiness: 'live_beta_ready',
            supportedQueryModes: ['search'],
            liveEvidenceRequirements: expect.arrayContaining([
              expect.objectContaining({
                signalId: 'x-collector-live-search-smoke',
              }),
            ]),
          }),
        ]),
      );
    } finally {
      await runtimeApp?.close();
      restoreEnvValue('X_COLLECTOR_ENABLED', previousEnabled);
      restoreEnvValue('X_COLLECTOR_GRPC_ADDRESS', previousAddress);
    }
  });
});

const restoreEnvValue = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
};
