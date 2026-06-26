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
  readonly liveEvidenceRequirements: readonly {
    readonly signalId: string;
    readonly description: string;
    readonly verificationCommand: string;
    readonly artifactEnv?: string;
    readonly requiredFor: string;
  }[];
  readonly freshnessGuard?: {
    readonly maxStalenessSeconds: number;
    readonly minimumScanIntervalSeconds: number;
    readonly skipRecentlyScanned: boolean;
    readonly scanHistoryRequired: boolean;
    readonly cursorResumeRequired: boolean;
    readonly rateLimitBackoffRequired: boolean;
    readonly staleReadModelState: string;
    readonly providerFailureHealthState: string;
    readonly signals: readonly string[];
  };
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

const requireSource = (
  sources: readonly SourceProfile[],
  providerKey: string,
): SourceProfile => {
  const source = sources.find((entry) => entry.providerKey === providerKey);

  if (source === undefined) {
    throw new Error(`Missing source profile: ${providerKey}`);
  }

  return source;
};

const requireFreshnessGuard = (source: SourceProfile): NonNullable<SourceProfile['freshnessGuard']> => {
  if (source.freshnessGuard === undefined) {
    throw new Error(`Missing source freshness guard: ${source.providerKey}`);
  }

  return source.freshnessGuard;
};

