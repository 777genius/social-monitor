import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { SourceItem } from '../../../domain/entities/source-item';
import { normalizeRedditArchive } from '../../source/reddit/reddit-archive-normalizer';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import { PrismaSourceItemRepository } from './prisma-source-item.repository';

function item() {
  const now = new Date('2026-10-16T08:00:00Z'), created = 1791115200;
  const normalized = normalizeRedditArchive({ data: [{ id: 'test123', subreddit: 'LocalLLaMA', title: 'Fixture', selftext: 'Source.',
    created_utc: created, retrieved_on: created + 10, score: 0, over_18: false, removed_by_category: null,
    permalink: '/r/LocalLLaMA/comments/test123/fixture/' }] }, {
    sourceUrl: 'https://arctic-shift.photon-reddit.com/api/posts/ids?ids=test123', acquiredAt: '2026-10-15T09:20:31.716Z',
    rawSha256: 'a'.repeat(64), day: '2026-10-04',
  }, ['test123'], { providerKey: 'reddit', mode: 'listing', query: 'LocalLLaMA', subreddit: 'LocalLLaMA' }, 0)[0]!;
  return SourceItem.ingest({ ...normalized, id: '00000000-0000-7000-8000-000000000008',
    tenantId: tenantId('tenant-fixture'), workspaceId: workspaceId('workspace-fixture'), sourceBindingId: 'binding-fixture',
    ingestedAt: now, metadata: { ...normalized.metadata, archiveImportObservedAt: now.toISOString() } });
}
describe('Explicit archive insertion versus ordinary live persistence', () => {
  it('uses the existing transaction seam and retains archive text without manufacturing live capture metadata', async () => {
    const created: { metadata: unknown }[] = [];
    const client = { sourceItem: { findMany: async () => [], create: async ({ data }: { data: object }) => {
      created.push(data as { metadata: unknown }); return { ...data, createdAt: new Date('2026-10-16T08:00:00Z') };
    } } };
    let calls = 0;
    const finite = { ...client, $transaction: async <T>(run: (tx: unknown) => Promise<T>) => { calls++; return run(finite); } };
    const repository = new PrismaSourceItemRepository(finite as unknown as PrismaIngestionClient), source = item();
    await repository.saveRedditArchiveBatchInsertOnly({ tenantId: source.toSnapshot().tenantId,
      workspaceId: source.toSnapshot().workspaceId, providerKey: 'reddit', items: [source] });
    expect(calls).toBe(1);
    expect(created[0]!.metadata).toMatchObject({ redditArchive: { removed: 'UNKNOWN_ABSENT' },
      archiveImportObservedAt: '2026-10-16T08:00:00.000Z' });
    expect(created[0]!.metadata).not.toHaveProperty('contentCapture');
    expect(created[0]!.metadata).not.toHaveProperty('articleCaptureAttempt');
    // Even identical archive-looking metadata cannot suppress ordinary provider capture.
    await repository.saveBatchInsertOnly({ tenantId: source.toSnapshot().tenantId,
      workspaceId: source.toSnapshot().workspaceId, providerKey: 'reddit', items: [source] });
    expect(created[1]!.metadata).toHaveProperty('contentCapture.native.origin', 'provider_native');
  });
  it('refuses missing provenance before any persistence call', () => {
    const source = item(), snapshot = source.toSnapshot();
    const invalid = SourceItem.ingest({ ...snapshot, metadata: { kind: 'reddit_post' } });
    const repository = new PrismaSourceItemRepository({} as PrismaIngestionClient);
    expect(() => repository.saveRedditArchiveBatchInsertOnly({ tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId, providerKey: 'reddit', items: [invalid] })).toThrow('provenance required');
  });
});
