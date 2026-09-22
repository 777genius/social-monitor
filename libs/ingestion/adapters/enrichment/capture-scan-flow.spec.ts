import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { RssSourceProvider } from '../source/rss/rss-source.provider';
import { ArticleContentSourceItemEnrichmentAdapter } from './article-content-source-item-enrichment.adapter';
import { InMemoryScanLeaseAdapter } from '../lease/in-memory-scan-lease.adapter';
import { InMemorySourceItemRepository } from '../persistence/in-memory-source-item.repository';
import { SourceItem } from '../../domain/entities/source-item';
import { readArticleCaptureAttempt } from '../../domain/value-objects/article-capture-attempt';
import { captureSha256, readContentCapture } from '../../domain/value-objects/source-content-capture';
import type { ArticleContentExtractorPort } from '../../ports/article-content-extractor.port';
import type { FetchedSourceItem } from '../../ports/source-fetcher.port';
import { captureScannedSourceItems } from '../../features/execute-scan/capture-scanned-source-items';
import { sanitizeAndPrepareLiveArticleFetchUrls } from '../../features/execute-scan/scan-source-sanitization';

const start = new Date('2026-09-20T00:00:00Z');
const scope = { tenantId: tenantId('tenant'), workspaceId: workspaceId('workspace'), sourceBindingId: 'binding', providerKey: 'hacker-news' };
const native = (externalId = '1', url = 'https://example.test/article'): FetchedSourceItem => ({
  externalId, title: 'HN story', body: 'Native caveat', publishedAt: start,
  canonicalUrl: `https://news.ycombinator.com/item?id=${externalId}`, metadata: { externalUrl: url },
});
const body = 'Article content. '.repeat(2500) + 'Qualification: results not controlled.';
const success = (url: string) => ({
  ok: true as const, sourceUrl: url, finalUrl: url, text: body, textLength: body.length,
  originalTextLength: body.length, truncated: false, fullTextSha256: captureSha256(body),
  extractionVersion: 'readability.text.v2', contentHash: 'hash', semanticFingerprint: 'fingerprint', wordCount: 5000,
});
const setup = (providerKey = scope.providerKey) => {
  const scanScope = { ...scope, providerKey };
  let now = new Date(start);
  let sequence = 0;
  const clock = { now: () => new Date(now) };
  const ids = { generate: () => String(++sequence) };
  const repository = new InMemorySourceItemRepository();
  const leases = new InMemoryScanLeaseAdapter();
  const extract = jest.fn<ReturnType<ArticleContentExtractorPort['extract']>, Parameters<ArticleContentExtractorPort['extract']>>().mockImplementation(async ({ url }) => success(url));
  const enrichment = new ArticleContentSourceItemEnrichmentAdapter({ extract });
  const scan = async (items: readonly FetchedSourceItem[]) => {
    const prepared = sanitizeAndPrepareLiveArticleFetchUrls(scanScope.providerKey, items);
    const lease = (await leases.acquire({ ...scanScope, scanJobId: `scan-${++sequence}`, workerId: 'worker', leasedAt: clock.now(), ttlSeconds: 120 }))!;
    try {
      return await captureScannedSourceItems({
        scope: scanScope, repository, enrichment,
        items: prepared.sanitizedFetchedItems,
        liveArticleFetchUrls: prepared.liveArticleFetchUrls,
        capturedAt: clock.now(), clock, ids, lease, correlationId: 'fixture',
      });
    } finally { await leases.release(lease); }
  };
  return { repository, leases, extract, clock, scan, advance: (ms: number) => { now = new Date(now.getTime() + ms); } };
};

