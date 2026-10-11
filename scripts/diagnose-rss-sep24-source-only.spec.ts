import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import * as dns from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, rename, symlink, unlink, writeFile } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const filesystem = require('node:fs/promises') as typeof FsPromises;
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpRssClient } from '@social-monitor/ingestion/adapters/source/rss/http-rss-client';
import { ContentHttpPolicyError } from '@social-monitor/ingestion/adapters/http/guarded-content-http';
import { RssSourceProvider } from '@social-monitor/ingestion/adapters/source/rss/rss-source.provider';
import type { RssClientPort } from '@social-monitor/ingestion/adapters/source/rss/rss-client.port';
import { diagnoseRssSep24SourceOnly, safeFailureCategory, type DiagnosticReceipt } from './diagnose-rss-sep24-source-only';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:http', () => ({ ...jest.requireActual('node:http'), request: jest.fn() }));
jest.mock('node:https', () => ({ ...jest.requireActual('node:https'), request: jest.fn() }));

const fakeSensitive = 'https://private.example.test/feed?q=fake-private-query fake-private-body';
const primary = 'https://example.test/rss';
const extras = Array.from({ length: 24 }, (_, index) => `https://feed-${index}.example.test/rss`);
const bindingId = '00000000-0000-4000-8000-000000000004';
const input = () => ({ scope: {
  tenantId: '00000000-0000-4000-8000-000000000001', workspaceId: '00000000-0000-4000-8000-000000000002',
  interestId: '00000000-0000-4000-8000-000000000003', sourceBindingId: bindingId,
  scanPolicyId: '00000000-0000-4000-8000-000000000005',
}, bindings: [{ bindingId, status: 'ENABLED', config: { feedUrl: primary, query: primary,
  extraFeedUrls: extras, mode: 'url', maxItems: 30, maxItemAgeHours: 24 } }] });
const expandedInput = () => {
  const value = input();
  const news = new URL('https://news.google.com/rss/search');
  news.searchParams.set('q', Array.from({ length: 26 }, (_, i) => `fake${i}`).join(' OR '));
  value.bindings[0]!.config.feedUrl = news.toString(); value.bindings[0]!.config.query = news.toString();
  return value;
};
const item = (index: number) => ({ guid: `fake-${index}`, title: 'Fake readable title',
  content: fakeSensitive, link: `https://example.test/posts/${index}`,
  publishedAt: new Date('2026-09-24T12:00:00.000Z') });

