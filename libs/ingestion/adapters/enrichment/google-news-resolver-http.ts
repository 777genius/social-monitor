import { request } from 'node:https';
import { createGuardedDnsLookup } from '@social-monitor/platform-http/adapters/guarded-dns';
import { ContentHttpPolicyError, readContentBody, type ContentHttpResponse } from '../http/guarded-content-http';

const endpoint = new URL('https://news.google.com/_/DotsSplashUi/data/batchexecute');

/** Read-only Google resolution RPC; its body and signatures never leave memory. */
export const postGoogleNewsResolution = (input: {
  readonly body: string;
  readonly timeoutMs: number;
  readonly maxBytes: number;
  readonly signal?: AbortSignal;
  readonly userAgent: string;
}): Promise<ContentHttpResponse> => new Promise((resolve, reject) => {
  if (Buffer.byteLength(input.body) > 32_000) {
    reject(new ContentHttpPolicyError('response_too_large', 'Google resolution request exceeded byte limit'));
    return;
  }
  const deadline = AbortSignal.timeout(input.timeoutMs);
  const signal = input.signal === undefined ? deadline : AbortSignal.any([deadline, input.signal]);
  const target = createGuardedDnsLookup(endpoint, signal);
  const req = request(endpoint, {
    method: 'POST', agent: false, signal, lookup: target.lookup,
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'content-length': Buffer.byteLength(input.body), 'user-agent': input.userAgent },
  }, (response) => {
    const status = response.statusCode ?? 0;
    if ([301, 302, 303, 307, 308].includes(status)) {
      response.destroy();
      reject(new ContentHttpPolicyError('invalid_redirect', 'Google resolution POST redirects are not allowed'));
      return;
    }
    if (Number(response.headers['content-length']) > input.maxBytes) {
      response.destroy();
      reject(new ContentHttpPolicyError('response_too_large', 'Content response exceeded byte limit'));
      return;
    }
    const retryAfter = response.headers['retry-after'];
    const headers = new Headers(typeof retryAfter === 'string' ? { 'retry-after': retryAfter } : undefined);
    void readContentBody(response, response.headers['content-encoding'] ?? null,
      input.maxBytes, signal).then((body) => resolve({
      status, headers, finalUrl: endpoint.toString(), body,
    }), reject);
  });
  req.once('socket', (socket) => socket.once('connect', () => {
    try { target.assertPeer(socket.remoteAddress); }
    catch (error) { req.destroy(error as Error); }
  }));
  req.once('error', reject);
  req.end(input.body);
});
