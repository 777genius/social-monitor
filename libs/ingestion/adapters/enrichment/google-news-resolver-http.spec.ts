import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import * as dns from 'node:dns/promises';
import * as https from 'node:https';
import type { RequestOptions } from 'node:https';
import { gzipSync } from 'node:zlib';
import { postGoogleNewsResolution } from './google-news-resolver-http';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:https', () => ({ ...jest.requireActual('node:https'), request: jest.fn() }));
const command = { body: 'f.req=fixture', timeoutMs: 1000, maxBytes: 100, userAgent: 'fixture-agent' };

describe('fixed Google read-only RPC transport', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('pins the public peer, uses only the constant endpoint, and forwards only its own headers/body', async () => {
    const f = fixture({ status: 200, body: 'reply' });
    await expect(postGoogleNewsResolution(command)).resolves.toMatchObject({ status: 200, body: 'reply' });
    expect(f.url()).toBe('https://news.google.com/_/DotsSplashUi/data/batchexecute');
    expect(f.options()?.method).toBe('POST');
    expect(f.options()?.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'content-length': Buffer.byteLength(command.body), 'user-agent': 'fixture-agent' });
    expect(f.body()).toBe(command.body);
  });

  it('rejects every POST redirect without forwarding its signed body', async () => {
    const f = fixture({ status: 302, headers: { location: 'https://other.test/' } });
    await expect(postGoogleNewsResolution(command)).rejects.toThrow('redirect');
    expect(https.request).toHaveBeenCalledTimes(1);
    expect(f.response.destroyed).toBe(true);
  });

  it('rejects private secondary DNS answers and a peer that differs from the pinned answer', async () => {
    fixture({ status: 200 });
    jest.mocked(dns.lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }] as never);
    await expect(postGoogleNewsResolution(command)).rejects.toThrow('private');
    jest.restoreAllMocks();
    fixture({ status: 200 }, '1.1.1.1');
    await expect(postGoogleNewsResolution(command)).rejects.toThrow('guarded DNS');
  });

  it('bounds declared, encoded and decoded response bytes', async () => {
    fixture({ status: 200, headers: { 'content-length': '101' } });
    await expect(postGoogleNewsResolution(command)).rejects.toThrow('byte limit');
    jest.restoreAllMocks();
    fixture({ status: 200, body: gzipSync(Buffer.from('x'.repeat(101))), headers: { 'content-encoding': 'gzip' } });
    await expect(postGoogleNewsResolution(command)).rejects.toThrow('byte limit');
  });
});

const fixture = (step: { status: number; body?: string | Buffer; headers?: Record<string, string> }, peer = '8.8.8.8') => {
  jest.mocked(dns.lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
  const response = Object.assign(new PassThrough(), { statusCode: step.status, headers: step.headers ?? {} });
  let capturedUrl: string | undefined;
  let capturedOptions: RequestOptions | undefined;
  let capturedBody: string | undefined;
  jest.mocked(https.request).mockImplementation(((url: URL, options: RequestOptions, callback: (value: unknown) => void) => {
    capturedUrl = url.toString(); capturedOptions = options;
    const req = new EventEmitter() as EventEmitter & { end(body: string): void; destroy(error: Error): void };
    let destroyed = false;
    req.destroy = (error) => { destroyed = true; req.emit('error', error); };
    req.end = (body) => {
      capturedBody = body;
      options.lookup!('news.google.com', { all: true }, (error) => {
        if (error) { req.destroy(error); return; }
        const socket = Object.assign(new EventEmitter(), { remoteAddress: peer });
        req.emit('socket', socket); socket.emit('connect');
        if (destroyed) return;
        callback(response);
        if (!response.destroyed) response.end(step.body ?? '');
      });
    };
    return req;
  }) as typeof https.request);
  return { response, url: () => capturedUrl, options: () => capturedOptions, body: () => capturedBody };
};
