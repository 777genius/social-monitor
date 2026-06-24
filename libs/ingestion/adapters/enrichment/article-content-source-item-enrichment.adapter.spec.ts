import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { ArticleContentExtractorPort, ExtractArticleContentCommand } from '../../ports';
import { ArticleContentSourceItemEnrichmentAdapter } from './article-content-source-item-enrichment.adapter';

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
      correlationId: 'corr-1',
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
          textLength: 62,
          wordCount: 8,
        },
      },
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
      correlationId: 'corr-1',
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
    expect(result.items[0]?.metadata).toEqual({
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
      correlationId: 'corr-1',
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
});

class FakeArticleExtractor implements ArticleContentExtractorPort {
  readonly calls: ExtractArticleContentCommand[] = [];

  async extract(command: ExtractArticleContentCommand) {
    this.calls.push(command);

    return {
      ok: true as const,
      sourceUrl: command.url,
      finalUrl: command.url,
      title: 'Extracted title',
      text: 'Full article text about agent workflows and integration quality.',
      textLength: 62,
      wordCount: 8,
      contentHash: 'content-hash-1',
      semanticFingerprint: 'feedfacecafebeef',
    };
  }
}
