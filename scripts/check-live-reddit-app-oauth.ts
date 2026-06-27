import { RedditAppOnlyTokenProvider } from '../libs/ingestion/adapters/source/reddit/app-only-reddit-token-provider';
import { HttpRedditClient, redditListings } from '../libs/ingestion/adapters/source/reddit/http-reddit-client';
import type {
  RedditClientPort,
  RedditListingPage,
  RedditListSubredditPostsRequest,
  RedditPostListing,
  RedditSearchPostsRequest,
} from '../libs/ingestion/adapters/source/reddit/reddit-client.port';
import { RedditSourceProvider } from '../libs/ingestion/adapters/source/reddit/reddit-source.provider';
import type { SourceRuntimeConfig } from '../libs/ingestion/ports';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const tokenProvider = RedditAppOnlyTokenProvider.fromEnvironment(process.env);
  assert(
    tokenProvider !== null,
    'Live Reddit app-only OAuth smoke requires REDDIT_APP_CLIENT_ID/REDDIT_APP_CLIENT_SECRET or REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET',
  );

  const redditClient = new RecordingRedditClient(new HttpRedditClient());
  const provider = new RedditSourceProvider(redditClient, tokenProvider);
  const subreddit = readOptionalEnv('REDDIT_SUBREDDIT') ?? 'programming';
  const listing = readListing(readOptionalEnv('REDDIT_LISTING') ?? 'hot');
  const maxItems = readPositiveInteger(readOptionalEnv('REDDIT_MAX_ITEMS'), 3, 1, 10);
  const userAgent = readOptionalEnv('REDDIT_APP_USER_AGENT') ?? readOptionalEnv('REDDIT_USER_AGENT');
  const config: SourceRuntimeConfig = {
    subreddit,
    listing,
    maxItems,
    ...(userAgent === undefined ? {} : { userAgent }),
  };
  const query = { mode: 'listing' as const, query: `${subreddit}:${listing}` };
  const context = {
    tenantId: tenantId('tenant-live-reddit-app-oauth-smoke'),
    workspaceId: workspaceId('workspace-live-reddit-app-oauth-smoke'),
    sourceBindingId: 'source-binding-live-reddit-app-oauth-smoke',
    scanJobId: 'scan-job-live-reddit-app-oauth-smoke',
    correlationId: 'correlation-live-reddit-app-oauth-smoke',
    config,
  };
  const plan = provider.planScan(query, context);
  const result = await provider.scan(plan, context);

  assert(result.items.length > 0, 'Live Reddit app-only OAuth smoke expected at least one normalized item');
  assert(result.items.length <= maxItems, 'Live Reddit app-only OAuth smoke must honor maxItems');
  assert(
    result.items.every((item) => item.externalId.startsWith('reddit:')),
    'Live Reddit app-only OAuth smoke must preserve reddit external ids',
  );
  assert(
    result.items.every((item) => item.canonicalUrl.startsWith('https://www.reddit.com/')),
    'Live Reddit app-only OAuth smoke must expose reddit canonical URLs',
  );
  assert(
    subreddit !== 'programming' || result.warnings.length === 0,
    'Live Reddit app-only OAuth smoke should be warning-free for default listing',
  );
  assert(
    redditClient.lastPage?.rateLimit?.headersObserved === true,
    'Live Reddit app-only OAuth smoke must observe Reddit rate-limit headers',
  );
  assert(
    redditClient.lastPage.after !== undefined || result.items.length < maxItems,
    'Live Reddit app-only OAuth smoke must observe an opaque next cursor when the page is full',
  );

  const authFailure = provider.classifyError(new Error(
    'Reddit API returned 401 access_token=leaky-access-token refresh_token=leaky-refresh-token client_secret=leaky-client-secret',
  ));
  assert(authFailure.kind === 'auth_failed', 'Reddit app-only auth failures must classify as auth_failed');
  assert(authFailure.retryable === false, 'Reddit app-only auth failures must fail closed without retries');
  for (const secret of ['leaky-access-token', 'leaky-refresh-token', 'leaky-client-secret']) {
    assert(!authFailure.message.includes(secret), `Reddit app-only auth failure leaked ${secret}`);
  }

  const rateLimitFailure = provider.classifyError(new Error('Reddit API returned 429'));
  assert(rateLimitFailure.kind === 'rate_limited', 'Reddit 429 failures must classify as rate_limited');
  assert(rateLimitFailure.retryable === true, 'Reddit 429 failures must remain retryable with backoff');

  console.log([
    'Live Reddit app-only OAuth smoke OK',
    `Subreddit: ${subreddit}`,
    `Listing: ${listing}`,
    `Items: ${result.items.length}`,
    `Next cursor: ${result.nextCursor ?? 'none'}`,
    `Rate-limit headers: ${redditClient.lastPage.rateLimit?.headersObserved === true ? 'present' : 'missing'}`,
    `Warnings: ${result.warnings.length}`,
  ].join('\n'));
}

function readListing(value: string): RedditPostListing {
  if (!redditListings.includes(value as RedditPostListing)) {
    throw new Error(`Unsupported REDDIT_LISTING: ${value}`);
  }
  return value as RedditPostListing;
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function readPositiveInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Value must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

class RecordingRedditClient implements RedditClientPort {
  lastPage: RedditListingPage | undefined;

  constructor(private readonly inner: RedditClientPort) {}

  async listSubredditPosts(request: RedditListSubredditPostsRequest): Promise<RedditListingPage> {
    const page = await this.inner.listSubredditPosts(request);
    this.lastPage = page;
    return page;
  }

  async searchPosts(request: RedditSearchPostsRequest): Promise<RedditListingPage> {
    const page = await this.inner.searchPosts(request);
    this.lastPage = page;
    return page;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
