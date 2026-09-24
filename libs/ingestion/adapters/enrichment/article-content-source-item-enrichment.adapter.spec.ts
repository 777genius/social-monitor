import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { ArticleContentExtractionResult, ArticleContentExtractorPort, ExtractArticleContentCommand } from '../../ports';
import { ArticleContentSourceItemEnrichmentAdapter } from './article-content-source-item-enrichment.adapter';
import { captureSha256, readContentCapture } from '../../domain/value-objects/source-content-capture';

describe('ArticleContentSourceItemEnrichmentAdapter', () => {
  it('enriches Reddit link posts through metadata linkedUrl and keeps only safe article metadata', async () => {
    const extractor = new FakeArticleExtractor();
    const enrichment = new ArticleContentSourceItemEnrichmentAdapter(extractor);

    const result = await enrichment.enrich({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      scanJobId: 'scan-1',
      providerKey: 'reddit',
      correlationId: 'corr-1', capturedAt: new Date('2026-09-20'), clock: { now: () => new Date('2026-09-20') },
      items: [{
        externalId: 'reddit:t3_1',
        canonicalUrl: 'https://www.reddit.com/r/OpenAI/comments/1/demo/',
        title: 'Interesting linked article',
        body: '',
        publishedAt: new Date('2026-06-21T00:00:00.000Z'),
        metadata: {
          subreddit: 'OpenAI',
          linkedUrl: 'https://example.test/agent-article',
          score: 500,
        },
      }],
    });

    expect(extractor.calls).toEqual([
      expect.objectContaining({ url: 'https://example.test/agent-article' }),
    ]);
    expect(result).toMatchObject({ enriched: 1, skipped: 0, failed: 0 });
    expect(result.items[0]).toMatchObject({
      body: 'Full article text about agent workflows and integration quality.',
      metadata: {
        subreddit: 'OpenAI',
        linkedUrl: 'https://example.test/agent-article',
        score: 500,
        articleContent: {
          status: 'enriched',
          finalUrlHost: 'example.test',
          finalUrlSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          contentHash: 'content-hash-1',
          semanticFingerprint: 'feedfacecafebeef',
          textLength: 64,
          wordCount: 8,
        },
      },
    });
  });

  it('fetches the HN external URL without changing discussion identity or dropping native text', async () => {
    const extractor = new FakeArticleExtractor();
    const enrichment = new ArticleContentSourceItemEnrichmentAdapter(extractor, { maxItemsPerScan: 1 });
    const native = 'Full article text';
    const result = await enrichment.enrich({
      tenantId: tenantId('tenant-1'), workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1', scanJobId: 'scan-1', providerKey: 'hacker-news',
      correlationId: 'corr-1', capturedAt: new Date('2026-09-20'), clock: { now: () => new Date('2026-09-20') },
      items: [
        { externalId: 'hn:ask', canonicalUrl: 'https://news.ycombinator.com/item?id=2',
          title: 'Ask HN', body: 'Native question', publishedAt: new Date('2026-09-20') },
        { externalId: 'hn:1', canonicalUrl: 'https://news.ycombinator.com/item?id=1',
          title: 'Article', body: native, publishedAt: new Date('2026-09-20'),
          metadata: { externalUrl: 'https://example.test/article' } },
      ],
    });
    expect(extractor.calls).toHaveLength(1);
    expect(extractor.calls[0]?.url).toBe('https://example.test/article');
    expect(result.items[1]).toMatchObject({
      externalId: 'hn:1', canonicalUrl: 'https://news.ycombinator.com/item?id=1',
      body: `${native}\n\nArticle text:\nFull article text about agent workflows and integration quality.`,
    });
  });

  it('skips discussion pages when no external article URL exists', async () => {
    const extractor = new FakeArticleExtractor();
    const enrichment = new ArticleContentSourceItemEnrichmentAdapter(extractor);

    const result = await enrichment.enrich({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      scanJobId: 'scan-1',
      providerKey: 'hacker-news',
      correlationId: 'corr-1', capturedAt: new Date('2026-09-20'), clock: { now: () => new Date('2026-09-20') },
      items: [{
        externalId: 'hn:1',
        canonicalUrl: 'https://news.ycombinator.com/item?id=1',
        title: 'Ask HN text discussion',
        body: 'Discussion text is already available from HN.',
        publishedAt: new Date('2026-06-21T00:00:00.000Z'),
      }],
    });

    expect(extractor.calls).toHaveLength(0);
    expect(result).toMatchObject({ enriched: 0, skipped: 1, failed: 0 });
    expect(result.items[0]?.metadata).toMatchObject({
      articleContent: {
        status: 'skipped',
        reason: 'no external article URL',
      },
    });
  });

  it('skips Reddit linkedUrl values that still point to Reddit discussion pages', async () => {
    const extractor = new FakeArticleExtractor();
    const enrichment = new ArticleContentSourceItemEnrichmentAdapter(extractor);

    const result = await enrichment.enrich({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      scanJobId: 'scan-1',
      providerKey: 'reddit',
      correlationId: 'corr-1', capturedAt: new Date('2026-09-20'), clock: { now: () => new Date('2026-09-20') },
      items: [{
        externalId: 'reddit:t3_2',
        canonicalUrl: 'https://www.reddit.com/r/OpenAI/comments/2/self_post/',
        title: 'Reddit self post',
        body: 'Self post content is already available.',
        publishedAt: new Date('2026-06-21T00:00:00.000Z'),
        metadata: {
          linkedUrl: 'https://www.reddit.com/r/OpenAI/comments/2/self_post/',
        },
      }],
    });

    expect(extractor.calls).toHaveLength(0);
    expect(result).toMatchObject({ enriched: 0, skipped: 1, failed: 0 });
  });

  it('fetches a signed URL but persists only credential-free redirect provenance', async () => {
    const extractor = new FakeArticleExtractor();
    extractor.result = {
      ...extractor.result,
      finalUrl: 'https://redirect-user:fixture-password@redirect.example.test/final?page=2&access_token=fixture-final-secret',
      text: 'Observed password=x is safely redacted before persistence.',
      textLength: 56,
      originalTextLength: 56,
      truncated: false,
    };
    const enrichment = new ArticleContentSourceItemEnrichmentAdapter(extractor);
    const result = await enrichment.enrich({
      tenantId: tenantId('tenant-1'), workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1', scanJobId: 'scan-1', providerKey: 'hacker-news',
      correlationId: 'corr-1', capturedAt: new Date('2026-09-20'), clock: { now: () => new Date('2026-09-20') },
      items: [{
        externalId: 'hn:credentialed-link', title: 'Linked article', body: '', publishedAt: new Date('2026-09-20'),
        canonicalUrl: 'https://news.ycombinator.com/item?id=99',
        metadata: { externalUrl: 'https://signed.example.test/article?lang=en&token=fixture-request-secret' },
      }],
    });

    expect(extractor.calls[0]?.url).toBe('https://signed.example.test/article?lang=en&token=fixture-request-secret');
    const item = result.items[0]!;
    const capture = readContentCapture(item)!;
    const article = capture.article!;
    expect(article).toMatchObject({
      sourceUrl: 'https://signed.example.test/article?lang=en',
      finalUrl: 'https://redirect.example.test/final?page=2',
      originalLength: article.length,
      truncated: false,
      fullTextSha256: captureSha256('Observed password=[REDACTED] is safely redacted before persistence.'),
    });
    expect(capture.articleUrl).toBe('https://signed.example.test/article?lang=en');
    expect(JSON.stringify(item)).not.toContain('fixture-request-secret');
    expect(JSON.stringify(item)).not.toContain('fixture-final-secret');
    expect(JSON.stringify(item)).not.toContain('fixture-password');
    expect(JSON.stringify(item)).not.toContain('redirect-user');
    expect(readContentCapture(item)).toBeDefined();
  });
});

class FakeArticleExtractor implements ArticleContentExtractorPort {
  readonly calls: ExtractArticleContentCommand[] = [];
  result: Extract<ArticleContentExtractionResult, { readonly ok: true }> = {
    ok: true as const,
    sourceUrl: '',
    finalUrl: '',
    title: 'Extracted title',
    text: 'Full article text about agent workflows and integration quality.',
    textLength: 62,
    wordCount: 8,
    contentHash: 'content-hash-1',
    semanticFingerprint: 'feedfacecafebeef',
  };

  async extract(command: ExtractArticleContentCommand) {
    this.calls.push(command);

    return {
      ...this.result,
      sourceUrl: command.url,
      finalUrl: this.result.finalUrl || command.url,
    };
  }
}
