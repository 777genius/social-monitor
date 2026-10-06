import { spawn } from 'node:child_process';
import { closeSync, constants, openSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { KeeperEvent, Launch } from './production-lifecycle-keeper.mts';

export interface LifecycleCommand { readonly command: string; readonly safe?: boolean }

// Only the 18 source-audited isolated fixtures opt in. New entries are serial.
// Commands and order match base 87a2c726390984c9f87f4df1c2bbbed95e074817.
export const lifecycleCommands: readonly LifecycleCommand[] = [
  { command: "bash ops/deploy/verify-production-shellcheck-baseline.sh ops/deploy/social-monitor-production-deploy.sh ops/deploy/production-transition-b0-host-control.sh ops/deploy/production-transition-marker-lib.sh ops/deploy/production-forward-bridge-host-lib.sh ops/deploy/github-production-forward-bridge-client-lib.sh" },
  { command: "node ops/deploy/production-runtime/rolling-summary-receipt.test.mjs", safe: true },
  { command: "bash ops/deploy/production-runtime/rolling-run.test.sh", safe: true },
  { command: "bash ops/deploy/production-runtime/daily-run.test.sh", safe: true },
  { command: "bash ops/deploy/daily-deploy-lock-race.test.sh" },
  { command: "bash ops/deploy/social-monitor-production-deploy.test.sh" },
  { command: "bash ops/deploy/x-collector-image-deploy-lib.test.sh", safe: true },
  { command: "bash ops/deploy/production-component-classification.test.sh", safe: true },
  { command: "bash ops/deploy/production-release-a-transition.test.sh" },
  { command: "bash ops/deploy/postgres-runtime-daily-c1-readiness-lib.test.sh", safe: true },
  { command: "bash ops/deploy/deploy-control-bridge-runtime-helper.test.sh", safe: true },
  { command: "bash ops/deploy/deploy-control-bridge-fixture-lifecycle.test.sh", safe: true },
  { command: "bash ops/deploy/deploy-control-reviewed-library-source.test.sh", safe: true },
  { command: "bash ops/deploy/reader-summary-recovery-maintenance-lib.test.sh" },
  { command: "bash ops/deploy/reader-summary-daily-delivery-c1-action.test.sh", safe: true },
  { command: "bash ops/deploy/github-production-maintenance-dispatch.test.sh", safe: true },
  { command: "bash ops/deploy/github-production-transition-client-lib.test.sh", safe: true },
  { command: "bash ops/deploy/production-transition-admission.test.sh", safe: true },
  { command: "bash ops/deploy/production-transition-prelude-authority.test.sh", safe: true },
  { command: "bash ops/deploy/production-transition-publisher-lifecycle.test.sh", safe: true },
  { command: "bash ops/deploy/production-transition-b0-bootstrap.test.sh" },
  { command: "bash ops/deploy/production-transition-b0-host-control.test.sh" },
  { command: "bash ops/deploy/production-forward-bootstrap-marker-resume.test.sh" },
  { command: "bash ops/deploy/production-forward-bridge.test.sh" },
  { command: "bash ops/deploy/github-production-deploy-client.test.sh", safe: true },
  { command: "bash ops/deploy/production-release-b-bridge-order.test.sh" },
  { command: "bash ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh", safe: true },
  { command: "npm run check:reader-summary-active-model-route-migration", safe: true },
];

export interface ExecutionOptions {
  readonly signal?: AbortSignal;
  readonly stdout?: (text: string) => void;
  readonly stderr?: (text: string) => void;
}

interface OwnedExecution {
  readonly settled: Promise<number>;
  cancel(): void;
}
function containCommand(command: string, onExit: (code: number) => void,
  stdout: (text: string) => void, stderr: (text: string) => void): OwnedExecution {
  let cancelled = false;
  let socket: Socket | undefined;
  const cancel = (): void => {
    cancelled = true;
    if (socket !== undefined && !socket.destroyed && !socket.writableEnded) {
      try { socket.write(`${JSON.stringify({ kind: 'cancel' })}\n`); }
      catch { socket.destroy(); }
    }
  };
  const settled = (async (): Promise<number> => {
    const root = await mkdtemp(path.join(tmpdir(), 'sm-lifecycle-'));
    const rootFd = openSync(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const server = createServer();
    let controlError: Error | undefined;
    let drained = false;
    let code: number | undefined;
    let childClosed = false;
    let protocol = '';
    const launch: Launch = {
      command, cwd: process.cwd(), env: process.env,
      uid: process.getuid!(), gid: process.getgid!(), groups: process.getgroups!(),
    };
    server.on('connection', connection => {
      if (socket !== undefined) { connection.destroy(); return; }
      socket = connection;
      connection.on('error', error => { controlError ??= error; });
      connection.on('data', chunk => {
        protocol += String(chunk);
        try {
          let end: number;
          while ((end = protocol.indexOf('\n')) !== -1) {
            const event = JSON.parse(protocol.slice(0, end)) as KeeperEvent;
            protocol = protocol.slice(end + 1);
            if (event.kind === 'exit' && Number.isInteger(event.code) && event.code >= 0 && event.code <= 255) {
              code = event.code; onExit(code);
            } else if (event.kind === 'drained') {
              drained = true;
            } else if (event.kind === 'error') { controlError ??= new Error(event.message); onExit(1); cancel(); }
            else throw new Error('invalid lifecycle keeper response');
          }
        } catch (error) { controlError ??= error as Error; onExit(1); cancel(); }
      });
      connection.write(`${JSON.stringify(cancelled ? { kind: 'cancel' } : { kind: 'launch', launch })}\n`);
    });
    try {
      // The provider's TMPDIR can exceed sockaddr_un's path limit. Keep the
      // private directory pinned and use its short Linux proc descriptor alias.
      const location = `/proc/${process.pid}/fd/${rootFd}/control`;
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject); server.listen(location, resolve);
      });
      const helper = fileURLToPath(new URL('./production-lifecycle-keeper.mts', import.meta.url));
      const args = ['--experimental-strip-types', helper, location];
      // Only the keeper is privileged. The shell receives the original UID/GID,
      // groups, environment and cwd through the private control channel.
      const child = process.getuid?.() === 0
        ? spawn(process.execPath, args, { detached: true, stdio: ['inherit', 'pipe', 'pipe'] })
        : spawn('sudo', ['--non-interactive', process.execPath, ...args], { detached: true, stdio: ['inherit', 'pipe', 'pipe'] });
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', stdout); child.stderr.on('data', stderr);
      await new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (status, signal) => {
          childClosed = true;
          if (code === undefined) code = signal ? 1 : (status ?? 1);
          if (status !== 0 && code === 0) controlError ??= new Error(`lifecycle keeper failed: ${status}`);
          resolve();
        });
      });
      if (controlError !== undefined) throw controlError;
      if (!drained) throw new Error('lifecycle keeper did not prove drain');
      return code ?? 1;
    } finally {
      // The keeper's close is authoritative; never signal a recycled numeric PID.
      // Socket loss instructs a live keeper to drain before it exits.
      if (!childClosed) socket?.end(`${JSON.stringify({ kind: 'cancel' })}\n`);
      socket?.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
      closeSync(rootFd);
      await rm(root, { recursive: true, force: true });
    }
  })();
  return { settled, cancel };
}

