import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { finished } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

export interface ChildSpec {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cancellation: 'group' | 'eof';
}

// Exactly two supervised children. Failure waits for the other result; cancellation
// asks the privileged helper to drain its own group and terminates only our Node group.
export async function supervise(children: readonly [ChildSpec, ChildSpec], logs: string): Promise<number> {
  let cancelled = 0;
  const stops: (() => void)[] = [];
  const cancel = (signal: NodeJS.Signals): void => {
    cancelled = signal === 'SIGINT' ? 130 : 143;
    for (const stop of stops) stop();
  };
  const onTerm = (): void => cancel('SIGTERM');
  const onInt = (): void => cancel('SIGINT');
  process.on('SIGTERM', onTerm);
  process.on('SIGINT', onInt);
  try {
    const results = await Promise.allSettled(children.map(async (spec) => {
      const started = performance.now();
      const path = join(logs, `${spec.name}.log`);
      const log = createWriteStream(path, { flags: 'wx' });
      const logResult = finished(log).then(() => true, () => false);
      const child = spawn(spec.command, [...spec.args], {
        detached: spec.cancellation === 'group', stdio: ['pipe', 'pipe', 'pipe'],
      });
      child.stdout.pipe(log, { end: false });
      child.stderr.pipe(log, { end: false });
      child.stdin.on('error', () => { /* An already settled child may have closed stdin. */ });
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      const kill = (signal: NodeJS.Signals): void => {
        if (settled || child.pid === undefined) return;
        try { process.kill(-child.pid, signal); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') log.write(`${String(error)}\n`);
        }
      };
      const stop = (): void => {
        if (settled || timer !== undefined) return;
        if (spec.cancellation === 'eof') child.stdin.end();
        else {
          kill('SIGTERM');
          timer = setTimeout(() => kill('SIGKILL'), 5000);
        }
      };
      log.once('error', onTerm);
      stops.push(stop);
      if (cancelled !== 0) stop();
      let spawnError = false;
      child.on('error', (error) => { spawnError = true; log.write(`${String(error)}\n`); });
      const status = await new Promise<number>((done) => {
        child.once('close', (code) => {
          settled = true;
          if (timer !== undefined) clearTimeout(timer);
          child.stdin.destroy();
          log.end();
          done(spawnError ? 1 : code ?? 1);
        });
      });
      const logged = await logResult;
      process.stdout.write(`\n${spec.name}: exit ${status}; ${(performance.now() - started).toFixed(0)} ms; ${path}\n`);
      if (logged) {
        const output = createReadStream(path);
        output.pipe(process.stdout, { end: false });
        await finished(output);
      }
      return status === 0 && logged ? 0 : 1;
    }));
    return cancelled || (results.every((result) => result.status === 'fulfilled' && result.value === 0) ? 0 : 1);
  } finally {
    process.off('SIGTERM', onTerm);
    process.off('SIGINT', onInt);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const logs = mkdtempSync(join(tmpdir(), 'social-monitor-static-quality-'));
  process.exitCode = await supervise([
    {
      name: 'root-release-controller', command: '/usr/bin/sudo', cancellation: 'eof',
      args: ['-n', '/usr/bin/env', '-i',
        'PATH=/root/social-monitor-release-contract-tests/python/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        '/usr/bin/bash', '--noprofile', '--norc',
        '/root/social-monitor-release-contract-tests/ops/ci/static-quality-root.sh'],
    },
    {
      name: 'serial-static-quality', command: '/usr/bin/bash', cancellation: 'group',
      args: ['--noprofile', '--norc', '-c', readFileSync(0, 'utf8')],
    },
  ], logs);
}
