import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import * as dns from 'node:dns/promises';
import * as https from 'node:https';
import type { RequestOptions } from 'node:http';

import { GuardedOAuth2TokenHttpClient } from './guarded-oauth2-token-http-client';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:https', () => ({ ...jest.requireActual('node:https'), request: jest.fn() }));

const input = {
  url: 'https://oauth.example.test/token',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=refresh_token&refresh_token=SYNTHETIC_PRIVATE_REFRESH',
  timeoutMs: 1_000,
};

describe('GuardedOAuth2TokenHttpClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends the refresh body only after a verified public TLS peer', async () => {
    const f = installFixture({ body: '{"access_token":"new-access","expires_in":3600}' });
    await expect(new GuardedOAuth2TokenHttpClient().post(input)).resolves.toEqual({
      status: 200, body: '{"access_token":"new-access","expires_in":3600}',
    });
    expect(f.options[0]).toMatchObject({
      method: 'POST', agent: false, rejectUnauthorized: true,
      maxHeaderSize: 16_384, headers: {
        ...input.headers, 'content-length': Buffer.byteLength(input.body, 'utf8'),
      },
    });
    expect(f.sent).toEqual([input.body]);
  });

  it.each([
    [{ address: '127.0.0.1', family: 4 }],
    [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }],
    [{ address: 'fe90::1', family: 6 }],
  ])('blocks private or mixed DNS answers without sending secrets', async (...addresses) => {
    const f = installFixture();
    jest.mocked(dns.lookup).mockResolvedValue(addresses as never);
    await expect(new GuardedOAuth2TokenHttpClient().post(input)).rejects.toMatchObject({
      reasonCode: 'unsafe_target',
    });
    expect(f.sent).toEqual([]);
  });

  it('rejects rebinding to a peer outside the DNS answers', async () => {
    const f = installFixture({ remoteAddress: '1.1.1.1' });
    await expect(new GuardedOAuth2TokenHttpClient().post(input)).rejects.toMatchObject({
      reasonCode: 'unsafe_connection',
    });
    expect(f.sent).toEqual([]);
  });

  it('rejects an unauthorized TLS connection without sending secrets', async () => {
    const f = installFixture({ authorized: false });
    await expect(new GuardedOAuth2TokenHttpClient().post(input)).rejects.toMatchObject({
      reasonCode: 'tls_unverified',
    });
    expect(f.sent).toEqual([]);
  });

  it('never forwards refresh secrets along a 307 redirect', async () => {
    const f = installFixture({ status: 307, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
    await expect(new GuardedOAuth2TokenHttpClient().post(input)).rejects.toMatchObject({
      reasonCode: 'redirect_forbidden', retryable: false,
    });
    expect(f.urls).toEqual([input.url]);
    expect(f.sent).toEqual([input.body]);
  });

  it('caps the token response before reading more than 64 KiB', async () => {
    const f = installFixture({ body: 'A'.repeat(65_537) });
    await expect(new GuardedOAuth2TokenHttpClient().post(input)).rejects.toMatchObject({
      reasonCode: 'response_too_large',
    });
    expect(f.sent).toEqual([input.body]);
  });

  it('rejects unsafe token URLs without opening an outbound connection', async () => {
    const f = installFixture();
    await expect(new GuardedOAuth2TokenHttpClient().post({
      ...input, url: 'http://127.0.0.1:8080/token',
    })).rejects.toMatchObject({ retryable: false });
    expect(f.urls).toEqual([]);
    expect(f.sent).toEqual([]);
  });
});

type Fixture = {
  status?: number;
  headers?: Record<string, string>;
  remoteAddress?: string;
  authorized?: boolean;
  body?: string;
};

const installFixture = (fixture: Fixture = {}) => {
  jest.mocked(dns.lookup).mockReset().mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
  const sent: string[] = [];
  const urls: string[] = [];
  const options: RequestOptions[] = [];
  jest.mocked(https.request).mockImplementation(((url: URL, opts: RequestOptions,
    onResponse: (response: PassThrough) => void) => {
    urls.push(url.toString());
    options.push(opts);
    const request = new EventEmitter() as EventEmitter & {
      end(body: string): void; destroy(error?: Error): void;
    };
    let destroyed = false;
    request.destroy = (error) => {
      if (destroyed) return;
      destroyed = true;
      request.emit('error', error ?? new Error('Connection closed'));
    };
    request.end = (body) => {
      sent.push(body);
      const response = Object.assign(new PassThrough(), {
        statusCode: fixture.status ?? 200, headers: fixture.headers ?? {},
      });
      onResponse(response);
      queueMicrotask(() => response.end(fixture.body ?? '{"access_token":"synthetic","expires_in":3600}'));
    };
    queueMicrotask(() => {
      opts.lookup!(url.hostname, { all: true }, (error) => {
        if (error) { request.destroy(error); return; }
        if (destroyed) return;
        const socket = Object.assign(new EventEmitter(), {
          remoteAddress: fixture.remoteAddress ?? '8.8.8.8',
          authorized: fixture.authorized ?? true,
        });
        request.emit('socket', socket);
        socket.emit('secureConnect');
      });
    });
    return request;
  }) as typeof https.request);
  return { sent, urls, options };
};
