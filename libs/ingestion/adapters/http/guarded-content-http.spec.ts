import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { gzipSync } from 'node:zlib';
import * as dns from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import { assertContentUrl, assertPublicAddress, guardedContentGet } from './guarded-content-http';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:http', () => ({ ...jest.requireActual('node:http'), request: jest.fn() }));
jest.mock('node:https', () => ({ ...jest.requireActual('node:https'), request: jest.fn() }));

describe('guarded article/RSS HTTP', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['127.0.0.1', '10.1.1.1', '100.64.0.1', '169.254.169.254',
    '::1', 'fe80::1', 'febf::1', 'ff02::1', '::ffff:7f00:1', 'fc00::1'])('rejects private/reserved address %s', (address) => {
    expect(() => assertPublicAddress(address)).toThrow();
  });

  it('allows public addresses and rejects userinfo before dispatch', () => {
    expect(() => assertPublicAddress('8.8.8.8')).not.toThrow();
    expect(() => assertPublicAddress('2606:4700:4700::1111')).not.toThrow();
    expect(() => assertContentUrl('https://user:password@example.test/')).toThrow('userinfo');
  });

  it('checks every DNS answer in the socket lookup, including a private secondary answer', async () => {
    const fixture = installHttpFixture([{ status: 200, body: 'text' }]);
    jest.mocked(dns.lookup).mockResolvedValue([
      { address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 },
    ] as never);
    await expect(guardedContentGet(request)).rejects.toThrow('private');
    expect(fixture.connected).toHaveLength(0);
  });

  it('validates redirects before opening the target and never forwards credentials or identifiers', async () => {
    const fixture = installHttpFixture([{ status: 302, location: 'http://169.254.169.254/private' }]);
    await expect(guardedContentGet({ ...request, headers: {
      accept: 'text/html', authorization: 'fixture-only', cookie: 'fixture-only', 'x-correlation-id': 'fixture',
    } })).rejects.toThrow('private');
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.calls[0]?.headers).toEqual({ accept: 'text/html' });
    expect(fixture.responses[0]?.destroyed).toBe(true);
  });

  it('uses one deadline across redirects and cancels oversized streamed bodies', async () => {
    const fixture = installHttpFixture([
      { status: 302, location: '/next' }, { status: 200, body: 'too many bytes' },
    ]);
    await expect(guardedContentGet({ ...request, maxBytes: 4 })).rejects.toThrow('byte limit');
    expect(fixture.calls[0]?.signal).toBe(fixture.calls[1]?.signal);
    expect(fixture.responses.every((response) => response.destroyed)).toBe(true);
  });

  it('aborts a stalled body at the original deadline and rejects an oversized declared body', async () => {
    const fixture = installHttpFixture([{ status: 200, body: 'late', delayMs: 200 }]);
    await expect(guardedContentGet({ ...request, timeoutMs: 20 })).rejects.toThrow();
    expect(fixture.calls[0]?.signal?.aborted).toBe(true);
    expect(fixture.responses[0]?.destroyed).toBe(true);
    jest.restoreAllMocks();
    const declared = installHttpFixture([{ status: 200, contentLength: '500' }]);
    await expect(guardedContentGet({ ...request, maxBytes: 100 })).rejects.toThrow('byte limit');
    expect(declared.responses[0]?.destroyed).toBe(true);
  });

  it('decodes a compressed HTTP response through the guarded transport', async () => {
    installHttpFixture([{ status: 200, body: gzipSync(Buffer.from('<p>Decoded article</p>')), encoding: 'gzip' }]);
    await expect(guardedContentGet(request)).resolves.toMatchObject({ body: '<p>Decoded article</p>' });
  });

  it('rejects a connection that does not match the pinned DNS result', async () => {
    installHttpFixture([{ status: 200, body: 'text' }], '1.1.1.1');
    await expect(guardedContentGet(request)).rejects.toThrow('guarded DNS');
  });
});

const request = { url: 'https://article.example.test/start', timeoutMs: 1000, maxBytes: 100, headers: {} };

type FixtureResponse = { readonly status: number; readonly location?: string; readonly body?: string | Buffer; readonly encoding?: string; readonly contentLength?: string; readonly delayMs?: number };
const installHttpFixture = (steps: readonly FixtureResponse[], remoteAddress = '8.8.8.8') => {
  jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
  const calls: http.RequestOptions[] = [];
  const connected: string[] = [];
  const responses: PassThrough[] = [];
  const implementation = (_url: URL, options: http.RequestOptions, callback: (response: unknown) => void) => {
    const index = calls.push(options) - 1;
    const req = new EventEmitter() as EventEmitter & { end(): void; destroy(error: Error): void };
    let destroyed = false;
    req.destroy = (error) => { destroyed = true; req.emit('error', error); };
    req.end = () => {
      options.lookup!('article.example.test', { all: true }, (error) => {
        if (error) { req.destroy(error); return; }
        connected.push(remoteAddress);
        const socket = Object.assign(new EventEmitter(), { remoteAddress });
        req.emit('socket', socket);
        socket.emit('connect');
        if (destroyed) return;
        const step = steps[index]!;
        const response = Object.assign(new PassThrough(), {
          statusCode: step.status,
          headers: { ...(step.encoding === undefined ? {} : { 'content-encoding': step.encoding }), ...(step.location === undefined ? {} : { location: step.location }),
            ...(step.contentLength === undefined ? {} : { 'content-length': step.contentLength }) },
        });
        responses.push(response);
        callback(response);
        if (step.delayMs === undefined) response.end(step.body ?? '');
        else {
          const timer = setTimeout(() => response.end(step.body ?? ''), step.delayMs);
          options.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            if (!response.destroyed) response.destroy(new Error('fixture request aborted'));
          }, { once: true });
        }
      });
    };
    return req;
  };
  jest.spyOn(http, 'request').mockImplementation(implementation as typeof http.request);
  jest.spyOn(https, 'request').mockImplementation(implementation as typeof https.request);
  return { calls, connected, responses };
};
