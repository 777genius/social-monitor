import type { PrismaIngestionWorkerConnection } from '../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection';
import type { PrismaConversationUnitRecord } from '@social-monitor/conversation/adapters/persistence/prisma/prisma-conversation-client';
import { createFiniteRedditArchiveCommentDependencies } from './reddit-archive-comment-dependencies';
import { commentPlan } from '../backfill/reddit-archive-write/comment-plan.spec-support';

const observedAt = new Date('2026-10-16T18:00:00.000Z');
function harness(options: { parents?: number; collision?: string; failInsert?: number; badReadback?: boolean;
  baselineCount?: number; parentDate?: string; denied?: boolean } = {}) {
  const plan = commentPlan();
  const committed: PrismaConversationUnitRecord[] = [];
  const existing = options.collision ? [{ workspaceId: options.collision }] : [];
  let attempts = 0;
  const upsert = jest.fn(() => { throw new Error('Update forbidden'); });
  const baseline = jest.fn(() => { throw new Error('Baseline mutation forbidden'); });
  const admission = jest.fn(async () => { if (options.denied) throw new Error('Admission refused'); });
  let seq = 0;
  const connection = { $transaction: jest.fn(async (run: (tx: unknown) => Promise<unknown>, settings: unknown) => {
    expect(settings).toEqual({ isolationLevel: 'Serializable', maxWait: 5000, timeout: 120000 });
    const staged: PrismaConversationUnitRecord[] = [];
    const tx = {
      conversationUnit: { upsert, create: async ({ data }: { data: PrismaConversationUnitRecord }) => {
        attempts++;
        if (attempts === options.failInsert) throw Object.assign(new Error('Synthetic conflict'), { code: 'P2034' });
        if (staged.some(row => row.providerUnitId === data.providerUnitId)) throw new Error('Duplicate');
        staged.push(data); return data;
      } },
      conversationSignalBaselineSample: { upsert: baseline },
      $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
        if (sql.includes('FROM pg_catalog.pg_roles r')) return [{ allowed: true }];
        if (sql.includes('SELECT i.query')) { expect(args.slice(0, 5)).toEqual(Object.values(plan.scope)); return [{ interestQuery: 'Synthetic' }]; }
        if (sql.includes('JOIN feed_items')) {
          expect(args).toEqual([plan.scope.tenantId, plan.scope.workspaceId, plan.scope.sourceBindingId,
            'reddit:t3_1wuktlf', plan.scope.interestId]);
          expect(sql).toContain("f.status='VISIBLE'");
          return Array.from({ length: options.parents ?? 1 }, () => ({ sourceItemId: 'parent-source',
            feedItemId: 'parent-feed', publishedAt: new Date(options.parentDate ?? '2026-10-01T00:00:00.000Z') }));
        }
        if (sql.includes('SELECT workspace_id')) {
          expect(args).toEqual([plan.scope.tenantId, ['t1_pd5e1lp', 't1_pdhrwqg']]);
          expect(sql).not.toContain('workspace_id='); // tenant-global uniqueness, including other workspaces
          return existing;
        }
        if (sql.includes('COUNT(*)')) return [{ count: options.baselineCount ?? 0 }];
        return staged.map(row => ({ providerUnitId: row.providerUnitId, feedItemId: row.rootFeedItemId,
          publishedAt: options.badReadback ? observedAt : row.publishedAt, observedAt: row.observedAt,
          rawSha256: plan.rawSha256, body: row.body, canonicalUrl: row.canonicalUrl,
          providerMetadata: row.providerMetadata, matches: true }));
      },
    };
    const result = await run(tx); committed.push(...staged); return result;
  }) };
  const deps = createFiniteRedditArchiveCommentDependencies(connection as unknown as PrismaIngestionWorkerConnection,
    { generate: () => `synthetic-${++seq}` }, { now: () => observedAt }, admission);
  const run = (candidatePlan = plan) => deps.withAtomicWrites(candidatePlan, async writes => {
    await writes.assertParentAndMissing(); const result = await writes.persist();
    expect(await writes.present()).toBe(2); return result;
  });
  return { run, connection, committed, upsert, baseline, admission, attempts: () => attempts, plan };
}

