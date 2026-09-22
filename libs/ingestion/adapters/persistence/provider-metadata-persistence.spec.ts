import { tenantId, workspaceId, type JsonObject } from '@social-monitor/shared-kernel';
import { SourceItem } from '../../domain/entities/source-item';
import { readContentCapture } from '../../domain/value-objects/source-content-capture';
import { sourceItemProviderContentHash } from '../../domain/value-objects/source-item-content-fingerprint';
import { InMemorySourceItemRepository } from './in-memory-source-item.repository';
import { PrismaSourceItemRepository } from './prisma/prisma-source-item.repository';
import type { PrismaIngestionClient } from './prisma/prisma-ingestion-client';
import type { PrismaSourceItemRecord } from './prisma/prisma-ingestion-records';

const now = new Date('2026-09-20T00:00:00Z');
const scope = { tenantId: tenantId('tenant'), workspaceId: workspaceId('workspace') };
const source = (metadata: JsonObject) => SourceItem.rehydrate({
  ...scope, id: 'source', sourceBindingId: 'binding', externalId: 'item', canonicalUrl: 'https://example.test/item',
  title: 'Title', body: 'Provider native description', publishedAt: now, ingestedAt: now, metadata,
});

const prismaRepository = () => {
  let record: PrismaSourceItemRecord | null = null;
  const sourceItem: PrismaIngestionClient['sourceItem'] = {
    findFirst: async () => record,
    create: async ({ data }) => (record = { ...data, authorHandle: data.authorHandle ?? null, createdAt: now }),
    update: async ({ data }) => {
      if (record === null) throw new Error('missing fixture record');
      return record = { ...record, ...data };
    },
  };
  return new PrismaSourceItemRepository({ sourceItem } as PrismaIngestionClient);
};

for (const [name, create] of [
  ['memory', () => new InMemorySourceItemRepository()], ['prisma', prismaRepository],
] as const) {
  describe(`${name} provider metadata persistence`, () => {
    it.each<{ providerKey: string; before: JsonObject; after: JsonObject }>([
      { providerKey: 'github-repo-radar', before: { kind: 'github_repository_trend', repository: { language: 'JavaScript', topics: ['old'], license: 'MIT' } },
        after: { kind: 'github_repository_trend', repository: { language: 'TypeScript', topics: ['new'], license: 'Apache-2.0' } } },
      { providerKey: 'rss', before: { kind: 'rss_item', enclosureUrl: 'https://example.test/old.mp3' },
        after: { kind: 'rss_item', enclosureUrl: 'https://example.test/new.mp3' } },
    ])('persists $providerKey metadata-only changes without changing assessment-text identity', async ({ providerKey, before, after }) => {
      const repository = create();
      const first = await repository.saveBatch({ ...scope, providerKey, items: [source(before)] });
      const second = await repository.saveBatch({ ...scope, providerKey, items: [source(after)] });
      const prior = first.items[0]!.persistedItem!.toSnapshot();
      const next = second.items[0]!.persistedItem!.toSnapshot();
      expect(next.metadata).toMatchObject(after);
      expect(next.body).toBe(prior.body);
      expect(readContentCapture(next)?.sourceSnapshotSha256).toBe(readContentCapture(prior)?.sourceSnapshotSha256);
      expect(second.contentUpdated).toBe(1);
      expect(sourceItemProviderContentHash({ providerKey, snapshot: next })).not.toBe(sourceItemProviderContentHash({ providerKey, snapshot: prior }));
    });

    it('persists engagement-only updates while keeping both content identities stable', async () => {
      const repository = create();
      const providerKey = 'hacker-news';
      const first = await repository.saveBatch({ ...scope, providerKey, items: [source({ kind: 'hacker_news_story', points: 1 })] });
      const second = await repository.saveBatch({ ...scope, providerKey, items: [source({ kind: 'hacker_news_story', points: 99 })] });
      const prior = first.items[0]!.persistedItem!.toSnapshot();
      const next = second.items[0]!.persistedItem!.toSnapshot();
      expect(next.metadata).toMatchObject({ points: 99 });
      expect(second.contentUpdated).toBe(0);
      expect(readContentCapture(next)?.sourceSnapshotSha256).toBe(readContentCapture(prior)?.sourceSnapshotSha256);
      const hash = (snapshot: typeof next) => sourceItemProviderContentHash({ providerKey, snapshot });
      expect(hash(next)).toBe(hash(prior));
      expect(hash({ ...next, metadata: { ...next.metadata, articleCaptureAttempt: { attemptedAt: 'later' }, articleContent: { status: 'failed' } } })).toBe(hash(next));
    });
  });
}
