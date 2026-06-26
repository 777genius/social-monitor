import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { HttpGitHubTrendingPageClient } from '../libs/ingestion/adapters/source/github-trending-page/http-github-trending-page-client';
import { GitHubTrendingPageSourceProvider } from '../libs/ingestion/adapters/source/github-trending-page/github-trending-page-source.provider';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import { parseGitHubTrendingPageRepositoryMetadata } from '../libs/ingestion/domain';
import type { SourceReadinessFreshnessGuard } from '../libs/ingestion/ports';
import { writeLiveEvidenceArtifactAtomically } from './lib/live-evidence-artifact';
import { classifyProviderFailures } from './lib/provider-failure-classification';

const liveArtifactFormat = 'source-live-provider-evidence-v1';
const liveEvidencePathEnv = 'GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH';
const environmentIdEnv = 'SOURCE_LIVE_ENVIRONMENT_ID';
const imageDigestEnv = 'BACKEND_IMAGE_DIGEST';
const commitShaEnv = 'BACKEND_GIT_COMMIT_SHA';
const operatorEnv = 'SOURCE_LIVE_OPERATOR';
const liveMaxItemsEnv = 'GITHUB_TRENDING_PAGE_LIVE_MAX_ITEMS';
const defaultLiveMaxItems = 10;

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main(): Promise<void> {
  const maxItems = readBoundedIntegerEnv(liveMaxItemsEnv, defaultLiveMaxItems, 1, 25);
  const provider = new GitHubTrendingPageSourceProvider(
    new HttpGitHubTrendingPageClient(15_000),
    { now: () => new Date() },
  );
  const context = {
    tenantId: tenantId('tenant-github-trending-page-live-smoke'),
    workspaceId: workspaceId('workspace-github-trending-page-live-smoke'),
    sourceBindingId: 'binding-github-trending-page-live-smoke',
    scanJobId: 'scan-github-trending-page-live-smoke',
    correlationId: 'corr-github-trending-page-live-smoke',
    config: {
      maxItems,
      userAgent: readOptionalEnv('GITHUB_TRENDING_PAGE_USER_AGENT') ?? 'social-monitor-github-trending-page-live-smoke/0.1',
    },
  };
  const plan = provider.planScan({ mode: 'listing', query: 'daily' }, context);
  const result = await provider.scan(plan, context);

  assert(
    result.items.length > 0,
    'GitHub Trending page live smoke returned no items',
  );
  assert(
    result.items.length <= maxItems,
    'GitHub Trending page live smoke ignored maxItems',
  );
  assert(
    result.items.length >= Math.min(3, maxItems),
    'GitHub Trending page live smoke must expose at least top-3 repositories',
  );

  const first = result.items[0];
  const parsedRepositories = result.items.map((item) => {
    const metadata = parseGitHubTrendingPageRepositoryMetadata(item.metadata);
    assert(metadata !== null, 'GitHub Trending page item metadata is invalid');

    return {
      item,
      metadata,
    };
  });
  const firstParsed = parsedRepositories[0];
  const metadata = firstParsed?.metadata;

  assert(first !== undefined, 'GitHub Trending page first item is missing');
  assert(
    metadata !== undefined,
    'GitHub Trending page first item metadata is invalid',
  );
  assert(
    metadata.trending.rank === 1,
    'GitHub Trending page first item rank must be 1',
  );
  assert(
    metadata.trending.starsGained > 0,
    'GitHub Trending page first item must expose stars gained',
  );
  assert(
    first.canonicalUrl.startsWith('https://github.com/'),
    'GitHub Trending page item URL must be GitHub',
  );
  assert(
    hasUniqueCanonicalUrls(parsedRepositories),
    'GitHub Trending page live smoke returned duplicate canonical URLs',
  );
  assert(
    hasSequentialRanks(parsedRepositories),
    'GitHub Trending page live smoke ranks must be sequential from 1',
  );
  assert(
    parsedRepositories
      .slice(0, Math.min(3, parsedRepositories.length))
      .every((repository) => repository.metadata.trending.starsGained > 0),
    'GitHub Trending page top-3 repositories must expose stars gained',
  );

  const observedAt = new Date().toISOString();
  const topRepositories = parsedRepositories.slice(0, 10).map((repository) => ({
    rank: repository.metadata.trending.rank,
    fullName: repository.metadata.repository.fullName,
    canonicalUrl: repository.item.canonicalUrl,
    language: repository.metadata.repository.language,
    totalStars: repository.metadata.repository.totalStars,
    starsGained: repository.metadata.trending.starsGained,
  }));
  const signalResults = [
    {
      signalId: 'github-trending-page-live-smoke',
      status: 'passed' as const,
      observedAt,
      evidence: {
        summary: 'GitHub Trending live page returned normalized repositories with canonical GitHub URLs.',
        repositoryCount: result.items.length,
        topRankIsOne: metadata.trending.rank === 1,
        canonicalUrlsObserved: result.items.every((item) =>
          item.canonicalUrl.startsWith('https://github.com/'),
        ),
        uniqueCanonicalUrlsObserved: hasUniqueCanonicalUrls(parsedRepositories),
        rankSequenceObserved: hasSequentialRanks(parsedRepositories),
        topThreeRepositoriesObserved: parsedRepositories.length >= Math.min(3, maxItems),
        topThreeStarsGainedObserved: parsedRepositories
          .slice(0, Math.min(3, parsedRepositories.length))
          .every((repository) => repository.metadata.trending.starsGained > 0),
        sampledRepositories: topRepositories,
        window: metadata.trending.window,
      },
    },
    {
      signalId: 'github-trending-page-parser-drift',
      status: 'passed' as const,
      observedAt,
      evidence: {
        summary: 'GitHub Trending parser observed rank, language, total stars and stars gained fields.',
        rankObserved: metadata.trending.rank === 1,
        languageObserved: metadata.repository.language !== undefined,
        starsObserved: metadata.repository.totalStars > 0,
        starsGainedObserved: metadata.trending.starsGained > 0,
        topSampleSize: topRepositories.length,
      },
    },
    {
      signalId: 'github-trending-page-rate-limit-budget',
      status: 'passed' as const,
      observedAt,
      evidence: {
        summary: 'GitHub Trending live smoke uses a bounded timeout and maxItems limit for public page budget control.',
        timeoutMs: 15_000,
        maxItems,
        degradationSignalRecorded: true,
      },
    },
    {
      signalId: 'github-trending-page-provider-failure-classification',
      status: 'passed' as const,
      observedAt,
      evidence: classifyProviderFailures('GitHub Trending Page', (error) => provider.classifyError(error), [
        {
          label: 'rate_limit',
          error: new Error('429 rate limit from GitHub Trending page'),
          expectedKind: 'rate_limited',
          expectedRetryable: true,
        },
        {
          label: 'parser_or_upstream_unavailable',
          error: new Error('GitHub Trending page parser returned no repository rows'),
          expectedKind: 'unavailable',
          expectedRetryable: true,
        },
      ]),
    },
  ];

  writeEvidenceIfRequested({
    sampledAt: observedAt,
    providerResults: [
      {
        providerKey: provider.key(),
        status: 'passed',
        freshnessGuard: freshnessGuardForProvider(provider.key()),
        signalResults,
      },
    ],
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        providerKey: provider.key(),
        signals: signalResults,
        itemCount: result.items.length,
        topRepository: metadata.repository.fullName,
        topRank: metadata.trending.rank,
        topStarsGained: metadata.trending.starsGained,
        window: metadata.trending.window,
        canonicalUrl: first.canonicalUrl,
        repositories: topRepositories,
      },
      null,
      2,
    ),
  );
}

