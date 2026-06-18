import { HttpRedditClient } from '../libs/ingestion/adapters/source/reddit/http-reddit-client';
import { RedditSourceProvider } from '../libs/ingestion/adapters/source/reddit/reddit-source.provider';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { SourceProviderScanContext, SourceQuery } from '../libs/ingestion/ports';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const missingTokenPolicy = 'fail_closed_without_reddit_access_token';

async function main(): Promise<void> {
  const accessToken = process.env.REDDIT_ACCESS_TOKEN?.trim();

  if (accessToken === undefined || accessToken.length === 0) {
    throw new Error(
      `Live Reddit OAuth smoke requires REDDIT_ACCESS_TOKEN (${missingTokenPolicy}). Use fixture reddit smoke for backend-safe checks.`,
    );
  }

  const provider = new RedditSourceProvider(new HttpRedditClient());
  const userAgent = process.env.REDDIT_USER_AGENT?.trim() || 'social-monitor-mvp/0.1 live-smoke';
  const subreddit = process.env.REDDIT_SUBREDDIT?.trim() || 'programming';
  const listing = process.env.REDDIT_LISTING?.trim() || 'hot';
  const query: SourceQuery = {
    mode: 'listing',
    query: `${subreddit}:${listing}`,
  };
  const context: SourceProviderScanContext = {
    tenantId: tenantId('tenant-live-reddit-oauth-smoke'),
    workspaceId: workspaceId('workspace-live-reddit-oauth-smoke'),
    sourceBindingId: 'source-binding-live-reddit-oauth-smoke',
    scanJobId: 'scan-job-live-reddit-oauth-smoke',
    correlationId: 'correlation-live-reddit-oauth-smoke',
    config: {
      accessToken,
      userAgent,
      subreddit,
      listing,
      maxItems: 3,
    },
  };

  const validation = provider.validateBinding(query);
  assert(validation.ok, 'Reddit live query must validate before scan');

  const plan = provider.planScan(query, context);
  const result = await provider.scan(plan, context);

  assert(result.items.length > 0, 'Reddit live OAuth scan must return at least one normalized item');
  assert(
    result.items.every((item) => item.externalId.startsWith('reddit:')),
    'Reddit live OAuth scan must preserve reddit external ids',
  );
  assert(
    result.items.every((item) => item.canonicalUrl.startsWith('https://www.reddit.com/')),
    'Reddit live OAuth scan must expose reddit canonical URLs',
  );
  assert(
    result.items.every((item) => item.title.trim().length > 0 || item.body.trim().length > 0),
    'Reddit live OAuth scan must expose readable title or body',
  );

  console.log([
    'Live Reddit OAuth smoke OK',
    `Subreddit: ${subreddit}`,
    `Listing: ${listing}`,
    `Items: ${result.items.length}`,
    `Next cursor: ${result.nextCursor ?? 'none'}`,
    `Warnings: ${result.warnings.length}`,
  ].join('\n'));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
