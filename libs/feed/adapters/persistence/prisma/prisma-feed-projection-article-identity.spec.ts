import { SourceItem } from '@social-monitor/ingestion/domain';
import { tenantId, workspaceId, type JsonObject } from '@social-monitor/shared-kernel';
import type { PrismaFeedClient } from './prisma-feed-client';
import type { PrismaFeedItemRecord } from './prisma-feed-records';
import { PrismaFeedProjectionAdapter } from './prisma-feed-projection.adapter';

const scope = { tenantId: tenantId('10000000-0000-4000-8000-000000000001'),
  workspaceId: workspaceId('20000000-0000-4000-8000-000000000002'),
  interestId: 'interest', sourceBindingId: 'binding', providerKey: 'reddit' };
const command = { ...scope, snapshots: {
  interestQuerySnapshot: { interestId: scope.interestId, query: 'AI research' },
  sourceBindingSnapshot: { sourceBindingId: scope.sourceBindingId, providerKey: 'reddit', sourceQuery: { mode: 'search' as const, query: 'AI research' } },
  workspaceScopeSnapshot: scope,
} };
const observed = new Date('2026-11-01T12:00:00Z');
const post = (id: string, metadata?: JsonObject) => SourceItem.ingest({ ...scope,
  id, externalId: id, canonicalUrl: `https://example.test/posts/${id}`, title: id,
  body: metadata ? `Captured article evidence for ${id}` : `Native post ${id}`,
  publishedAt: observed, ingestedAt: observed, metadata,
});

/** Enforces the real unique identity constraint and atomic batch rollback. */
class IdentityDatabase {
  rows: PrismaFeedItemRecord[] = [];
  rollbacks = 0;
  constructor(private readonly explicitUpdate: boolean) {}
  readonly $transaction = async <T>(operation: (db: PrismaFeedClient) => Promise<T>) => {
    const staged = structuredClone(this.rows);
    const persist = (row: PrismaFeedItemRecord) => {
      if (staged.some(other => other.id !== row.id && other.tenantId === row.tenantId &&
        other.interestId === row.interestId && other.dedupeKey === row.dedupeKey)) throw { code: 'P2002' };
      const index = staged.findIndex(other => other.id === row.id);
      if (index < 0) staged.push(row); else staged[index] = row;
      return row;
    };
    const feedItem: PrismaFeedClient['feedItem'] = {
      findFirst: async args => staged.find(row => Object.entries(args.where).every(([key, value]) => row[key as keyof PrismaFeedItemRecord] === value)) ?? null,
      upsert: async args => {
        const selector = args.where.tenantId_interestId_dedupeKey;
        const prior = staged.find(row => row.tenantId === selector.tenantId && row.interestId === selector.interestId && row.dedupeKey === selector.dedupeKey);
        return persist(prior ? { ...prior, ...args.update } : { ...args.create,
          authorHandle: args.create.authorHandle ?? null, providerMetadata: args.create.providerMetadata ?? null, createdAt: observed });
      },
      ...(this.explicitUpdate ? { update: async (args: Parameters<NonNullable<PrismaFeedClient['feedItem']['update']>>[0]) => {
        const prior = staged.find(row => row.id === args.where.id);
        if (!prior) throw new Error('Missing feed post');
        return persist({ ...prior, ...args.data });
      } } : {}),
      findMany: async () => [], count: async () => staged.length,
    };
    try {
      const result = await operation({ feedItem, feedSignalBaselineSample: {
        deleteMany: async () => ({ count: 0 }), upsert: async args => ({ ...args.create }), findMany: async () => [],
      } } as PrismaFeedClient);
      this.rows = staged; return result;
    } catch (error) { this.rollbacks += 1; throw error; }
  };
}

describe('existing post identity after shared article enrichment', () => {
  it.each([true, false])('preserves three posts and article grouping without rolling back innocent updates (explicit update=%s)', async explicit => {
    const database = new IdentityDatabase(explicit);
    let sequence = 0;
    const adapter = new PrismaFeedProjectionAdapter(database as unknown as PrismaFeedClient, { generate: () => `id-${++sequence}` });
    await adapter.project({ ...command, sourceItems: [post('a'), post('b'), post('innocent')] });
    // An already-enriched independent post owns the article-level key.
    await adapter.project({ ...command, sourceItems: [post('article-owner', { articleContent: { semanticFingerprint: 'shared' } })] });
    const before = database.rows.map(row => ({ id: row.id, sourceItemId: row.sourceItemId, dedupeKey: row.dedupeKey }));
    await adapter.project({ ...command, sourceItems: [post('innocent', { articleContent: { semanticFingerprint: 'other' } }),
      post('a', { articleContent: { semanticFingerprint: 'shared' } }), post('b', { articleContent: { semanticFingerprint: 'shared' } })] });
    expect(database.rows.map(row => ({ id: row.id, sourceItemId: row.sourceItemId, dedupeKey: row.dedupeKey }))).toEqual(before);
    expect(database.rows.filter(row => ['a', 'b'].includes(row.sourceItemId)).map(row => row.providerMetadata)).toEqual([
      expect.objectContaining({ articleContent: { semanticFingerprint: 'shared' } }),
      expect.objectContaining({ articleContent: { semanticFingerprint: 'shared' } }),
    ]);
    expect(database.rows.find(row => row.sourceItemId === 'innocent')?.bodyPreview).toBe('Captured article evidence for innocent');
    expect(database.rollbacks).toBe(0);
  });
});
