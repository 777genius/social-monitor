import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import * as dns from 'node:dns/promises';
import * as https from 'node:https';
import type { RequestOptions } from 'node:http';
import { isIP } from 'node:net';

import { GuardedWebhookHttpClient } from './guarded-webhook-http-client';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:https', () => ({ ...jest.requireActual('node:https'), request: jest.fn() }));

const input = {
  url: 'https://webhook.example.test/callback', timeoutMs: 1_000,
  headers: { 'content-type': 'application/json', 'x-webhook-signature': 'synthetic-signature' },
  body: '{"eventId":"synthetic-event"}',
};

describe('GuardedWebhookHttpClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends exact signed bytes after validated TLS connection and reads only response headers', async () => {
    const fixture = installFixture({ status: 202, headers: { 'x-request-id': 'accepted-id' } });
    await expect(new GuardedWebhookHttpClient().post(input)).resolves.toEqual({ status: 202, providerMessageId: 'accepted-id' });
    expect(fixture.sent).toEqual([input.body]);
    expect(fixture.options[0]).toMatchObject({ method: 'POST', agent: false, headers: input.headers, maxHeaderSize: 16_384 });
    expect(fixture.response.destroyed).toBe(true);
    expect(fixture.response.readableLength).toBe(0);
  });

  it.each([301, 302, 303, 307, 308])('does not forward signed payloads after HTTP %i', async (status) => {
    const fixture = installFixture({ status, headers: { location: 'https://169.254.169.254/private' } });
    await expect(new GuardedWebhookHttpClient().post(input)).rejects.toMatchObject({ reasonCode: 'redirect_forbidden', retryable: false });
    expect(fixture.urls).toEqual([input.url]);
    expect(fixture.sent).toEqual([input.body]);
    expect(fixture.response.destroyed).toBe(true);
  });

  it.each(['https://localhost./', 'https://[fe90::1]/', 'https://[ff02::1]/', 'https://[::127.0.0.1]/', 'http://example.test/'])(
    'rejects unsafe URL %s without opening a connection', async (url) => {
      const fixture = installFixture();
      await expect(new GuardedWebhookHttpClient().post({ ...input, url })).rejects.toMatchObject({ retryable: false });
      expect(fixture.urls).toEqual([]);
      expect(fixture.sent).toEqual([]);
    },
  );

  it.each([
    [{ address: '127.0.0.1', family: 4 }],
    [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }],
    [{ address: 'fe90::1', family: 6 }],
  ])('rejects unsafe socket DNS answers without sending a body', async (...addresses) => {
    const fixture = installFixture();
    jest.mocked(dns.lookup).mockResolvedValue(addresses as never);
    await expect(new GuardedWebhookHttpClient().post(input)).rejects.toMatchObject({ reasonCode: 'unsafe_target' });
    expect(fixture.sent).toEqual([]);
  });

  it('rejects a peer outside the guarded DNS answers before sending signed bytes', async () => {
    const fixture = installFixture({ remoteAddress: '1.1.1.1' });
    await expect(new GuardedWebhookHttpClient().post(input)).rejects.toMatchObject({ reasonCode: 'unsafe_connection' });
    expect(fixture.sent).toEqual([]);
  });

  it.each(['8.8.8.8', '2606:4700:4700::1111'])('guards public literal %s when Node skips DNS lookup', async (address) => {
    const fixture = installFixture({ remoteAddress: address });
    const host = address.includes(':') ? `[${address}]` : address;
    await expect(new GuardedWebhookHttpClient().post({ ...input, url: `https://${host}/callback` })).resolves.toMatchObject({ status: 202 });
    expect(dns.lookup).not.toHaveBeenCalled();
    expect(fixture.sent).toEqual([input.body]);
  });

  it('discards a huge or stalled response body immediately at headers', async () => {
    const fixture = installFixture({ headers: { 'content-length': '9999999999', 'content-encoding': 'gzip' } });
    await expect(new GuardedWebhookHttpClient().post(input)).resolves.toMatchObject({ status: 202 });
    expect(fixture.response.destroyed).toBe(true);
    expect(fixture.response.readableLength).toBe(0);
  });

  it('uses the request deadline even while DNS resolution is stalled', async () => {
    const fixture = installFixture();
    jest.mocked(dns.lookup).mockImplementation(() => new Promise(() => {}));
    await expect(new GuardedWebhookHttpClient().post({ ...input, timeoutMs: 20 })).rejects.toThrow();
    expect(fixture.options[0]?.signal?.aborted).toBe(true);
    expect(fixture.sent).toEqual([]);
  });

  it('cancels pending delivery when execution ownership is lost', async () => {
    const fixture = installFixture();
    jest.mocked(dns.lookup).mockImplementation(() => new Promise(() => {}));
    const abort = new AbortController();
    const pending = new GuardedWebhookHttpClient().post({ ...input, signal: abort.signal });
    abort.abort(new Error('Execution ownership lost'));
    await expect(pending).rejects.toThrow('Execution ownership lost');
    expect(fixture.sent).toEqual([]);
  });
});

type Fixture = { status?: number; headers?: Record<string, string>; remoteAddress?: string };
const installFixture = (fixture: Fixture = {}) => {
  jest.mocked(dns.lookup).mockReset().mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
  const sent: string[] = [];
  const urls: string[] = [];
  const options: RequestOptions[] = [];
  const response = Object.assign(new PassThrough(), { statusCode: fixture.status ?? 202, headers: fixture.headers ?? {} });
  jest.mocked(https.request).mockImplementation(((url: URL, opts: RequestOptions, callback: (value: unknown) => void) => {
    urls.push(url.toString()); options.push(opts);
    const request = new EventEmitter() as EventEmitter & { end(body: string): void; destroy(error?: Error): void };
    let destroyed = false;
    const abort = () => request.destroy(opts.signal?.reason as Error);
    request.destroy = (error) => {
      if (destroyed) return;
      destroyed = true;
      opts.signal?.removeEventListener('abort', abort);
      request.emit('error', error ?? new Error('Connection closed'));
    };
    request.end = (body) => {
      sent.push(body);
      opts.signal?.removeEventListener('abort', abort);
      callback(response);
    };
    opts.signal?.addEventListener('abort', abort, { once: true });
    queueMicrotask(() => {
      const connect = (error: Error | null) => {
        if (error) { request.destroy(error); return; }
        if (destroyed) return;
        const socket = Object.assign(new EventEmitter(), { remoteAddress: fixture.remoteAddress ?? '8.8.8.8' });
        request.emit('socket', socket);
        socket.emit('connect');
        socket.emit('secureConnect');
      };
      if (isIP(url.hostname.replace(/^\[|\]$/g, ''))) connect(null);
      else opts.lookup!(url.hostname, { all: true }, connect);
    });
    return request;
  }) as typeof https.request);
  return { sent, urls, options, response };
};
