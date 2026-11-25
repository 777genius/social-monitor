import { JSDOM, VirtualConsole } from 'jsdom';
import { googleNewsArticleId } from '../../domain/value-objects/google-news-article';
import { assertContentUrl, guardedContentGet } from '../http/guarded-content-http';
import { postGoogleNewsResolution } from './google-news-resolver-http';

const requestId = '0';
const context = [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
  'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0];
export class GoogleNewsResolutionError extends Error {
  constructor(readonly reasonCode: 'google_resolver_unavailable' | 'google_resolver_invalid_response') {
    super('Google article publisher resolution was unavailable');
  }
}
const unavailable = (): GoogleNewsResolutionError => new GoogleNewsResolutionError('google_resolver_unavailable');
const invalidResponse = (): GoogleNewsResolutionError => new GoogleNewsResolutionError('google_resolver_invalid_response');
export class GoogleNewsResolutionHttpError extends Error {
  constructor(readonly status: number, readonly retryAfter: string | null) {
    super(`Google article resolver returned HTTP ${status}`);
  }
}

export const resolveGoogleNewsArticle = async (url: string, options: {
  readonly remainingMs: () => number;
  readonly maxBytes: number;
  readonly maxRedirects: number;
  readonly signal?: AbortSignal;
  readonly userAgent: string;
}): Promise<string> => {
  const id = googleNewsArticleId(url);
  if (id === undefined) throw unavailable();
  const page = new URL(`/rss/articles/${id}`, 'https://news.google.com');
  page.search = new URLSearchParams({ hl: 'en-US', gl: 'US', ceid: 'US:en' }).toString();
  const response = await guardedContentGet({
    url: page.toString(), timeoutMs: options.remainingMs(), maxBytes: options.maxBytes,
    maxRedirects: options.maxRedirects, signal: options.signal,
    headers: { accept: 'text/html, application/xhtml+xml;q=0.9', 'user-agent': options.userAgent },
  });
  if (response.status !== 200) throw new GoogleNewsResolutionHttpError(response.status, response.headers.get('retry-after'));
  if (new URL(response.finalUrl).origin !== 'https://news.google.com') throw unavailable();
  const dom = new JSDOM(response.body, { virtualConsole: new VirtualConsole() });
  let signature: string | null | undefined;
  let timestamp: string | null | undefined;
  try {
    const nodes = dom.window.document.querySelectorAll('[data-n-a-sg][data-n-a-ts]');
    if (nodes.length !== 1) throw unavailable();
    signature = nodes[0]!.getAttribute('data-n-a-sg');
    timestamp = nodes[0]!.getAttribute('data-n-a-ts');
  } finally { dom.window.close(); }
  if (!signature || signature.length > 10_000 || !/^\d{1,15}$/.test(timestamp ?? '')) throw unavailable();
  const payload = ['garturlreq', context, id, Number(timestamp), signature];
  const body = `f.req=${encodeURIComponent(JSON.stringify([[['Fbv4je', JSON.stringify(payload), null, requestId]]]))}`;
  const resolved = await postGoogleNewsResolution({
    body, timeoutMs: options.remainingMs(), maxBytes: options.maxBytes, signal: options.signal,
    userAgent: options.userAgent,
  });
  options.remainingMs();
  if (resolved.status !== 200) throw new GoogleNewsResolutionHttpError(resolved.status, resolved.headers.get('retry-after'));
  return parseGoogleNewsPublisher(resolved.body);
};

export const parseGoogleNewsPublisher = (body: string): string => {
  const rows: unknown[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('[')) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) rows.push(...parsed);
    } catch { throw invalidResponse(); }
  }
  const results = rows.filter((row): row is unknown[] => Array.isArray(row) && row[0] === 'wrb.fr');
  if (results.length !== 1) throw invalidResponse();
  const row = results[0]!;
  const responseId = row.slice(3).reverse().find((cell) => cell !== null && cell !== undefined);
  if (row[1] !== 'Fbv4je' || typeof row[2] !== 'string' || responseId !== requestId) throw invalidResponse();
  let payload: unknown;
  try { payload = JSON.parse(row[2]); } catch { throw invalidResponse(); }
  if (!Array.isArray(payload) || payload[0] !== 'garturlres' || typeof payload[1] !== 'string') throw invalidResponse();
  const publisher = assertContentUrl(payload[1]);
  if (publisher.hostname === 'news.google.com' || publisher.pathname === '/') throw invalidResponse();
  return publisher.toString();
};
