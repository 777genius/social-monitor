import { randomUUID } from 'node:crypto';
import { approvedScope, exactKeys, materializedRequest, prettyBytes, refuse, sep24Window, validateSnapshot,
  type SourceSnapshot } from './social-source-private-input-contract';
import type { SnapshotReader } from './social-source-private-input-database';
import { assertExternalPrivateRoot, PrivateDirectory, privateHash, type DirectoryPin, type FileFault, type FilePin } from './social-source-private-input-files';

export type PublicMaterializationReceipt = Readonly<{
  identity: string; materialized: true; collected: false; imported: false;
  providers: readonly Readonly<{ provider: 'reddit' | 'rss'; passCount: number; feedCount: number; expandedFeedCount: number }>[];
}>;
/** Process-local successful-publication authority, intentionally absent from the public CLI receipt. */
export type PrivateInputCommit = Readonly<{ kind: 'trusted-private-input-commit' }>;
type CommitPins = { root: string; worktree: string; directory: DirectoryPin; manifest: FilePin; files: Record<string, FilePin> };
const commits = new WeakMap<PrivateInputCommit, CommitPins>();
const normalized = (value: unknown): unknown => Array.isArray(value) ? value.map(normalized) :
  value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => [key, normalized(child)])) : value;
const equivalent = (a: unknown, b: unknown): boolean => JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));

async function snapshots(reader: SnapshotReader): Promise<readonly SourceSnapshot[]> {
  const values = await reader();
  if (!Array.isArray(values) || values.length !== 2) refuse('scope');
  const rows = values.map(validateSnapshot).sort((a, b) => a.provider.localeCompare(b.provider));
  if (rows[0]?.provider !== 'reddit' || rows[1]?.provider !== 'rss') refuse('scope');
  return rows;
}

export async function materializeSocialSep24PrivateInputs(input: {
  outputRoot: string; worktree: string; readSnapshots: SnapshotReader; fault?: FileFault;
}): Promise<{ receipt: PublicMaterializationReceipt; commit: PrivateInputCommit }> {
  let directory: PrivateDirectory | undefined;
  let manifestStarted = false;
  try {
    assertExternalPrivateRoot(input.outputRoot, input.worktree);
    const rows = await snapshots(input.readSnapshots);
    // Validate every provider before creating any output directory.
    const requests = rows.map(materializedRequest);
    const identity = randomUUID();
    directory = await PrivateDirectory.acquire(input.outputRoot, input.worktree, true, input.fault);
    const files: Record<string, FilePin> = {};
    const snapshotBytes = prettyBytes({ version: 1, identity, window: sep24Window, scope: approvedScope, snapshots: rows });
    files['snapshot.json'] = await directory.write('snapshot.json', snapshotBytes);
    for (const [index, row] of rows.entries()) {
      files[`${row.provider}-request.json`] = await directory.write(`${row.provider}-request.json`, requests[index]!.bytes);
    }
    await directory.sync();
    const manifestBytes = prettyBytes({ version: 1, identity, window: sep24Window, directory: directory.pin, files });
    manifestStarted = true;
    const manifest = await directory.write('manifest.json', manifestBytes);
    await directory.sync();
    // Reopen all private files by descriptor and verify exact bytes before committing.
    for (const [name, pin] of Object.entries(files)) await directory.read(name, pin, name === 'snapshot.json' ? 262_144 : 65_536);
    await directory.read('manifest.json', manifest, 8192);
    const pins: CommitPins = { root: input.outputRoot, worktree: input.worktree, directory: directory.pin, manifest, files };
    await directory.close(); directory = undefined;
    const commit = Object.freeze({ kind: 'trusted-private-input-commit' as const });
    commits.set(commit, pins);
    return { commit, receipt: Object.freeze({ identity, materialized: true, collected: false, imported: false,
      providers: rows.map((row, index) => ({ provider: row.provider, passCount: requests[index]!.passCount,
        feedCount: requests[index]!.feedCount, expandedFeedCount: requests[index]!.expandedFeedCount })) }) };
  } catch {
    if (manifestStarted) await directory?.invalidateManifest();
    return refuse('filesystem');
  } finally { await directory?.close().catch(() => undefined); }
}

/**
 * Trusted composition must hold an external approved scope fence and reserve ONCE before its first
 * provider request. This API grants neither reservation nor capture authority and calls no exporter.
 * Repeat after capture: drift makes retained results ineligible, never authorizes another capture.
 */
export async function admitSocialSep24PrivateInputs(commit: PrivateInputCommit, readSnapshots: SnapshotReader): Promise<{
  redditRequestBytes: Buffer; rssRequestBytes: Buffer;
}> {
  const pins = commits.get(commit);
  if (pins === undefined) return refuse('filesystem');
  let directory: PrivateDirectory | undefined;
  try {
    directory = await PrivateDirectory.acquire(pins.root, pins.worktree, false);
    if (directory.pin.dev !== pins.directory.dev || directory.pin.ino !== pins.directory.ino || directory.pin.uid !== pins.directory.uid) refuse('filesystem');
    const manifestBytes = await directory.read('manifest.json', pins.manifest, 8192);
    const manifest = exactKeys(JSON.parse(manifestBytes.toString('utf8')) as unknown, ['version', 'identity', 'window', 'directory', 'files']);
    if (manifest.version !== 1 || !equivalent(manifest.window, sep24Window) || !equivalent(manifest.directory, pins.directory) || !equivalent(manifest.files, pins.files)) refuse('filesystem');
    const snapshotBytes = await directory.read('snapshot.json', pins.files['snapshot.json']!, 262_144);
    const snapshot = exactKeys(JSON.parse(snapshotBytes.toString('utf8')) as unknown, ['version', 'identity', 'window', 'scope', 'snapshots']);
    if (snapshot.version !== 1 || snapshot.identity !== manifest.identity || !equivalent(snapshot.window, sep24Window) ||
      !equivalent(snapshot.scope, approvedScope) || !Array.isArray(snapshot.snapshots)) refuse('filesystem');
    const stored = await snapshots(async () => snapshot.snapshots as SourceSnapshot[]);
    const requestBytes: Buffer[] = [];
    for (const row of stored) {
      const name = `${row.provider}-request.json`;
      const bytes = await directory.read(name, pins.files[name]!, 65_536);
      const expected = materializedRequest(row).bytes;
      if (privateHash(bytes) !== privateHash(expected) || !bytes.equals(expected)) refuse('filesystem');
      requestBytes.push(bytes);
    }
    const current = await snapshots(readSnapshots);
    if (!equivalent(stored, current)) refuse('drift');
    await directory.check(); await directory.close(); directory = undefined;
    return { redditRequestBytes: requestBytes[0]!, rssRequestBytes: requestBytes[1]! };
  } catch { return refuse('drift'); }
  finally { await directory?.close().catch(() => undefined); }
}
