import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

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

// Inherit npm's cwd/environment and exact shell arguments; no fixture timeout changes.
// Linux CI: one owned process group per command, including shell/npm descendants.
export async function runLifecycle(
  commands: readonly LifecycleCommand[], options: ExecutionOptions = {},
): Promise<number> {
  const out = options.stdout ?? (text => { process.stdout.write(text); });
  const err = options.stderr ?? (text => { process.stderr.write(text); });
  const active = new Set<() => void>();
  let failure = 0;
  const cancel = (): void => {
    failure ||= 130;
    for (const terminate of active) terminate();
  };
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();

  const execute = (entry: LifecycleCommand, index: number): Promise<void> => new Promise(resolve => {
    const label = `[lifecycle ${index + 1}]`;
    out(`${label} START ${entry.command}\n`);
    const child = spawn('/bin/sh', ['-c', entry.command], {
      detached: true, stdio: ['inherit', 'pipe', 'pipe'],
    });
    let finished = false;
    let closed = false;
    let terminating = false;
    let escalated = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const killGroup = (signal: NodeJS.Signals): void => {
      if (child.pid === undefined) return;
      try { process.kill(-child.pid, signal); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
          failure ||= 1; err(`${label} cancellation: ${String(error)}\n`);
        }
      }
    };
    const finish = (code: number): void => {
      if (finished) return;
      finished = true;
      failure ||= code;
      clearTimeout(killTimer); clearTimeout(closeTimer);
      active.delete(terminate);
      out(`${label} END exit=${code}\n`);
      resolve();
    };
    const terminate = (): void => {
      if (terminating || finished) return;
      terminating = true;
      killGroup('SIGTERM');
      killTimer = setTimeout(() => {
        escalated = true;
        // Even if the shell closed, a TERM-resistant descendant may still exist.
        killGroup('SIGKILL');
        if (closed) { finish(130); return; }
        closeTimer = setTimeout(() => {
          child.stdout.destroy(); child.stderr.destroy(); finish(130);
        }, 1_000);
      }, 2_000);
    };
    active.add(terminate);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => out(`${label} stdout: ${chunk}`));
    child.stderr.on('data', (chunk: string) => err(`${label} stderr: ${chunk}`));
    child.once('error', error => { failure ||= 1; err(`${label} ${String(error)}\n`); });
    // Observe exit before inherited output pipes close to stop admissions promptly.
    child.once('exit', (code, signal) => { failure ||= signal ? 1 : (code ?? 1); });
    child.once('close', (code, signal) => {
      closed = true;
      if (!terminating || escalated) finish(signal ? 1 : (code ?? 1));
    });
    if (options.signal?.aborted) terminate();
  });

  try {
    let next = 0;
    while (next < commands.length && failure === 0) {
      const entry = commands[next];
      if (entry === undefined) break;
      if (entry.safe !== true) { await execute(entry, next++); continue; }
      let end = next;
      while (commands[end]?.safe === true) end++;
      // Two FIFO workers only; both drain before crossing any serial barrier.
      const worker = async (): Promise<void> => {
        while (next < end && failure === 0) {
          const index = next++;
          const admitted = commands[index];
          if (admitted !== undefined) await execute(admitted, index);
        }
      };
      await Promise.all([worker(), worker()]);
    }
    return failure;
  } finally { options.signal?.removeEventListener('abort', cancel); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  try { process.exitCode = await runLifecycle(lifecycleCommands, { signal: controller.signal }); }
  finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
}
