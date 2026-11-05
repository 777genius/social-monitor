import type { PrismaIngestionWorkerConnection } from '../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection';
import type { RedditArchivePlan } from '../backfill/reddit-archive-write/plan';
import { createFiniteRedditArchiveDependencies } from './reddit-archive-finite-dependencies';

const save = jest.fn(), project = jest.fn();
let repositoryClient: { $transaction?: <T>(run: (client: unknown) => Promise<T>) => Promise<T> };
jest.mock('@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-item.repository', () => ({
  PrismaSourceItemRepository: class {
    constructor(client: typeof repositoryClient) { repositoryClient = client; }
    saveRedditArchiveBatchInsertOnly(...args: unknown[]) { return save(...args); }
  },
}));
jest.mock('@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter', () => ({
  PrismaFeedProjectionAdapter: class { project(...args: unknown[]) { return project(...args); } },
}));
const scope = { tenantId: '00000000-0000-7000-8000-000000000001', workspaceId: '00000000-0000-7000-8000-000000000002',
  interestId: '00000000-0000-7000-8000-000000000003', sourceBindingId: '00000000-0000-7000-8000-000000000004',
  scanPolicyId: '00000000-0000-7000-8000-000000000005' };
const plan: RedditArchivePlan = { scope, day: '2026-10-04', providerKey: 'reddit', coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS',
  semanticKey: 'a'.repeat(64), planSha256: 'b'.repeat(64), packetSha256: 'c'.repeat(64), archiveSha256: 'd'.repeat(64),
  itemsSha256: 'e'.repeat(64), bindingConfigSha256: 'f'.repeat(64), matchedLaneOrdinal: 1,
  bindingConfig: JSON.stringify({ scanPasses: [{ mode: 'listing', subreddit: 'LocalLLaMA', listing: 'new', minScore: 0 }] }),
  scanPolicy: { id: scope.scanPolicyId, intervalSeconds: 3600, freshnessSeconds: 7200, retryBudget: 0 },
  sourceQuery: { mode: 'listing', query: 'LocalLLaMA' }, candidates: [{ externalId: 'reddit:t3_test123', item: {
    externalId: 'reddit:t3_test123', canonicalUrl: 'https://www.reddit.com/r/LocalLLaMA/comments/test123/fixture/',
    title: 'Fixture', body: 'Source.', publishedAt: new Date('2026-10-04T12:00:00Z'), metadata: { kind: 'reddit_post' } } }] };

describe('Reddit archive transaction boundary', () => {
  it('checks all native aliases, URL and feed identities inside the same Serializable transaction before any mutation', async () => {
    const calls: { sql: string; args: unknown[] }[] = []; let inTransaction = false, committed = false;
    const raw = { feedItem: {}, $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
      expect(inTransaction).toBe(true); calls.push({ sql, args });
      if (sql.includes('FROM pg_catalog.pg_roles r')) return [{ allowed: true }];
      if (sql.includes('SELECT i.query')) return [{ interestQuery: 'Fixture interest' }];
      return [{ reserved: true }];
    } };
    const transaction = jest.fn(async (run: (tx: unknown) => Promise<unknown>, _options: unknown) => {
      expect(_options).toEqual({ isolationLevel: 'Serializable', maxWait: 5000, timeout: 120000 });
      inTransaction = true; try { const result = await run(raw); committed = true; return result; }
      finally { inTransaction = false; }
    });
    const dependencies = createFiniteRedditArchiveDependencies({ $transaction: transaction } as unknown as PrismaIngestionWorkerConnection);
    await expect(dependencies.withAtomicWrites(plan, async writes => {
      await writes.assertMissing('00000000-0000-7000-8000-000000000008'); return writes.persist();
    })).rejects.toThrow('identity already exists');
    expect(transaction.mock.calls[0]![1]).toEqual({ isolationLevel: 'Serializable', maxWait: 5000, timeout: 120000 });
    const absence = calls.find(x => x.sql.includes('AS reserved'))!;
    expect(absence.args[2]).toEqual(['test123', 't3_test123', 'reddit:test123', 'reddit:t3_test123']);
    expect(absence.args[3]).toEqual([plan.candidates[0]!.item.canonicalUrl]);
    expect(absence.args[5]).toHaveLength(1); expect(absence.args[6]).toEqual(['test123']);
    expect(committed).toBe(false); expect(save).not.toHaveBeenCalled(); expect(project).not.toHaveBeenCalled();
    // Interactive Prisma transaction clients lack this method. The adapter must
    // provide the accepted facade, reusing this transaction instead of opening another.
    expect(repositoryClient.$transaction).toEqual(expect.any(Function));
    await repositoryClient.$transaction!(async client => { expect(client).toBe(repositoryClient); });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
