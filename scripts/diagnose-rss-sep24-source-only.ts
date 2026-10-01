/** Future operator invocation only. This file is never an acquisition/import writer. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { HttpRssClient } from '@social-monitor/ingestion/adapters/source/rss/http-rss-client';
import { RssSourceProvider } from '@social-monitor/ingestion/adapters/source/rss/rss-source.provider';
import { RssEntityEvidenceError } from '@social-monitor/ingestion/adapters/source/rss/rss-xml-entity-evidence';
import { ContentHttpPolicyError, guardedContentGet } from '@social-monitor/ingestion/adapters/http/guarded-content-http';
import type { RssClientPort } from '@social-monitor/ingestion/adapters/source/rss/rss-client.port';
import { exportRssSep24Selected, type SelectedExportRequest } from './export-rss-sep24-selected';

const START = '2026-09-24T00:00:00.000Z';
const END = '2026-09-25T00:00:00.000Z';
type Category = 'XML_MALFORMED' | 'ENVELOPE_INVALID' | 'ENTITY_UNRESOLVED' |
  'FEED_OVERSIZED' | 'DNS_FAILURE' | 'TIMEOUT' | 'DESTINATION_REFUSED' |
  'TRANSPORT_FAILURE' | 'UNKNOWN' | `HTTP_${number}`;
type Reason = Category | 'SCAN_STOPPED' | 'SCAN_FAILED' | 'INPUT_REJECTED' | 'FENCE_REJECTED' | 'FENCE_LOST' | 'FINALIZATION_PENDING';
/**
 * Returned SCAN_STOPPED attests completion of this invocation only. receipt.json
 * never attests success: would-be success is FINALIZATION_PENDING with null counts.
 * Failure is corrected through the verified exclusive FD when available; failed
 * correction may leave pending, partial or empty evidence, never durable success.
 */
export type DiagnosticReceipt = {
  reasons: Partial<Record<Reason, number>>;
  httpStatuses: Partial<Record<number, number>>;
  selectedCount: number | null;
  warningCount: number | null;
  unitCount: number | null;
  exported: false;
  imported: false;
};

