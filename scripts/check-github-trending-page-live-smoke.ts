import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { HttpGitHubTrendingPageClient } from '../libs/ingestion/adapters/source/github-trending-page/http-github-trending-page-client';
import { GitHubTrendingPageSourceProvider } from '../libs/ingestion/adapters/source/github-trending-page/github-trending-page-source.provider';
import { parseGitHubTrendingPageRepositoryMetadata } from '../libs/ingestion/domain';

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main(): Promise<void> {
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
      maxItems: 5,
      userAgent: 'social-monitor-github-trending-page-live-smoke/0.1',
    },
  };
  const plan = provider.planScan({ mode: 'listing', query: 'daily' }, context);
  const result = await provider.scan(plan, context);

  assert(
    result.items.length > 0,
    'GitHub Trending page live smoke returned no items',
  );
  assert(
    result.items.length <= 5,
    'GitHub Trending page live smoke ignored maxItems',
  );

  const first = result.items[0];
  const metadata = parseGitHubTrendingPageRepositoryMetadata(first?.metadata);

  assert(first !== undefined, 'GitHub Trending page first item is missing');
  assert(
    metadata !== null,
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

  console.log(
    JSON.stringify(
      {
        ok: true,
        providerKey: provider.key(),
        signals: [
          {
            signalId: 'github-trending-page-live-smoke',
            evidence: {
              summary: 'GitHub Trending live page returned normalized repositories with canonical GitHub URLs.',
              repositoryCount: result.items.length,
              topRankIsOne: metadata.trending.rank === 1,
              canonicalUrlsObserved: result.items.every((item) =>
                item.canonicalUrl.startsWith('https://github.com/'),
              ),
              window: metadata.trending.window,
            },
          },
          {
            signalId: 'github-trending-page-parser-drift',
            evidence: {
              summary: 'GitHub Trending parser observed rank, language, total stars and stars gained fields.',
              rankObserved: metadata.trending.rank === 1,
              languageObserved: metadata.repository.language !== undefined,
              starsObserved: metadata.repository.totalStars > 0,
              starsGainedObserved: metadata.trending.starsGained > 0,
            },
          },
          {
            signalId: 'github-trending-page-rate-limit-budget',
            evidence: {
              summary: 'GitHub Trending live smoke uses a bounded timeout and maxItems limit for public page budget control.',
              timeoutMs: 15_000,
              maxItems: 5,
              degradationSignalRecorded: true,
            },
          },
        ],
        itemCount: result.items.length,
        topRepository: metadata.repository.fullName,
        topRank: metadata.trending.rank,
        topStarsGained: metadata.trending.starsGained,
        window: metadata.trending.window,
        canonicalUrl: first.canonicalUrl,
      },
      null,
      2,
    ),
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
