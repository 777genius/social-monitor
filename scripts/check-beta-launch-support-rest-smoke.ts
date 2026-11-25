import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { sourceReadinessProfiles } from '@social-monitor/ingestion/adapters/source/source-readiness-profiles';
import { LaunchRestModule } from '@social-monitor/launch/interfaces/rest/launch-rest.module';
import { readFileSync } from 'node:fs';
import request from 'supertest';

import { DomainErrorFilter } from '../apps/api-gateway/src/domain-error.filter';
import type {
  BetaKnownLimitationsResponseDto,
  BetaLaunchSupportResponseDto,
  PostMvpBacklogResponseDto,
} from '../libs/launch/interfaces/rest/beta-launch-support.dto';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

type SourceProviderCertificationReport = {
  blockingPassed: boolean;
  certifiedProviders: Array<{
    providerKey: string;
    readinessState: string;
  }>;
  deferredProviders: Array<{
    providerKey: string;
  }>;
};

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [LaunchRestModule],
    providers: [
      {
        provide: APP_FILTER,
        useClass: DomainErrorFilter,
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();

  await app.init();

  try {
    await request(app.getHttpServer()).get('/beta/launch-support').expect(400);

    const snapshot = (await request(app.getHttpServer())
      .get('/beta/launch-support')
      .set(scopeHeaders())
      .expect(200)).body as BetaLaunchSupportResponseDto;

    assert(snapshot.schemaVersion === 1, 'launch support snapshot must expose schemaVersion=1');
    assert(snapshot.launchMode === 'api_operator_beta', 'launch support snapshot must expose API/operator beta mode');
    assert(snapshot.knownLimitations.length >= 4, 'known limitations must be visible');
    assert(snapshot.postMvpBacklog.length >= 4, 'post-MVP backlog classification must be visible');

    const enabledSources = sourceReadinessProfiles
      .filter((profile) => profile.state === 'enabled_beta')
      .map((profile) => profile.providerKey)
      .sort();
    const deferredSources = sourceReadinessProfiles
      .filter((profile) => profile.runtimeReadiness === 'deferred')
      .map((profile) => profile.providerKey)
      .sort();

    assert(
      snapshot.supportedSources.join(',') === enabledSources.join(','),
      `supported sources must match readiness profiles: ${snapshot.supportedSources.join(',')}`,
    );
    assert(
      snapshot.deferredSources.join(',') === deferredSources.join(','),
      `deferred sources must match readiness profiles: ${snapshot.deferredSources.join(',')}`,
    );

    const certification = loadSourceProviderCertificationReport();
    const certifiedSourceKeys = certification.certifiedProviders
      .filter((provider) => provider.readinessState === 'enabled_beta')
      .map((provider) => provider.providerKey)
      .sort();
    const certifiedDeferredSourceKeys = certification.deferredProviders
      .map((provider) => provider.providerKey)
      .sort();

    assert(certification.blockingPassed === true, 'source provider certification must be passing');
    assert(
      snapshot.supportedSources.join(',') === certifiedSourceKeys.join(','),
      `supported sources must match source certification artifact: ${snapshot.supportedSources.join(',')}`,
    );
    assert(
      snapshot.deferredSources.join(',') === certifiedDeferredSourceKeys.join(','),
      `deferred sources must match source certification artifact: ${snapshot.deferredSources.join(',')}`,
    );

    const limitationIds = new Set(snapshot.knownLimitations.map((entry) => entry.limitationId));
    for (const requiredLimitation of [
      'fake-source-fixture-only',
      'frontend-deferred',
      'x-twitter-deferred',
      'telegram-manual-only',
      'durable-runtime-required-before-external-beta',
    ]) {
      assert(limitationIds.has(requiredLimitation), `missing known limitation ${requiredLimitation}`);
    }

    const classifications = new Set(snapshot.postMvpBacklog.map((entry) => entry.classification));
    for (const requiredClassification of [
      'accepted_mvp_gap',
      'evidence_based_opportunity',
      'deferred_idea',
    ] as const) {
      assert(
        classifications.has(requiredClassification),
        `post-MVP backlog missing classification ${requiredClassification}`,
      );
    }

    const limitations = (await request(app.getHttpServer())
      .get('/beta/launch-support/known-limitations')
      .set(scopeHeaders())
      .expect(200)).body as BetaKnownLimitationsResponseDto;

    assert(
      limitations.knownLimitations.length === snapshot.knownLimitations.length,
      'known-limitations endpoint must return the same limitations as the full snapshot',
    );
    assert(
      limitations.knownLimitations.every((entry) => entry.supportAction.trim().length > 0),
      'known limitations must include support actions',
    );

    const backlog = (await request(app.getHttpServer())
      .get('/beta/launch-support/post-mvp-backlog')
      .set(scopeHeaders())
      .expect(200)).body as PostMvpBacklogResponseDto;

    assert(
      backlog.postMvpBacklog.length === snapshot.postMvpBacklog.length,
      'post-mvp-backlog endpoint must return the same backlog items as the full snapshot',
    );
    assert(
      backlog.postMvpBacklog.every((entry) => entry.architectureGuardrail.trim().length > 0),
      'post-MVP backlog items must preserve architecture guardrails',
    );

    console.log('Beta launch support REST smoke OK');
  } finally {
    await app.close();
  }
}

const scopeHeaders = (): Record<string, string> => ({
  'x-tenant-id': 'tenant-beta-launch-support-smoke',
  'x-workspace-id': 'workspace-beta-launch-support-smoke',
});

const loadSourceProviderCertificationReport = (): SourceProviderCertificationReport => {
  const rawReport = readFileSync('ops/ingestion/source-provider-certification.json', 'utf8');
  const parsedReport = JSON.parse(rawReport) as SourceProviderCertificationReport;

  assert(Array.isArray(parsedReport.certifiedProviders), 'source certification must list certified providers');
  assert(Array.isArray(parsedReport.deferredProviders), 'source certification must list deferred providers');

  return parsedReport;
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
