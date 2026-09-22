import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { SourceItem } from '../../../domain/entities/source-item';
import { captureArticleText, captureNativeText, captureSha256 } from '../../../domain/value-objects/source-content-capture';
import { prepareArticleCaptureAttempt, readArticleCaptureAttempt, reserveArticleCapture, finishArticleCapture } from '../../../domain/value-objects/article-capture-attempt';
import { sourceItemContentHash, sourceItemProviderContentHash } from '../../../domain/value-objects/source-item-content-fingerprint';
import { PrismaArticleCaptureRepository } from './prisma-article-capture.repository';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import type { PrismaSourceItemRecord } from './prisma-ingestion-records';

const now = new Date('2026-09-20T00:00:00Z');
const scope = { tenantId: tenantId('tenant'), workspaceId: workspaceId('workspace'), sourceBindingId: 'binding', providerKey: 'hacker-news' };
const lease = { ...scope, scanJobId: 'scan', workerId: 'worker', fencingToken: 'fence', leasedAt: now, expiresAt: new Date(now.getTime() + 60_000) };
const fixture = () => {
  const native = captureNativeText({ ...scope, id: 'source', externalId: 'story', canonicalUrl: 'https://news.ycombinator.com/item?id=1',
    title: 'Story', body: 'Native', authorHandle: 'original', publishedAt: now, ingestedAt: now,
    metadata: { kind: 'hacker_news_story', externalUrl: 'https://example.test/article', points: 1 } }, scope.providerKey, now);
  const reserved = reserveArticleCapture(prepareArticleCaptureAttempt(native, now), {
    now, token: 'reservation', scanJobId: lease.scanJobId, scanFence: lease.fencingToken, leaseUntil: lease.expiresAt,
  })!;
  const incoming = finishArticleCapture(captureArticleText(reserved, { text: 'Article', sourceUrl: 'https://example.test/article',
    finalUrl: 'https://example.test/article', originalLength: 7, fullTextSha256: captureSha256('Article'), truncated: false,
    extractionVersion: 'readability.text.v2', acquiredAt: now }), { kind: 'succeeded' }, now);
  let record: PrismaSourceItemRecord = { ...reserved, providerItemId: reserved.externalId, authorHandle: 'corrected',
    publishedAt: new Date(now.getTime() - 1000), metadata: { ...reserved.metadata, points: 99, comments: 12 },
    contentHash: 'previous', providerContentHash: 'previous', observedAt: now, lastObservedAt: now, contentUpdatedAt: now, createdAt: now };
  const query = jest.fn(async (sql: TemplateStringsArray, ...values: unknown[]) => {
    const text = sql.join('?');
    if (text.includes('UPDATE source_items')) {
      record = { ...record, metadata: JSON.parse(values[0] as string), body: values[1] as string,
        contentHash: values[2] as string, providerContentHash: values[3] as string };
      return [{ id: record.id }];
    }
    if (text.includes('FROM scan_leases')) return [{ expires_at: lease.expiresAt }];
    if (text.includes('FOR UPDATE')) return [{ id: record.id }];
    return [{ now }];
  });
  const client = { $queryRaw: query, sourceItem: { findFirst: async () => record },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(client) };
  const repository = new PrismaArticleCaptureRepository(client as unknown as PrismaIngestionClient);
  return { complete: () => repository.completeArticleCapture({ ...scope, item: SourceItem.rehydrate(incoming),
    expected: readArticleCaptureAttempt(reserved)!, lease, now }),
    record: () => record, change: (patch: Partial<PrismaSourceItemRecord>) => { record = { ...record, ...patch }; }, query };
};

describe('capture completion current-record merge', () => {
  it('preserves concurrent engagement and corrections and hashes the actual persisted record', async () => {
    const f = fixture();
    const result = (await f.complete())!.toSnapshot();
    expect(result.metadata).toMatchObject({ points: 99, comments: 12 });
    expect(result.authorHandle).toBe('corrected');
    expect(result.publishedAt).toEqual(new Date(now.getTime() - 1000));
    expect(result.body).toContain('Article');
    expect(f.record().contentHash).toBe(sourceItemContentHash(result));
    expect(f.record().providerContentHash).toBe(sourceItemProviderContentHash({ providerKey: scope.providerKey, snapshot: result }));
  });

  it('rejects a provider-kind correction without overwriting current provider metadata', async () => {
    const f = fixture();
    f.change({ metadata: { ...(f.record().metadata as Record<string, unknown>), kind: 'hacker_news_comment' } });
    expect(await f.complete()).toBeNull();
    expect(f.query.mock.calls.some(([sql]) => sql.join('?').includes('UPDATE source_items'))).toBe(false);
  });

  it.each([{ canonicalUrl: 'https://news.ycombinator.com/item?id=2' },
    { metadata: { kind: 'hacker_news_story', externalUrl: 'https://example.test/changed' } }])('rejects relevant identity changes: %p', async (patch) => {
    const f = fixture();
    f.change({ ...patch, ...(patch.metadata === undefined ? {} : {
      metadata: { ...(f.record().metadata as Record<string, unknown>), ...patch.metadata },
    }) });
    expect(await f.complete()).toBeNull();
    expect(f.query.mock.calls.some(([sql]) => sql.join('?').includes('UPDATE source_items'))).toBe(false);
  });
});
