import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sourceReadinessProfiles } from '@social-monitor/ingestion/adapters/source/source-readiness-profiles';
import { readFileSync } from 'node:fs';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import type { BetaLaunchSupportResponseDto } from '../../libs/launch/interfaces/rest/beta-launch-support.dto';

type SourceProviderCertificationReport = {
  readonly blockingPassed: boolean;
  readonly certifiedProviders: ReadonlyArray<{
    readonly providerKey: string;
    readonly readinessState: string;
  }>;
  readonly deferredProviders: ReadonlyArray<{
    readonly providerKey: string;
  }>;
};

describe('Beta launch support API (e2e)', () => {
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

  it('exposes scope-protected beta support snapshot, limitations and backlog', async () => {
    await request(app.getHttpServer()).get('/beta/launch-support').expect(400);

    const snapshot = (await request(app.getHttpServer())
      .get('/beta/launch-support')
      .set(scopeHeaders())
      .expect(200)).body as BetaLaunchSupportResponseDto;

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      launchMode: 'api_operator_beta',
      snapshotId: expect.any(String),
      publishedAt: expect.any(String),
    });
    expect(snapshot.knownLimitations.length).toBeGreaterThanOrEqual(4);
    expect(snapshot.postMvpBacklog.length).toBeGreaterThanOrEqual(4);

    const enabledSources = sourceReadinessProfiles
      .filter((profile) => profile.state === 'enabled_beta')
      .map((profile) => profile.providerKey)
      .sort();
    const deferredSources = sourceReadinessProfiles
      .filter((profile) => profile.runtimeReadiness === 'deferred')
      .map((profile) => profile.providerKey)
      .sort();

    expect(snapshot.supportedSources).toEqual(enabledSources);
    expect(snapshot.deferredSources).toEqual(deferredSources);

    const certification = loadSourceProviderCertificationReport();
    expect(certification.blockingPassed).toBe(true);
    expect(snapshot.supportedSources).toEqual(
      certification.certifiedProviders
        .filter((provider) => provider.readinessState === 'enabled_beta')
        .map((provider) => provider.providerKey)
        .sort(),
    );
    expect(snapshot.deferredSources).toEqual(
      certification.deferredProviders.map((provider) => provider.providerKey).sort(),
    );

    expect(snapshot.knownLimitations.map((entry) => entry.limitationId)).toEqual(expect.arrayContaining([
      'fake-source-fixture-only',
      'frontend-deferred',
      'x-twitter-deferred',
      'telegram-manual-only',
      'durable-runtime-required-before-external-beta',
    ]));
    expect(snapshot.postMvpBacklog.map((entry) => entry.classification)).toEqual(expect.arrayContaining([
      'accepted_mvp_gap',
      'evidence_based_opportunity',
      'deferred_idea',
    ]));

    const limitations = await request(app.getHttpServer())
      .get('/beta/launch-support/known-limitations')
      .set(scopeHeaders())
      .expect(200);

    expect(limitations.body.knownLimitations).toHaveLength(snapshot.knownLimitations.length);
    expect(limitations.body.knownLimitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          limitationId: 'durable-runtime-required-before-external-beta',
          supportAction: expect.any(String),
        }),
      ]),
    );

    const backlog = await request(app.getHttpServer())
      .get('/beta/launch-support/post-mvp-backlog')
      .set(scopeHeaders())
      .expect(200);

    expect(backlog.body.postMvpBacklog).toHaveLength(snapshot.postMvpBacklog.length);
    expect(backlog.body.postMvpBacklog.every((entry: { architectureGuardrail?: string }) =>
      typeof entry.architectureGuardrail === 'string' && entry.architectureGuardrail.trim().length > 0,
    )).toBe(true);
  });
});

const scopeHeaders = (): Record<string, string> => ({
  'x-tenant-id': 'tenant-beta-launch-support-e2e',
  'x-workspace-id': 'workspace-beta-launch-support-e2e',
});

const loadSourceProviderCertificationReport = (): SourceProviderCertificationReport => {
  const report = JSON.parse(readFileSync('ops/ingestion/source-provider-certification.json', 'utf8')) as SourceProviderCertificationReport;

  expect(Array.isArray(report.certifiedProviders)).toBe(true);
  expect(Array.isArray(report.deferredProviders)).toBe(true);

  return report;
};
