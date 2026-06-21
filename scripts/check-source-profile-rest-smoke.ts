import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { IngestionRestModule } from '@social-monitor/ingestion/interfaces/rest/ingestion-rest.module';
import request from 'supertest';

import { DomainErrorFilter } from '../apps/api-gateway/src/domain-error.filter';

type SourceProfile = {
  readonly providerKey: string;
  readonly displayName?: string;
  readonly productionSafe: boolean;
  readonly readinessState: string;
  readonly runtimeReadiness: string;
  readonly liveBetaBlockers: readonly string[];
  readonly acquisitionMode: string;
  readonly supportedContentUnits: readonly string[];
  readonly supportedQueryModes: readonly string[];
  readonly cursorModel: string;
  readonly quotaModel: string;
  readonly limitations: readonly string[];
};

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const requireSource = (sources: readonly SourceProfile[], providerKey: string): SourceProfile => {
  const source = sources.find((entry) => entry.providerKey === providerKey);

  if (source === undefined) {
    throw new Error(`Missing source profile: ${providerKey}`);
  }

  return source;
};

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [IngestionRestModule],
    providers: [
      {
        provide: APP_FILTER,
        useClass: DomainErrorFilter,
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  try {
    const response = await request(app.getHttpServer()).get('/sources/profiles').expect(200);
    const sources = response.body.sources as readonly SourceProfile[];

    assert(Array.isArray(sources), 'source profile REST response must return a sources array');
    assert(sources.length >= 5, 'source profile REST response must expose enabled MVP sources');
    assert(
      sources.map((source) => source.providerKey).join(',') ===
        [...sources].map((source) => source.providerKey).sort().join(','),
      'source profile REST response must be sorted by provider key for stable clients',
    );

    const fake = requireSource(sources, 'fake-source');
    const github = requireSource(sources, 'github');
    requireSource(sources, 'hacker-news');
    requireSource(sources, 'rss');
    const telegram = requireSource(sources, 'telegram');
    const xTwitter = requireSource(sources, 'x-twitter');

    assert(fake.readinessState === 'certification_ready', 'Fake source must be certification-only');
    assert(fake.runtimeReadiness === 'fixture_ready', 'Fake source must stay fixture-ready only');
    assert(
      fake.liveBetaBlockers.some((blocker) => blocker.toLowerCase().includes('not a real external source')),
      'Fake source must explain why it cannot unblock external beta',
    );

    assert(github.displayName === 'GitHub', 'GitHub profile must expose display name');
    assert(github.productionSafe === true, 'GitHub profile must be marked production safe');
    assert(github.readinessState === 'enabled_beta', 'GitHub readiness must be enabled beta');
    assert(github.acquisitionMode === 'official_or_open_api', 'GitHub profile must document official API acquisition');
    assert(github.supportedQueryModes.includes('search'), 'GitHub profile must support search mode');
    assert(github.cursorModel === 'page_token', 'GitHub profile must expose page-token cursor model');

    const reddit = requireSource(sources, 'reddit');

    assert(reddit.displayName === 'Reddit', 'Reddit profile must expose display name');
    assert(reddit.productionSafe === true, 'Reddit profile must be marked production safe after provider enablement');
    assert(reddit.readinessState === 'enabled_beta', 'Reddit readiness must be enabled beta');
    assert(reddit.acquisitionMode === 'official_oauth_api', 'Reddit profile must document official API acquisition');
    assert(reddit.quotaModel === 'per_app', 'Reddit profile must expose app-only quota model');
    assert(reddit.cursorModel === 'opaque', 'Reddit profile must expose opaque cursor model');
    assert(reddit.supportedQueryModes.includes('listing'), 'Reddit profile must support subreddit listings');
    assert(reddit.supportedQueryModes.includes('search'), 'Reddit profile must support search mode');
    assert(reddit.supportedContentUnits.includes('post'), 'Reddit profile must support post content units');
    assert(
      reddit.limitations.some((limitation) => limitation.toLowerCase().includes('oauth api')),
      'Reddit profile must document OAuth API limitation',
    );

    assert(xTwitter.displayName === undefined, 'X/Twitter must not expose runtime capability display name while deferred');
    assert(xTwitter.productionSafe === false, 'X/Twitter must not be production-safe while provider-only');
    assert(xTwitter.readinessState === 'provider_only', 'X/Twitter readiness must stay provider-only before paid API/vendor approval');
    assert(xTwitter.runtimeReadiness === 'deferred', 'X/Twitter runtime readiness must stay deferred');
    assert(xTwitter.acquisitionMode === 'approved_paid_api_or_vendor', 'X/Twitter must require approved paid API or vendor acquisition');
    assert(xTwitter.supportedQueryModes.length === 0, 'X/Twitter must not expose query modes without a registered runtime provider');
    assert(
      xTwitter.liveBetaBlockers.some((blocker) => blocker.toLowerCase().includes('paid x api')),
      'X/Twitter profile must explain paid API blocker',
    );

    assert(telegram.readinessState === 'manual_only', 'Telegram readiness must stay manual-only before authorization model');
    assert(telegram.runtimeReadiness === 'deferred', 'Telegram runtime readiness must stay deferred');
    assert(telegram.supportedQueryModes.length === 0, 'Telegram must not expose query modes without a registered runtime provider');

    console.log('Source profile REST smoke OK');
  } finally {
    await app.close();
  }
}

void main();
