import { createHash } from 'node:crypto';

import type { JsonObject, JsonValue } from '@social-monitor/shared-kernel';

import type {
  ArticleContentExtractorPort,
  EnrichSourceItemsCommand,
  EnrichSourceItemsResult,
  FetchedSourceItem,
  SourceItemEnrichmentPort,
} from '../../ports';

export type ArticleContentSourceItemEnrichmentOptions = {
  readonly providerKeys?: readonly string[];
  readonly maxItemsPerScan?: number;
};

const defaultProviderKeys = ['reddit', 'hacker-news', 'rss'];
const defaultMaxItemsPerScan = 20;
const discussionHosts = new Set([
  'news.ycombinator.com',
  'old.reddit.com',
  'reddit.com',
  'www.reddit.com',
]);

export class ArticleContentSourceItemEnrichmentAdapter implements SourceItemEnrichmentPort {
  private readonly providerKeys: ReadonlySet<string>;
  private readonly maxItemsPerScan: number;

  constructor(
    private readonly extractor: ArticleContentExtractorPort,
    options: ArticleContentSourceItemEnrichmentOptions = {},
  ) {
    this.providerKeys = new Set(options.providerKeys ?? defaultProviderKeys);
    this.maxItemsPerScan = positiveInteger(options.maxItemsPerScan, defaultMaxItemsPerScan);
  }

  async enrich(command: EnrichSourceItemsCommand): Promise<EnrichSourceItemsResult> {
    if (!this.providerKeys.has(command.providerKey)) {
      return {
        items: command.items,
        enriched: 0,
        skipped: command.items.length,
        failed: 0,
      };
    }

    const enrichedItems: FetchedSourceItem[] = [];
    let enriched = 0;
    let skipped = 0;
    let failed = 0;

    for (const [index, item] of command.items.entries()) {
      if (index >= this.maxItemsPerScan) {
        enrichedItems.push(markArticleContent(item, { status: 'skipped', reason: 'scan item enrichment budget exceeded' }));
        skipped += 1;
        continue;
      }

      const url = articleUrlForItem(command.providerKey, item);
      if (url === undefined) {
        enrichedItems.push(markArticleContent(item, { status: 'skipped', reason: 'no external article URL' }));
        skipped += 1;
        continue;
      }

      try {
        const extraction = await this.extractor.extract({
          url,
          correlationId: command.correlationId,
        });

        if (!extraction.ok) {
          enrichedItems.push(markArticleContent(item, { status: 'skipped', reason: extraction.reason }));
          skipped += 1;
          continue;
        }

        enrichedItems.push({
          ...item,
          title: item.title.trim().length > 0 ? item.title : extraction.title ?? item.title,
          body: mergeBody(item.body, extraction.text),
          metadata: articleContentMetadata(item.metadata, {
            status: 'enriched',
            finalUrlHost: hostOf(extraction.finalUrl),
            finalUrlSha256: sha256(extraction.finalUrl),
            contentHash: extraction.contentHash,
            semanticFingerprint: extraction.semanticFingerprint,
            textLength: extraction.textLength,
            wordCount: extraction.wordCount,
          }),
        });
        enriched += 1;
      } catch (error) {
        enrichedItems.push(markArticleContent(item, {
          status: 'failed',
          reason: safeErrorReason(error),
        }));
        failed += 1;
      }
    }

    return {
      items: enrichedItems,
      enriched,
      skipped,
      failed,
    };
  }
}

type ArticleContentMetadataInput = {
  readonly status: 'enriched' | 'skipped' | 'failed';
  readonly reason?: string;
  readonly finalUrlHost?: string;
  readonly finalUrlSha256?: string;
  readonly contentHash?: string;
  readonly semanticFingerprint?: string;
  readonly textLength?: number;
  readonly wordCount?: number;
};

const articleUrlForItem = (providerKey: string, item: FetchedSourceItem): string | undefined => {
  if (providerKey === 'reddit') {
    const linkedUrl = readString(item.metadata, 'linkedUrl');

    return linkedUrl === undefined || isDiscussionUrl(linkedUrl) ? undefined : linkedUrl;
  }

  if (isDiscussionUrl(item.canonicalUrl)) {
    return undefined;
  }

  return item.canonicalUrl;
};

const isDiscussionUrl = (value: string): boolean => {
  try {
    return discussionHosts.has(new URL(value).hostname.toLocaleLowerCase('en-US'));
  } catch {
    return true;
  }
};

const mergeBody = (existingBody: string, articleText: string): string => {
  const existing = existingBody.trim();
  if (existing.length === 0) {
    return articleText;
  }

  if (articleText.includes(existing) || existing.includes(articleText)) {
    return articleText.length >= existing.length ? articleText : existing;
  }

  return `${existing}\n\nArticle text:\n${articleText}`;
};

const markArticleContent = (
  item: FetchedSourceItem,
  input: ArticleContentMetadataInput,
): FetchedSourceItem => ({
  ...item,
  metadata: articleContentMetadata(item.metadata, input),
});

const articleContentMetadata = (
  metadata: JsonObject | undefined,
  input: ArticleContentMetadataInput,
): JsonObject => ({
  ...(metadata ?? {}),
  articleContent: {
    status: input.status,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.finalUrlHost === undefined ? {} : { finalUrlHost: input.finalUrlHost }),
    ...(input.finalUrlSha256 === undefined ? {} : { finalUrlSha256: input.finalUrlSha256 }),
    ...(input.contentHash === undefined ? {} : { contentHash: input.contentHash }),
    ...(input.semanticFingerprint === undefined ? {} : { semanticFingerprint: input.semanticFingerprint }),
    ...(input.textLength === undefined ? {} : { textLength: input.textLength }),
    ...(input.wordCount === undefined ? {} : { wordCount: input.wordCount }),
  },
});

const readString = (metadata: JsonObject | undefined, key: string): string | undefined => {
  const value: JsonValue | undefined = metadata?.[key];

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

const hostOf = (value: string): string | undefined => {
  try {
    return new URL(value).hostname.toLocaleLowerCase('en-US');
  } catch {
    return undefined;
  }
};

const safeErrorReason = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'article enrichment failed';

  return message.replace(/https?:\/\/\S+/g, '[url]').slice(0, 160);
};

const sha256 = (value: string): string => {
  return createHash('sha256').update(value).digest('hex');
};

const positiveInteger = (value: number | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Article content enrichment options must be positive integers');
  }

  return value;
};