/** Exact adapter contracts only; neither substring matching nor error serialization. */
export function safeFailureCategory(error: unknown): Category {
  try {
    if (error instanceof RssEntityEvidenceError) return 'ENTITY_UNRESOLVED';
    if (error instanceof ContentHttpPolicyError) {
      if (error.reasonCode === 'response_too_large') return 'FEED_OVERSIZED';
      if (['unsafe_target', 'unsafe_connection', 'invalid_url'].includes(error.reasonCode)) return 'DESTINATION_REFUSED';
      if (error.reasonCode === 'invalid_dns_result') return 'DNS_FAILURE';
      if (['invalid_encoding', 'unsupported_encoding', 'invalid_redirect', 'redirect_limit'].includes(error.reasonCode)) return 'TRANSPORT_FAILURE';
      return 'UNKNOWN';
    }
    if (error instanceof DOMException && error.name === 'TimeoutError') return 'TIMEOUT';
    if (!(error instanceof Error)) return 'UNKNOWN';
    const exact: Record<string, Category> = {
      'RSS provider returned malformed XML': 'XML_MALFORMED',
      'RSS provider returned an invalid RSS or Atom envelope': 'ENVELOPE_INVALID',
      'RSS provider returned an oversized feed': 'FEED_OVERSIZED',
      'Content target has no addresses': 'DNS_FAILURE',
    };
    if (Object.hasOwn(exact, error.message)) return exact[error.message]!;
    const http = /^RSS provider returned HTTP ([1-5][0-9]{2})$/u.exec(error.message);
    if (http) return `HTTP_${Number(http[1])}`;
    const code = (error as Error & { code?: unknown }).code;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS_FAILURE';
    if (code === 'ETIMEDOUT') return 'TIMEOUT';
    if (code === 'ABORT_ERR' && error.cause instanceof DOMException && error.cause.name === 'TimeoutError') return 'TIMEOUT';
    if (code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'DESTINATION_REFUSED';
    if (['ECONNRESET', 'EPIPE', 'ERR_STREAM_PREMATURE_CLOSE', 'Z_DATA_ERROR'].includes(typeof code === 'string' ? code : '')) return 'TRANSPORT_FAILURE';
    // AbortError alone does not establish a timeout.
    return 'UNKNOWN';
  } catch { return 'UNKNOWN'; }
}

async function safePath(path: string): Promise<void> {
  if (!isAbsolute(path) || resolve(path) !== path || parse(path).root === path) throw new Error('INPUT_REJECTED');
  let current = parse(path).root;
  const segments = relative(current, dirname(path)).split(sep).filter(Boolean);
  for (const segment of [...segments, '']) {
    const state = await lstat(current);
    if (!state.isDirectory() || state.isSymbolicLink() ||
      (state.uid !== process.getuid?.() && state.uid !== 0) ||
      ((state.mode & 0o022) !== 0 && !(state.uid === 0 && (state.mode & 0o1777) === 0o1777))) {
      throw new Error('INPUT_REJECTED');
    }
    current = join(current, segment);
  }
}

async function closeInputHandle(handle: Awaited<ReturnType<typeof open>>): Promise<void> {
  try { await handle.close(); } catch (error) {
    // As with outer handles, retry once only while the original FD is still live.
    // Never reopen a pathname or retry after real close. A persistent failure may
    // leave this FD live; bounded cleanup cannot guarantee closure in that case.
    if (handle.fd >= 0) {
      try { await handle.close(); } catch { /* Preserve the first close failure. */ }
    }
    // Successful cleanup does not admit a request/attempt whose close failed.
    throw error;
  }
}

async function readPrivateRequest(path: string): Promise<Omit<SelectedExportRequest, 'outputRoot'>> {
  await safePath(path);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const state = await handle.stat();
    if (!state.isFile() || state.uid !== process.getuid?.() || (state.mode & 0o777) !== 0o600 ||
      state.nlink !== 1 || state.size < 1 || state.size > 16_384 || await realpath(path) !== path) throw new Error('INPUT_REJECTED');
    const buffer = Buffer.alloc(state.size + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    const after = await handle.stat();
    if (size !== state.size || after.size !== state.size || after.mtimeMs !== state.mtimeMs) throw new Error('INPUT_REJECTED');
    const bytes = buffer.subarray(0, size);
    const request = JSON.parse(bytes.toString('utf8')) as Omit<SelectedExportRequest, 'outputRoot'>;
    if (!bytes.equals(Buffer.from(`${JSON.stringify(request, null, 2)}\n`)) ||
      !request || Object.keys(request).sort().join(',') !== 'bindings,scope' ||
      !Array.isArray(request.bindings) || request.bindings.length !== 1) throw new Error('INPUT_REJECTED');
    const binding = request.bindings[0] as { config?: { maxItems?: unknown } };
    if (binding?.config?.maxItems !== 30) throw new Error('INPUT_REJECTED');
    // The exact exporter validates all remaining scope/config keys and its 36-feed expansion.
    return request;
  } finally { await closeInputHandle(handle); }
}

const scanScope = new AsyncLocalStorage<DiagnosticReceipt>();
const stopped = Symbol('diagnostic scan stopped');
let active = false;
// Retained for this loaded module's process lifetime, independently of filesystem fences.
// No release/expiry on failure or parent replacement; not a module-reload/new-process
// or host-root intervention guarantee.
const admittedRoots = new Set<string>();

/**
 * Client errors are classified at the nearest boundary and replaced before provider warnings.
 * A scoped scan completion trap counts lengths only and throws before the exporter can
 * inspect warnings/items or serialize anything. Other async callers retain normal behavior.
 * The pre-existing output directory is a second, independent exporter mkdir fence.
 */
export async function diagnoseRssSep24SourceOnly(requestPath: string, outputRoot: string,
  client: RssClientPort = new HttpRssClient(10_000, (input) => guardedContentGet({ ...input, maxRedirects: 0 }))): Promise<DiagnosticReceipt> {
  const receipt: DiagnosticReceipt = { reasons: {}, httpStatuses: {}, selectedCount: null, warningCount: null,
    unitCount: null, exported: false, imported: false };
  const count = (reason: Reason): void => { receipt.reasons[reason] = (receipt.reasons[reason] ?? 0) + 1; };
  if (active) { count('FENCE_REJECTED'); return receipt; }
  active = true;
  let directory: Awaited<ReturnType<typeof open>> | undefined;
  let parent: Awaited<ReturnType<typeof open>> | undefined;
  let reservation: Awaited<ReturnType<typeof open>> | undefined;
  let lost = false;
  let checkFinalIdentity: (() => Promise<void>) | undefined;
  const fenceLost = Symbol('diagnostic fence lost');
  const markFailed = (): void => {
    receipt.reasons.SCAN_FAILED ??= 1;
    delete receipt.reasons.SCAN_STOPPED;
    receipt.selectedCount = receipt.warningCount = receipt.unitCount = null;
  };
  const closeOuterHandles = async (): Promise<void> => {
    // Await every close even if an earlier close fails; never reopen a handle.
    const handles = [directory, reservation, parent];
    directory = reservation = parent = undefined;
    for (const handle of handles) {
      try { await handle?.close(); } catch {
        markFailed();
        if (handle && handle.fd >= 0) {
          try { await handle.close(); } catch { markFailed(); }
        }
      }
    }
  };
  const markLost = (): void => {
    if (!lost) count('FENCE_LOST');
    lost = true;
    delete receipt.reasons.SCAN_STOPPED;
    receipt.selectedCount = receipt.warningCount = receipt.unitCount = null;
  };
  try {
    let request: Omit<SelectedExportRequest, 'outputRoot'>;
    try { request = await readPrivateRequest(requestPath); await safePath(outputRoot); }
    catch { count('INPUT_REJECTED'); return receipt; }
    if (admittedRoots.has(outputRoot)) { count('FENCE_REJECTED'); return receipt; }
    // Never read terminalattempt/r1 contents. Every existing path is rejected, regardless of name.
    try {
      // A diagnostic-only sibling survives rename/removal of the attempt directory.
      // Exclusive creation reserves the canonical name before any scan, even if setup fails.
      parent = await open(dirname(outputRoot), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      const parentState = await parent.stat();
      if (parentState.uid !== process.getuid?.() || (parentState.mode & 0o777) !== 0o700 ||
        await realpath(dirname(outputRoot)) !== dirname(outputRoot)) throw new Error('FENCE_REJECTED');
      const reservationName = `.rss-sep24-diagnostic-${createHash('sha256').update(outputRoot).digest('hex')}.attempt`;
      reservation = await open(`/proc/self/fd/${parent.fd}/${reservationName}`,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      // Valid canonical private parent and successful exclusive reservation claim admission.
      admittedRoots.add(outputRoot);
      await reservation.writeFile('ATTEMPT_FENCED\n');
      await reservation.sync();
      await parent.sync();
      await mkdir(outputRoot, { mode: 0o700 });
      directory = await open(outputRoot, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      const state = await directory.stat();
      if (state.uid !== process.getuid?.() || (state.mode & 0o777) !== 0o700 ||
        await realpath(outputRoot) !== outputRoot) throw new Error('FENCE_REJECTED');
      await parent.sync();
      const fence = await open(`/proc/self/fd/${directory.fd}/attempt`, 'wx', 0o600);
      try { await fence.writeFile('ATTEMPT_FENCED\n'); await fence.sync(); } finally { await closeInputHandle(fence); }
      await directory.sync();
    } catch { count('FENCE_REJECTED'); return receipt; }
    const reservationPath = join(dirname(outputRoot), `.rss-sep24-diagnostic-${createHash('sha256').update(outputRoot).digest('hex')}.attempt`);
    const identities = await Promise.all([directory.stat(), parent!.stat(), reservation!.stat()]);
    const checkIdentity = async (): Promise<void> => {
      if (lost) throw fenceLost;
      try {
        await safePath(outputRoot);
        const states = await Promise.all([lstat(outputRoot), lstat(dirname(outputRoot)), lstat(reservationPath)]);
        for (let i = 0; i < states.length; i++) {
          const state = states[i]!; const identity = identities[i]!;
          if (state.dev !== identity.dev || state.ino !== identity.ino || state.isSymbolicLink() ||
            state.uid !== process.getuid?.() || (state.mode & 0o777) !== (i === 2 ? 0o600 : 0o700) ||
            (i === 2 ? !state.isFile() || state.nlink !== 1 : !state.isDirectory())) throw fenceLost;
        }
        if (await realpath(outputRoot) !== outputRoot || await realpath(reservationPath) !== reservationPath) throw fenceLost;
      } catch { markLost(); throw fenceLost; }
    };
    checkFinalIdentity = checkIdentity;
    await checkIdentity();
    let reads = 0;
    let readTail = Promise.resolve();
    const boundedClient: RssClientPort = { readFeed: (url, limit, options) => {
      // Provider fan-out is concurrent; serialize admission through the entire read so
      // pathname loss during one transaction fences every subsequent transaction.
      const next = readTail.then(async () => {
        await checkIdentity();
        if (++reads > 36 || limit !== 30 || options?.etag !== undefined || options?.lastModified !== undefined ||
          options?.targetPublishedWindow?.startInclusive.toISOString() !== START ||
          options?.targetPublishedWindow?.endExclusive.toISOString() !== END) throw new Error('Diagnostic read rejected');
        try { return await client.readFeed(url, limit, options); }
        catch (error) {
          const category = safeFailureCategory(error);
          count(category);
          if (/^HTTP_[1-5][0-9]{2}$/u.test(category)) {
            const status = Number(category.slice(5));
            receipt.httpStatuses[status] = (receipt.httpStatuses[status] ?? 0) + 1;
          }
          throw new Error('Diagnostic feed read failed');
        }
      });
      readTail = next.then(() => undefined, () => undefined);
      return next;
    } };
    const original = RssSourceProvider.prototype.scan;
    let scans = 0;
    RssSourceProvider.prototype.scan = async function (plan, context) {
      if (scanScope.getStore() !== receipt) return original.call(this, plan, context);
      if (++scans !== 1 || plan.maxItems !== 30 || plan.cursor !== undefined ||
        context.config?.targetPublishedWindow === undefined) throw stopped;
      const scan = await original.call(this, plan, context);
      await checkIdentity();
      receipt.selectedCount = scan.items.length;
      receipt.warningCount = scan.warnings.length;
      receipt.unitCount = scan.conversationUnits?.length ?? 0;
      throw stopped;
    };
    try {
      await scanScope.run(receipt, () => exportRssSep24Selected({ ...request, outputRoot }, boundedClient));
      count('SCAN_FAILED'); // Unreachable under the exact exporter flow; never claim success.
    } catch (error) { count(error === stopped && receipt.selectedCount !== null ? 'SCAN_STOPPED' : 'SCAN_FAILED'); }
    finally { RssSourceProvider.prototype.scan = original; }
    // Loss is sticky, including when the provider swallowed a rejected read.
    try { await checkIdentity(); } catch { receipt.reasons.SCAN_FAILED ??= 1; }
    const receiptPath = `/proc/self/fd/${directory.fd}/receipt.json`;
    const file = await open(receiptPath, 'wx', 0o600);
    let receiptLost = false;
    let checkReceiptIdentity: ((withFd?: boolean) => Promise<void>) | undefined;
    const checkFinalFence = async (): Promise<void> => {
      try { await checkIdentity(); } catch { markFailed(); }
    };
    const correctFailure = async (): Promise<void> => {
      // A closed or unverified inode cannot be corrected. Never reopen a pathname.
      if (file.fd < 0 || receiptLost || !checkReceiptIdentity) return;
      await checkReceiptIdentity();
      const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`);
      await file.truncate(0);
      let offset = 0;
      while (offset < bytes.length) {
        await checkReceiptIdentity();
        const { bytesWritten } = await file.write(bytes, offset, bytes.length - offset, offset);
        if (bytesWritten < 1) throw new Error('Diagnostic receipt write failed');
        offset += bytesWritten;
      }
      await checkReceiptIdentity();
      await file.sync();
      await checkReceiptIdentity();
    };
    try {
      const identity = await file.stat();
      checkReceiptIdentity = async (withFd = true): Promise<void> => {
        if (receiptLost) throw fenceLost;
        try {
          // Anchor to our directory FD while available. With canonical-root loss,
          // correction after outer closes verifies only our exclusive, live inode.
          const states = lost && !directory && withFd ? [] :
            [await lstat(directory ? receiptPath : join(outputRoot, 'receipt.json'))];
          if (withFd) states.push(await file.stat());
          for (const state of states) {
            if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1 ||
              state.uid !== process.getuid?.() || (state.mode & 0o777) !== 0o600 ||
              state.dev !== identity.dev || state.ino !== identity.ino) throw fenceLost;
          }
        } catch { receiptLost = true; markLost(); throw fenceLost; }
      };
      await checkReceiptIdentity();
      await checkFinalFence();
      if (lost || receipt.reasons.SCAN_FAILED) markFailed();
      // No durable success is published before fallible finalization. A last close
      // can throw AFTER closing the FD, when safe correction is impossible. Thus
      // receipt.json is fail-closed evidence: FINALIZATION_PENDING/null counts is
      // not completion, even when the returned receipt later reports SCAN_STOPPED.
      // Only the return after all closes/checks attests completion for this call;
      // there is no crash, host-root or later-process completion guarantee.
      const durable = receipt.reasons.SCAN_STOPPED ? { ...receipt,
        reasons: { ...receipt.reasons, SCAN_STOPPED: undefined, FINALIZATION_PENDING: 1 },
        selectedCount: null, warningCount: null, unitCount: null } : receipt;
      await file.writeFile(`${JSON.stringify(durable)}\n`);
      await checkReceiptIdentity();
      await file.sync();
      await checkReceiptIdentity();
      await directory.sync();
      await checkReceiptIdentity();
    } catch { markFailed(); }
    // One finalization boundary handles write/sync/fence faults AND every close.
    // Keep the exclusive receipt FD through all outer closes and their checks.
    await closeOuterHandles();
    await checkFinalFence();
    try {
      await checkReceiptIdentity?.();
      if (receipt.reasons.SCAN_FAILED) await correctFailure();
    } catch { markFailed(); }
    try { await file.close(); } catch {
      markFailed();
      await checkFinalFence();
      // A throw before real close still permits verified-FD correction. A throw
      // after real close leaves the conservative pending receipt untouched.
      if (file.fd >= 0) {
        try { await correctFailure(); } catch { markFailed(); }
        try { await file.close(); } catch { markFailed(); }
      }
    }
    if (!lost) {
      await checkFinalFence();
      try { await checkReceiptIdentity?.(false); } catch { markFailed(); }
    }
    // All fallible finalization is complete before returning a successful receipt.
    checkFinalIdentity = undefined;
    return receipt;
  } catch {
    try { await checkFinalIdentity?.(); } catch { /* Already marked as lost. */ }
    markFailed();
    return receipt;
  }
  finally {
    await closeOuterHandles();
    try { await checkFinalIdentity?.(); } catch { markFailed(); }
    active = false;
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--request-file' || args[2] !== '--output-root') {
    process.stdout.write(`${JSON.stringify({ reasons: { INPUT_REJECTED: 1 }, httpStatuses: {}, selectedCount: null,
      warningCount: null, unitCount: null, exported: false, imported: false })}\n`);
    process.exitCode = 1;
  } else {
    diagnoseRssSep24SourceOnly(args[1]!, args[3]!).then((receipt) => {
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
      process.exitCode = receipt.reasons.SCAN_STOPPED === 1 && !receipt.reasons.SCAN_FAILED ? 0 : 1;
    }).catch(() => { process.stdout.write('{"reasons":{"SCAN_FAILED":1},"httpStatuses":{},"selectedCount":null,"warningCount":null,"unitCount":null,"exported":false,"imported":false}\n'); process.exitCode = 1; });
  }
}