describe('bounded source-only diagnostic (synthetic; no HTTP)', () => {
  let parent: string;
  let request: string;
  let root: string;
  beforeEach(async () => {
    parent = await mkdtemp(join(tmpdir(), 'rss-safe-diagnostic-test-'));
    request = join(parent, 'request.json'); root = join(parent, 'new-attempt');
    await writeFile(request, `${JSON.stringify(input(), null, 2)}\n`, { mode: 0o600 });
  });
  afterEach(async () => { jest.restoreAllMocks(); await rm(parent, { recursive: true, force: true }); });

  // Retain real handles so GC cannot hide leaks; teardown uses the original close.
  function inputCloseFault(target: 'request' | 'attempt', fault: 'before-once' | 'after' | 'persistent',
    afterClose?: () => Promise<void>) {
    const originalOpen = filesystem.open;
    const handles: { handle: Awaited<ReturnType<typeof filesystem.open>>; close: () => Promise<void> }[] = [];
    const targets: { handle: Awaited<ReturnType<typeof filesystem.open>>; calls: number; fds: number[] }[] = [];
    const opens: string[] = [];
    jest.spyOn(filesystem, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      const close = handle.close.bind(handle);
      handles.push({ handle, close });
      const path = String(args[0]); opens.push(path);
      if (target === 'request' ? path === request : path.endsWith('/attempt')) {
        const captured = { handle, calls: 0, fds: [] as number[] };
        targets.push(captured);
        jest.spyOn(handle, 'close').mockImplementation(async () => {
          captured.fds.push(handle.fd);
          captured.calls++;
          if (fault === 'persistent') throw new Error('Synthetic pre-close failure');
          if (captured.calls === 1) {
            if (fault === 'after') { await close(); await afterClose?.(); }
            throw new Error('Synthetic close failure');
          }
          await close();
        });
      }
      return handle;
    });
    return { handles, targets, opens, cleanup: async () => {
      for (const { handle, close } of handles) if (handle.fd >= 0) await close();
    } };
  }

  async function liveInputFds(path: string): Promise<number> {
    const paths = await Promise.all((await readdir('/proc/self/fd')).map(async (fd) => {
      try { return await readlink(`/proc/self/fd/${fd}`); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error; }
    }));
    return paths.filter((value) => value === path).length;
  }

  describe('private input FileHandle close regressions', () => {
    it.each(['request', 'attempt'] as const)('retries one pre-close %s failure on the original live FD and retains rejection', async (target) => {
      const fault = inputCloseFault(target, 'before-once');
      const readFeed = jest.fn(async () => ({ items: [] }));
      try {
        const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed });
        expect(result).toEqual({ reasons: { [target === 'request' ? 'INPUT_REJECTED' : 'FENCE_REJECTED']: 1 },
          httpStatuses: {}, selectedCount: null, warningCount: null, unitCount: null, exported: false, imported: false });
        expect(readFeed).not.toHaveBeenCalled();
        expect(fault.targets).toHaveLength(1);
        const captured = fault.targets[0]!;
        expect(await liveInputFds(target === 'request' ? request : join(root, 'attempt'))).toBe(0);
        expect(captured.calls).toBe(2);
        expect(captured.fds[0]).toBeGreaterThanOrEqual(0);
        expect(captured.fds).toEqual([captured.fds[0], captured.fds[0]]);
        expect(fault.handles.every(({ handle }) => handle.fd === -1)).toBe(true);
        expect(fault.opens.filter((path) => target === 'request' ? path === request : path.endsWith('/attempt'))).toHaveLength(1);
        if (target === 'attempt') {
          expect(await readFile(join(root, 'attempt'), 'utf8')).toBe('ATTEMPT_FENCED\n');
          expect((await diagnoseRssSep24SourceOnly(request, root, { readFeed })).reasons).toEqual({ FENCE_REJECTED: 1 });
          expect(readFeed).not.toHaveBeenCalled();
        } else expect(await readdir(parent)).toEqual(['request.json']);
      } finally { await fault.cleanup(); }
    });

    it.each(['request', 'attempt'] as const)('does not retry %s after real close or overwrite replacement evidence', async (target) => {
      const path = target === 'request' ? request : join(root, 'attempt');
      const fault = inputCloseFault(target, 'after', async () => {
        await rename(path, `${path}.original`);
        await writeFile(path, 'synthetic replacement untouched', { mode: 0o600 });
      });
      const readFeed = jest.fn(async () => ({ items: [] }));
      try {
        const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed });
        expect(result.reasons).toEqual({ [target === 'request' ? 'INPUT_REJECTED' : 'FENCE_REJECTED']: 1 });
        expect(result).toMatchObject({ selectedCount: null, warningCount: null, unitCount: null, exported: false, imported: false });
        expect(readFeed).not.toHaveBeenCalled();
        expect(fault.targets).toHaveLength(1);
        expect(fault.targets[0]!.calls).toBe(1);
        expect(fault.handles.every(({ handle }) => handle.fd === -1)).toBe(true);
        expect(await liveInputFds(`${path}.original`)).toBe(0);
        expect(await liveInputFds(path)).toBe(0);
        expect(await readFile(path, 'utf8')).toBe('synthetic replacement untouched');
        expect(fault.opens.filter((value) => target === 'request' ? value === request : value.endsWith('/attempt'))).toHaveLength(1);
      } finally { await fault.cleanup(); }
    });

    it.each(['request', 'attempt'] as const)('bounds persistent %s close failure to two attempts with an honestly live FD', async (target) => {
      const fault = inputCloseFault(target, 'persistent');
      const readFeed = jest.fn(async () => ({ items: [] }));
      const path = target === 'request' ? request : join(root, 'attempt');
      try {
        const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed });
        expect(result.reasons).toEqual({ [target === 'request' ? 'INPUT_REJECTED' : 'FENCE_REJECTED']: 1 });
        expect(result).toMatchObject({ selectedCount: null, warningCount: null, unitCount: null, exported: false, imported: false });
        expect(readFeed).not.toHaveBeenCalled();
        expect(fault.targets).toHaveLength(1);
        const captured = fault.targets[0]!;
        expect(captured.calls).toBe(2);
        expect(captured.fds[0]).toBeGreaterThanOrEqual(0);
        expect(captured.fds).toEqual([captured.fds[0], captured.fds[0]]);
        expect(await liveInputFds(path)).toBe(1);
        expect(captured.handle.fd).toBe(captured.fds[0]);
        expect((await captured.handle.stat()).ino).toBe((await lstat(path)).ino);
        expect(fault.handles.filter(({ handle }) => handle.fd >= 0)).toHaveLength(1);
        expect(fault.opens.filter((value) => target === 'request' ? value === request : value.endsWith('/attempt'))).toHaveLength(1);
      } finally { await fault.cleanup(); }
      expect(await liveInputFds(path)).toBe(0);
    });

    it('does not accumulate recoverable request FDs over eight same-root input failures', async () => {
      const fault = inputCloseFault('request', 'before-once');
      const readFeed = jest.fn(async () => ({ items: [] }));
      const liveCounts: number[] = [];
      const results: DiagnosticReceipt[] = [];
      try {
        for (let i = 0; i < 8; i++) {
          results.push(await diagnoseRssSep24SourceOnly(request, root, { readFeed }));
          liveCounts.push(await liveInputFds(request));
        }
        expect(results.map((result) => result.reasons)).toEqual(Array.from({ length: 8 }, () => ({ INPUT_REJECTED: 1 })));
        expect(readFeed).not.toHaveBeenCalled();
        expect(liveCounts).toEqual(Array(8).fill(0)); // exact9a47: actual kernel counts 1..8.
        expect(fault.targets).toHaveLength(8);
        expect(fault.targets.map(({ calls }) => calls)).toEqual(Array(8).fill(2));
        expect(fault.handles.every(({ handle }) => handle.fd === -1)).toBe(true);
        expect(await readdir(parent)).toEqual(['request.json']);
      } finally { await fault.cleanup(); }
    });
  });

  it('bounds actual guarded HTTPS transactions to 36 even with three redirect hops per feed', async () => {
    await writeFile(request, `${JSON.stringify(expandedInput(), null, 2)}\n`);
    jest.mocked(dns.lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
    let transactions = 0;
    const transport = (_url: URL, options: https.RequestOptions, callback: (response: unknown) => void) => {
      transactions++;
      expect(options.agent).toBe(false);
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.rejectUnauthorized).not.toBe(false);
      const req = new EventEmitter() as EventEmitter & { end(): void; destroy(error: Error): void };
      let destroyed = false;
      req.destroy = (error) => { destroyed = true; req.emit('error', error); };
      req.end = () => {
        options.lookup!(_url.hostname, { all: true }, (error) => {
          if (error) { req.destroy(error); return; }
          const socket = Object.assign(new EventEmitter(), { remoteAddress: '8.8.8.8' });
          req.emit('socket', socket); socket.emit('connect');
          if (destroyed) return;
          const hop = Number(_url.searchParams.get('syntheticHop') ?? 0);
          const next = new URL(_url); next.searchParams.set('syntheticHop', String(hop + 1));
          const response = Object.assign(new PassThrough(), {
            statusCode: hop < 3 ? 302 : 502, headers: hop < 3 ? { location: next.toString() } : {},
          });
          callback(response); response.end('synthetic unavailable');
        });
      };
      return req;
    };
    jest.spyOn(https, 'request').mockImplementation(transport as typeof https.request);
    jest.spyOn(http, 'request').mockImplementation(() => { throw new Error('Unexpected HTTP'); });
    const result = await diagnoseRssSep24SourceOnly(request, root);
    expect(transactions).toBe(36);
    expect(dns.lookup).toHaveBeenCalledTimes(36);
    expect(result.reasons).toEqual({ TRANSPORT_FAILURE: 36, SCAN_FAILED: 1 });
    expect(result.httpStatuses).toEqual({});
    expect(JSON.parse(await readFile(join(root, 'receipt.json'), 'utf8'))).toEqual(result);
  });

  it('retains canonical root admission when the parent is replaced during fake HTTPS', async () => {
    await writeFile(request, `${JSON.stringify(expandedInput(), null, 2)}\n`);
    const requestBytes = await readFile(request);
    const movedParent = `${parent}-moved`;
    jest.mocked(dns.lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
    let transactions = 0;
    const transport = (_url: URL, options: https.RequestOptions, callback: (response: unknown) => void) => {
      transactions++;
      const req = new EventEmitter() as EventEmitter & { end(): void; destroy(error: Error): void };
      req.destroy = (error) => { req.emit('error', error); };
      req.end = () => {
        options.lookup!(_url.hostname, { all: true }, (error) => {
          if (error) { req.destroy(error); return; }
          const socket = Object.assign(new EventEmitter(), { remoteAddress: '8.8.8.8' });
          req.emit('socket', socket); socket.emit('connect');
          void (async () => {
            if (transactions === 1) {
              await rename(parent, movedParent);
              await mkdir(parent, { mode: 0o700 });
              await writeFile(request, requestBytes, { mode: 0o600 });
            }
            const response = Object.assign(new PassThrough(), { statusCode: 502, headers: {} });
            callback(response); response.end('synthetic unavailable');
          })().catch((failure: unknown) => req.destroy(failure as Error));
        });
      };
      return req;
    };
    jest.spyOn(https, 'request').mockImplementation(transport as typeof https.request);
    jest.spyOn(http, 'request').mockImplementation(() => { throw new Error('Unexpected HTTP'); });
    try {
      const first = await diagnoseRssSep24SourceOnly(request, root);
      expect(transactions).toBe(1);
      expect(first.reasons).toEqual({ HTTP_502: 1, FENCE_LOST: 1, SCAN_FAILED: 1 });
      const repeat = await diagnoseRssSep24SourceOnly(request, root);
      expect(transactions).toBe(1); // exact6f1: 37 actual HTTPS transactions in this loaded process.
      expect(repeat.reasons).toEqual({ FENCE_REJECTED: 1 });
      expect(await readdir(parent)).toEqual(['request.json']);
    } finally { await rm(movedParent, { recursive: true, force: true }); }
  });

  it.each(['directory', 'reservation', 'parent'] as const)('rejects receipt unlink after actual final %s close', async (target) => {
    await finalCloseFault(target, async () => { await unlink(join(root, 'receipt.json')); });
    const readFeed = jest.fn(async () => ({ items: [] }));
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed });
    expect(readFeed).toHaveBeenCalledTimes(25);
    expect(result.reasons).toEqual({ FENCE_LOST: 1, SCAN_FAILED: 1 });
    expect(result).toMatchObject({ selectedCount: null, warningCount: null, unitCount: null });
    await expect(lstat(join(root, 'receipt.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await diagnoseRssSep24SourceOnly(request, root, { readFeed })).reasons).toEqual({ FENCE_REJECTED: 1 });
    expect(readFeed).toHaveBeenCalledTimes(25);
  });

  // Wrap real filesystem handles; each fault occurs only after the real close settles.
  async function finalCloseFault(target: 'directory' | 'reservation' | 'parent', fault: () => Promise<void>) {
    const originalOpen = filesystem.open;
    jest.spyOn(filesystem, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      const path = String(args[0]);
      if ((target === 'directory' && path === root) || (target === 'parent' && path === parent) ||
        (target === 'reservation' && path.endsWith('.attempt'))) {
        const close = handle.close.bind(handle);
        jest.spyOn(handle, 'close').mockImplementation(async () => { await close(); await fault(); });
      }
      return handle;
    });
  }

  it.each(['directory', 'reservation', 'parent'] as const)('rejects receipt replacement after final %s close without overwriting it', async (target) => {
    const path = join(root, 'receipt.json');
    await finalCloseFault(target, async () => {
      await rename(path, join(root, 'original-receipt'));
      await writeFile(path, 'replacement untouched', { mode: 0o600 });
    });
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed: async () => ({ items: [] }) });
    expect(result.reasons).toEqual({ FENCE_LOST: 1, SCAN_FAILED: 1 });
    expect(result).toMatchObject({ selectedCount: null, warningCount: null, unitCount: null });
    expect(await readFile(path, 'utf8')).toBe('replacement untouched');
  });

  it.each(['directory', 'reservation', 'parent'] as const)('rejects directory substitution after final %s close', async (target) => {
    const moved = join(parent, 'original-directory');
    await finalCloseFault(target, async () => {
      await rename(root, moved);
      await mkdir(root, { mode: 0o700 });
      await writeFile(join(root, 'receipt.json'), 'replacement untouched', { mode: 0o600 });
    });
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed: async () => ({ items: [] }) });
    expect(result.reasons).toEqual({ FENCE_LOST: 1, SCAN_FAILED: 1 });
    expect(result).toMatchObject({ selectedCount: null, warningCount: null, unitCount: null });
    expect(await readFile(join(root, 'receipt.json'), 'utf8')).toBe('replacement untouched');
    expect(JSON.parse(await readFile(join(moved, 'receipt.json'), 'utf8'))).toEqual(result);
  });

  it.each(['directory', 'reservation', 'parent'] as const)('reports a fault after actual final %s close with null counts', async (target) => {
    await finalCloseFault(target, async () => { throw new Error(fakeSensitive); });
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed: async () => ({ items: [] }) });
    expect(result.reasons).toEqual({ SCAN_FAILED: 1 });
    expect(result).toMatchObject({ selectedCount: null, warningCount: null, unitCount: null });
    expect(JSON.parse(await readFile(join(root, 'receipt.json'), 'utf8'))).toEqual(result);
  });

  function pendingReceipt(result: DiagnosticReceipt): DiagnosticReceipt {
    const reasons = { ...result.reasons };
    delete reasons.SCAN_STOPPED;
    delete reasons.SCAN_FAILED;
    reasons.FINALIZATION_PENDING = 1;
    return { ...result, reasons, selectedCount: null, warningCount: null, unitCount: null };
  }

  // Independent fault injection wraps real handles and never substitutes disk state.
  // The same four cases must fail against exact5e96, not just a model of the code.
  it.each([
    ['directory.sync', 'before'], ['directory.sync', 'after'],
    ['receipt.close', 'before'], ['receipt.close', 'after'],
  ] as const)('finalization fault %s %s the real operation never publishes success', async (boundary, timing) => {
    const originalOpen = filesystem.open;
    const handles: Awaited<ReturnType<typeof filesystem.open>>[] = [];
    let injected = 0;
    let realOperationCompleted = false;
    jest.spyOn(filesystem, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      handles.push(handle);
      const path = String(args[0]);
      if (boundary === 'directory.sync' && path === root) {
        const sync = handle.sync.bind(handle);
        let calls = 0;
        jest.spyOn(handle, 'sync').mockImplementation(async () => {
          if (++calls !== 2) { await sync(); return; }
          injected++;
          if (timing === 'after') { await sync(); realOperationCompleted = true; }
          throw new Error(fakeSensitive);
        });
      }
      if (boundary === 'receipt.close' && path.endsWith('/receipt.json')) {
        const close = handle.close.bind(handle);
        jest.spyOn(handle, 'close').mockImplementation(async () => {
          if (injected) { await close(); return; }
          injected++;
          if (timing === 'after') { await close(); realOperationCompleted = true; }
          throw new Error(fakeSensitive);
        });
      }
      return handle;
    });
    const readFeed = jest.fn(async () => ({ items: [] }));
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed });
    expect(injected).toBe(1);
    expect(realOperationCompleted).toBe(timing === 'after');
    expect(readFeed).toHaveBeenCalledTimes(25);
    expect(result).toEqual({ reasons: { SCAN_FAILED: 1 }, httpStatuses: {},
      selectedCount: null, warningCount: null, unitCount: null, exported: false, imported: false });
    const bytes = await readFile(join(root, 'receipt.json'), 'utf8');
    const disk = JSON.parse(bytes) as DiagnosticReceipt;
    expect(disk).toEqual(boundary === 'receipt.close' && timing === 'after' ? pendingReceipt(result) : result);
    expect(disk.reasons.SCAN_STOPPED).toBeUndefined();
    expect(bytes).not.toMatch(/https|body|query|stack/u);
    expect(handles.every((handle) => handle.fd === -1)).toBe(true);
    expect((await diagnoseRssSep24SourceOnly(request, root, { readFeed })).reasons).toEqual({ FENCE_REJECTED: 1 });
    expect(readFeed).toHaveBeenCalledTimes(25);
    expect(await readFile(join(root, 'receipt.json'), 'utf8')).toBe(bytes);
  });

  it.each([
    ['write', 'before'], ['write', 'after'], ['sync', 'before'], ['sync', 'after'],
  ] as const)('corrects receipt %s failure %s real I/O through the exclusive FD', async (boundary, timing) => {
    const originalOpen = filesystem.open;
    let injected = false;
    jest.spyOn(filesystem, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      if (String(args[0]).endsWith('/receipt.json')) {
        const write = handle.writeFile.bind(handle);
        const sync = handle.sync.bind(handle);
        const fail = async (operation: () => Promise<void>) => {
          if (injected) { await operation(); return; }
          injected = true;
          if (timing === 'after') await operation();
          throw new Error(fakeSensitive);
        };
        if (boundary === 'write') jest.spyOn(handle, 'writeFile').mockImplementation(async (...bytes) => fail(() => write(...bytes)));
        else jest.spyOn(handle, 'sync').mockImplementation(async () => fail(sync));
      }
      return handle;
    });
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed: async () => ({ items: [] }) });
    expect(injected).toBe(true);
    expect(result.reasons).toEqual({ SCAN_FAILED: 1 });
    expect(result).toMatchObject({ selectedCount: null, warningCount: null, unitCount: null });
    expect(JSON.parse(await readFile(join(root, 'receipt.json'), 'utf8'))).toEqual(result);
  });

  it.each(['directory', 'reservation', 'parent'] as const)('corrects a %s close rejection before real close and closes every handle', async (target) => {
    const originalOpen = filesystem.open;
    const handles: Awaited<ReturnType<typeof filesystem.open>>[] = [];
    let injected = false;
    jest.spyOn(filesystem, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      handles.push(handle);
      const path = String(args[0]);
      if ((target === 'directory' && path === root) || (target === 'parent' && path === parent) ||
        (target === 'reservation' && path.endsWith('.attempt'))) {
        const close = handle.close.bind(handle);
        jest.spyOn(handle, 'close').mockImplementation(async () => {
          if (injected) { await close(); return; }
          injected = true;
          throw new Error(fakeSensitive);
        });
      }
      return handle;
    });
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed: async () => ({ items: [] }) });
    expect(injected).toBe(true);
    expect(result.reasons).toEqual({ SCAN_FAILED: 1 });
    expect(result).toMatchObject({ selectedCount: null, warningCount: null, unitCount: null });
    expect(JSON.parse(await readFile(join(root, 'receipt.json'), 'utf8'))).toEqual(result);
    expect(handles.every((handle) => handle.fd === -1)).toBe(true);
  });

  it.each(['truncate-before', 'truncate-after', 'write-before', 'write-after', 'sync-before', 'sync-after'] as const)(
    'keeps failure correction %s fail-closed without a pathname reopen', async (fault) => {
      const originalOpen = filesystem.open;
      const opens: string[] = [];
      let injected = false;
      jest.spyOn(filesystem, 'open').mockImplementation(async (...args) => {
        const handle = await originalOpen(...args);
        const path = String(args[0]); opens.push(path);
        if (path === root) {
          const sync = handle.sync.bind(handle);
          let calls = 0;
          jest.spyOn(handle, 'sync').mockImplementation(async () => {
            await sync();
            if (++calls === 2) throw new Error(fakeSensitive);
          });
        }
        if (path.endsWith('/receipt.json')) {
          const fail = async <T,>(operation: () => Promise<T>): Promise<T> => {
            injected = true;
            if (fault.endsWith('after')) await operation();
            throw new Error(fakeSensitive);
          };
          if (fault.startsWith('truncate')) {
            const truncate = handle.truncate.bind(handle);
            jest.spyOn(handle, 'truncate').mockImplementation(async (...args) => fail(() => truncate(...args)));
          } else if (fault.startsWith('write')) {
            const write = handle.write.bind(handle);
            jest.spyOn(handle, 'write').mockImplementation((async (...args: Parameters<typeof write>) =>
              fail(() => write(...args))) as typeof handle.write);
          } else {
            const sync = handle.sync.bind(handle);
            let calls = 0;
            jest.spyOn(handle, 'sync').mockImplementation(async () => {
              if (++calls === 2) return fail(sync);
              await sync();
            });
          }
        }
        return handle;
      });
      const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed: async () => ({ items: [] }) });
      expect(injected).toBe(true);
      expect(result.reasons).toEqual({ SCAN_FAILED: 1 });
      expect(result).toMatchObject({ selectedCount: null, warningCount: null, unitCount: null });
      const bytes = await readFile(join(root, 'receipt.json'), 'utf8');
      if (fault === 'truncate-after' || fault === 'write-before') expect(bytes).toBe('');
      else expect(JSON.parse(bytes)).toEqual(fault === 'truncate-before' ? pendingReceipt(result) : result);
      expect(bytes).not.toContain('SCAN_STOPPED');
      expect(opens.filter((path) => path.endsWith('/receipt.json'))).toHaveLength(1);
    });

  it.each(['short', 'zero'] as const)('handles %s progress from real correction writes honestly', async (progress) => {
    const originalOpen = filesystem.open;
    let writes = 0;
    jest.spyOn(filesystem, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      if (String(args[0]) === root) {
        const sync = handle.sync.bind(handle);
        let calls = 0;
        jest.spyOn(handle, 'sync').mockImplementation(async () => {
          await sync();
          if (++calls === 2) throw new Error(fakeSensitive);
        });
      }
      if (String(args[0]).endsWith('/receipt.json')) {
        const write = handle.write.bind(handle);
        jest.spyOn(handle, 'write').mockImplementation((async (bytes: Buffer, offset: number, length: number, position: number) => {
          writes++;
          return write(bytes, offset, progress === 'zero' ? 0 : Math.min(length, 13), position);
        }) as typeof handle.write);
      }
      return handle;
    });
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed: async () => ({ items: [] }) });
    expect(result.reasons).toEqual({ SCAN_FAILED: 1 });
    expect(result).toMatchObject({ selectedCount: null, warningCount: null, unitCount: null });
    const bytes = await readFile(join(root, 'receipt.json'), 'utf8');
    if (progress === 'short') {
      expect(writes).toBeGreaterThan(1);
      expect(JSON.parse(bytes)).toEqual(result);
    } else {
      expect(writes).toBe(1);
      expect(bytes).toBe('');
    }
  });

  it.each(['before', 'after'] as const)('leaves a receipt replacement untouched %s real receipt close', async (timing) => {
    const originalOpen = filesystem.open;
    const path = join(root, 'receipt.json');
    const moved = join(root, 'original-receipt');
    let originalBytes: string | undefined;
    jest.spyOn(filesystem, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      if (String(args[0]).endsWith('/receipt.json')) {
        const close = handle.close.bind(handle);
        let injected = false;
        jest.spyOn(handle, 'close').mockImplementation(async () => {
          if (injected) { await close(); return; }
          injected = true;
          if (timing === 'after') await close();
          originalBytes = await readFile(path, 'utf8');
          await rename(path, moved);
          await writeFile(path, 'replacement untouched', { mode: 0o600 });
          throw new Error(fakeSensitive);
        });
      }
      return handle;
    });
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed: async () => ({ items: [] }) });
    expect(result.reasons).toEqual({ FENCE_LOST: 1, SCAN_FAILED: 1 });
    expect(result).toMatchObject({ selectedCount: null, warningCount: null, unitCount: null });
    expect(await readFile(path, 'utf8')).toBe('replacement untouched');
    expect(await readFile(moved, 'utf8')).toBe(originalBytes);
    expect(JSON.parse(originalBytes!).reasons).toEqual({ FINALIZATION_PENDING: 1 });
  });

  it.each(['creation', 'write', 'sync', 'completion', 'close'])('detects receipt unlink at %s with real FD sync', async (phase) => {
    const originalOpen = filesystem.open;
    const receiptPath = join(root, 'receipt.json');
    let removed = false;
    const removeReceipt = async () => { if (!removed) { removed = true; await unlink(receiptPath); } };
    jest.spyOn(filesystem, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      if (String(args[0]).endsWith('/receipt.json')) {
        if (phase === 'creation') await removeReceipt();
        if (phase === 'write') {
          const write = handle.writeFile.bind(handle);
          jest.spyOn(handle, 'writeFile').mockImplementation(async (...bytes) => { await write(...bytes); await removeReceipt(); });
        }
        if (phase === 'close') {
          const close = handle.close.bind(handle);
          jest.spyOn(handle, 'close').mockImplementation(async () => { await close(); await removeReceipt(); });
        }
        const sync = handle.sync.bind(handle);
        jest.spyOn(handle, 'sync').mockImplementation(async () => {
          await sync();
          if (phase === 'sync') await removeReceipt();
        });
      } else if (String(args[0]) === root && phase === 'completion') {
        const sync = handle.sync.bind(handle);
        jest.spyOn(handle, 'sync').mockImplementation(async () => {
          await sync();
          try { await lstat(receiptPath); } catch { return; }
          await removeReceipt();
        });
      }
      return handle;
    });
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed: async () => ({ items: [] }) });
    expect(removed).toBe(true);
    expect(result.reasons).toEqual({ FENCE_LOST: 1, SCAN_FAILED: 1 });
    expect(result.selectedCount).toBeNull(); expect(result.warningCount).toBeNull(); expect(result.unitCount).toBeNull();
    await expect(lstat(receiptPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['rename', 'replacement', 'hardlink', 'mode'])('rejects receipt %s during successful FD sync without touching replacements', async (fault) => {
    const originalOpen = filesystem.open;
    const receiptPath = join(root, 'receipt.json');
    const moved = join(root, 'moved-receipt');
    let changed = false;
    let originalBytes: Buffer | undefined;
    jest.spyOn(filesystem, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      if (String(args[0]).endsWith('/receipt.json')) {
        const sync = handle.sync.bind(handle);
        jest.spyOn(handle, 'sync').mockImplementation(async () => {
          await sync();
          if (changed) return;
          changed = true; originalBytes = await readFile(receiptPath);
          if (fault === 'hardlink') await link(receiptPath, moved);
          else if (fault === 'mode') await chmod(receiptPath, 0o644);
          else {
            await rename(receiptPath, moved);
            if (fault === 'replacement') await writeFile(receiptPath, 'replacement untouched', { mode: 0o600 });
          }
        });
      }
      return handle;
    });
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed: async () => ({ items: [] }) });
    expect(changed).toBe(true);
    expect(result.reasons).toEqual({ FENCE_LOST: 1, SCAN_FAILED: 1 });
    expect(result.selectedCount).toBeNull(); expect(result.warningCount).toBeNull(); expect(result.unitCount).toBeNull();
    if (fault === 'replacement') expect(await readFile(receiptPath, 'utf8')).toBe('replacement untouched');
    expect(await readFile(fault === 'mode' ? receiptPath : moved)).toEqual(originalBytes);
  });

  it.each(['rename', 'remove', 'replace'])('retains independent admission after attempt pathname %s', async (fault) => {
    await writeFile(request, `${JSON.stringify(expandedInput(), null, 2)}\n`);
    const moved = join(parent, 'moved');
    const originalScan = RssSourceProvider.prototype.scan;
    let calls = 0;
    const readFeed = jest.fn(async () => {
      if (++calls === 1) {
        if (fault === 'remove') await rm(root, { recursive: true });
        else await rename(root, moved);
        if (fault === 'replace') {
          await mkdir(root, { mode: 0o700 });
          await writeFile(join(root, 'receipt.json'), 'replacement untouched', { mode: 0o600 });
        }
      }
      return { items: [item(calls)] };
    });
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed });
    const callsBeforeRepeat = calls;
    const repeat = await diagnoseRssSep24SourceOnly(request, root, { readFeed });
    // Old code observes 36 + 36 reads for rename/removal; replacement is also a lost fence.
    expect(calls).toBe(1); expect(callsBeforeRepeat).toBe(1);
    expect(repeat.reasons).toEqual({ FENCE_REJECTED: 1 });
    expect(result.reasons).toEqual({ FENCE_LOST: 1, SCAN_FAILED: 1 });
    expect(result.selectedCount).toBeNull();
    expect(RssSourceProvider.prototype.scan).toBe(originalScan);
    if (fault !== 'remove') {
      expect(JSON.parse(await readFile(join(moved, 'receipt.json'), 'utf8'))).toEqual(result);
    }
    if (fault === 'replace') expect(await readFile(join(root, 'receipt.json'), 'utf8')).toBe('replacement untouched');
    const reservations = (await readdir(parent)).filter((name) => name.startsWith('.rss-sep24-diagnostic-'));
    expect(reservations).toHaveLength(1);
    const reservation = join(parent, reservations[0]!);
    const bytes = await readFile(reservation);
    expect((await lstat(reservation)).mode & 0o777).toBe(0o600);
    expect((await diagnoseRssSep24SourceOnly(request, root, { readFeed })).reasons).toEqual({ FENCE_REJECTED: 1 });
    expect(calls).toBe(1); expect(await readFile(reservation)).toEqual(bytes);
  });

  it.each(['directory', 'reservation'])('checks %s identity at scan completion even after the final read', async (target) => {
    let calls = 0;
    const readFeed = jest.fn(async () => {
      if (++calls === 25) {
        const name = (await readdir(parent)).find((entry) => entry.startsWith('.rss-sep24-diagnostic-'))!;
        await rename(target === 'directory' ? root : join(parent, name), join(parent, 'moved'));
        if (target === 'reservation') await writeFile(join(parent, name), 'replacement untouched', { mode: 0o600 });
      }
      return { items: [item(calls)] };
    });
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed });
    expect(calls).toBe(25);
    expect(result.reasons).toEqual({ FENCE_LOST: 1, SCAN_FAILED: 1 });
    expect(result.selectedCount).toBeNull();
    const receiptPath = join(target === 'directory' ? join(parent, 'moved') : root, 'receipt.json');
    const bytes = await readFile(receiptPath, 'utf8');
    expect(JSON.parse(bytes)).toEqual(result);
    expect((await diagnoseRssSep24SourceOnly(request, root, { readFeed })).reasons).toEqual({ FENCE_REJECTED: 1 });
    expect(calls).toBe(25); expect(await readFile(receiptPath, 'utf8')).toBe(bytes);
  });

  it.each(['creation', 'sync'])('checks the canonical pathname through receipt %s', async (phase) => {
    const originalOpen = filesystem.open;
    let moved = false;
    jest.spyOn(filesystem, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      if (String(args[0]).endsWith('/receipt.json')) {
        if (phase === 'creation') { moved = true; await rename(root, join(parent, 'moved')); }
        else {
          const sync = handle.sync.bind(handle);
          jest.spyOn(handle, 'sync').mockImplementation(async () => {
            await sync();
            if (!moved) { moved = true; await rename(root, join(parent, 'moved')); }
          });
        }
      }
      return handle;
    });
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed: async () => ({ items: [] }) });
    expect(result.reasons).toEqual({ FENCE_LOST: 1, SCAN_FAILED: 1 });
    expect(result.selectedCount).toBeNull();
    expect(JSON.parse(await readFile(join(parent, 'moved', 'receipt.json'), 'utf8'))).toEqual(result);
  });

  it('accepts a trusted private SGID synthetic parent without changing its permissions', async () => {
    await chmod(parent, 0o2700);
    const before = (await lstat(parent)).mode;
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed: async () => ({ items: [] }) });
    expect(result.reasons).toEqual({ SCAN_STOPPED: 1 });
    expect((await lstat(parent)).mode).toBe(before);
    expect((await lstat(root)).mode & 0o777).toBe(0o700);
  });

  // Red: r1 collapsed these actual adapter exceptions into FEED_READ_FAILED.
  it.each([
    ['<rss><channel></rss>', 'XML_MALFORMED'],
    ['<other>fake-private-body</other>', 'ENVELOPE_INVALID'],
    ['<rss><channel><title>&fake_unknown;</title></channel></rss>', 'ENTITY_UNRESOLVED'],
  ])('classifies actual HttpRssClient exception for synthetic %s', async (body, expected) => {
    const client = new HttpRssClient(10, async () => ({ status: 200, headers: new Headers(), finalUrl: primary, body }));
    let caught: unknown;
    try { await client.readFeed(primary, 30); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error);
    expect(safeFailureCategory(caught)).toBe(expected);
  });

  // Red: substring inference, unsafe status interpolation, or code spoofing escapes the finite whitelist.
  it('maps exact HTTP/guard/network contracts and leaves ambiguous errors UNKNOWN', async () => {
    const client = new HttpRssClient(10, async () => ({ status: 502, headers: new Headers(), finalUrl: primary, body: fakeSensitive }));
    await expect(client.readFeed(primary, 30)).rejects.toThrow('RSS provider returned HTTP 502');
    expect(safeFailureCategory(new Error('RSS provider returned HTTP 502'))).toBe('HTTP_502');
    expect(safeFailureCategory(new ContentHttpPolicyError('response_too_large', fakeSensitive))).toBe('FEED_OVERSIZED');
    expect(safeFailureCategory(new Error('RSS provider returned an oversized feed'))).toBe('FEED_OVERSIZED');
    expect(safeFailureCategory(new ContentHttpPolicyError('unsafe_connection', fakeSensitive))).toBe('DESTINATION_REFUSED');
    expect(safeFailureCategory(new ContentHttpPolicyError('invalid_encoding', fakeSensitive))).toBe('TRANSPORT_FAILURE');
    for (const [code, category] of [['ENOTFOUND', 'DNS_FAILURE'], ['EAI_AGAIN', 'DNS_FAILURE'],
      ['ETIMEDOUT', 'TIMEOUT'], ['ECONNREFUSED', 'DESTINATION_REFUSED'], ['ECONNRESET', 'TRANSPORT_FAILURE']]) {
      expect(safeFailureCategory(Object.assign(new Error(fakeSensitive), { code }))).toBe(category);
    }
    expect(safeFailureCategory(new DOMException(fakeSensitive, 'TimeoutError'))).toBe('TIMEOUT');
    expect(safeFailureCategory(Object.assign(new Error(fakeSensitive, { cause: new DOMException(fakeSensitive, 'TimeoutError') }), { code: 'ABORT_ERR' }))).toBe('TIMEOUT');
    for (const error of [new Error(`${fakeSensitive} malformed XML HTTP 502`), new Error('RSS provider returned HTTP 999'),
      new DOMException(fakeSensitive, 'AbortError'), { code: 'ENOTFOUND', message: fakeSensitive },
      new ContentHttpPolicyError(fakeSensitive, fakeSensitive), Object.assign(new Error(fakeSensitive), { code: fakeSensitive })]) {
      expect(safeFailureCategory(error)).toBe('UNKNOWN');
    }
  });

  // Red: a successful scan reaches exporter serialization/writes; counts drift from actual normalization.
  it('runs one exact 36-feed expansion, selects 30, counts failures without leaking and stops exporter', async () => {
    const authentic = input();
    const news = new URL('https://news.google.com/rss/search?q=fake');
    news.searchParams.set('q', Array.from({ length: 26 }, (_, i) => `fake${i}`).join(' OR '));
    authentic.bindings[0]!.config.feedUrl = news.toString(); authentic.bindings[0]!.config.query = news.toString();
    await writeFile(request, `${JSON.stringify(authentic, null, 2)}\n`);
    const before = await readFile(request);
    const scan = jest.spyOn(RssSourceProvider.prototype, 'scan');
    let calls = 0;
    const client: RssClientPort = { readFeed: async (_url, limit, options) => {
      expect(limit).toBe(30);
      expect(options?.targetPublishedWindow?.startInclusive.toISOString()).toBe('2026-09-24T00:00:00.000Z');
      expect(options?.targetPublishedWindow?.endExclusive.toISOString()).toBe('2026-09-25T00:00:00.000Z');
      expect(options?.etag).toBeUndefined(); expect(options?.lastModified).toBeUndefined();
      calls++;
      if (calls <= 15) throw new Error('RSS provider returned HTTP 502');
      if (calls === 16) throw new Error('RSS provider returned malformed XML');
      if (calls === 17) throw new Error('RSS provider returned an invalid RSS or Atom envelope');
      if (calls === 18) throw new ContentHttpPolicyError('response_too_large', fakeSensitive);
      if (calls === 19) throw new Error(fakeSensitive);
      return { items: [item(calls * 2), item(calls * 2 + 1)] };
    } };
    const receipt = await diagnoseRssSep24SourceOnly(request, root, client);
    expect(calls).toBe(36); expect(scan).toHaveBeenCalledTimes(1);
    expect(receipt).toEqual({ reasons: { HTTP_502: 15, XML_MALFORMED: 1, ENVELOPE_INVALID: 1,
      FEED_OVERSIZED: 1, UNKNOWN: 1, SCAN_STOPPED: 1 }, httpStatuses: { 502: 15 }, selectedCount: 30, warningCount: 20,
      unitCount: 0, exported: false, imported: false });
    expect(await readFile(request)).toEqual(before);
    expect(await readdir(root)).toEqual(['attempt', 'receipt.json']);
    const disk = await readFile(join(root, 'receipt.json'), 'utf8');
    expect(JSON.parse(disk)).toEqual(pendingReceipt(receipt));
    expect(disk).not.toMatch(/https|example|query|body|stack|RSS provider/u);
    expect((await lstat(root)).mode & 0o777).toBe(0o700);
    for (const name of ['receipt.json', 'attempt']) expect((await lstat(join(root, name))).mode & 0o777).toBe(0o600);
    const repeated = await diagnoseRssSep24SourceOnly(request, root, client);
    expect(repeated.reasons).toEqual({ FENCE_REJECTED: 1 }); expect(calls).toBe(36);
    expect(await readFile(join(root, 'receipt.json'), 'utf8')).toBe(disk);
  });

  // Red: happy/no-warning scan is allowed to export or exposes source bodies.
  it('stops even a fully valid no-warning scan before all exporter artifacts', async () => {
    const readFeed = jest.fn(async () => ({ items: [item(1)] }));
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed });
    expect(readFeed).toHaveBeenCalledTimes(25);
    expect(result).toMatchObject({ selectedCount: 25, warningCount: 0, unitCount: 0, reasons: { SCAN_STOPPED: 1 } });
    expect(await readdir(root)).toEqual(['attempt', 'receipt.json']);
    const disk = JSON.parse(await readFile(join(root, 'receipt.json'), 'utf8')) as DiagnosticReceipt;
    expect(disk).toEqual(pendingReceipt(result));
    expect(disk.reasons.SCAN_STOPPED).toBeUndefined();
  });

  // Red: partial failures imply a fabricated zero selected/warning count or allow automatic rerun.
  it('records unknown counts honestly when every read fails, retains fence and safe receipt', async () => {
    const readFeed = jest.fn(async () => { throw new Error(fakeSensitive); });
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed });
    expect(readFeed).toHaveBeenCalledTimes(25);
    expect(result).toEqual({ reasons: { UNKNOWN: 25, SCAN_FAILED: 1 }, httpStatuses: {}, selectedCount: null,
      warningCount: null, unitCount: null, exported: false, imported: false });
    expect(JSON.parse(await readFile(join(root, 'receipt.json'), 'utf8'))).toEqual(result);
    await diagnoseRssSep24SourceOnly(request, root, { readFeed });
    expect(readFeed).toHaveBeenCalledTimes(25);
  });

  // Red: an unexpected receipt write exception leaks raw text, reports success, or drops the fence.
  it('returns safe failure counts and retains the fence on receipt creation failure', async () => {
    const originalOpen = filesystem.open;
    jest.spyOn(filesystem, 'open').mockImplementation(async (...args) => {
      if (String(args[0]).endsWith('/receipt.json')) throw new Error(fakeSensitive);
      return originalOpen(...args);
    });
    const readFeed = jest.fn(async () => ({ items: [item(1)] }));
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed });
    expect(result.reasons).toEqual({ SCAN_FAILED: 1 });
    expect(result).toMatchObject({ selectedCount: null, warningCount: null, unitCount: null, exported: false, imported: false });
    expect(JSON.stringify(result)).not.toContain(fakeSensitive);
    expect(await readdir(root)).toEqual(['attempt']);
    await diagnoseRssSep24SourceOnly(request, root, { readFeed });
    expect(readFeed).toHaveBeenCalledTimes(25);
  });

  // Red: malicious request fields override fixed date/cursor/limit or weak metadata reaches a client.
  it.each(['maxItems', 'cursor', 'window', 'multiple', 'mode', 'extraFeeds', 'scope', 'privateMode', 'symlink'])('rejects %s before requests', async (fault) => {
      const value = input(); const config = value.bindings[0]!.config;
      if (fault === 'maxItems') config.maxItems = 31;
      if (fault === 'cursor') Object.assign(config, { cursor: 'fake-cursor' });
      if (fault === 'window') Object.assign(config, { targetPublishedWindow: { startInclusive: '2026-09-23', endExclusive: '2026-09-24' } });
      if (fault === 'multiple') value.bindings.push(value.bindings[0]!);
      if (fault === 'mode') config.mode = 'search';
      if (fault === 'extraFeeds') config.extraFeedUrls = extras.slice(1);
      if (fault === 'scope') value.scope.interestId = 'fake-invalid';
      await writeFile(request, `${JSON.stringify(value, null, 2)}\n`);
      if (fault === 'privateMode') await chmod(request, 0o644);
      if (fault === 'symlink') { const link = join(parent, 'link'); await symlink(request, link); request = link; }
      const readFeed = jest.fn(async () => ({ items: [] }));
      const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed });
      expect(readFeed).not.toHaveBeenCalled(); expect(result.exported).toBe(false);
    });

  // Red: a changed adapter plan/cursor/window silently escapes the diagnostic read bound.
  it.each(['cursor', 'limit', 'start', 'end'])('rejects injected plan drift %s before the client', async (fault) => {
    jest.spyOn(RssSourceProvider.prototype, 'planScan').mockImplementation((query, context) => {
      if (fault === 'start' || fault === 'end') Object.assign(context.config!, { targetPublishedWindow: {
        startInclusive: fault === 'start' ? '2026-09-23T00:00:00.000Z' : '2026-09-24T00:00:00.000Z',
        endExclusive: fault === 'end' ? '2026-09-26T00:00:00.000Z' : '2026-09-25T00:00:00.000Z',
      } });
      return { query, maxItems: fault === 'limit' ? 31 : 30, ...(fault === 'cursor' ? { cursor: 'fake-cursor' } : {}) };
    });
    const readFeed = jest.fn(async () => ({ items: [] }));
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed });
    expect(readFeed).not.toHaveBeenCalled();
    expect(result).toMatchObject({ reasons: { SCAN_FAILED: 1 }, exported: false, imported: false });
    expect(await readdir(root)).toEqual(['attempt', 'receipt.json']);
  });

  // Red: terminal r1 path is read or reused, or parallel invocation starts more requests.
  it('rejects existing terminal paths and concurrent attempts without reading old receipts', async () => {
    const terminal = join(parent, 'diagnosticr1'); await mkdir(terminal, { mode: 0o700 });
    await writeFile(join(terminal, 'receipt.json'), fakeSensitive, { mode: 0o000 });
    const readFeed = jest.fn(async () => ({ items: [] }));
    expect((await diagnoseRssSep24SourceOnly(request, terminal, { readFeed })).reasons).toEqual({ FENCE_REJECTED: 1 });
    expect(readFeed).not.toHaveBeenCalled();
    let release!: () => void;
    const pending = new Promise<void>((done) => { release = done; });
    let started!: () => void;
    const live = new Promise<void>((done) => { started = done; });
    const first = diagnoseRssSep24SourceOnly(request, root, { readFeed: async () => { started(); await pending; return { items: [] }; } });
    await live;
    expect((await diagnoseRssSep24SourceOnly(request, join(parent, 'other'), { readFeed })).reasons).toEqual({ FENCE_REJECTED: 1 });
    expect(readFeed).not.toHaveBeenCalled(); release(); await first;
  });

  // Red: the stop trap disrupts an unrelated caller or its normal provider result.
  it('keeps unrelated scans outside the diagnostic async scope untouched', async () => {
    let release!: () => void; let started!: () => void;
    const pending = new Promise<void>((done) => { release = done; });
    const live = new Promise<void>((done) => { started = done; });
    const diagnostic = diagnoseRssSep24SourceOnly(request, root, { readFeed: async () => {
      started(); await pending; return { items: [] };
    } });
    await live;
    const provider = new RssSourceProvider({ readFeed: async () => ({ items: [item(1)] }) });
    const other = await provider.scan({ query: { mode: 'url', query: primary }, maxItems: 1 }, {} as Parameters<RssSourceProvider['scan']>[1]);
    expect(other.items).toHaveLength(1); expect(other.warnings).toEqual([]);
    release(); expect((await diagnostic).reasons).toEqual({ SCAN_STOPPED: 1 });
  });

  // Red: a raw unexpected exception is serialized; scan trap remains installed after failure.
  it('does not inspect raw warnings and restores the scan boundary on unexpected failure', async () => {
    const warnings = new Proxy(['fake-private-warning'], { get(target, property) {
      if (property !== 'length') throw new Error(fakeSensitive);
      return target.length;
    } });
    const scan = jest.spyOn(RssSourceProvider.prototype, 'scan').mockResolvedValue({ items: [], warnings });
    const result = await diagnoseRssSep24SourceOnly(request, root, { readFeed: async () => { throw new Error('unused'); } });
    expect(result).toMatchObject({ selectedCount: 0, warningCount: 1, reasons: { SCAN_STOPPED: 1 } });
    expect(RssSourceProvider.prototype.scan).toBe(scan);
    scan.mockRejectedValue(new Error(fakeSensitive));
    const failed = await diagnoseRssSep24SourceOnly(request, join(parent, 'failed'), { readFeed: async () => ({ items: [] }) });
    expect(failed.reasons).toEqual({ SCAN_FAILED: 1 });
    expect(JSON.stringify(failed)).not.toContain(fakeSensitive);
    expect(RssSourceProvider.prototype.scan).toBe(scan);
  });
});
