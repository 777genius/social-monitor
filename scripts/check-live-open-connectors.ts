import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { HttpGitHubClient } from '../libs/ingestion/adapters/source/github/http-github-client';
import { HttpHackerNewsClient } from '../libs/ingestion/adapters/source/hacker-news/http-hacker-news-client';
import { validateFeedUrl } from '../libs/ingestion/adapters/source/rss/feed-url-policy';
import { HttpRssClient } from '../libs/ingestion/adapters/source/rss/http-rss-client';

type LiveOpenSignalId =
  | 'hn-live-http-smoke'
  | 'hn-rate-limit-evidence'
  | 'rss-allowlisted-live-feeds'
  | 'rss-http-cache-evidence'
  | 'rss-ssrf-proof'
  | 'github-live-api-smoke'
  | 'github-rate-limit-budget';

const coveredSignalIds: readonly LiveOpenSignalId[] = [
  'hn-live-http-smoke',
  'hn-rate-limit-evidence',
  'rss-allowlisted-live-feeds',
  'rss-http-cache-evidence',
  'rss-ssrf-proof',
  'github-live-api-smoke',
  'github-rate-limit-budget',
];
const liveEvidencePathEnv = 'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH';
const timeoutMs = 10_000;
const liveRssFeedUrls = [
  'https://hnrss.org/frontpage',
  'https://github.blog/changelog/feed/',
] as const;
const rssSsrfProbeUrls = [
  'http://127.0.0.1/feed.xml',
  'http://localhost/feed.xml',
  'http://169.254.169.254/latest/meta-data',
  'file:///tmp/feed.xml',
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const hackerNews = new HttpHackerNewsClient(timeoutMs);
  const [topStories, searchStories] = await Promise.all([
    hackerNews.listStories('top', 2),
    hackerNews.searchStories('monitoring', 2),
  ]);

  assert(topStories.length > 0, 'Hacker News top listing must return at least one story');
  assert(searchStories.length > 0, 'Hacker News search must return at least one story');
  assert(
    topStories.every((story) => Number.isInteger(story.id)),
    'Hacker News listing stories must include stable numeric ids',
  );

  const rssEvidence = await readRssEvidence();

  const github = await new HttpGitHubClient(timeoutMs).searchIssues({
    query: 'repo:microsoft/TypeScript is:issue',
    limit: 1,
    accessToken: readOptionalEnv('GITHUB_ACCESS_TOKEN'),
  });
  assert(github.items.length > 0, 'GitHub public issue search must return at least one issue without an API key');
  assert(
    github.items.every((item) => item.isPullRequest !== true && (item.htmlUrl ?? '').startsWith('https://github.com/')),
    'GitHub public issue search must return issue URLs and must not include pull requests for is:issue query',
  );
  const githubRateLimit = await readGitHubRateLimitBudget();

  const evidence = {
    schemaVersion: 1,
    evidenceId: 'live-open-connectors-evidence-v1',
    sampledAt: new Date().toISOString(),
    signalIds: coveredSignalIds,
    providers: {
      hackerNews: {
        signalIds: ['hn-live-http-smoke', 'hn-rate-limit-evidence'] satisfies readonly LiveOpenSignalId[],
        topStoryCount: topStories.length,
        searchStoryCount: searchStories.length,
        requestBudget: {
          timeoutMs,
          maxListingStories: 2,
          maxSearchStories: 2,
          degradationSignal: 'provider_rate_limited',
        },
      },
      rss: rssEvidence,
      github: {
        signalIds: ['github-live-api-smoke', 'github-rate-limit-budget'] satisfies readonly LiveOpenSignalId[],
        issueCount: github.items.length,
        authMode: readOptionalEnv('GITHUB_ACCESS_TOKEN') === undefined ? 'anonymous' : 'token_redacted',
        rateLimit: githubRateLimit,
      },
    },
  };
  writeEvidenceIfRequested(evidence);

  console.log([
    'Live open connector smoke OK',
    `Signals: ${coveredSignalIds.join(', ')}`,
    `HN top stories: ${topStories.length}`,
    `HN search stories: ${searchStories.length}`,
    `RSS feeds: ${rssEvidence.feeds.length}`,
    `RSS cache validators: ${rssEvidence.cacheValidatorFeedCount}`,
    `GitHub issues: ${github.items.length}`,
    `GitHub search remaining: ${githubRateLimit.search.remaining}`,
  ].join('\n'));
}