describe('comments-only archive transaction', () => {
  it('inserts two units with original chronology and actual observation time in one transaction, without updates or baselines', async () => {
    const h = harness(); await expect(h.run()).resolves.toEqual({ inserted: 2, projected: 2 });
    expect(h.connection.$transaction).toHaveBeenCalledTimes(1); expect(h.admission).toHaveBeenCalledTimes(1);
    expect(h.committed.map(row => [row.providerUnitId, row.publishedAt.toISOString(), row.observedAt])).toEqual([
      ['t1_pd5e1lp', '2026-10-01T04:51:00.000Z', observedAt], ['t1_pdhrwqg', '2026-10-02T21:22:01.000Z', observedAt],
    ]);
    expect(h.upsert).not.toHaveBeenCalled(); expect(h.baseline).not.toHaveBeenCalled();
  });
  it.each([{ parents: 0 }, { parents: 2 }, { parentDate: '2026-10-02T00:00:00.000Z' },
    { collision: '00000000-0000-7000-8000-000000006102' }, { collision: 'foreign-workspace' }, { denied: true }])(
    'refuses missing/foreign/ambiguous parent, collisions or unadmitted operation before writes (%j)', async options => {
      const h = harness(options); await expect(h.run()).rejects.toThrow();
      expect(h.attempts()).toBe(0); expect(h.committed).toEqual([]);
    });
  it.each([{ failInsert: 2 }, { badReadback: true }, { baselineCount: 1 }])(
    'rolls back the entire batch on conflict, changed readback or unexpected baseline; no retry (%j)', async options => {
      const h = harness(options); await expect(h.run()).rejects.toThrow();
      expect(h.committed).toEqual([]); expect(h.connection.$transaction).toHaveBeenCalledTimes(1);
      expect(h.attempts()).toBe(2); expect(h.upsert).not.toHaveBeenCalled(); expect(h.baseline).not.toHaveBeenCalled();
    });
  it('rejects duplicate identities, an orphan or invalid second unit before either insert', async () => {
    for (const mutation of [
      (p: ReturnType<typeof commentPlan>) => [p.candidates[0]!, p.candidates[0]!],
      (p: ReturnType<typeof commentPlan>) => [p.candidates[0]!, { ...p.candidates[1]!, rootExternalId: 'reddit:t3_foreign' }],
      (p: ReturnType<typeof commentPlan>) => [p.candidates[0]!, { ...p.candidates[1]!, body: '' }],
      (p: ReturnType<typeof commentPlan>) => [p.candidates[0]!, { ...p.candidates[1]!, metadata: { ...p.candidates[1]!.metadata, providerScore: 4 } }],
    ]) {
      const h = harness();
      await expect(h.run({ ...h.plan, candidates: mutation(h.plan) })).rejects.toThrow();
      expect(h.attempts()).toBe(0); expect(h.committed).toEqual([]);
    }
  });
  it('fails closed without later native admission or when a caller skips the parent check', async () => {
    const h = harness();
    const deps = createFiniteRedditArchiveCommentDependencies(h.connection as unknown as PrismaIngestionWorkerConnection,
      { generate: () => 'synthetic' }, { now: () => observedAt });
    await expect(deps.withAtomicWrites(h.plan, async () => undefined)).rejects.toThrow('admission');
    expect(h.connection.$transaction).not.toHaveBeenCalled();
    const admitted = createFiniteRedditArchiveCommentDependencies(h.connection as unknown as PrismaIngestionWorkerConnection,
      { generate: () => 'synthetic' }, { now: () => observedAt }, async () => undefined);
    await expect(admitted.withAtomicWrites(h.plan, writes => writes.persist())).rejects.toThrow('parent was not checked');
    expect(h.committed).toEqual([]);
  });
});
