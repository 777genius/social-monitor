import { randomUUID } from 'node:crypto';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { SourceItem } from '../../../domain/entities/source-item';
import { captureNativeText, captureArticleText, captureSha256 } from '../../../domain/value-objects/source-content-capture';
import { prepareArticleCaptureAttempt, reserveArticleCapture, readArticleCaptureAttempt, finishArticleCapture } from '../../../domain/value-objects/article-capture-attempt';
import { sourceItemContentHash, sourceItemProviderContentHash } from '../../../domain/value-objects/source-item-content-fingerprint';
import { PrismaArticleCaptureRepository } from './prisma-article-capture.repository';
import { capturePostgresFixture } from './article-capture-postgres.spec-support';

const databaseUrl = process.env.INGESTION_CAPTURE_TEST_DATABASE_URL;
const sqlTest = databaseUrl === undefined ? it.skip : it;

sqlTest('merges a competing committed engagement/author/date correction after waiting for its real PostgreSQL row lock', async () => {
  const f = await capturePostgresFixture(databaseUrl!, randomUUID().replaceAll('-', ''));
  const writer = await f.pool.connect();
  try {
    const now: Date = (await f.pool.query('SELECT clock_timestamp() AS now')).rows[0].now;
    const scope = { tenantId: tenantId('10000000-0000-4000-8000-000000000001'),
      workspaceId: workspaceId('20000000-0000-4000-8000-000000000002'),
      sourceBindingId: '30000000-0000-4000-8000-000000000003', providerKey: 'hacker-news' };
    const lease = { ...scope, scanJobId: '40000000-0000-4000-8000-000000000004', workerId: 'fixture',
      fencingToken: 'fence', leasedAt: now, expiresAt: new Date(now.getTime() + 120_000) };
    const native = captureNativeText({ ...scope, id: '50000000-0000-4000-8000-000000000005', externalId: 'story',
      canonicalUrl: 'https://news.ycombinator.com/item?id=1', title: 'Story', body: 'Native', authorHandle: 'original',
      publishedAt: now, ingestedAt: now,
      metadata: { kind: 'hacker_news_story', externalUrl: 'https://example.test/article', points: 1 } }, scope.providerKey, now);
    const reserved = reserveArticleCapture(prepareArticleCaptureAttempt(native, now), {
      now, token: 'reservation', scanJobId: lease.scanJobId, scanFence: lease.fencingToken, leaseUntil: lease.expiresAt,
    })!;
    await f.pool.query(`INSERT INTO source_items VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$11,$11,$11,$12,$13,$14)`,
      [native.id, scope.tenantId, scope.workspaceId, scope.sourceBindingId, scope.providerKey, native.externalId,
        native.canonicalUrl, native.title, native.body, native.authorHandle, now, sourceItemContentHash(reserved),
        sourceItemProviderContentHash({ providerKey: scope.providerKey, snapshot: reserved }), JSON.stringify(reserved.metadata)]);
    await f.pool.query('INSERT INTO scan_leases VALUES ($1,$2,$3,$4,$5)',
      [scope.tenantId, scope.workspaceId, lease.scanJobId, lease.fencingToken, lease.expiresAt]);
    const incoming = finishArticleCapture(captureArticleText(reserved, {
      text: 'Article', sourceUrl: 'https://example.test/article', finalUrl: 'https://example.test/article',
      originalLength: 7, fullTextSha256: captureSha256('Article'), truncated: false,
      extractionVersion: 'readability.text.v2', acquiredAt: now,
    }), { kind: 'succeeded' }, now);
    await writer.query('BEGIN');
    await writer.query(`UPDATE source_items SET metadata=metadata || '{"points":99,"comments":12}'::jsonb,
      author_handle='corrected', published_at=published_at - interval '1 second'`);
    const completion = new PrismaArticleCaptureRepository(f.client).completeArticleCapture({
      ...scope, lease, now, item: SourceItem.rehydrate(incoming), expected: readArticleCaptureAttempt(reserved)!,
    });
    // Attach rejection handling while observing the lock to avoid unhandled rejection on fixture failure.
    const outcome = completion.then((value) => ({ value }), (error: unknown) => ({ error }));
    try { await f.waitForSourceLock(); } finally { await writer.query('COMMIT'); }
    const settled = await outcome;
    if ('error' in settled) throw settled.error;
    const result = settled.value!.toSnapshot();
    expect(result.metadata).toMatchObject({ points: 99, comments: 12 });
    expect(result.authorHandle).toBe('corrected');
    expect(result.publishedAt).toEqual(new Date(now.getTime() - 1000));
    expect(result.body).toContain('Article');
    const persisted = await f.read();
    expect(persisted.contentHash).toBe(sourceItemContentHash(result));
    expect(persisted.providerContentHash).toBe(sourceItemProviderContentHash({ providerKey: scope.providerKey, snapshot: result }));
    expect(f.transactionCount()).toBeGreaterThanOrEqual(2);
  } finally {
    await writer.query('ROLLBACK');
    writer.release();
    await f.close();
  }
}, 20_000);
