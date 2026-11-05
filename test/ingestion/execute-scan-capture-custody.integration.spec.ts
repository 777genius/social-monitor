import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ArticleContentSourceItemEnrichmentAdapter } from '../../libs/ingestion/adapters/enrichment/article-content-source-item-enrichment.adapter';
import { InMemoryScanLeaseAdapter } from '../../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemorySourceItemRepository } from '../../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { captureSha256, readContentCapture } from '../../libs/ingestion/domain/value-objects/source-content-capture';
import type { ArticleContentExtractorPort } from '../../libs/ingestion/ports/article-content-extractor.port';
import type { FetchSourceItemsResult, SourceFetcherPort } from '../../libs/ingestion/ports/source-fetcher.port';
import { ExecuteScanUseCase } from '../../libs/ingestion/features/execute-scan/execute-scan.use-case';
import { readReaderValueCapture } from '../../libs/relevance/infrastructure/reader-value/reader-value-capture';
import {
  FakeFeedProjection,
  FakeScanAttemptRepository,
  FakeScanCursorRepository,
  FakeScanExecutionReporter,
  FakeScanFailureQueue,
  makeExecuteScanCommand,
  SequenceIdGenerator,
} from '../../libs/ingestion/features/execute-scan/execute-scan.use-case.spec-support';

const now = new Date('2026-09-22T00:00:00.000Z');

describe('ExecuteScanUseCase capture custody', () => {
  it('sanitizes native URL metadata on no-extraction and repeat-scan persistence paths', async () => {
    const item = {
      externalId: 'hn:no-extraction', title: 'Ask HN', body: 'Native body',
      canonicalUrl: 'https://reader:discarded@news.ycombinator.com/item?id=1&signature=synthetic-canonical#details',
      publishedAt: now,
      metadata: {
        redirectUrl: 'https://redirect.test/final?signature=synthetic-redirect#fragment',
        nested: { finalUrl: 'https://final.test/article?access_token=synthetic-final#fragment' },
      },
    };
    const extractor = recordingExtractor('unused article');
    const { execute, repository } = useCaseFor([item], extractor);

    await expect(execute.execute(command('no-extraction-1'))).resolves.toMatchObject({ ok: true });
    await expect(execute.execute(command('no-extraction-2'))).resolves.toMatchObject({ ok: true });

    expect(extractor.urls).toEqual([]);
    const persisted = repository.all()[0]!.toSnapshot();
    expect(persisted.canonicalUrl).toBe('https://news.ycombinator.com/item?id=1');
    expect(persisted.metadata).toMatchObject({
      redirectUrl: 'https://redirect.test/final',
      nested: { finalUrl: 'https://final.test/article' },
    });
    expect(JSON.stringify(persisted)).not.toContain('synthetic-');
  });

  it('uses a signed URL only for the live extractor request and keeps a successful capture on repeat scan', async () => {
    const signedUrl = 'https://article.test/report?lang=en&signature=synthetic-signed-request#ignored';
    const { execute, repository, extractor } = useCaseFor([{
      externalId: 'hn:signed', title: 'Linked story', body: 'Native context',
      canonicalUrl: 'https://news.ycombinator.com/item?id=2', publishedAt: now,
      metadata: { externalUrl: signedUrl },
    }], recordingExtractor('Fetched article body'));

    await expect(execute.execute(command('signed-1'))).resolves.toMatchObject({ ok: true });
    await expect(execute.execute(command('signed-2'))).resolves.toMatchObject({ ok: true });

    expect(extractor.urls).toEqual(['https://article.test/report?lang=en&signature=synthetic-signed-request']);
    const persisted = repository.all()[0]!.toSnapshot();
    expect(persisted.metadata).toMatchObject({ externalUrl: 'https://article.test/report?lang=en' });
    expect(readContentCapture(persisted)?.article).toMatchObject({
      sourceUrl: 'https://article.test/report?lang=en',
      finalUrl: 'https://article.test/report?lang=en',
    });
    expect(JSON.stringify(persisted)).not.toContain('synthetic-signed-request');
  });

  it('does not deduplicate whitespace-different native and article bytes', async () => {
    const { execute, repository } = useCaseFor([{
      externalId: 'hn:whitespace', title: 'Whitespace provenance', body: 'Native bytes \n',
      canonicalUrl: 'https://news.ycombinator.com/item?id=3', publishedAt: now,
      metadata: { externalUrl: 'https://article.test/whitespace' },
    }], recordingExtractor('Native bytes'));

    await expect(execute.execute(command('whitespace'))).resolves.toMatchObject({ ok: true });

    const persisted = repository.all()[0]!.toSnapshot();
    const capture = readContentCapture(persisted)!;
    expect(persisted.body).toBe('Native bytes \n\nArticle text:\nNative bytes');
    expect(capture.article).toMatchObject({
      offset: 'Native bytes \n\nArticle text:\n'.length,
      length: 'Native bytes'.length,
      originalLength: 'Native bytes'.length,
      fullTextSha256: captureSha256('Native bytes'),
      truncated: false,
    });
    expect(capture.presentationComplete).toBe(true);
    expect(readReaderValueCapture(
      persisted.metadata ?? {}, 'hacker-news', persisted.title, persisted.body,
    ).capture.representationVersion).toBe('source_content_capture.v1');
  });
});

const command = (scanJobId: string) => makeExecuteScanCommand({
  scanJobId,
  providerKey: 'hacker-news',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
});

const useCaseFor = (items: FetchSourceItemsResult['items'], extractor: RecordingExtractor) => {
  const repository = new InMemorySourceItemRepository();
  const execute = new ExecuteScanUseCase(
    repeatingFetcher(items), repository, new FakeFeedProjection(),
    new FakeScanAttemptRepository(), new FakeScanCursorRepository(),
    new FakeScanExecutionReporter(), new FakeScanFailureQueue(), new InMemoryScanLeaseAdapter(),
    new SequenceIdGenerator(), new FixedClock(now), undefined,
    new ArticleContentSourceItemEnrichmentAdapter(extractor),
  );
  return { execute, repository, extractor };
};

type RecordingExtractor = ArticleContentExtractorPort & { readonly urls: string[] };
const recordingExtractor = (text: string): RecordingExtractor => {
  const urls: string[] = [];
  return {
    urls,
    async extract({ url }) {
      urls.push(url);
      return {
        ok: true, sourceUrl: url, finalUrl: url, text, textLength: text.length,
        originalTextLength: text.length, truncated: false, fullTextSha256: captureSha256(text),
        extractionVersion: 'readability.text.v2', contentHash: captureSha256(text),
        semanticFingerprint: 'fixture', wordCount: text.split(/\s+/u).filter(Boolean).length,
      };
    },
  };
};

const repeatingFetcher = (items: FetchSourceItemsResult['items']): SourceFetcherPort => ({
  async fetch() {
    return { items };
  },
});
