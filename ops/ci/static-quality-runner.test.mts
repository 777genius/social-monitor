import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import type { WriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
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
const delay = (ms: number): Promise<void> => new Promise(done => setTimeout(done, ms));
const observation = async (path: string): Promise<string> => {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    try { return await readFile(path, 'utf8'); } catch { await delay(20); }
  }
  throw new Error(`Missing child observation: ${path}`);
};

// Fresh synthetic tree: the leader exits on TERM while its same-group descendant
// ignores TERM/INT and closes all supervisor output descriptors.
async function tree(root: string, mode: string): Promise<void> {
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
  await writeFile(join(root, 'leader-pid'), String(process.pid));
  spawn(process.execPath, ['--experimental-strip-types', self, 'leaf', root], { stdio: 'ignore' });
  await observation(join(root, 'leaf-pid'));
  console.log('TREE_TAIL');
  await writeFile(join(root, 'tree-ready'), '');
  if (mode === 'success' || mode === 'failure') process.exit(mode === 'success' ? 0 : 7);
  setInterval(() => {}, 1000);
}

async function guardianCopy(root: string, mode: string): Promise<string> {
  const snapshot = join(root, 'snapshot');
  await mkdir(join(snapshot, 'python/bin'), { recursive: true });
  await mkdir(join(snapshot, 'ops/release/hetzner'), { recursive: true });
  await mkdir(join(snapshot, 'ops/ci/release-e2e-fixture'), { recursive: true });
  await symlink('/usr/bin/python3', join(snapshot, 'python/bin/python3'));
  const source = await readFile(new URL('./static-quality-root.sh', import.meta.url), 'utf8');
  const helper = join(snapshot, 'ops/ci/static-quality-root.sh');
  // Only the canonical TEST snapshot path is remapped; the guardian algorithm,
  // four command sequence, interpreter flags and cancellation input are intact.
  await writeFile(helper, source.replaceAll('/root/social-monitor-release-contract-tests', snapshot));
  await writeFile(join(snapshot, 'ops/release/hetzner/check.sh'),
    `exec ${quote(process.execPath)} --experimental-strip-types ${quote(self)} tree ${quote(root)} ${quote(mode)}\n`);
  for (const [index, path] of ['release-e2e-driver_test.py', 'release-e2e-fixture/operator_test.py',
    'release-database-plan_test.py'].entries()) {
    await writeFile(join(snapshot, 'ops/ci', path),
      `with open(${JSON.stringify(join(root, 'commands'))}, 'a') as trace: trace.write('${index + 2}\\n')\n`);
  }
  return helper;
}

