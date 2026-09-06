import { strict as assert } from 'node:assert';

import type { FeedItem } from '@social-monitor/feed/domain';
import type {
  FeedItemReadRepositoryPort,
  ListFeedItemSignalCandidatesQuery,
} from '@social-monitor/feed/ports';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  CountReaderSummaryCollectedFeedItemsQuery,
  ReaderSummaryProviderCollectionHealth,
} from '../../ports';
import { FeedReaderSummaryCoverageCounter } from './feed-reader-summary-coverage.counter';

const query: CountReaderSummaryCollectedFeedItemsQuery = {
  tenantId: tenantId('11111111-1111-4111-8111-111111111111'),
  workspaceId: workspaceId('22222222-2222-4222-8222-222222222222'),
  scope: { type: 'interest', interestId: '33333333-3333-4333-8333-333333333333' },
  period: {
    cadence: 'daily',
    periodKey: 'daily:2026-09-01T00:00:00.000Z:2026-09-02T00:00:00.000Z:UTC',
    startedAt: new Date('2026-09-01T00:00:00Z'),
    endedAt: new Date('2026-09-02T00:00:00Z'),
    timezone: 'UTC',
  },
  observedThrough: new Date('2026-09-02T00:05:00Z'),
};
const emptyCoverage = {
  collectedFeedItemCount: 0,
  lowRelevanceFeedItemCount: 0,
  mutedFeedItemCount: 0,
  userRatedFeedItemCount: 0,
  providerBreakdown: [],
  topicBreakdown: [],
  queryBreakdown: [],
};
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function verifyOrdering(mode: string, scenario: string): Promise<void> {
  const health = deferred<readonly ReaderSummaryProviderCollectionHealth[]>();
  const feed = deferred<readonly FeedItem[]>();
  const healthError = new Error('TEST health failure');
  const feedError = new Error('TEST feed failure');
  let healthCalls = 0;
  let feedCalls = 0;
  let listCalls = 0;
  const readFeed = (feedQuery: ListFeedItemSignalCandidatesQuery) => {
    feedCalls += 1;
    assert.deepEqual(feedQuery, {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      interestId: query.scope.type === 'interest' ? query.scope.interestId : undefined,
      publishedAtOrAfter: query.period.startedAt,
      publishedBefore: query.period.endedAt,
      observedAtOrBefore: query.observedThrough,
    });
    if (scenario === 'sync-feed' || scenario === 'sync-both') throw feedError;
    return feed.promise;
  };
  const repository: FeedItemReadRepositoryPort = {
    async findById() { return null; },
    async list({ limit, cursor, ...feedQuery }) {
      assert.equal(this, repository);
      listCalls += 1;
      assert.equal(limit, 100);
      assert.equal(cursor, undefined);
      return { items: await readFeed(feedQuery) };
    },
    ...(mode === 'candidate' ? {
      listSignalCandidates(this: FeedItemReadRepositoryPort, feedQuery: ListFeedItemSignalCandidatesQuery) {
        assert.equal(this, repository);
        return readFeed(feedQuery);
      },
    } : {}),
  };
  // Use a genuinely synchronous throwing list implementation in that case.
  if (mode === 'pagination' && (scenario === 'sync-feed' || scenario === 'sync-both')) {
    repository.list = () => { listCalls += 1; feedCalls += 1; throw feedError; };
  }
  const counter = new FeedReaderSummaryCoverageCounter(repository, {
    readProviderCollectionHealth(healthQuery) {
      healthCalls += 1;
      assert.equal(healthQuery, query);
      if (scenario === 'sync-health' || scenario === 'sync-both') throw healthError;
      return health.promise;
    },
  });
  const result = Promise.allSettled([counter.countCollectedFeedItemCoverage(query)]);
  // Both requests must start before either settles, including synchronous throws.
  assert.equal(healthCalls, 1);
  assert.equal(feedCalls, 1);
  let expected: Error | undefined;
  switch (scenario) {
    case 'health-first':
      expected = healthError;
      health.reject(healthError);
      assertRejected(await result, expected);
      await nextTurn();
      feed.reject(feedError);
      break;
    case 'feed-first':
      expected = feedError;
      feed.reject(feedError);
      assertRejected(await result, expected);
      await nextTurn();
      health.reject(healthError);
      break;
    case 'simultaneous':
      health.reject(healthError);
      feed.reject(feedError);
      // Promise adoption can order same-turn errors differently between the
      // candidate and pagination workflows; either original error must escape.
      expected = ((await result)[0] as PromiseRejectedResult).reason as Error;
      assert(expected === healthError || expected === feedError);
      break;
    case 'sync-health':
    case 'sync-both':
      expected = healthError;
      assertRejected(await result, expected);
      if (scenario === 'sync-health') feed.reject(feedError);
      break;
    case 'sync-feed':
      expected = feedError;
      assertRejected(await result, expected);
      await nextTurn();
      health.reject(healthError);
      break;
    case 'health-only-error':
      expected = healthError;
      feed.resolve([]);
      await nextTurn();
      health.reject(healthError);
      break;
    case 'feed-only-error':
      expected = feedError;
      health.resolve([]);
      await nextTurn();
      feed.reject(feedError);
      break;
    case 'success':
      health.resolve([]);
      feed.resolve([]);
      break;
    default:
      throw new Error(`Unknown ordering scenario: ${scenario}`);
  }
  if (expected === undefined) {
    assert.deepEqual(await result, [{ status: 'fulfilled', value: emptyCoverage }]);
  } else {
    assertRejected(await result, expected);
  }
  // A later rejection of the losing branch is fatal under strict Node if orphaned.
  await nextTurn();
  assert.equal(healthCalls, 1);
  assert.equal(feedCalls, 1);
  assert.equal(listCalls, mode === 'candidate' ? 0 : 1);
}

