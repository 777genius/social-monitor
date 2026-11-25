import { randomUUID } from 'node:crypto';
import { tenantId, workspaceId, type JsonObject } from '@social-monitor/shared-kernel';
import { capturePostgresFixture } from './article-capture-postgres.spec-support';
import { PrismaArticleCaptureRepository } from './prisma-article-capture.repository';
import { SourceItem } from '../../../domain/entities/source-item';
import { ARTICLE_REPRESENTATION_VERSION, captureArticleText, captureNativeText, captureSha256, readContentCapture } from '../../../domain/value-objects/source-content-capture';
import { finishArticleCapture, readArticleCaptureAttempt } from '../../../domain/value-objects/article-capture-attempt';
import { GOOGLE_NEWS_ARTICLE_REPRESENTATION_VERSION } from '../../../domain/value-objects/google-news-article';
import { sourceItemContentHash, sourceItemProviderContentHash } from '../../../domain/value-objects/source-item-content-fingerprint';
import { googleArticleFeedProjection } from '../../../../../test/support/google-article-feed-projection';

const databaseUrl = process.env.INGESTION_CAPTURE_TEST_DATABASE_URL;
const sqlTest = databaseUrl === undefined ? it.skip : it;

sqlTest('selects only eligible Google upgrades before LIMIT and spends cumulative attempt2 under the normal SQL fence', async () => {
  const f = await capturePostgresFixture(databaseUrl!, randomUUID().replaceAll('-', ''));
  try {
    const now: Date = (await f.pool.query('SELECT clock_timestamp() AS now')).rows[0].now;
    const scope = { tenantId: tenantId('10000000-0000-4000-8000-000000000001'),
      workspaceId: workspaceId('20000000-0000-4000-8000-000000000002'),
      sourceBindingId: '30000000-0000-4000-8000-000000000003', providerKey: 'rss' };
    const persist = async (externalId: string, patch: JsonObject, publishedAt: Date, articleUrl?: string) => {
      const native = captureNativeText({ ...scope, id: randomUUID(), externalId,
        canonicalUrl: articleUrl ?? `https://news.google.com/rss/articles/CBMi_${externalId}`,
        title: externalId, body: 'Feed description', publishedAt, ingestedAt: now, metadata: { kind: 'rss_item' } }, 'rss', now);
      const capture = readContentCapture(native)!;
      const item = { ...native, metadata: { ...native.metadata, articleCaptureAttempt: {
        version: 'article_capture_attempt.v1', nativeRevision: capture.nativeRevision,
        articleUrl: capture.articleUrl, representationVersion: ARTICLE_REPRESENTATION_VERSION,
        status: 'permanent_failed', attemptCount: 1, nextAttemptAt: null, reasonCode: 'empty_extraction',
        reservationToken: null, scanJobId: null, scanFence: null, leaseUntil: null, ...patch,
      } } };
      await f.pool.query(`INSERT INTO source_items VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$11,$11,$11,$12,$13,$14)`,
        [item.id, scope.tenantId, scope.workspaceId, scope.sourceBindingId, scope.providerKey, externalId,
          item.canonicalUrl, item.title, item.body, null, publishedAt, sourceItemContentHash(item),
          sourceItemProviderContentHash({ providerKey: scope.providerKey, snapshot: item }), JSON.stringify(item.metadata)]);
      return item;
    };
    const excluded: readonly JsonObject[] = [
      { reasonCode: 'http_403' }, { attemptCount: 3 }, { representationVersion: 'unknown.v9', status: 'pending', nextAttemptAt: now.toISOString() },
      { status: 'succeeded' }, { status: 'running', nextAttemptAt: now.toISOString(), leaseUntil: new Date(now.getTime() + 60_000).toISOString() },
    ];
    for (let i = 0; i < 20; i += 1) await persist(`excluded_${String(i).padStart(2, '0')}`, excluded[i % excluded.length]!, new Date(now.getTime() - 60_000));
    await persist('non_google', {}, new Date(now.getTime() - 30_000), 'https://publisher.test/failed');
    const old = await persist('eligible', {}, now);
    const feed = await googleArticleFeedProjection(f.pool, { generate: randomUUID });
    const interestId = '60000000-0000-4000-8000-000000000006';
    const projection = { ...scope, interestId, snapshots: {
      interestQuerySnapshot: { interestId, query: 'science' },
      sourceBindingSnapshot: { sourceBindingId: scope.sourceBindingId, providerKey: 'rss', sourceQuery: { mode: 'url' as const, query: 'https://publisher.test/feed' } },
      workspaceScopeSnapshot: scope,
    } };
    await feed.adapter.project({ ...projection, sourceItems: [SourceItem.rehydrate(old)] });
    const originalFeed = await feed.read();
    const unselectedBefore = (await f.pool.query(`SELECT provider_item_id, metadata, body, content_hash, provider_content_hash,
      content_updated_at FROM source_items WHERE provider_item_id <> 'eligible' ORDER BY provider_item_id`)).rows;
    const repository = new PrismaArticleCaptureRepository(f.client);
    const due = await repository.findDueArticleCaptures({ ...scope, now, limit: 1, liveArticleCredentialIdentities: [] });
    expect(due.map((item) => item.toSnapshot().externalId)).toEqual(['eligible']);
    expect(readArticleCaptureAttempt(due[0]!.toSnapshot())).toMatchObject({
      representationVersion: GOOGLE_NEWS_ARTICLE_REPRESENTATION_VERSION, attemptCount: 1, status: 'pending',
    });
    const beforeReserve = (await f.pool.query('SELECT metadata, content_hash, content_updated_at FROM source_items WHERE id=$1', [old.id])).rows[0];
    expect(beforeReserve.metadata.articleCaptureAttempt).toMatchObject({ representationVersion: ARTICLE_REPRESENTATION_VERSION, attemptCount: 1, status: 'permanent_failed' });
    const lease = { ...scope, scanJobId: '40000000-0000-4000-8000-000000000004', workerId: 'fixture', fencingToken: 'fence',
      leasedAt: now, expiresAt: new Date(now.getTime() + 60_000) };
    await f.pool.query('INSERT INTO scan_leases VALUES ($1,$2,$3,$4,$5)', [scope.tenantId, scope.workspaceId, lease.scanJobId, lease.fencingToken, lease.expiresAt]);
    const capture = readContentCapture(old)!;
    const reserved = await repository.reserveArticleCapture({ ...scope, now, lease, externalId: old.externalId,
      expectedNativeRevision: capture.nativeRevision, expectedArticleUrl: capture.articleUrl!, reservationToken: 'reservation' });
    expect(reserved).not.toBeNull();
    expect(readArticleCaptureAttempt(reserved!.toSnapshot())).toMatchObject({ attemptCount: 2,
      priorRepresentation: { representationVersion: ARTICLE_REPRESENTATION_VERSION, reasonCode: 'empty_extraction', attemptCount: 1 } });
    const afterReserve = (await f.pool.query('SELECT content_hash, content_updated_at FROM source_items WHERE id=$1', [old.id])).rows[0];
    expect(afterReserve).toEqual({ content_hash: beforeReserve.content_hash, content_updated_at: beforeReserve.content_updated_at });
    const text = 'Publisher detail with a qualification.';
    const incoming = finishArticleCapture(captureArticleText(reserved!.toSnapshot(), {
      text, sourceUrl: capture.articleUrl!, finalUrl: 'https://publisher.test/report', originalLength: text.length,
      fullTextSha256: captureSha256(text), truncated: false, extractionVersion: GOOGLE_NEWS_ARTICLE_REPRESENTATION_VERSION, acquiredAt: now,
    }), { kind: 'succeeded' }, now);
    const completed = await repository.completeArticleCapture({ ...scope, now, lease, item: SourceItem.rehydrate(incoming),
      expected: readArticleCaptureAttempt(reserved!.toSnapshot())! });
    expect(completed).not.toBeNull();
    expect(readArticleCaptureAttempt(completed!.toSnapshot())).toMatchObject({ status: 'succeeded', attemptCount: 2 });
    expect(readContentCapture(completed!.toSnapshot())?.article).toMatchObject({ sourceUrl: old.canonicalUrl,
      finalUrl: 'https://publisher.test/report', extractionVersion: GOOGLE_NEWS_ARTICLE_REPRESENTATION_VERSION });
    await feed.adapter.project({ ...projection, sourceItems: [completed!] });
    const enrichedFeed = await feed.read();
    expect(enrichedFeed).toMatchObject({ id: originalFeed.id, sourceItemId: old.id,
      dedupeKey: originalFeed.dedupeKey, canonicalUrl: old.canonicalUrl,
      bodyPreview: expect.stringContaining(text), providerMetadata: {
        contentCapture: { article: { extractionVersion: GOOGLE_NEWS_ARTICLE_REPRESENTATION_VERSION } },
        articleCaptureAttempt: { status: 'succeeded', attemptCount: 2,
          priorRepresentation: { representationVersion: ARTICLE_REPRESENTATION_VERSION, reasonCode: 'empty_extraction', attemptCount: 1 } },
      } });
    expect(await repository.findDueArticleCaptures({ ...scope, now, limit: 20, liveArticleCredentialIdentities: [] })).toEqual([]);
    const unselectedAfter = (await f.pool.query(`SELECT provider_item_id, metadata, body, content_hash, provider_content_hash,
      content_updated_at FROM source_items WHERE provider_item_id <> 'eligible' ORDER BY provider_item_id`)).rows;
    expect(unselectedAfter).toEqual(unselectedBefore);
  } finally { await f.close(); }
}, 20_000);
