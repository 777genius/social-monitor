import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { feedProviderMetricsFromMetadata } from '@social-monitor/feed/domain';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import {
  CryptoIdGenerator,
  FixedClock,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import { InMemoryFeedProjectionAdapter } from '../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter';
import { InMemoryScanLeaseAdapter } from '../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { CircuitBreakerSourceFetcherAdapter } from '../libs/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter';
import { GitHubTrendingPageSourceProvider } from '../libs/ingestion/adapters/source/github-trending-page/github-trending-page-source.provider';
import { HttpGitHubTrendingPageClient } from '../libs/ingestion/adapters/source/github-trending-page/http-github-trending-page-client';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import {
  GITHUB_TRENDING_PAGE_PROVIDER_KEY,
  parseGitHubTrendingPageRepositoryMetadata,
} from '../libs/ingestion/domain';
import { ExecuteScanUseCase } from '../libs/ingestion/features/execute-scan/execute-scan.use-case';
import type {
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  ScanExecutionReporterPort,
  SourceConfigReaderPort,
  SourceRuntimeConfig,
} from '../libs/ingestion/ports';

class HtmlE2eScanExecutionReporter implements ScanExecutionReporterPort {
  succeeded: ReportScanSucceededCommand | undefined;
  failed: ReportScanFailedCommand | undefined;

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    this.succeeded = command;
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    this.failed = command;
  }
}

class StaticSourceConfigReader implements SourceConfigReaderPort {
  async readConfig(): Promise<SourceRuntimeConfig> {
    return {
      maxItems: 2,
      userAgent: 'social-monitor-github-trending-page-html-e2e/0.1',
    };
  }
}

void run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function run(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let observedFetch = false;

  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));

    assert(url.hostname === 'github.com', `unexpected host ${url.hostname}`);
    assert(url.pathname === '/trending', `unexpected path ${url.pathname}`);
    assert(
      url.searchParams.get('since') === 'daily',
      `unexpected trending window ${url.searchParams.get('since')}`,
    );
    assert(
      readHeader(init?.headers, 'accept')?.includes('text/html') === true,
      'GitHub Trending client must request HTML',
    );
    assert(
      readHeader(init?.headers, 'user-agent') ===
        'social-monitor-github-trending-page-html-e2e/0.1',
      'GitHub Trending client must use configured user agent',
    );

    observedFetch = true;

    return new Response(githubTrendingHtmlFixture, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }) as typeof fetch;

  try {
    await runHtmlE2e();
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert(observedFetch, 'GitHub Trending HTML e2e did not call fetch');
  console.log('GitHub Trending page HTML e2e OK');
}

