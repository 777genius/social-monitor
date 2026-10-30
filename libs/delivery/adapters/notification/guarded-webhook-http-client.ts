import { request as httpsRequest } from 'node:https';
import { OutboundHttpPolicyError } from '@social-monitor/platform-http';
import { createGuardedDnsLookup } from '@social-monitor/platform-http/adapters/guarded-dns';
import { validateOutboundUrl } from '@social-monitor/shared-kernel';

export type WebhookHttpRequest = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
};

export type WebhookHttpResponse = {
  readonly status: number;
  readonly providerMessageId?: string;
};

export interface WebhookHttpClientPort {
  post(request: WebhookHttpRequest): Promise<WebhookHttpResponse>;
}

/** Signed webhook payloads are sent to exactly the registered HTTPS target. */
export class GuardedWebhookHttpClient implements WebhookHttpClientPort {
  async post(input: WebhookHttpRequest): Promise<WebhookHttpResponse> {
    const validation = validateOutboundUrl(input.url, {
      label: 'Webhook endpoint URL', allowedProtocols: ['https:'],
    });
    if (!validation.ok) throw new OutboundHttpPolicyError('unsafe_target', validation.reason);
    const deadline = AbortSignal.timeout(input.timeoutMs);
    const signal = input.signal === undefined ? deadline : AbortSignal.any([deadline, input.signal]);
    signal.throwIfAborted();
    const target = createGuardedDnsLookup(validation.url, signal);

    return new Promise((resolve, reject) => {
      const request = httpsRequest(validation.url, {
        method: 'POST', headers: input.headers, signal, agent: false,
        lookup: target.lookup,
        maxHeaderSize: 16_384,
      }, (response) => {
        const status = response.statusCode ?? 0;
        const header = response.headers['x-request-id'] ?? response.headers['x-correlation-id'];
        const providerMessageId = typeof header === 'string' ? header : undefined;
        // No redirect is followed and no response body is needed. Destroy at
        // headers so an unbounded, compressed or stalled body is never buffered.
        response.destroy();
        if (status >= 300 && status < 400) {
          reject(new OutboundHttpPolicyError('redirect_forbidden', 'Webhook endpoint redirects are not allowed'));
          return;
        }
        resolve({ status, providerMessageId });
      });
      request.once('error', reject);
      request.once('socket', (socket) => {
        // Defer signed bytes until TLS has verified the server and the peer is
        // one of the actual socket lookup's validated public addresses.
        socket.once('secureConnect', () => {
          try {
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