const assertLiveEvidenceRequirement = (
  source: SourceProfile,
  signalId: string,
  artifactEnv: string,
): void => {
  const requirement = source.liveEvidenceRequirements.find(
    (candidate) => candidate.signalId === signalId,
  );

  if (requirement === undefined) {
    throw new Error(
      `${source.providerKey} profile must expose live evidence requirement ${signalId}`,
    );
  }
  assert(
    requirement.description.trim().length > 0,
    `${source.providerKey} live evidence requirement ${signalId} must describe the proof`,
  );
  assert(
    requirement.verificationCommand.includes('npm run '),
    `${source.providerKey} live evidence requirement ${signalId} must expose an npm verification command`,
  );
  assert(
    requirement.artifactEnv === artifactEnv,
    `${source.providerKey} live evidence requirement ${signalId} must expose ${artifactEnv}`,
  );
  assert(
    requirement.requiredFor === 'external_beta',
    `${source.providerKey} live evidence requirement ${signalId} must be required for external beta`,
  );
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
    const response = await request(app.getHttpServer())
      .get('/sources/profiles')
      .expect(200);
    const sources = response.body.sources as readonly SourceProfile[];

    assert(
      Array.isArray(sources),
      'source profile REST response must return a sources array',
    );
    assert(
      sources.length >= 5,
      'source profile REST response must expose enabled MVP sources',
    );
    assert(
      sources.map((source) => source.providerKey).join(',') ===
        [...sources]
          .map((source) => source.providerKey)
          .sort()
          .join(','),
      'source profile REST response must be sorted by provider key for stable clients',
    );

    const fake = requireSource(sources, 'fake-source');
    const github = requireSource(sources, 'github-issues');
    const githubRepoRadar = requireSource(sources, 'github-repo-radar');
    const githubTrendingPage = requireSource(sources, 'github-trending-page');
    requireSource(sources, 'hacker-news');
    requireSource(sources, 'rss');
    const telegram = requireSource(sources, 'telegram');
    const xTwitter = requireSource(sources, 'x-twitter');

    assert(
      fake.readinessState === 'certification_ready',
      'Fake source must be certification-only',
    );
    assert(
      fake.runtimeReadiness === 'fixture_ready',
      'Fake source must stay fixture-ready only',
    );
    assert(
      fake.liveBetaBlockers.some((blocker) =>
        blocker.toLowerCase().includes('not a real external source'),
      ),
      'Fake source must explain why it cannot unblock external beta',
    );

    assert(
      github.displayName === 'GitHub Issues',
      'GitHub issues profile must expose display name',
    );
    assert(
      github.productionSafe === true,
      'GitHub profile must be marked production safe',
    );
    assert(
      github.readinessState === 'enabled_beta',
      'GitHub readiness must be enabled beta',
    );
    assert(
      github.acquisitionMode === 'official_or_open_api',
      'GitHub profile must document official API acquisition',
    );
    assert(
      github.supportedQueryModes.includes('search'),
      'GitHub profile must support search mode',
    );
    assert(
      github.cursorModel === 'page_token',
      'GitHub profile must expose page-token cursor model',
    );

    assert(
      githubRepoRadar.displayName === 'GitHub Repo Radar',
      'GitHub Repo Radar profile must expose display name',
    );
    assert(
      githubRepoRadar.productionSafe === true,
      'GitHub Repo Radar profile must be marked production safe',
    );
    assert(
      githubRepoRadar.readinessState === 'enabled_beta',
      'GitHub Repo Radar readiness must be enabled beta',
    );
    assert(
      githubRepoRadar.acquisitionMode === 'official_or_open_api',
      'GitHub Repo Radar profile must document GH Archive/GitHub API acquisition',
    );
    assert(
      githubRepoRadar.supportedQueryModes.includes('search'),
      'GitHub Repo Radar must support search mode',
    );
    assert(
      githubRepoRadar.supportedContentUnits.includes('link'),
      'GitHub Repo Radar must expose repository links as content units',
    );
    assert(
      githubRepoRadar.cursorModel === 'time',
      'GitHub Repo Radar must expose time cursor model',
    );
    assert(
      githubRepoRadar.quotaModel === 'per_app',
      'GitHub Repo Radar must expose app-level quota model',
    );
    assert(
      githubRepoRadar.limitations.some((limitation) =>
        limitation.includes('GH Archive BigQuery WatchEvent aggregation'),
      ),
      'GitHub Repo Radar must document GH Archive BigQuery acquisition limits',
    );
    assertLiveEvidenceRequirement(
      githubRepoRadar,
      'github-repo-radar-gh-archive-query',
      'GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH',
    );
    assertLiveEvidenceRequirement(
      githubRepoRadar,
      'github-repo-radar-prisma-live-e2e',
      'GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH',
    );
    const githubRepoRadarGuard = requireFreshnessGuard(githubRepoRadar);
    assert(
      githubRepoRadarGuard.maxStalenessSeconds === 21_600,
      'GitHub Repo Radar must expose 6 hour freshness guard',
    );
    assert(
      githubRepoRadarGuard.minimumScanIntervalSeconds === 21_600,
      'GitHub Repo Radar must expose 6 hour minimum scan interval',
    );
    assert(
      githubRepoRadarGuard.signals.includes('gh_archive_window_end'),
      'GitHub Repo Radar must expose GH Archive window freshness signal',
    );
    assert(
      githubRepoRadarGuard.signals.includes('repository_snapshot_checked_at'),
      'GitHub Repo Radar must expose repository live snapshot freshness signal',
    );

    assert(
      githubTrendingPage.displayName === 'GitHub Trending Page',
      'GitHub Trending page profile must expose display name',
    );
    assert(
      githubTrendingPage.productionSafe === true,
      'GitHub Trending page profile must be marked production safe',
    );
    assert(
      githubTrendingPage.readinessState === 'enabled_beta',
      'GitHub Trending page readiness must be enabled beta',
    );
    assert(
      githubTrendingPage.acquisitionMode ===
        'public_page_with_site_policy_respect',
      'GitHub Trending page profile must document public page acquisition',
    );
    assert(
      githubTrendingPage.supportedQueryModes.includes('listing'),
      'GitHub Trending page must support listing mode',
    );
    assert(
      githubTrendingPage.cursorModel === 'time',
      'GitHub Trending page must expose time cursor model',
    );
    assertLiveEvidenceRequirement(
      githubTrendingPage,
      'github-trending-page-live-smoke',
      'GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH',
    );
    assertLiveEvidenceRequirement(
      githubTrendingPage,
      'github-trending-page-parser-drift',
      'GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH',
    );
    const githubTrendingGuard = requireFreshnessGuard(githubTrendingPage);
    assert(
      githubTrendingGuard.maxStalenessSeconds === 3_600,
      'GitHub Trending page must expose hourly freshness guard',
    );
    assert(
      githubTrendingGuard.minimumScanIntervalSeconds === 3_600,
      'GitHub Trending page must expose hourly minimum scan interval',
    );
    assert(
      githubTrendingGuard.skipRecentlyScanned === true,
      'GitHub Trending page must expose skip-recently-scanned guard',
    );
    assert(
      githubTrendingGuard.signals.includes('github_trending_since_window'),
      'GitHub Trending page must expose trend window freshness signal',
    );

    const reddit = requireSource(sources, 'reddit');

    assert(
      reddit.displayName === 'Reddit',
      'Reddit profile must expose display name',
    );
    assert(
      reddit.productionSafe === true,
      'Reddit profile must be marked production safe after provider enablement',
    );
    assert(
      reddit.readinessState === 'enabled_beta',
      'Reddit readiness must be enabled beta',
    );
    assert(
      reddit.acquisitionMode === 'official_oauth_api',
      'Reddit profile must document official API acquisition',
    );
    assert(
      reddit.quotaModel === 'per_app',
      'Reddit profile must expose app-only quota model',
    );
    assert(
      reddit.cursorModel === 'opaque',
      'Reddit profile must expose opaque cursor model',
    );
    assert(
      reddit.supportedQueryModes.includes('listing'),
      'Reddit profile must support subreddit listings',
    );
    assert(
      reddit.supportedQueryModes.includes('search'),
      'Reddit profile must support search mode',
    );
    assert(
      reddit.supportedContentUnits.includes('post'),
      'Reddit profile must support post content units',
    );
    assert(
      reddit.limitations.some((limitation) =>
        limitation.toLowerCase().includes('oauth api'),
      ),
      'Reddit profile must document OAuth API limitation',
    );
    assertLiveEvidenceRequirement(
      reddit,
      'reddit-tenant-oauth-smoke',
      'REDDIT_LIVE_EVIDENCE_PATH',
    );
    assertLiveEvidenceRequirement(
      reddit,
      'reddit-credential-lifecycle',
      'REDDIT_LIVE_EVIDENCE_PATH',
    );
    const redditFreshnessGuard = requireFreshnessGuard(reddit);
    assert(
      redditFreshnessGuard.maxStalenessSeconds === 900,
      'Reddit profile must expose 15 minute freshness guard',
    );
    assert(
      redditFreshnessGuard.minimumScanIntervalSeconds === 900,
      'Reddit profile must expose 15 minute minimum scan interval',
    );
    assert(
      redditFreshnessGuard.scanHistoryRequired === true,
      'Reddit profile must require scan history for freshness decisions',
    );
    assert(
      redditFreshnessGuard.rateLimitBackoffRequired === true,
      'Reddit profile must expose rate-limit backoff requirement',
    );

    assert(
      xTwitter.displayName === undefined,
      'X/Twitter must not expose runtime capability display name while deferred',
    );
    assert(
      xTwitter.productionSafe === false,
      'X/Twitter must not be production-safe while provider-only',
    );
    assert(
      xTwitter.readinessState === 'provider_only',
      'X/Twitter readiness must stay provider-only before paid API/vendor approval',
    );
    assert(
      xTwitter.runtimeReadiness === 'deferred',
      'X/Twitter runtime readiness must stay deferred',
    );
    assert(
      xTwitter.acquisitionMode === 'approved_paid_api_or_vendor',
      'X/Twitter must require approved paid API or vendor acquisition',
    );
    assert(
      xTwitter.supportedQueryModes.length === 0,
      'X/Twitter must not expose query modes without a registered runtime provider',
    );
    assert(
      xTwitter.liveEvidenceRequirements.length === 0,
      'X/Twitter must not expose live beta evidence requirements while deferred',
    );
    assert(
      xTwitter.liveBetaBlockers.some((blocker) =>
        blocker.toLowerCase().includes('paid x api'),
      ),
      'X/Twitter profile must explain paid API blocker',
    );

    assert(
      telegram.readinessState === 'manual_only',
      'Telegram readiness must stay manual-only before authorization model',
    );
    assert(
      telegram.runtimeReadiness === 'deferred',
      'Telegram runtime readiness must stay deferred',
    );
    assert(
      telegram.supportedQueryModes.length === 0,
      'Telegram must not expose query modes without a registered runtime provider',
    );
    assert(
      telegram.liveEvidenceRequirements.length === 0,
      'Telegram must not expose live beta evidence requirements while deferred',
    );

    console.log('Source profile REST smoke OK');
  } finally {
    await app.close();
  }
}

void main();
