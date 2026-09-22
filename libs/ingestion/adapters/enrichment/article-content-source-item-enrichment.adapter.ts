import { ContentHttpPolicyError } from '../http/guarded-content-http';
import { createHash } from 'node:crypto';
import { articleFetchUrl, articleRequestUrl, captureNativeText, captureArticleText, requiresLiveArticleCredentials, sanitizeCaptureUrl } from '../../domain/value-objects/source-content-capture';

import type { JsonObject } from '@social-monitor/shared-kernel';
import { redactSensitiveRecord, redactSensitiveText } from '@social-monitor/shared-kernel';

import type {
  ArticleContentExtractorPort,
  ArticleContentExtractionResult,
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

    let attempts = 0;
    const requests = new Map<string, ArticleContentExtractionResult>();
    for (const originalItem of command.items) {
      // Signed URLs only enter through this in-memory map. The item itself is
      // already safe to persist, and every result below is rebuilt from that
      // safe representation before it leaves this adapter.
      const captureUrl = articleRequestUrl(command.providerKey, originalItem);
      const liveUrl = command.liveArticleFetchUrls?.get(originalItem.externalId);
      const matchingLiveUrl = liveUrl !== undefined && captureUrl !== undefined &&
        sanitizeCaptureUrl(liveUrl) === captureUrl ? liveUrl : undefined;
      const fetchUrl = matchingLiveUrl ?? (requiresLiveArticleCredentials(originalItem)
        ? undefined
        : articleFetchUrl(command.providerKey, originalItem));
      const item = captureNativeText(
        sanitizeArticleItem(originalItem, command.providerKey, captureUrl),
        command.providerKey,
        command.capturedAt,
      );
      if (fetchUrl === undefined || captureUrl === undefined) {
        enrichedItems.push(markArticleContent(item, { status: 'skipped', reason: 'no external article URL' }));
        skipped += 1;
        continue;
      }

      if (command.signal?.aborted || (command.deadlineAt !== undefined && command.clock.now() >= command.deadlineAt) || (attempts >= this.maxItemsPerScan && !requests.has(fetchUrl))) {
        enrichedItems.push(markArticleContent(item, { status: 'skipped', reason: 'scan item enrichment budget exceeded', reasonCode: 'scan_budget_exhausted' }));
        skipped += 1;
        continue;
      }

      try {
        let extraction = requests.get(fetchUrl);
        if (extraction === undefined) {
          attempts += 1;
          try {
            extraction = await this.extractor.extract({
              url: fetchUrl, correlationId: command.correlationId, signal: command.signal,
              ...(command.deadlineAt === undefined ? {} : {
                remainingBudgetMs: command.deadlineAt.getTime() - command.clock.now().getTime(),
              }),
            });
          } catch (error) {
            extraction = { ok: false, sourceUrl: fetchUrl, reason: safeErrorReason(error),
              reasonCode: error instanceof ContentHttpPolicyError ? error.reasonCode : 'network_or_timeout',
              retryable: !(error instanceof ContentHttpPolicyError) };
          }
          requests.set(fetchUrl, extraction);
        }

        if (!extraction.ok) {
          enrichedItems.push(markArticleContent(item, { status: 'skipped', reason: extraction.reason, reasonCode: extraction.reasonCode ?? 'unavailable', retryable: extraction.retryable ?? false, retryAfter: extraction.retryAfter }));
          skipped += 1;
          continue;
        }

        const safeText = redactSensitiveText(extraction.text);
        const redactionChanged = safeText !== extraction.text;
        // HttpReadabilityArticleContentExtractor already measures and hashes a
        // fully redacted representation before truncating it. Preserve that
        // provenance. If an older/custom extractor hands us changed raw text,
        // it cannot provide a trustworthy safe full-length/hash, so bind the
        // persisted capture to the exact safe prefix instead.
        const originalLength = redactionChanged ? safeText.length
          : extraction.originalTextLength ?? safeText.length;
        const fullTextSha256 = redactionChanged ? sha256(safeText)
          : extraction.fullTextSha256 ?? sha256(safeText);
        const captureTruncated = extraction.truncated === true || originalLength > safeText.length;
        const captured = captureArticleText(item, {
          text: safeText, sourceUrl: captureUrl, finalUrl: sanitizeCaptureUrl(extraction.finalUrl),
          // Do not retain raw-length or raw-text hashes after redaction. A
          // non-cooperating extractor may only give us a truncated raw prefix;
          // retain that fact without claiming its raw length is the safe text.
          originalLength,
          fullTextSha256,
          truncated: captureTruncated,
          extractionVersion: extraction.extractionVersion ?? 'legacy_extractor',
          acquiredAt: command.clock.now(),
        });
        enrichedItems.push({
          ...captured,
          metadata: articleContentMetadata(captured.metadata, {
            status: 'enriched',
            finalUrlHost: hostOf(sanitizeCaptureUrl(extraction.finalUrl)),
            finalUrlSha256: sha256(sanitizeCaptureUrl(extraction.finalUrl)),
            contentHash: extraction.contentHash,
            semanticFingerprint: extraction.semanticFingerprint,
            textLength: safeText.length,
            originalTextLength: originalLength,
            truncated: captureTruncated,
            fullTextSha256,
            extractionVersion: extraction.extractionVersion ?? 'legacy_extractor',
            wordCount: extraction.wordCount,
          }),
        });
        enriched += 1;
      } catch (error) {
        enrichedItems.push(markArticleContent(item, {
          status: 'failed',
          reason: safeErrorReason(error),
          reasonCode: error instanceof ContentHttpPolicyError ? error.reasonCode : 'network_or_timeout',
          retryable: !(error instanceof ContentHttpPolicyError),
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
  readonly reasonCode?: string;
  readonly retryable?: boolean;
  readonly retryAfter?: string;
  readonly finalUrlHost?: string;
  readonly finalUrlSha256?: string;
  readonly contentHash?: string;
  readonly semanticFingerprint?: string;
  readonly textLength?: number;
  readonly originalTextLength?: number;
  readonly truncated?: boolean;
  readonly fullTextSha256?: string;
  readonly extractionVersion?: string;
  readonly wordCount?: number;
};

const markArticleContent = (
  item: FetchedSourceItem,
  input: ArticleContentMetadataInput,
): FetchedSourceItem => ({
  ...item,
  metadata: articleContentMetadata(item.metadata, input),
});

const sanitizeArticleItem = (
  item: FetchedSourceItem,
  providerKey: string,
  captureUrl: string | undefined,
): FetchedSourceItem => {
  const metadata = item.metadata === undefined ? undefined
    : redactSensitiveRecord(item.metadata) as JsonObject;
  const sourceUrlKey = providerKey === 'hacker-news' ? 'externalUrl'
    : providerKey === 'reddit' ? 'linkedUrl' : undefined;
  const safeMetadata = sourceUrlKey === undefined || metadata === undefined ? metadata
    : captureUrl === undefined ? Object.fromEntries(Object.entries(metadata)
      .filter(([key]) => key !== sourceUrlKey)) as JsonObject
      : { ...metadata, [sourceUrlKey]: captureUrl };
  return {
    ...item,
    canonicalUrl: sanitizeCaptureUrl(item.canonicalUrl),
    metadata: safeMetadata,
  };
};

const articleContentMetadata = (
  metadata: JsonObject | undefined,
  input: ArticleContentMetadataInput,
): JsonObject => ({
  ...(metadata ?? {}),
  articleContent: {
    status: input.status,
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
    ...(input.retryable === undefined ? {} : { retryable: input.retryable }),
    ...(input.retryAfter === undefined ? {} : { retryAfter: input.retryAfter.slice(0, 128) }),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.finalUrlHost === undefined ? {} : { finalUrlHost: input.finalUrlHost }),
    ...(input.finalUrlSha256 === undefined ? {} : { finalUrlSha256: input.finalUrlSha256 }),
    ...(input.contentHash === undefined ? {} : { contentHash: input.contentHash }),
    ...(input.semanticFingerprint === undefined ? {} : { semanticFingerprint: input.semanticFingerprint }),
    ...(input.textLength === undefined ? {} : { textLength: input.textLength }),
    ...(input.originalTextLength === undefined ? {} : { originalTextLength: input.originalTextLength }),
    ...(input.truncated === undefined ? {} : { truncated: input.truncated }),
    ...(input.fullTextSha256 === undefined ? {} : { fullTextSha256: input.fullTextSha256 }),
    ...(input.extractionVersion === undefined ? {} : { extractionVersion: input.extractionVersion }),
    ...(input.wordCount === undefined ? {} : { wordCount: input.wordCount }),
  },
});

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
