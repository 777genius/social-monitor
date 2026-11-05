import { createHash } from 'node:crypto';
import { constants, type BigIntStats } from 'node:fs';
import { lstat, mkdir, open, realpath, type FileHandle } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { refuse } from './social-source-private-input-contract';

export const privateHash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
export type DirectoryPin = Readonly<{ dev: string; ino: string; uid: number }>;
export type FilePin = DirectoryPin & Readonly<{ size: number; sha256: string }>;
export type FileFault = (phase: 'opened' | 'write' | 'sync' | 'close' | 'directory-sync' | 'check', name: string, handle: FileHandle) => Promise<void>;
const same = (a: DirectoryPin | BigIntStats, b: DirectoryPin | BigIntStats): boolean =>
  a.dev.toString() === b.dev.toString() && a.ino.toString() === b.ino.toString() && a.uid.toString() === b.uid.toString();
const fdPath = (handle: FileHandle): string => `/proc/self/fd/${handle.fd}`;
const inside = (path: string, worktree: string): boolean => path === worktree || path.startsWith(`${worktree}${sep}`);
export function assertExternalPrivateRoot(root: string, worktree: string): void {
  if (process.platform !== 'linux' || process.getuid?.() === undefined || !isAbsolute(root) || resolve(root) !== root || root === '/' ||
    !isAbsolute(worktree) || inside(root, resolve(worktree))) refuse('filesystem');
}