describe('durable ingestion article capture', () => {
  it('A10/A12 captures HN external text once per request, preserves it through native-only scans and keeps late qualifications', async () => {
    const fixture = setup();
    await fixture.scan([native('1'), native('2')]);
    expect(fixture.extract).toHaveBeenCalledTimes(1);
    const first = fixture.repository.all()[0]!.toSnapshot();
    expect(first.canonicalUrl).toBe(native('1').canonicalUrl);
    expect(first.body).toContain('Native caveat');
    expect(first.body).toContain('Qualification: results not controlled.');
    expect(readContentCapture(first)?.presentationComplete).toBe(true);
    fixture.advance(1000);
    await fixture.scan([native('1'), native('2')]);
    expect(fixture.extract).toHaveBeenCalledTimes(1);
    expect(readContentCapture(fixture.repository.all()[0]!.toSnapshot())?.sourceSnapshotSha256)
      .toBe(readContentCapture(first)?.sourceSnapshotSha256);
  });

  it('A11 revisits a transient failure when a provider returns an empty/304 batch', async () => {
    const fixture = setup();
    fixture.extract.mockResolvedValueOnce({ ok: false, sourceUrl: 'https://example.test/article',
      reason: 'temporary', reasonCode: 'http_503', retryable: true });
    await fixture.scan([native()]);
    expect(fixture.repository.all()[0]!.toSnapshot().body).toBe('Native caveat');
    expect(readArticleCaptureAttempt(fixture.repository.all()[0]!.toSnapshot())?.attemptCount).toBe(1);
    fixture.advance(60_000);
    await fixture.scan([]);
    expect(fixture.extract).toHaveBeenCalledTimes(2);
    expect(readContentCapture(fixture.repository.all()[0]!.toSnapshot())?.article).toBeDefined();
  });

  it('defers a signed-URL retry without spending an attempt until matching live credentials return', async () => {
    const fixture = setup();
    const signedUrl = 'https://example.test/article?edition=north&sig=fixture-signature&sv=2025-01-05&se=2030-01-01';
    fixture.extract.mockResolvedValueOnce({
      ok: false, sourceUrl: signedUrl,
      reason: 'temporary', reasonCode: 'http_503', retryable: true,
    });

    await fixture.scan([native('signed-recovery', signedUrl)]);
    expect(fixture.extract).toHaveBeenCalledTimes(1);
    const failed = fixture.repository.all()[0]!.toSnapshot();
    expect(readArticleCaptureAttempt(failed)?.attemptCount).toBe(1);
    expect(failed.metadata?.articleFetchPolicy).toEqual({
      version: 'article_fetch_policy.v1',
      liveUrlRequired: true,
    });
    expect(JSON.stringify(failed)).not.toContain('fixture-signature');
    fixture.advance(60_000);

    await fixture.scan([]);
    expect(fixture.extract).toHaveBeenCalledTimes(1);
    expect(readArticleCaptureAttempt(fixture.repository.all()[0]!.toSnapshot())).toMatchObject({
      attemptCount: 1,
      status: 'retryable_failed',
    });

    await fixture.scan([native('signed-recovery', signedUrl)]);
    expect(fixture.extract).toHaveBeenCalledTimes(2);
    expect(fixture.extract).toHaveBeenLastCalledWith(expect.objectContaining({ url: signedUrl }));
    const recovered = fixture.repository.all()[0]!.toSnapshot();
    expect(readContentCapture(recovered)?.article).toBeDefined();
    expect(JSON.stringify(recovered)).not.toContain('fixture-signature');
  });

  it('selects a newer eligible article past 20 credential-waiting retries', async () => {
    const fixture = setup();
    fixture.extract.mockResolvedValue({
      ok: false,
      sourceUrl: 'https://example.test/article',
      reason: 'temporary',
      reasonCode: 'http_503',
      retryable: true,
    });
    const waiting = Array.from({ length: 20 }, (_, index) => native(
      `waiting-${String(index).padStart(2, '0')}`,
      `https://example.test/waiting/${index}?sig=fixture-${index}`,
    ));
    await fixture.scan(waiting);
    expect(fixture.extract).toHaveBeenCalledTimes(20);
    fixture.advance(60_000);
    fixture.extract.mockImplementation(async ({ url }) => success(url));

    const eligible = {
      ...native('eligible', 'https://example.test/eligible'),
      publishedAt: new Date(start.getTime() + 1_000),
    };
    const result = await fixture.scan([eligible]);

    expect(fixture.extract).toHaveBeenCalledTimes(21);
    expect(fixture.extract).toHaveBeenLastCalledWith(expect.objectContaining({
      url: 'https://example.test/eligible',
    }));
    expect(result.items.map((item) => item.toSnapshot().externalId)).toContain('eligible');
    for (const item of fixture.repository.all().filter((entry) =>
      entry.toSnapshot().externalId.startsWith('waiting-'))) {
      expect(readArticleCaptureAttempt(item.toSnapshot())).toMatchObject({
        attemptCount: 1,
        status: 'retryable_failed',
      });
    }
  });

  it('keeps normal query parameters as distinct durable article identities', () => {
    const first = sanitizeAndPrepareLiveArticleFetchUrls(scope.providerKey, [
      native('north', 'https://example.test/article?token=fixture-one&edition=north'),
      native('south', 'https://example.test/article?token=fixture-two&edition=south'),
    ]).sanitizedFetchedItems;

    expect(first[0]?.metadata?.externalUrl).toBe('https://example.test/article?edition=north');
    expect(first[1]?.metadata?.externalUrl).toBe('https://example.test/article?edition=south');
    expect(first[0]?.metadata?.externalUrl).not.toBe(first[1]?.metadata?.externalUrl);
  });

  it('persists a redacted article with reader-compatible capture lengths after a full scan', async () => {
    const fixture = setup();
    const unsafeText = 'Finding: access_token=x should never reach source custody.';
    fixture.extract.mockImplementationOnce(async ({ url }) => ({
      ...success(url), text: unsafeText, textLength: unsafeText.length,
      originalTextLength: unsafeText.length, fullTextSha256: captureSha256(unsafeText), truncated: false,
    }));

    const signedUrl = 'https://example.test/article?lang=en&token=fixture-scan-secret';
    await fixture.scan([native('redacted', signedUrl)]);
    expect(fixture.extract).toHaveBeenCalledWith(expect.objectContaining({ url: signedUrl }));
    const saved = fixture.repository.all()[0]!.toSnapshot();
    const capture = readContentCapture(saved)!;
    const article = capture.article!;
    const safeText = 'Finding: access_token=[REDACTED] should never reach source custody.';
    expect(saved.body).toContain(safeText);
    expect(saved.body).not.toContain('access_token=x');
    expect(JSON.stringify(saved)).not.toContain('fixture-scan-secret');
    expect(article).toMatchObject({
      length: safeText.length,
      originalLength: safeText.length,
      truncated: false,
      fullTextSha256: captureSha256(safeText),
    });
    // Reader capture accepts an untruncated segment only when these lengths
    // match exactly; asserting them on the persisted scan result protects that
    // boundary without importing a sibling bounded context into ingestion.
    expect(capture.presentationComplete).toBe(true);
  });

  it('keeps concurrent provider metrics and author/date corrections when memory capture completes', async () => {
    const fixture = setup();
    fixture.extract.mockImplementationOnce(async ({ url }) => {
      const current = fixture.repository.all()[0]!.toSnapshot();
      await fixture.repository.saveBatch({ ...scope, items: [SourceItem.rehydrate({
        ...current, authorHandle: 'corrected', publishedAt: new Date(start.getTime() - 1000),
        metadata: { ...current.metadata, points: 99, comments: 12 },
      })] });
      return success(url);
    });
    await fixture.scan([native()]);
    const saved = fixture.repository.all()[0]!.toSnapshot();
    expect(saved.body).toContain('Qualification: results not controlled.');
    expect(saved.authorHandle).toBe('corrected');
    expect(saved.publishedAt).toEqual(new Date(start.getTime() - 1000));
    expect(saved.metadata).toMatchObject({ points: 99, comments: 12 });
    const duplicate = await fixture.repository.saveBatch({ ...scope, items: [SourceItem.rehydrate(saved)] });
    expect(duplicate.contentUpdated).toBe(0);
  });

  it('revisits a refunded RSS budget skip when the provider subsequently returns 304', async () => {
    const fixture = setup('rss');
    const readFeed = jest.fn()
      .mockResolvedValueOnce({ items: [{ guid: 'rss-item', link: 'https://example.test/article', title: 'Report',
        content: 'Native RSS summary', publishedAt: start }], etag: 'fixture-etag' })
      .mockResolvedValueOnce({ items: [], notModified: true, etag: 'fixture-etag' });
    const provider = new RssSourceProvider({ readFeed });
    const context = { ...scope, scanJobId: 'rss-scan', correlationId: 'fixture' };
    const plan = provider.planScan({ mode: 'url', query: 'https://example.test/feed.xml' }, context);
    const first = await provider.scan(plan, context);
    const reserve = fixture.repository.reserveArticleCapture.bind(fixture.repository);
    jest.spyOn(fixture.repository, 'reserveArticleCapture').mockImplementationOnce(async (command) => {
      const reserved = await reserve(command);
      fixture.advance(61_000);
      return reserved;
    });
    await fixture.scan(first.items);
    expect(fixture.extract).not.toHaveBeenCalled();
    expect(readArticleCaptureAttempt(fixture.repository.all()[0]!.toSnapshot())?.attemptCount).toBe(0);
    const second = await provider.scan({ ...plan, cursor: first.nextCursor }, context);
    expect(second.items).toEqual([]);
    await fixture.scan(second.items);
    expect(fixture.extract).toHaveBeenCalledTimes(1);
    expect(fixture.repository.all()[0]!.toSnapshot().body).toContain('Native RSS summary');
    expect(readContentCapture(fixture.repository.all()[0]!.toSnapshot())?.article).toBeDefined();
  });

  it('A11 refuses an old article completion and never returns its stale projection after a native revision change', async () => {
    const fixture = setup();
    fixture.extract.mockImplementationOnce(async ({ url }) => {
      const current = fixture.repository.all()[0]!.toSnapshot();
      await fixture.repository.saveBatch({ ...scope, items: [SourceItem.ingest({
        ...native('1', 'https://example.test/new'), ...scope, id: current.id, ingestedAt: fixture.clock.now(),
        title: 'Newer provider title', body: 'Newer provider body',
      })] });
      return success(url);
    });
    const result = await fixture.scan([native('1', 'https://example.test/old')]);
    const saved = fixture.repository.all()[0]!.toSnapshot();
    expect(saved.title).toBe('Newer provider title');
    expect(saved.body).toBe('Newer provider body');
    expect(readContentCapture(saved)?.articleUrl).toBe('https://example.test/new');
    expect(result.items).toEqual([]);
    expect(result.saveResult.items).toEqual([]);
  });

  it('refunds a reservation if the budget expires before dispatch and retries it on the next empty batch', async () => {
    const fixture = setup();
    const reserve = fixture.repository.reserveArticleCapture.bind(fixture.repository);
    jest.spyOn(fixture.repository, 'reserveArticleCapture').mockImplementationOnce(async (command) => {
      const reserved = await reserve(command);
      fixture.advance(61_000);
      return reserved;
    });
    await fixture.scan([native()]);
    expect(fixture.extract).not.toHaveBeenCalled();
    expect(readArticleCaptureAttempt(fixture.repository.all()[0]!.toSnapshot())).toMatchObject({ attemptCount: 0, status: 'pending' });
    await fixture.scan([]);
    expect(fixture.extract).toHaveBeenCalledTimes(1);
  });

  it('rejects a completion after the authoritative in-memory scan lease is released', async () => {
    const fixture = setup();
    fixture.extract.mockImplementationOnce(async ({ url }) => {
      const attempt = readArticleCaptureAttempt(fixture.repository.all()[0]!.toSnapshot())!;
      const lease = fixture.leases.current({ ...scope, scanJobId: attempt.scanJobId! })!;
      await fixture.leases.release(lease);
      return success(url);
    });
    await fixture.scan([native()]);
    expect(fixture.repository.all()[0]!.toSnapshot().body).toBe('Native caveat');
  });
});
