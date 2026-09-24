import { performance } from 'node:perf_hooks';
import { guardedContentGet } from '../http/guarded-content-http';
import { parseReadableArticleInWorker } from './readability-worker';
import { redactSensitiveText, validateOutboundUrl } from '@social-monitor/shared-kernel';

import type {
  ArticleContentExtractionResult,
  ArticleContentExtractorPort,
  ExtractArticleContentCommand,
} from '../../ports';
import {
  articleContentHash,
  countWords,
  exactArticleTextHash,
  normalizeArticleText,
  semanticFingerprintForArticle,
  truncateArticleText,
} from './article-content-normalization';

export type HttpReadabilityArticleContentExtractorOptions = {
  readonly timeoutMs?: number;
  readonly maxRedirects?: number;
  readonly maxBytes?: number;
  readonly maxTextCharacters?: number;
  readonly minTextCharacters?: number;
  readonly userAgent?: string;
};

const defaultTimeoutMs = 10_000;
const defaultMaxRedirects = 3;
const defaultMaxBytes = 1_500_000;
const defaultMaxTextCharacters = 64_000;
const defaultMinTextCharacters = 300;
const defaultUserAgent = 'social-monitor-article-enrichment/0.1';

export class HttpReadabilityArticleContentExtractor implements ArticleContentExtractorPort {
  private readonly timeoutMs: number;
  private readonly maxRedirects: number;
  private readonly maxBytes: number;
  private readonly maxTextCharacters: number;
  private readonly minTextCharacters: number;
  private readonly userAgent: string;

  constructor(options: HttpReadabilityArticleContentExtractorOptions = {}) {
    this.timeoutMs = positiveInteger(options.timeoutMs, defaultTimeoutMs);
    this.maxRedirects = positiveInteger(options.maxRedirects, defaultMaxRedirects);
    this.maxBytes = positiveInteger(options.maxBytes, defaultMaxBytes);
    this.maxTextCharacters = positiveInteger(options.maxTextCharacters, defaultMaxTextCharacters);
    this.minTextCharacters = positiveInteger(options.minTextCharacters, defaultMinTextCharacters);
    this.userAgent = options.userAgent?.trim() || defaultUserAgent;
  }

  async extract(command: ExtractArticleContentCommand): Promise<ArticleContentExtractionResult> {
    const started = performance.now();
    const budgetMs = Math.min(this.timeoutMs, command.remainingBudgetMs ?? this.timeoutMs);
    if (!Number.isFinite(budgetMs) || budgetMs <= 0) throw new Error('Article extraction deadline exceeded');
    const sourceUrl = command.url.trim();
    const validated = validateArticleUrl(sourceUrl);
    if (!validated.ok) {
      return { ok: false, sourceUrl, reason: validated.reason, reasonCode: 'invalid_url', retryable: false };
    }

    const response = await guardedContentGet({
      url: validated.url.toString(), timeoutMs: Math.ceil(budgetMs),
      maxBytes: this.maxBytes, maxRedirects: this.maxRedirects, signal: command.signal,
      headers: { accept: 'text/html, application/xhtml+xml;q=0.9', 'user-agent': this.userAgent },
    });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, sourceUrl, reason: `Article content fetch returned HTTP ${response.status}`,
        reasonCode: `http_${response.status}`, retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        ...(response.status === 429 && response.headers.get('retry-after') !== null ? { retryAfter: response.headers.get('retry-after')! } : {}),
      };
    }
    const contentType = response.headers.get('content-type') ?? '';

    if (!isHtmlContentType(contentType)) {
      return { ok: false, sourceUrl, reason: 'article content is not HTML', reasonCode: 'non_html', retryable: false };
    }

    const finalUrl = response.finalUrl;
    const html = response.body;
    const article = await parseReadableArticleInWorker(
      html, finalUrl, budgetMs - (performance.now() - started), command.signal,
    );
    // The extractor's representation is persisted by ingestion. Redact before
    // calculating its length, digest or truncation so those fields describe the
    // exact safe representation rather than discarded raw credentials.
    const fullText = redactSensitiveText(normalizeArticleText(article.text, Number.MAX_SAFE_INTEGER));
    const parsed = {
      title: normalizeTitle(article.title),
      text: truncateArticleText(fullText, this.maxTextCharacters),
      originalTextLength: fullText.length,
      fullTextSha256: exactArticleTextHash(fullText),
    };
    command.signal?.throwIfAborted();
    if (performance.now() - started >= budgetMs) throw new Error('Article extraction deadline exceeded');
    if (parsed.text.length < this.minTextCharacters) {
      return { ok: false, sourceUrl, reason: 'article content was too short', reasonCode: 'empty_extraction', retryable: false };
    }

    return {
      ok: true,
      sourceUrl,
      finalUrl,
      title: parsed.title,
      text: parsed.text,
      textLength: parsed.text.length,
      originalTextLength: parsed.originalTextLength,
      truncated: parsed.text.length < parsed.originalTextLength,
      fullTextSha256: parsed.fullTextSha256,
      extractionVersion: 'readability.text.v2',
      wordCount: countWords(parsed.text),
      contentHash: articleContentHash(parsed.text),
      semanticFingerprint: semanticFingerprintForArticle(parsed.title, parsed.text),
    };
  }

}

const validateArticleUrl = (value: string) =>
  validateOutboundUrl(value, {
    label: 'Article URL',
    allowedProtocols: ['http:', 'https:'],
  });

const isHtmlContentType = (contentType: string): boolean => {
  const normalized = contentType.toLocaleLowerCase('en-US');

  return normalized.length === 0
    || normalized.includes('text/html')
    || normalized.includes('application/xhtml+xml');
};

const normalizeTitle = (value: string | undefined): string | undefined => {
  const title = value?.replace(/\s+/g, ' ').trim();

  return title === undefined || title.length === 0 ? undefined : title;
};

const positiveInteger = (value: number | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Article content extractor options must be positive integers');
  }

  return value;
};