/** Linux proc-fd anchors provide openat-like traversal without following user symlink components. */
export class PrivateDirectory {
  private markerHandle: FileHandle | undefined;
  private constructor(
    readonly root: string, readonly pin: DirectoryPin, private readonly handles: FileHandle[],
    private readonly paths: string[], private readonly states: BigIntStats[], private readonly fault?: FileFault,
  ) {}
  private get directory(): FileHandle { return this.handles[this.handles.length - 1]!; }
  private get parent(): FileHandle { return this.handles[this.handles.length - 2]!; }
  private namePath(name: string): string {
    if (!/^[a-z][a-z0-9-]*\.json$/u.test(name)) return refuse('filesystem');
    return join(fdPath(this.directory), name);
  }
  static async acquire(root: string, worktree: string, create: boolean, fault?: FileFault): Promise<PrivateDirectory> {
    const uid = process.getuid?.();
    assertExternalPrivateRoot(root, worktree);
    if (uid === undefined) return refuse('filesystem');
    const handles: FileHandle[] = [];
    const paths: string[] = [];
    const states: BigIntStats[] = [];
    try {
      const worktreeState = await lstat(await realpath(worktree), { bigint: true });
      if (!worktreeState.isDirectory()) refuse('filesystem');
      const segments = relative('/', dirname(root)).split(sep).filter(Boolean);
      let path = '/';
      for (let index = 0; index <= segments.length; index++) {
        const target = index === 0 ? '/' : join(fdPath(handles[index - 1]!), segments[index - 1]!);
        if (index > 0) path = join(path, segments[index - 1]!);
        const handle = await open(target, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        handles.push(handle); paths.push(path);
        const state = await handle.stat({ bigint: true }); states.push(state);
        if (!state.isDirectory() || (state.uid !== BigInt(uid) && state.uid !== 0n) ||
          ((state.mode & 0o022n) !== 0n && !(state.uid === 0n && (state.mode & 0o1777n) === 0o1777n))) refuse('filesystem');
        if (!same(state, await lstat(path, { bigint: true }))) refuse('filesystem');
        // Also refuse filesystem aliases/bind mounts of the checkout, not just lexical descendants.
        if (state.dev === worktreeState.dev && state.ino === worktreeState.ino) refuse('filesystem');
      }
      const target = join(fdPath(handles[handles.length - 1]!), root.slice(dirname(root).length + (dirname(root) === '/' ? 0 : 1)));
      if (create) await mkdir(target, { mode: 0o700 }); // EEXIST is always refusal, including an empty prior attempt.
      const handle = await open(target, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      handles.push(handle); paths.push(root);
      const state = await handle.stat({ bigint: true }); states.push(state);
      if (!state.isDirectory() || state.uid !== BigInt(uid) || (state.mode & 0o7777n) !== 0o700n) refuse('filesystem');
      const directory = new PrivateDirectory(root, { dev: state.dev.toString(), ino: state.ino.toString(), uid: Number(state.uid) }, handles, paths, states, fault);
      await directory.check();
      return directory;
    } catch {
      for (const handle of handles.reverse()) await handle.close().catch(() => undefined);
      return refuse('filesystem');
    }
  }
  async check(): Promise<void> {
    await this.fault?.('check', 'directory', this.directory);
    for (const [index, handle] of this.handles.entries()) {
      const actual = await handle.stat({ bigint: true });
      const linked = await lstat(this.paths[index]!, { bigint: true });
      if (!same(actual, this.states[index]!) || !same(actual, linked) || actual.mode !== this.states[index]!.mode || linked.mode !== actual.mode) refuse('filesystem');
    }
  }
  private async assertFile(handle: FileHandle, name: string, pin?: FilePin): Promise<BigIntStats> {
    const state = await handle.stat({ bigint: true });
    const linked = await lstat(this.namePath(name), { bigint: true });
    if (!state.isFile() || state.nlink !== 1n || state.uid !== BigInt(this.pin.uid) || (state.mode & 0o7777n) !== 0o400n ||
      !same(state, linked) || linked.nlink !== 1n || linked.mode !== state.mode ||
      (pin !== undefined && (!same(state, pin) || state.size !== BigInt(pin.size)))) refuse('filesystem');
    return state;
  }
  async write(name: string, bytes: Buffer): Promise<FilePin> {
    let handle: FileHandle | undefined;
    try {
      await this.check();
      handle = await open(this.namePath(name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o400);
      await this.fault?.('opened', name, handle);
      await this.assertFile(handle, name);
      await this.fault?.('write', name, handle);
      await handle.writeFile(bytes);
      await this.fault?.('sync', name, handle);
      await handle.sync();
      const state = await this.assertFile(handle, name);
      if (state.size !== BigInt(bytes.length)) refuse('filesystem');
      await this.check();
      if (name === 'manifest.json') { this.markerHandle = handle; handle = undefined; }
      else {
        await this.fault?.('close', name, handle); await this.assertFile(handle, name); await this.check();
        await handle.close(); handle = undefined;
      }
      return { dev: state.dev.toString(), ino: state.ino.toString(), uid: Number(state.uid), size: Number(state.size), sha256: privateHash(bytes) };
    } catch {
      if (name === 'manifest.json') { await handle?.truncate(0).catch(() => undefined); await handle?.sync().catch(() => undefined); }
      return refuse('filesystem');
    }
    finally { await handle?.close().catch(() => undefined); }
  }
  async read(name: string, pin: FilePin, limit: number): Promise<Buffer> {
    let handle: FileHandle | undefined;
    try {
      await this.check();
      handle = await open(this.namePath(name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const before = await this.assertFile(handle, name, pin);
      if (before.size > BigInt(limit) || before.size < 1n) refuse('filesystem');
      // Bound allocation even if a same-owner actor grows the file during reading.
      const bytes = Buffer.alloc(Number(before.size) + 1);
      let size = 0;
      while (size < bytes.length) {
        const read = await handle.read(bytes, size, bytes.length - size, size);
        if (read.bytesRead === 0) break;
        size += read.bytesRead;
      }
      const after = await this.assertFile(handle, name, pin);
      const result = bytes.subarray(0, size);
      if (BigInt(size) !== before.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || privateHash(result) !== pin.sha256) refuse('filesystem');
      await this.check();
      await handle.close(); handle = undefined;
      return result;
    } catch { return refuse('filesystem'); }
    finally { await handle?.close().catch(() => undefined); }
  }
  async sync(): Promise<void> {
    await this.check();
    await this.fault?.('directory-sync', 'directory', this.directory); await this.directory.sync();
    await this.fault?.('directory-sync', 'parent', this.parent); await this.parent.sync();
    await this.check();
  }
  /** Preserve failed bytes, but best-effort invalidate a failed marker. Admission additionally requires a successful commit capability. */
  async invalidateManifest(): Promise<void> {
    try {
      if (this.markerHandle === undefined) return;
      await this.markerHandle.truncate(0); await this.markerHandle.sync(); await this.directory.sync();
    } catch { /* No admission capability is issued even if the filesystem cannot invalidate. */ }
  }
  async close(): Promise<void> {
    let failed = false;
    // Faults and rebinding checks run while all ancestry descriptors are still live.
    for (const handle of [...this.handles].reverse()) {
      try { await this.fault?.('close', 'directory', handle); } catch { failed = true; }
    }
    if (this.markerHandle !== undefined) {
      try { await this.fault?.('close', 'manifest.json', this.markerHandle); } catch { failed = true; }
    }
    try { await this.check(); } catch { failed = true; }
    if (failed) await this.invalidateManifest();
    for (const handle of [...this.handles].reverse()) {
      try { await handle.close(); }
      catch { failed = true; await handle.close().catch(() => undefined); }
    }
    if (this.markerHandle !== undefined) {
      const marker = this.markerHandle;
      try {
        if (failed) { await marker.truncate(0); await marker.sync(); }
        await marker.close();
      } catch {
        failed = true; await marker.truncate(0).catch(() => undefined); await marker.sync().catch(() => undefined);
        await marker.close().catch(() => undefined);
      }
      this.markerHandle = undefined;
    }
    if (failed) refuse('filesystem');
  }
}