function assertRejected(results: readonly PromiseSettledResult<unknown>[], error: Error): void {
  assert.equal(results.length, 1);
  assert.equal(results[0]?.status, 'rejected');
  assert.equal((results[0] as PromiseRejectedResult).reason, error);
}

async function verifyEarlyExit(mode: string, rejectHealth: boolean): Promise<void> {
  const health = deferred<readonly ReaderSummaryProviderCollectionHealth[]>();
  const healthError = new Error('TEST health failed after pagination stopped');
  let calls = 0;
  let healthCalls = 0;
  let completed = false;
  const counter = new FeedReaderSummaryCoverageCounter({
    async findById() { return null; },
    async list({ cursor, limit }) {
      assert.equal(limit, 100);
      assert.equal(cursor, calls === 0 ? undefined : mode === 'repeat' ? 'same' : String(calls));
      calls += 1;
      return { items: [], nextCursor: mode === 'repeat' ? 'same' : String(calls) };
    },
  }, {
    readProviderCollectionHealth() { healthCalls += 1; return health.promise; },
  });
  const result = Promise.allSettled([counter.countCollectedFeedItems(query)]).then((value) => {
    completed = true;
    return value;
  });
  await nextTurn();
  assert.equal(calls, mode === 'repeat' ? 2 : 1000);
  assert.equal(completed, false, 'pagination exit still owns pending health');
  if (rejectHealth) {
    health.reject(healthError);
    assertRejected(await result, healthError);
  } else {
    health.resolve([]);
    assert.deepEqual(await result, [{ status: 'fulfilled', value: undefined }]);
  }
  await nextTurn();
  assert.equal(healthCalls, 1);
  assert.equal(calls, mode === 'repeat' ? 2 : 1000);
}

async function main(mode: string): Promise<void> {
  if (mode === 'early-exits') {
    for (const exit of ['repeat', 'ceiling']) {
      await verifyEarlyExit(exit, true);
      await verifyEarlyExit(exit, false);
    }
  } else {
    assert(['candidate', 'pagination'].includes(mode));
    for (const scenario of [
      'health-first', 'feed-first', 'simultaneous', 'sync-health', 'sync-feed',
      'sync-both', 'health-only-error', 'feed-only-error', 'success',
    ]) {
      await verifyOrdering(mode, scenario);
    }
  }
  process.stdout.write(`verified ${mode}\n`);
}

if (require.main === module) {
  // Keep a hung join observable by the parent's timeout even with deferred fakes.
  const keepAlive = setInterval(() => undefined, 1000);
  void main(process.argv[2] ?? '').then(() => clearInterval(keepAlive), (error: unknown) => {
    clearInterval(keepAlive);
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