async function fixture(root: string, scenario: string): Promise<number> {
  const marker = (name: string): string => quote(join(root, name));
  if (scenario === 'logging-fails') {
    const rootTree = join(root, 'root-tree'), staticTree = join(root, 'static-tree');
    await mkdir(staticTree);
    const helper = await guardianCopy(rootTree, 'SIGTERM');
    const original = fs.createWriteStream;
    const sink: { log?: WriteStream } = {};
    // Injection is confined to this synthetic fixture process. Production logging
    // is unchanged; a real writable stream emits its ordinary I/O error event.
    fs.createWriteStream = (path, options) => {
      const log = original(path, options);
      if (String(path) === join(root, 'root.log')) sink.log = log;
      return log;
    };
    syncBuiltinESMExports();
    let joined: Promise<number>;
    try {
      joined = supervise([
        { name: 'root', command: '/usr/bin/bash', args: ['--noprofile', '--norc', helper], cancellation: 'eof' },
        { name: 'static', command: process.execPath,
          args: ['--experimental-strip-types', self, 'tree', staticTree, 'failure'], cancellation: 'group' },
      ], root);
    } finally {
      fs.createWriteStream = original;
      syncBuiltinESMExports();
    }
    await observation(join(rootTree, 'tree-ready'));
    await observation(join(staticTree, 'tree-ready'));
    const leader = Number(await observation(join(staticTree, 'leader-pid')));
    const deadline = performance.now() + 5000;
    while (true) {
      try {
        const stat = await readFile(`/proc/${leader}/stat`, 'utf8');
        if (stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z ')) break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
        throw error;
      }
      assert.ok(performance.now() < deadline, 'failure command exits before the log error');
      await delay(20);
    }
    assert.ok(sink.log);
    sink.log.destroy(new Error('SYNTHETIC_LOG_IO_FAILURE'));
    return joined;
  }
  if (scenario.startsWith('orphan-')) {
    return supervise([
      shell('root', 'echo ROOT_OK'),
      { name: 'static', command: process.execPath,
        args: ['--experimental-strip-types', self, 'tree', root, scenario.slice('orphan-'.length)], cancellation: 'group' },
    ], root);
  }
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

if (process.argv[2] === 'leaf') {
  const root = process.argv[3];
  assert.ok(root);
  process.on('SIGTERM', () => {});
  process.on('SIGINT', () => {});
  await writeFile(join(root, 'leaf-pid'), String(process.pid));
  setInterval(() => {}, 1000);
} else if (process.argv[2] === 'tree') {
  const root = process.argv[3], mode = process.argv[4];
  assert.ok(root && mode);
  await tree(root, mode);
} else if (process.argv[2] === 'fixture') {
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
        if (group !== undefined && !await gone(group)) {
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

  for (const supervisor of ['runner', 'guardian'] as const) {
    for (const mode of ['success', 'failure', 'SIGTERM', 'SIGINT', 'EOF'] as const) {
      if (supervisor === 'runner' && mode === 'EOF') continue;
      test(`${supervisor} drains redirected orphan after ${mode}, pins ownership, preserves status`,
        { timeout: 15000 }, async () => {
        const root = await mkdtemp(join(tmpdir(), 'static-quality-orphan-'));
        const foreign = spawn('/usr/bin/sleep', ['30'], { stdio: 'ignore' });
        const foreignDone = new Promise<void>(done => foreign.once('close', () => done()));
        const command = supervisor === 'guardian' ? await guardianCopy(root, mode) : undefined;
        const run = command === undefined ? start(root, `orphan-${mode}`) : (() => {
          const child = spawn('/usr/bin/bash', ['--noprofile', '--norc', command], {
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          let output = '';
          child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
          child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
          const result = new Promise<{ code: number | null; signal: NodeJS.Signals | null; output: string }>((done, reject) => {
            child.once('error', reject);
            child.once('close', (code, signal) => done({ code, signal, output }));
          });
          return { child, result };
        })();
        let leaf: number | undefined;
        try {
          await marker(join(root, 'tree-ready'));
          leaf = Number(await marker(join(root, 'leaf-pid')));
          const leader = Number(await marker(join(root, 'leader-pid')));
          assert.ok(Number.isInteger(leaf) && leaf > 0 && leader > 0);
          const stat = await readFile(`/proc/${leaf}/stat`, 'utf8');
          const group = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2]);
          const started = performance.now();
          if (mode === 'EOF') run.child.stdin?.end();
          else if (mode === 'SIGTERM' || mode === 'SIGINT') assert.equal(run.child.kill(mode), true);
          const deadline = performance.now() + 5000;
          while (!await gone(leader) && performance.now() < deadline) await delay(20);
          assert.equal(await gone(leader), true, 'command exits before TERM escalation');
          assert.ok(group > 0 && group !== leader && group !== process.pid, 'separate owned group keeper');
          assert.equal(await gone(group), false, 'keeper pins group until drain completes');
          const result = await run.result;
          assert.equal(result.signal, null, result.output);
          const status = mode === 'success' ? 0 : mode === 'failure' ? (supervisor === 'runner' ? 1 : 7)
            : mode === 'SIGINT' && supervisor === 'runner' ? 130 : 143;
          assert.equal(result.code, status, result.output);
          assert.ok(performance.now() - started < 10000, 'completion and cancellation drain must be bounded');
          assert.match(result.output, /TREE_TAIL/);
          if (supervisor === 'runner' && mode === 'failure') assert.match(result.output, /static: exit 7/);
          if (supervisor === 'guardian' && mode === 'success') {
            assert.equal(await readFile(join(root, 'commands'), 'utf8'), '2\n3\n4\n');
          }
          if (supervisor === 'guardian' && mode === 'failure') {
            await assert.rejects(readFile(join(root, 'commands')), { code: 'ENOENT' });
          }
          assert.equal(await gone(leader), true, 'original command must exit before escalation');
          assert.equal(await gone(group), true, 'owned keeper must also be drained');
          assert.equal(await gone(leaf), true, 'redirected TERM-resistant descendant must be drained');
          assert.equal(foreign.exitCode, null);
          assert.equal(foreign.signalCode, null);
          assert.ok(foreign.pid);
          process.kill(foreign.pid, 0);
        } finally {
          if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill('SIGTERM');
          await run.result;
          // Only a still-live recorded synthetic descendant is cleaned up on an
          // old-source regression failure; never signal an expired process group.
          if (leaf !== undefined && !await gone(leaf)) process.kill(leaf, 'SIGKILL');
          foreign.kill('SIGTERM');
          await foreignDone;
          await rm(root, { recursive: true, force: true });
        }
      });
    }
  }

  test('log I/O failure joins root EOF drain and preserves completed command status without orphans',
    { timeout: 15000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'static-quality-log-failure-'));
    const foreign = spawn('/usr/bin/sleep', ['30'], { stdio: 'ignore' });
    const foreignDone = new Promise<void>(done => foreign.once('close', () => done()));
    const run = start(root, 'logging-fails');
    const leaves: number[] = [];
    try {
      for (const lane of ['root-tree', 'static-tree']) {
        leaves.push(Number(await marker(join(root, lane, 'leaf-pid'))));
      }
      const result = await run.result;
      assert.equal(result.signal, null, result.output);
      assert.equal(result.code, 143, result.output);
      assert.match(result.output, /root: exit 143/);
      assert.match(result.output, /static: exit 7/);
      assert.match(result.output, /TREE_TAIL/);
      for (const leaf of leaves) {
        assert.ok(Number.isInteger(leaf) && leaf > 0);
        assert.equal(await gone(leaf), true, 'both lanes drain after logging fails');
      }
      assert.equal(foreign.exitCode, null);
      assert.equal(foreign.signalCode, null);
      assert.ok(foreign.pid);
      process.kill(foreign.pid, 0);
    } finally {
      if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill('SIGTERM');
      await run.result;
      for (const leaf of leaves) if (!await gone(leaf)) process.kill(leaf, 'SIGKILL');
      foreign.kill('SIGTERM');
      await foreignDone;
      await rm(root, { recursive: true, force: true });
    }
  });
}
