import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Transform, Writable, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import { validateOutboundUrl } from '@social-monitor/shared-kernel';
import { OutboundHttpPolicyError as ContentHttpPolicyError } from '@social-monitor/platform-http';
import { createGuardedDnsLookup } from '@social-monitor/platform-http/adapters/guarded-dns';

export { OutboundHttpPolicyError as ContentHttpPolicyError } from '@social-monitor/platform-http';
export { assertPublicAddress } from '@social-monitor/platform-http/adapters/guarded-dns';

export type ContentHttpResponse = {
  readonly status: number;
  readonly headers: Headers;
  readonly finalUrl: string;
  readonly body: string;
};
export type ContentHttpRequest = {
  readonly url: string;
  readonly timeoutMs: number;
  readonly maxBytes: number;
  readonly maxRedirects?: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  /** Omit to read every body; unlisted statuses return headers with an empty body. */
  readonly readBodyForStatuses?: readonly number[];
};

export const assertContentUrl = (value: string): URL => {
  const validation = validateOutboundUrl(value, { label: 'Content URL', allowedProtocols: ['http:', 'https:'] });
  if (!validation.ok) throw new ContentHttpPolicyError('unsafe_target', validation.reason);
  const url = validation.url;
  if (url.username || url.password) throw new ContentHttpPolicyError('invalid_url', 'Content URL userinfo is not allowed');
  url.hash = '';
  return url;
};

// DNS resolution is supplied to the actual socket lookup, never performed as
// a detached precheck followed by a second, potentially rebound resolution.
export const guardedContentGet = async (input: ContentHttpRequest): Promise<ContentHttpResponse> => {
  const deadline = AbortSignal.timeout(input.timeoutMs);
  const signal = input.signal === undefined ? deadline : AbortSignal.any([deadline, input.signal]);
  let url = assertContentUrl(input.url);
  for (let hop = 0; hop <= (input.maxRedirects ?? 3); hop += 1) {
    signal.throwIfAborted();
    const response = await requestOnce(url, input, signal);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (location === null) throw new ContentHttpPolicyError('invalid_redirect', 'Content redirect has no location');
    url = assertContentUrl(new URL(location, url).toString());
  }
  throw new ContentHttpPolicyError('redirect_limit', 'Content redirect limit exceeded');
};

const requestOnce = (url: URL, input: ContentHttpRequest, signal: AbortSignal): Promise<ContentHttpResponse> =>
  new Promise((resolve, reject) => {
    const target = createGuardedDnsLookup(url, signal);
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'GET', signal, agent: false,
      headers: safeRequestHeaders(input.headers),
      lookup: target.lookup,
    }, (response) => {
      const status = response.statusCode ?? 0;
      const headers = responseHeaders(response.headers);
      const result = (body: string): ContentHttpResponse => ({ status, headers, finalUrl: url.toString(), body });
      if ([301, 302, 303, 307, 308, 304].includes(status)) {
        response.destroy();
        resolve(result(''));
        return;
      }
      if (input.readBodyForStatuses !== undefined && !input.readBodyForStatuses.includes(status)) {
        response.destroy();
        resolve(result(''));
        return;
      }
      const declared = Number(headers.get('content-length'));
      if (declared > input.maxBytes) {
        response.destroy();
        reject(new ContentHttpPolicyError('response_too_large', 'Content response exceeded byte limit'));
        return;
      }
      void readContentBody(response, headers.get('content-encoding'), input.maxBytes, signal)
        .then((body) => resolve(result(body)), reject);
    });
    request.once('socket', (socket) => socket.once('connect', () => {
      try { target.assertPeer(socket.remoteAddress); }
      catch (error) { request.destroy(error as Error); }
    }));
    request.once('error', reject);
    request.end();
  });

const safeRequestHeaders = (headers: Readonly<Record<string, string>>): Record<string, string> => {
  const allowed = new Set(['accept', 'user-agent', 'if-none-match', 'if-modified-since']);
  return Object.fromEntries(Object.entries(headers).filter(([key]) => allowed.has(key.toLowerCase())));
};
const responseHeaders = (input: IncomingHttpHeaders): Headers => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  return headers;
};


// Bound both sides of decompression. pipeline propagates cancellation through
// the response, decoder and sink, including after the socket has finished.
export const readContentBody = async (
  response: Readable, encoding: string | null, maxBytes: number, signal: AbortSignal,
): Promise<string> => {
  const normalized = encoding?.trim().toLowerCase() ?? 'identity';
  const decoder = normalized === 'gzip' ? createGunzip()
    : normalized === 'deflate' ? createInflate()
      : normalized === 'br' ? createBrotliDecompress() : undefined;
  if (decoder === undefined && normalized !== 'identity' && normalized !== '') {
    response.destroy();
    throw new ContentHttpPolicyError('unsupported_encoding', 'Unsupported content encoding');
  }
  let failureOrigin: 'response' | 'decoder' | undefined;
  response.once('error', () => { failureOrigin ??= 'response'; });
  decoder?.once('error', () => { failureOrigin ??= 'decoder'; });
  const chunks: Buffer[] = [];
  let encodedBytes = 0;
  let decodedBytes = 0;
  const tooLarge = () => new ContentHttpPolicyError('response_too_large', 'Content response exceeded byte limit');
  const encodedLimit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    encodedBytes += chunk.length;
    callback(encodedBytes > maxBytes ? tooLarge() : null, chunk);
  } });
  const sink = new Writable({ write(chunk: Buffer, _encoding, callback) {
    decodedBytes += chunk.length;
    if (decodedBytes > maxBytes) { callback(tooLarge()); return; }
    chunks.push(chunk);
    callback();
  } });
  try {
    await pipeline([response, encodedLimit, ...(decoder === undefined ? [] : [decoder]), sink], { signal });
    signal.throwIfAborted();
    return Buffer.concat(chunks).toString('utf8');
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof ContentHttpPolicyError || failureOrigin !== 'decoder') throw error;
    throw new ContentHttpPolicyError('invalid_encoding', 'Invalid compressed content response');
  }
};
