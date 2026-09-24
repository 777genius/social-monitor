import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Transform, Writable, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import { validateOutboundUrl } from '@social-monitor/shared-kernel';

export class ContentHttpPolicyError extends Error {
  readonly retryable = false;
  constructor(readonly reasonCode: string, message: string) { super(message); }
}

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
};

export const assertContentUrl = (value: string): URL => {
  const validation = validateOutboundUrl(value, { label: 'Content URL', allowedProtocols: ['http:', 'https:'] });
  if (!validation.ok) throw new ContentHttpPolicyError('unsafe_target', validation.reason);
  const url = validation.url;
  if (url.username || url.password) throw new ContentHttpPolicyError('invalid_url', 'Content URL userinfo is not allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) assertPublicAddress(host);
  url.hash = '';
  return url;
};

export const assertPublicAddress = (address: string): void => {
  const family = isIP(address);
  if (!family) throw new ContentHttpPolicyError('invalid_dns_result', 'Content target did not resolve to an IP address');
  const validation = validateOutboundUrl(`http://${family === 6 ? `[${address}]` : address}/`, {
    label: 'Content target', allowedProtocols: ['http:'],
  });
  if (!validation.ok) throw new ContentHttpPolicyError('unsafe_target', validation.reason);
  // Permit global unicast IPv6 only. This also rejects the entire link-local
  // /10, multicast /8, mapped/compatible IPv4 and translation ranges.
  if (family === 6) {
    const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
    const first = Number.parseInt(canonical.split(':')[0] || '0', 16);
    if ((first & 0xe000) !== 0x2000) throw new ContentHttpPolicyError('unsafe_target', 'Content target is not global unicast');
  }
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
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const pinned = new Set<string>(isIP(hostname) ? [normalizedAddress(hostname)] : []);
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'GET', signal, agent: false,
      headers: safeRequestHeaders(input.headers),
      lookup: (host, options, callback) => {
        void lookup(host, { all: true, verbatim: true }).then((addresses) => {
          signal.throwIfAborted();
          if (addresses.length === 0) throw new Error('Content target has no addresses');
          for (const record of addresses) {
            assertPublicAddress(record.address);
            pinned.add(normalizedAddress(record.address));
          }
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0]!.address, addresses[0]!.family);
        }).catch((error: Error) => callback(error, '', 4));
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      const headers = responseHeaders(response.headers);
      const result = (body: string): ContentHttpResponse => ({ status, headers, finalUrl: url.toString(), body });
      if ([301, 302, 303, 307, 308, 304].includes(status)) {
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
      const remote = socket.remoteAddress;
      if (remote === undefined || !pinned.has(normalizedAddress(remote))) {
        request.destroy(new ContentHttpPolicyError('unsafe_connection', 'Content connection did not match the guarded DNS result'));
      }
    }));
    request.once('error', reject);
    request.end();
  });

const normalizedAddress = (address: string): string =>
  isIP(address) === 6 ? new URL(`http://[${address}]/`).hostname : address;

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