async function runHtmlE2e(): Promise<void> {
  const tenant = tenantId('tenant-github-trending-page-html-e2e');
  const workspace = workspaceId('workspace-github-trending-page-html-e2e');
  const topicId = 'topic-github-trending-page-html-e2e';
  const clock = new FixedClock(new Date('2026-06-24T12:00:00.000Z'));
  const provider = new GitHubTrendingPageSourceProvider(
    new HttpGitHubTrendingPageClient(15_000),
    clock,
  );
  const registry = new InMemorySourceProviderRegistry(
    [provider],
    sourceReadinessProfiles,
  );
  const feedItems = new InMemoryFeedItemReadRepository();
  const sourceItems = new InMemorySourceItemRepository();
  const scanAttempts = new InMemoryScanAttemptRepository();
  const scanCursors = new InMemoryScanCursorRepository();
  const scanExecutionReporter = new HtmlE2eScanExecutionReporter();
  const scanFailures = new InMemoryScanFailureQueueAdapter(
    new InMemoryMetricsRecorder(),
  );
  const scanLeases = new InMemoryScanLeaseAdapter();
  const executeScan = new ExecuteScanUseCase(
    new CircuitBreakerSourceFetcherAdapter(
      new RegistrySourceFetcherAdapter(
        registry,
        new StaticSourceConfigReader(),
      ),
      clock,
      { failureThreshold: 3, cooldownSeconds: 60 },
    ),
    sourceItems,
    new InMemoryFeedProjectionAdapter(feedItems),
    scanAttempts,
    scanCursors,
    scanExecutionReporter,
    scanFailures,
    scanLeases,
    new CryptoIdGenerator(),
    clock,
  );
  const result = await executeScan.execute({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId: 'scan-github-trending-page-html-e2e',
    topicId,
    sourceBindingId: 'binding-github-trending-page-html-e2e',
    scanPolicyId: 'policy-github-trending-page-html-e2e',
    providerKey: GITHUB_TRENDING_PAGE_PROVIDER_KEY,
    sourceQuery: { mode: 'listing', query: 'daily' },
    correlationId: 'corr-github-trending-page-html-e2e',
    causationId: 'cause-github-trending-page-html-e2e',
  });

  if (!result.ok) {
    throw result.error;
  }

  assert(
    result.value.fetched === 2,
    `expected two HTML-parsed GitHub Trending items, got ${result.value.fetched}`,
  );
  assert(
    result.value.inserted === 2,
    `expected two inserted items, got ${result.value.inserted}`,
  );
  assert(
    result.value.projected === 2,
    `expected two projected feed items, got ${result.value.projected}`,
  );
  assert(
    scanExecutionReporter.succeeded !== undefined,
    'GitHub Trending page HTML e2e success report is required',
  );
  assert(
    scanExecutionReporter.failed === undefined,
    'GitHub Trending page HTML e2e must not report scan failure',
  );

  const feed = await feedItems.list({
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    limit: 10,
  });

  assert(
    feed.items.length === 2,
    `expected two GitHub Trending page feed items, got ${feed.items.length}`,
  );

  const metadataItems = feed.items
    .map((item) =>
      parseGitHubTrendingPageRepositoryMetadata(
        item.toSnapshot().providerMetadata,
      ),
    )
    .filter(
      (metadata): metadata is NonNullable<typeof metadata> => metadata !== null,
    );
  const top = metadataItems.find((item) => item.trending.rank === 1);
  const second = metadataItems.find((item) => item.trending.rank === 2);

  assert(top !== undefined, 'rank #1 metadata is required');
  assert(second !== undefined, 'rank #2 metadata is required');
  assert(
    top.repository.fullName === 'calesthio/OpenMontage',
    `unexpected top repository ${top.repository.fullName}`,
  );
  assert(top.repository.language === 'Python', 'top language must be Python');
  assert(top.repository.totalStars === 18398, 'top stars must be parsed');
  assert(top.repository.forksCount === 2113, 'top forks must be parsed');
  assert(top.trending.starsGained === 3703, 'top stars gained must be parsed');
  assert(top.trending.window === 'daily', 'top window must be daily');
  assert(
    top.trending.source === 'github_trending_html',
    'top source must prove non-fixture HTML path',
  );

  assert(
    second.repository.fullName === 'apple/container',
    `unexpected second repository ${second.repository.fullName}`,
  );
  assert(
    second.repository.language === 'Swift',
    'second language must be Swift',
  );
  assert(second.repository.totalStars === 41719, 'second stars must be parsed');
  assert(second.repository.forksCount === 1219, 'second forks must be parsed');
  assert(
    second.trending.starsGained === 1746,
    'second stars gained must be parsed',
  );

  const topMetrics = feedProviderMetricsFromMetadata({
    providerKey: GITHUB_TRENDING_PAGE_PROVIDER_KEY,
    providerMetadata: feed.items
      .find(
        (item) =>
          parseGitHubTrendingPageRepositoryMetadata(
            item.toSnapshot().providerMetadata,
          )?.trending.rank === 1,
      )
      ?.toSnapshot().providerMetadata,
  });

  assert(topMetrics?.kind === 'github_trending_repository', 'top metrics kind');
  assert(topMetrics.rank === 1, 'top metrics rank must be parsed');
  assert(topMetrics.starsGained === 3703, 'top metrics stars gained');
  assert(topMetrics.window === 'daily', 'top metrics window');
}

function readHeader(
  headers: HeadersInit | undefined,
  name: string,
): string | undefined {
  if (headers === undefined) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  const normalizedName = name.toLocaleLowerCase('en-US');

  if (Array.isArray(headers)) {
    return headers.find(
      ([key]) => key.toLocaleLowerCase('en-US') === normalizedName,
    )?.[1];
  }

  const record = headers as Readonly<Record<string, string>>;

  return record[name] ?? record[normalizedName];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const githubTrendingHtmlFixture = `
  <html>
    <body>
      <main>
        <article class="Box-row">
          <h2 class="h3 lh-condensed">
            <a href="/calesthio/OpenMontage" class="Link">
              <span class="text-normal">calesthio /</span>
              OpenMontage
            </a>
          </h2>
          <p class="col-9 color-fg-muted my-1">
            World's first open-source, agentic video production system.
          </p>
          <span itemprop="programmingLanguage">Python</span>
          <a href="/calesthio/OpenMontage/stargazers">18,398</a>
          <a href="/calesthio/OpenMontage/forks">2,113</a>
          <span>3,703 stars today</span>
        </article>
        <article class="Box-row">
          <h2 class="h3 lh-condensed">
            <a href="/apple/container" class="Link">
              <span class="text-normal">apple /</span>
              container
            </a>
          </h2>
          <p>
            A tool for creating and running Linux containers using lightweight
            virtual machines on a Mac.
          </p>
          <span itemprop="programmingLanguage">Swift</span>
          <a href="/apple/container/stargazers">41,719</a>
          <a href="/apple/container/forks">1,219</a>
          <span>1,746 stars today</span>
        </article>
        <article class="Box-row">
          <h2 class="h3 lh-condensed">
            <a href="/ignored/over-limit" class="Link">
              <span class="text-normal">ignored /</span>
              over-limit
            </a>
          </h2>
          <p>This item proves maxItems is honored after parsing HTML.</p>
          <span itemprop="programmingLanguage">TypeScript</span>
          <a href="/ignored/over-limit/stargazers">999</a>
          <a href="/ignored/over-limit/forks">99</a>
          <span>88 stars today</span>
        </article>
      </main>
    </body>
  </html>
`;
