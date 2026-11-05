// Linux CI only. The keeper stays outside the command cgroup and retains root
// authority; the bootstrap joins before dropping back to the invoking identity.
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { constants, closeSync, fstatSync, openSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import { mkdir, rmdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface Launch {
  readonly command: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly uid: number;
  readonly gid: number;
  readonly groups: readonly number[];
}
export type KeeperEvent = { readonly kind: 'exit'; readonly code: number }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'drained' };

interface OwnedCgroup { readonly fd: number; readonly dev: number; readonly ino: number }

// The inode must still be a cgroup v2 directory. No delayed numeric PID/PGID
// signal exists in this implementation, even if a malicious identity is supplied.
export function ownedCgroupPath(owner: OwnedCgroup): string {
  const location = `/proc/self/fd/${owner.fd}`;
  const metadata = fstatSync(owner.fd);
  if (metadata.dev !== owner.dev || metadata.ino !== owner.ino || !metadata.isDirectory()
    || statfsSync(location).type !== 0x63677270) {
    throw new Error('lifecycle ownership is not a pinned cgroup v2 directory');
  }
  return location;
}
function ownership(fd: number): OwnedCgroup {
  const { dev, ino } = fstatSync(fd);
  const owner = { fd, dev, ino };
  ownedCgroupPath(owner);
  return owner;
}
function populated(owner: OwnedCgroup): boolean {
  const content = readFileSync(`${ownedCgroupPath(owner)}/cgroup.events`, 'utf8');
  const value = /^populated ([01])$/m.exec(content)?.[1];
  if (value === undefined) throw new Error('invalid owned cgroup populated state');
  return value === '1';
}
async function drain(owner: OwnedCgroup, report: (error: unknown) => void): Promise<void> {
  // cgroup.kill is recursive, covers changed UID and setsid descendants, and
  // cannot address a recycled PID. A denied kill never becomes false success:
  // retain the FD and keeper until the kernel proves the cgroup is empty.
  let reported = false;
  for (;;) {
    try {
      if (!populated(owner)) return;
      writeFileSync(`${ownedCgroupPath(owner)}/cgroup.kill`, '1');
      if (!populated(owner)) return;
    } catch (error) {
      if (!reported) { report(error); reported = true; }
    }
    await delay(10);
  }
}

async function bootstrap(): Promise<void> {
  process.on('disconnect', () => process.exit(1));
  let launched = false;
  let childLaunch: Launch | undefined;
  process.on('message', (message: Launch | 'admit') => {
    try {
      if (message !== 'admit') {
        if (childLaunch !== undefined) throw new Error('duplicate lifecycle bootstrap');
        childLaunch = message;
        writeFileSync(`${ownedCgroupPath(ownership(4))}/cgroup.procs`, String(process.pid));
        closeSync(4);
        process.send?.('attached');
        return;
      }
      if (childLaunch === undefined || launched) throw new Error('invalid lifecycle admission');
      launched = true;
      const launch = childLaunch;
      process.setgroups!(Array.from(launch.groups));
      process.setgid!(launch.gid); process.setuid!(launch.uid);
      const child = spawn('/bin/sh', ['-c', launch.command], {
        cwd: launch.cwd, env: launch.env, stdio: 'inherit',
      });
      child.once('error', error => {
        process.send?.({ kind: 'error', message: String(error) } satisfies KeeperEvent);
        process.send?.({ kind: 'exit', code: 1 } satisfies KeeperEvent);
      });
      child.once('exit', (code, signal) => {
        process.send?.({ kind: 'exit', code: signal ? 1 : (code ?? 1) } satisfies KeeperEvent);
      });
      // Remain owned until the outside keeper has killed residual descendants.
    } catch (error) {
      process.send?.({ kind: 'error', message: String(error) } satisfies KeeperEvent);
      process.send?.({ kind: 'exit', code: 1 } satisfies KeeperEvent, () => process.exit(1));
    }
  });
}

async function keeper(socketPath: string): Promise<void> {
  if (process.platform !== 'linux' || process.getuid?.() !== 0) {
    throw new Error('lifecycle keeper requires Linux root cgroup authority');
  }
  const socket = connect(socketPath);
  let cancelled = false;
  let launch: Launch | undefined;
  let wake: (() => void) | undefined;
  let buffer = '';
  const cancel = (): void => { cancelled = true; wake?.(); };
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  const send = (event: KeeperEvent): void => {
    if (!socket.destroyed && socket.writable) socket.write(`${JSON.stringify(event)}\n`);
  };
  const report = (error: unknown): void => send({ kind: 'error', message: String(error) });
  socket.on('error', () => { cancelled = true; wake?.(); });
  socket.on('close', () => { cancelled = true; wake?.(); });
  socket.on('data', chunk => {
    buffer += String(chunk);
    try {
      let end: number;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const message = JSON.parse(buffer.slice(0, end)) as { kind: string; launch?: Launch };
        buffer = buffer.slice(end + 1);
        if (message.kind === 'cancel') cancelled = true;
        else if (message.kind === 'launch' && launch === undefined) launch = message.launch;
        else throw new Error('invalid lifecycle keeper control message');
        wake?.();
      }
    } catch (error) { cancelled = true; report(error); wake?.(); }
  });
  const changed = (): Promise<void> => new Promise(resolve => { wake = resolve; });
  let fd: number | undefined;
  let owner: OwnedCgroup | undefined;
  let group: string | undefined;
  let code = 1;
  let bootstrapChild: ChildProcess | undefined;
  let bootstrapSettled: Promise<void> | undefined;
  try {
    while (launch === undefined && !cancelled) await changed();
    if (cancelled || launch === undefined) { code = 130; return; }
    const scope = /^0::(\/.*)$/m.exec(readFileSync('/proc/self/cgroup', 'utf8'))?.[1];
    if (scope === undefined || scope.split('/').includes('..')) throw new Error('missing cgroup v2 scope');
    const base = path.join('/sys/fs/cgroup', scope);
    if (statfsSync(base).type !== 0x63677270) throw new Error('cgroup v2 mount unavailable');
    const candidate = path.join(base, `social-monitor-lifecycle-${randomUUID()}`);
    await mkdir(candidate, { mode: 0o700 });
    group = candidate;
    fd = openSync(group, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    owner = ownership(fd);
    if (cancelled) { code = 130; return; }
    const child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(import.meta.url), '--bootstrap'], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc', fd],
    });
    bootstrapChild = child;
    let exited = false;
    let attached = false;
    // Its output streams are inherited, so exit (or failed spawn) settles this
    // direct child. Waiting for IPC 'close' after disconnect can miss closure.
    const settled = new Promise<void>(resolve => {
      const finish = (): void => {
        if (!exited) {
          code = cancelled ? 130 : 1;
          send({ kind: 'exit', code });
        }
        exited = true; wake?.(); resolve();
      };
      child.once('exit', finish); child.once('error', finish);
    });
    bootstrapSettled = settled;
    child.once('error', error => { report(error); exited = true; wake?.(); });
    child.on('message', (event: KeeperEvent | 'attached') => {
      if (event === 'attached') { attached = true; wake?.(); return; }
      send(event);
      if (event.kind === 'exit') { code = event.code; exited = true; wake?.(); }
    });
    child.send(launch);
    // Do not race cancellation against attachment: no shell is admitted until
    // the bootstrap has acknowledged membership in the pinned cgroup.
    while (!attached && !exited) await changed();
    if (attached && !cancelled && !exited) child.send('admit');
    while (!exited && !cancelled) await changed();
    if (cancelled && !exited) code = 130;
    await drain(owner, report);
    await settled;
  } catch (error) { code = 1; report(error); }
  finally {
    // An exception after admission also retains containment until proof of drain.
    if (bootstrapChild?.connected) bootstrapChild.disconnect();
    if (owner !== undefined) await drain(owner, report);
    if (bootstrapSettled !== undefined) await bootstrapSettled;
    // Even an attachment racing a startup error must be observed before release.
    if (owner !== undefined) await drain(owner, report);
    if (fd !== undefined) closeSync(fd);
    if (group !== undefined) await rmdir(group);
    send({ kind: 'drained' });
    socket.end(); process.exitCode = code;
    process.off('SIGINT', cancel); process.off('SIGTERM', cancel);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--bootstrap') await bootstrap();
  else {
    const socketPath = process.argv[2];
    if (!socketPath) throw new Error('missing keeper socket');
    await keeper(socketPath);
  }
}