const readRssEvidence = async (): Promise<{
  readonly signalIds: readonly LiveOpenSignalId[];
  readonly feeds: readonly {
    readonly feedUrl: string;
    readonly itemCount: number;
    readonly hasEtag: boolean;
    readonly hasLastModified: boolean;
    readonly conditionalRequest: 'not_modified' | 'returned_items' | 'no_validator';
  }[];
  readonly cacheValidatorFeedCount: number;
  readonly ssrfRejectedUrls: readonly string[];
}> => {
  const rssClient = new HttpRssClient(timeoutMs);
  const feeds = [];

  for (const feedUrl of liveRssFeedUrls) {
    const result = await rssClient.readFeed(feedUrl, 2);
    assert(result.items.length > 0, `RSS feed ${feedUrl} must return at least one item`);
    assert(
      result.items.some((item) => (item.title ?? '').trim().length > 0 || (item.content ?? '').trim().length > 0),
      `RSS feed ${feedUrl} must include readable title or content`,
    );

    const hasEtag = result.etag !== undefined;
    const hasLastModified = result.lastModified !== undefined;
    let conditionalRequest: 'not_modified' | 'returned_items' | 'no_validator' = 'no_validator';
    if (hasEtag || hasLastModified) {
      const conditionalResult = await rssClient.readFeed(feedUrl, 2, {
        etag: result.etag,
        lastModified: result.lastModified,
      });
      conditionalRequest = conditionalResult.notModified === true ? 'not_modified' : 'returned_items';
    }

    feeds.push({
      feedUrl,
      itemCount: result.items.length,
      hasEtag,
      hasLastModified,
      conditionalRequest,
    });
  }

  const cacheValidatorFeedCount = feeds.filter((feed) => feed.hasEtag || feed.hasLastModified).length;
  assert(cacheValidatorFeedCount > 0, 'At least one allowlisted RSS feed must expose ETag or Last-Modified evidence');

  const ssrfRejectedUrls = rssSsrfProbeUrls.filter((url) => !validateFeedUrl(url).ok);
  assert(
    ssrfRejectedUrls.length === rssSsrfProbeUrls.length,
    'RSS SSRF proof must reject loopback, metadata-service and file URLs before fetch',
  );

  return {
    signalIds: ['rss-allowlisted-live-feeds', 'rss-http-cache-evidence', 'rss-ssrf-proof'],
    feeds,
    cacheValidatorFeedCount,
    ssrfRejectedUrls,
  };
};

const readGitHubRateLimitBudget = async (): Promise<{
  readonly core: { readonly limit: number; readonly remaining: number; readonly reset: number };
  readonly search: { readonly limit: number; readonly remaining: number; readonly reset: number };
}> => {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'social-monitor-mvp/0.1',
    'x-github-api-version': '2022-11-28',
  };
  const accessToken = readOptionalEnv('GITHUB_ACCESS_TOKEN');
  if (accessToken !== undefined) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch('https://api.github.com/rate_limit', {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  assert(response.ok, `GitHub rate-limit budget endpoint returned HTTP ${response.status}`);

  const body = await response.json() as GitHubRateLimitResponse;
  const core = normalizeGitHubRate(body.resources?.core, 'core');
  const search = normalizeGitHubRate(body.resources?.search, 'search');

  return { core, search };
};

type GitHubRateLimitResponse = {
  readonly resources?: {
    readonly core?: GitHubRateLimitBucket;
    readonly search?: GitHubRateLimitBucket;
  };
};

type GitHubRateLimitBucket = {
  readonly limit?: number;
  readonly remaining?: number;
  readonly reset?: number;
};

const normalizeGitHubRate = (
  bucket: GitHubRateLimitBucket | undefined,
  bucketName: string,
): { readonly limit: number; readonly remaining: number; readonly reset: number } => {
  assert(bucket !== undefined, `GitHub rate-limit response must include ${bucketName} bucket`);
  const limit = bucket.limit;
  const remaining = bucket.remaining;
  const reset = bucket.reset;
  assert(typeof limit === 'number' && Number.isFinite(limit) && limit > 0, `GitHub ${bucketName} rate-limit must define a positive limit`);
  assert(
    typeof remaining === 'number' && Number.isFinite(remaining) && remaining >= 0,
    `GitHub ${bucketName} rate-limit must define remaining budget`,
  );
  assert(typeof reset === 'number' && Number.isFinite(reset) && reset > 0, `GitHub ${bucketName} rate-limit must define reset timestamp`);

  return {
    limit,
    remaining,
    reset,
  };
};

const readOptionalEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
};

const writeEvidenceIfRequested = (evidence: unknown): void => {
  const evidencePath = readOptionalEnv(liveEvidencePathEnv);
  if (evidencePath === undefined) {
    return;
  }

  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