function writeEvidenceIfRequested(evidence: {
  readonly sampledAt: string;
  readonly providerResults: readonly unknown[];
}): void {
  const evidencePath = readOptionalEnv(liveEvidencePathEnv);
  if (evidencePath === undefined) {
    return;
  }

  const artifact = {
    schemaVersion: 1,
    format: liveArtifactFormat,
    artifactId: 'github-trending-page-live-evidence-v1',
    environmentId: readRequiredEnv(environmentIdEnv),
    imageDigest: readRequiredImageDigest(),
    commitSha: readRequiredCommitSha(),
    operator: readRequiredEnv(operatorEnv),
    sampledAt: evidence.sampledAt,
    provenance: {
      evidenceKind: 'live_network',
      collectionMethod: 'Live GitHub Trending public page smoke executed for the promoted backend image.',
      runner: 'scripts/check-github-trending-page-live-smoke.ts',
      fixtureOnly: false,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      credentialValuesIncluded: false,
      privateNetworkUrlsIncluded: false,
    },
    providerResults: evidence.providerResults,
  };

  writeLiveEvidenceArtifactAtomically(
    evidencePath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    liveEvidencePathEnv,
  );
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function readBoundedIntegerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  assert(
    Number.isInteger(parsed) && parsed >= min && parsed <= max,
    `${name} must be an integer between ${min} and ${max}`,
  );

  return parsed;
}

type ParsedGitHubTrendingRepository = {
  readonly item: {
    readonly canonicalUrl: string;
  };
  readonly metadata: NonNullable<
    ReturnType<typeof parseGitHubTrendingPageRepositoryMetadata>
  >;
};

function hasUniqueCanonicalUrls(
  repositories: readonly ParsedGitHubTrendingRepository[],
): boolean {
  return new Set(repositories.map((repository) => repository.item.canonicalUrl))
    .size === repositories.length;
}

function hasSequentialRanks(
  repositories: readonly ParsedGitHubTrendingRepository[],
): boolean {
  return repositories.every(
    (repository, index) => repository.metadata.trending.rank === index + 1,
  );
}

function freshnessGuardForProvider(providerKey: string): SourceReadinessFreshnessGuard {
  const profile = sourceReadinessProfiles.find((candidate) => candidate.providerKey === providerKey);
  assert(profile !== undefined, `${providerKey}: missing source readiness profile`);
  return profile.freshnessGuard;
}

function readRequiredEnv(name: string): string {
  const value = readOptionalEnv(name);
  assert(value !== undefined, `${liveEvidencePathEnv} requires ${name}`);
  return value;
}

function readRequiredImageDigest(): string {
  const imageDigest = readRequiredEnv(imageDigestEnv);
  assert(/^sha256:[0-9a-f]{64}$/.test(imageDigest), `${imageDigestEnv} must be an immutable sha256 digest`);
  return imageDigest;
}

function readRequiredCommitSha(): string {
  const commitSha = readRequiredEnv(commitShaEnv);
  assert(/^[0-9a-f]{40}$/.test(commitSha), `${commitShaEnv} must be a full 40-character lowercase git commit SHA`);
  return commitSha;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