// The audited two FIFO lanes and serial barriers are unchanged. A command owns
// its containment until the keeper has proved descendant drain and closed.
export async function runLifecycle(
  commands: readonly LifecycleCommand[], options: ExecutionOptions = {},
): Promise<number> {
  const out = options.stdout ?? (text => { process.stdout.write(text); });
  const err = options.stderr ?? (text => { process.stderr.write(text); });
  const active = new Set<OwnedExecution>();
  let failure = 0;
  let exception: unknown;
  let hasException = false;
  const cancelOwned = (): void => { for (const owned of active) owned.cancel(); };
  const cancel = (): void => { failure ||= 130; cancelOwned(); };
  const failException = (error: unknown): void => {
    if (!hasException) { exception = error; hasException = true; }
    failure ||= 1; cancelOwned();
  };
  const emit = (sink: (text: string) => void, text: string): void => {
    if (hasException) return;
    try { sink(text); } catch (error) { failException(error); }
  };
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();

  const execute = async (entry: LifecycleCommand, index: number): Promise<void> => {
    const label = `[lifecycle ${index + 1}]`;
    emit(out, `${label} START ${entry.command}\n`);
    if (failure !== 0) return;
    const owned = containCommand(entry.command, code => { failure ||= code; },
      text => emit(out, `${label} stdout: ${text}`), text => emit(err, `${label} stderr: ${text}`));
    active.add(owned);
    try {
      const code = await owned.settled;
      failure ||= code;
      emit(out, `${label} END exit=${code}\n`);
    } catch (error) { failException(error); }
    finally { active.delete(owned); }
  };
  try {
    let next = 0;
    while (next < commands.length && failure === 0) {
      const entry = commands[next];
      if (entry === undefined) break;
      if (entry.safe !== true) { await execute(entry, next++); continue; }
      let end = next;
      while (commands[end]?.safe === true) end++;
      const worker = async (): Promise<void> => {
        while (next < end && failure === 0) {
          const index = next++;
          const admitted = commands[index];
          if (admitted !== undefined) await execute(admitted, index);
        }
      };
      await Promise.all([worker(), worker()]);
    }
  } catch (error) { failException(error); }
  finally {
    if (hasException || options.signal?.aborted) cancelOwned();
    await Promise.allSettled(Array.from(active, owned => owned.settled));
    options.signal?.removeEventListener('abort', cancel);
  }
  if (hasException) throw exception;
  return failure;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  try { process.exitCode = await runLifecycle(lifecycleCommands, { signal: controller.signal }); }
  finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
}
