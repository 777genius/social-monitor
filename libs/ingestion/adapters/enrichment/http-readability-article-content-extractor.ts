import { Readability } from '@mozilla/readability';
import { validateOutboundUrl } from '@social-monitor/shared-kernel';
import { JSDOM } from 'jsdom';

import type {
  ArticleContentExtractionResult,
  ArticleContentExtractorPort,
  ExtractArticleContentCommand,
} from '../../ports';
import {
  articleContentHash,
  countWords,
  normalizeArticleText,
  semanticFingerprintForArticle,
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
const defaultMaxTextCharacters = 30_000;
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
    const sourceUrl = command.url.trim();
    const validated = validateArticleUrl(sourceUrl);
    if (!validated.ok) {
      return { ok: false, sourceUrl, reason: validated.reason };
    }

    const response = await this.fetchWithSafeRedirects(validated.url, command.correlationId);
    const contentType = response.headers.get('content-type') ?? '';

    if (!isHtmlContentType(contentType)) {
      return { ok: false, sourceUrl, reason: 'article content is not HTML' };
    }

    const finalUrl = response.url.trim().length > 0 ? response.url : validated.url.toString();
    const html = await readTextWithLimit(response, this.maxBytes);
    const parsed = parseReadableArticle(html, finalUrl, this.maxTextCharacters);
    if (parsed.text.length < this.minTextCharacters) {
      return { ok: false, sourceUrl, reason: 'article content was too short' };
    }

    return {
      ok: true,
      sourceUrl,
      finalUrl,
      title: parsed.title,
      text: parsed.text,
      textLength: parsed.text.length,
      wordCount: countWords(parsed.text),
      contentHash: articleContentHash(parsed.text),
      semanticFingerprint: semanticFingerprintForArticle(parsed.title, parsed.text),
    };
  }

  private async fetchWithSafeRedirects(initialUrl: URL, correlationId: string): Promise<Response> {
    let currentUrl = initialUrl;

    for (let redirectCount = 0; redirectCount <= this.maxRedirects; redirectCount += 1) {
      const response = await fetch(currentUrl.toString(), {
        headers: {
          accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.1',
          'user-agent': this.userAgent,
          'x-correlation-id': correlationId,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!isRedirectStatus(response.status)) {
        if (!response.ok) {
          throw new Error(`Article content fetch returned HTTP ${response.status}`);
        }

        return response;
      }

      const location = response.headers.get('location');
      if (location === null) {
        throw new Error('Article redirect had no location');
      }

      const nextUrl = new URL(location, currentUrl);
      const validation = validateArticleUrl(nextUrl.toString());
      if (!validation.ok) {
        throw new Error(validation.reason);
      }

      currentUrl = validation.url;
    }

    throw new Error('Article content redirect limit exceeded');
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

const isRedirectStatus = (status: number): boolean => [301, 302, 303, 307, 308].includes(status);

const readTextWithLimit = async (response: Response, maxBytes: number): Promise<string> => {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && Number(contentLength) > maxBytes) {
    throw new Error('Article content exceeded byte limit');
  }

  if (response.body === null) {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value !== undefined) {
      received += value.byteLength;
      if (received > maxBytes) {
        throw new Error('Article content exceeded byte limit');
      }
      chunks.push(value);
    }
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
};

const parseReadableArticle = (
  html: string,
  url: string,
  maxTextCharacters: number,
): { readonly title?: string; readonly text: string } => {
  const dom = new JSDOM(html, { url });

  try {
    const headingTitle = normalizeTitle(dom.window.document.querySelector('article h1, main h1, h1')?.textContent);
    const article = new Readability(dom.window.document).parse();
    const text = normalizeArticleText(
      article?.textContent ?? dom.window.document.body?.textContent ?? '',
      maxTextCharacters,
    );
    const title = normalizeTitle(
      headingTitle
      ?? article?.title
      ?? dom.window.document.title,
    );

    return { title, text };
  } finally {
    dom.window.close();
  }
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
