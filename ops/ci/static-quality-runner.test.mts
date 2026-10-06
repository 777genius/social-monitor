import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { supervise } from './static-quality-runner.mts';
import type { ChildSpec } from './static-quality-runner.mts';

const self = fileURLToPath(import.meta.url);
const shell = (name: string, program: string, cancellation: 'group' | 'eof' = 'group'): ChildSpec => ({
  name, command: '/usr/bin/bash', args: ['--noprofile', '--norc', '-c', `set -euo pipefail\n${program}`], cancellation,
});
const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

async function fixture(root: string, scenario: string): Promise<number> {
  const marker = (name: string): string => quote(join(root, name));
  switch (scenario) {
    case 'overlap':
      return supervise([
        shell('root', `touch ${marker('root-start')}; while ! test -e ${marker('static-start')}; do sleep 0.01; done; echo ROOT_OK`),
        shell('static', `touch ${marker('static-start')}; while ! test -e ${marker('root-start')}; do sleep 0.01; done; echo STATIC_OK`),
      ], root);
    case 'root-fails':
    case 'static-fails':
    case 'both-fail': {
      const rootFails = scenario !== 'static-fails';
      const staticFails = scenario !== 'root-fails';
      return supervise([
        shell('root', rootFails ? 'echo ROOT_REFUSAL >&2; exit 7' : `sleep 0.2; touch ${marker('root-done')}; echo ROOT_DONE`),
        shell('static', `sleep 0.2; touch ${marker('static-done')}; echo STATIC_FIRST; ${staticFails ? 'exit 9' : ':'}\necho STATIC_LATER`),
      ], root);
    }
    case 'spawn-fails':
      return supervise([
        { name: 'root', command: join(root, 'missing-executable'), args: [], cancellation: 'group' },
        shell('static', `sleep 0.2; touch ${marker('static-done')}; echo STATIC_DONE`),
      ], root);
    case 'drain':
      return supervise([
        shell('root', "head -c 262144 /dev/zero | tr '\\0' R; echo ROOT_TAIL >&2"),
        shell('static', "head -c 262144 /dev/zero | tr '\\0' S; echo STATIC_TAIL >&2"),
      ], root);
    case 'cancel':
      return supervise([
        shell('root', `touch ${marker('root-ready')}; if read -r cancellation; then :; fi; sleep 0.2; touch ${marker('root-drained')}; echo ROOT_DRAINED`, 'eof'),
        shell('static', `trap '' TERM INT; echo $$ > ${marker('static-pid')};
bash --noprofile --norc -c 'trap "" TERM INT; echo $$ > "$1"; while :; do sleep 1; done' child ${marker('grandchild-pid')} &
touch ${marker('static-ready')}; wait "$!"`),
      ], root);
    default: throw new Error(`Unknown synthetic scenario: ${scenario}`);
  }
}

if (process.argv[2] === 'fixture') {
  const root = process.argv[3], scenario = process.argv[4];
  assert.ok(root && scenario);
  process.exitCode = await fixture(root, scenario);
} else {
  const start = (root: string, scenario: string) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', self, 'fixture', root, scenario], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    const result = new Promise<{ code: number | null; signal: NodeJS.Signals | null; output: string }>((done, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => done({ code, signal, output }));
    });
    return { child, result };
  };
  const delay = (ms: number): Promise<void> => new Promise(done => setTimeout(done, ms));
  const marker = async (path: string): Promise<string> => {
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      try { return await readFile(path, 'utf8'); } catch { await delay(20); }
    }
    throw new Error(`Missing child observation: ${path}`);
  };
  const gone = async (pid: number): Promise<boolean> => {
    try {
      // A terminated adopted grandchild may briefly remain a zombie in a container.
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
      return stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z ');
    } catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
  };

  for (const scenario of ['overlap', 'root-fails', 'static-fails', 'both-fail', 'spawn-fails', 'drain']) {
    test(`join observes both children: ${scenario}`, { timeout: 10000 }, async () => {
      const root = await mkdtemp(join(tmpdir(), 'static-quality-proof-'));
      const run = start(root, scenario);
      try {
        const result = await run.result;
        assert.equal(result.signal, null);
        assert.equal(result.code, ['overlap', 'drain'].includes(scenario) ? 0 : 1, result.output);
        if (scenario === 'overlap') {
          assert.match(result.output, /ROOT_OK/);
          assert.match(result.output, /STATIC_OK/);
        } else if (scenario === 'drain') {
          for (const [name, letter, tail] of [['root', 'R', 'ROOT_TAIL'], ['static', 'S', 'STATIC_TAIL']]) {
            assert.ok(name && letter && tail);
            const log = await readFile(join(root, `${name}.log`), 'utf8');
            assert.equal(log.replace(`${tail}\n`, ''), letter.repeat(262144));
            assert.ok(result.output.includes(tail));
          }
        } else {
          assert.equal(await marker(join(root, 'static-done')), '');
          assert.match(result.output, /static: exit/);
          if (scenario === 'root-fails' || scenario === 'both-fail') assert.match(result.output, /ROOT_REFUSAL/);
          if (scenario === 'static-fails') assert.equal(await marker(join(root, 'root-done')), '');
          if (scenario === 'static-fails' || scenario === 'both-fail') {
            assert.match(result.output, /STATIC_FIRST/);
            assert.doesNotMatch(result.output, /STATIC_LATER/);
            assert.match(result.output, /static: exit 9/);
          }
          if (scenario === 'spawn-fails') assert.match(result.output, /ENOENT/);
        }
      } finally {
        if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill('SIGTERM');
        await run.result;
        await rm(root, { recursive: true, force: true });
      }
    });
  }

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    test(`${signal} drains EOF child, terminates owned descendants, and leaves foreign child alive`, { timeout: 15000 }, async () => {
      const root = await mkdtemp(join(tmpdir(), 'static-quality-cancel-'));
      const foreign = spawn('/usr/bin/sleep', ['30'], { stdio: 'ignore' });
      const foreignDone = new Promise<void>(done => foreign.once('close', () => done()));
      const run = start(root, 'cancel');
      let group: number | undefined;
      try {
        await marker(join(root, 'root-ready'));
        await marker(join(root, 'static-ready'));
        group = Number(await marker(join(root, 'static-pid')));
        const descendant = Number(await marker(join(root, 'grandchild-pid')));
        assert.ok(Number.isInteger(group) && group > 0 && descendant > 0);
        const started = performance.now();
        assert.equal(run.child.kill(signal), true);
        const result = await run.result;
        assert.equal(result.signal, null);
        assert.equal(result.code, signal === 'SIGINT' ? 130 : 143, result.output);
        assert.ok(performance.now() - started < 10000, 'cancellation must be bounded');
        assert.equal(await marker(join(root, 'root-drained')), '');
        assert.match(result.output, /ROOT_DRAINED/);
        assert.equal(await gone(group), true);
        assert.equal(await gone(descendant), true);
        assert.equal(foreign.exitCode, null);
        assert.equal(foreign.signalCode, null);
        assert.ok(foreign.pid);
        process.kill(foreign.pid, 0);
      } finally {
        if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill('SIGTERM');
        await run.result;
        if (group !== undefined) {
          try { process.kill(-group, 'SIGKILL'); } catch (error) {
            assert.equal((error as NodeJS.ErrnoException).code, 'ESRCH');
          }
        }
        foreign.kill('SIGTERM');
        await foreignDone;
        await rm(root, { recursive: true, force: true });
      }
    });
  }
}
