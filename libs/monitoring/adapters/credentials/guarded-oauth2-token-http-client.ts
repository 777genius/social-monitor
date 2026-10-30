import { request as httpsRequest } from 'node:https';

import { OutboundHttpPolicyError } from '@social-monitor/platform-http';
import { createGuardedDnsLookup } from '@social-monitor/platform-http/adapters/guarded-dns';
import { validateOutboundUrl } from '@social-monitor/shared-kernel';

export type OAuth2TokenHttpRequest = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly timeoutMs: number;
};

export type OAuth2TokenHttpResponse = {
  readonly status: number;
  readonly body: string;
};

export interface OAuth2TokenHttpClientPort {
  post(input: OAuth2TokenHttpRequest): Promise<OAuth2TokenHttpResponse>;
}

const MAX_RESPONSE_BYTES = 65_536;

/** Refresh secrets are only written to a validated public HTTPS/TLS peer. */
export class GuardedOAuth2TokenHttpClient implements OAuth2TokenHttpClientPort {
  async post(input: OAuth2TokenHttpRequest): Promise<OAuth2TokenHttpResponse> {
    const validated = validateOutboundUrl(input.url, {
      label: 'OAuth2 token URL', allowedProtocols: ['https:'],
    });
    if (!validated.ok) throw new OutboundHttpPolicyError('unsafe_target', validated.reason);

    const signal = AbortSignal.timeout(input.timeoutMs);
    signal.throwIfAborted();
    const target = createGuardedDnsLookup(validated.url, signal);

    return new Promise((resolve, reject) => {
      const request = httpsRequest(validated.url, {
        method: 'POST',
        // OAuth token servers may reject chunked form POSTs (HTTP 411).
        headers: { ...input.headers, 'content-length': Buffer.byteLength(input.body, 'utf8') },
        signal,
        agent: false,
        rejectUnauthorized: true,
        lookup: target.lookup,
        maxHeaderSize: 16_384,
      }, (response) => {
        const status = response.statusCode ?? 0;
        // A 307/308 can preserve the OAuth refresh token and client secret.
        // Never follow *any* redirect, even if the next host looks public.
        if (status >= 300 && status < 400) {
          response.destroy();
          reject(new OutboundHttpPolicyError('redirect_forbidden', 'OAuth2 token endpoint redirected'));
          return;
        }

        const parts: Buffer[] = [];
        let bytes = 0;
        response.on('data', (value: Buffer | string) => {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          bytes += chunk.length;
          if (bytes > MAX_RESPONSE_BYTES) {
            const error = new OutboundHttpPolicyError('response_too_large', 'OAuth2 token response exceeded size limit');
            response.destroy();
            request.destroy(error);
            reject(error);
            return;
          }
          parts.push(chunk);
        });
        response.once('error', reject);
        response.once('end', () => resolve({ status, body: Buffer.concat(parts).toString('utf8') }));
      });
      request.once('error', reject);
      request.once('socket', (socket) => {
        socket.once('secureConnect', () => {
          try {
            if (!('authorized' in socket) || socket.authorized !== true) {
              throw new OutboundHttpPolicyError('tls_unverified', 'OAuth2 token TLS peer authorization failed');
            }
            target.assertPeer(socket.remoteAddress);
            request.end(input.body);
          } catch (error) {
            request.destroy(error as Error);
          }
        });
      });
    });
  }
}
