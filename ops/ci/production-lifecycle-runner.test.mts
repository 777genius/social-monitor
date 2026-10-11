import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, fstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { lifecycleCommands, runLifecycle } from './production-lifecycle-runner.mts';
import type { LifecycleCommand } from './production-lifecycle-runner.mts';
import { ownedCgroupPath } from './production-lifecycle-keeper.mts';
import type { KeeperEvent, Launch } from './production-lifecycle-keeper.mts';

const self = fileURLToPath(import.meta.url);
const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;
async function until(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'synthetic child handshake timed out');
    await delay(10);
  }
}

function processStat(pid: number): { state: string; group: string; session: string; start: string } {
  const raw = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
  const state = fields[0], group = fields[2], session = fields[3], start = fields[19];
  assert.ok(state && group && session && start);
  return { state, group, session, start };
}

// The fixture is this same strictly typechecked MTS file, never a real lifecycle job.
async function fixture(root: string, id: string, mode: string): Promise<void> {
  const mark = (event: string): void => appendFileSync(path.join(root, 'events'), `${event} ${id}\n`);
  if (mode === 'barrier-probe') {
    const pid = Number(readFileSync(path.join(root, 'early-desc.pid'), 'utf8'));
    const start = readFileSync(path.join(root, 'early-desc.identity'), 'utf8');
    try {
      const current = processStat(pid);
      assert.ok(current.start !== start || current.state === 'Z', 'serial barrier admitted with a live owned descendant');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    writeFileSync(path.join(root, `${id}.pid`), String(process.pid));
    process.exit(0);
  }
  if (mode.startsWith('early-')) {
    const descendant = spawn(process.execPath, ['--experimental-strip-types', self, '--fixture', root, `${id}-desc`, 'stubborn'],
      { detached: true, stdio: 'ignore' });
    descendant.unref();
    await until(() => existsSync(path.join(root, `${id}-desc.heartbeat`)));
    writeFileSync(path.join(root, `${id}.pid`), String(process.pid));
    process.exit(Number(mode.slice('early-'.length)));
  }
  if (mode === 'stubborn') {
    process.on('SIGTERM', () => {});
    writeFileSync(path.join(root, `${id}.pid`), String(process.pid));
    writeFileSync(path.join(root, `${id}.identity`), processStat(process.pid).start);
    setInterval(() => writeFileSync(path.join(root, `${id}.heartbeat`), String(Date.now())), 20);
    return;
  }
  if (mode === 'tree' || mode === 'tree-setsid') {
    const descendant = spawn(process.execPath, ['--experimental-strip-types', self, '--fixture', root, `${id}-desc`, 'stubborn'],
      { detached: mode === 'tree-setsid', stdio: 'ignore' });
    await until(() => existsSync(path.join(root, `${id}-desc.heartbeat`)));
    assert.ok(descendant.pid);
    // Make the descendant TERM resistant and allow the leader to exit first.
    process.on('SIGTERM', () => process.exit(0));
  }
  if (mode === 'failure-pipe') {
    const descendant = spawn(process.execPath, ['--experimental-strip-types', self, '--fixture', root, `${id}-pipe`, 'normal'],
      { stdio: ['ignore', process.stdout, process.stderr] });
    descendant.unref();
    await until(() => existsSync(path.join(root, `${id}-pipe.pid`)));
  }
  writeFileSync(path.join(root, `${id}.pid`), String(process.pid));
  writeFileSync(path.join(root, `${id}.context`), JSON.stringify({ cwd: process.cwd(), env: process.env['LIFECYCLE_SYNTHETIC'] }));
  writeFileSync(path.join(root, `${id}.process-context`), JSON.stringify({
    ...processStat(process.pid), uid: process.getuid!(), gid: process.getgid!(), groups: process.getgroups!(),
  }));
  mark('start');
  await until(() => existsSync(path.join(root, `${id}.release`)));
  const code = Number(readFileSync(path.join(root, `${id}.release`), 'utf8'));
  process.stdout.write(`synthetic stdout ${id}\n`);
  process.stderr.write(`synthetic stderr ${id}\n`);
  mark('end');
  process.exit(code);
}

async function scenario(body: (root: string, signal: AbortSignal) => Promise<void>): Promise<void> {
  const directory = path.join(process.cwd(), '.cache', 'ci-lifecycle-pool');
  await mkdir(directory, { recursive: true });
  const root = await mkdtemp(path.join(directory, 'synthetic-'));
  const controller = new AbortController();
  const previous = process.env['LIFECYCLE_SYNTHETIC'];
  process.env['LIFECYCLE_SYNTHETIC'] = root;
  try { await body(root, controller.signal); }
  finally {
    if (previous === undefined) delete process.env['LIFECYCLE_SYNTHETIC'];
    else process.env['LIFECYCLE_SYNTHETIC'] = previous;
    controller.abort(); await delay(3_100); await rm(root, { recursive: true, force: true });
  }
}
function command(root: string, id: string, safe?: boolean, mode = 'normal'): LifecycleCommand {
  const command = `exec ${[process.execPath, '--experimental-strip-types', self, '--fixture', root, id, mode].map(quote).join(' ')}`;
  return safe === undefined ? { command } : { command, safe };
}
const started = (root: string, id: string): boolean => existsSync(path.join(root, `${id}.pid`));
const release = async (root: string, id: string, code = 0): Promise<void> => writeFile(path.join(root, `${id}.release`), String(code));

if (process.argv[2] === '--fixture') {
  const [root, id, mode] = process.argv.slice(3);
  assert.ok(root && id && mode);
  await fixture(root, id, mode);
} else {
  test('actual registry preserves the independent original package chain and 18 SAFE positions', () => {
    const current = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
    const chain = current.scripts['check:production-deploy-lifecycle:serial'];
    assert.ok(chain, 'primary integration must preserve the original independent :serial package contract');
    const expected = chain.split(' && ');
    assert.equal(expected.length, 28);
    assert.deepEqual(lifecycleCommands.map(entry => entry.command), expected);
    assert.equal(new Set(lifecycleCommands.map(entry => entry.command)).size, 28);
    assert.deepEqual(lifecycleCommands.flatMap((entry, index) => entry.safe === true ? [index + 1] : []),
      [2, 3, 4, 7, 8, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 25, 27, 28]);
  });

  for (const code of [0, 7]) {
    test(`early leader exit=${code} drains redirected setsid descendants before settlement`, async () => scenario(async root => {
      const controller = new AbortController();
      const running = runLifecycle([command(root, 'early', undefined, `early-${code}`), command(root, 'barrier', undefined, 'barrier-probe')],
        { signal: controller.signal, stdout: () => {}, stderr: () => {} });
      try {
        assert.equal(await running, code);
        assert.equal(started(root, 'barrier'), code === 0);
        const heartbeat = readFileSync(path.join(root, 'early-desc.heartbeat'), 'utf8');
        await delay(100);
        assert.equal(readFileSync(path.join(root, 'early-desc.heartbeat'), 'utf8'), heartbeat, 'owned setsid descendant survived command settlement');
      } finally {
        controller.abort();
        await running;
      }
    }));
  }

  test('START sink exception stops pending admissions and drains scheduled execution before rejecting', async () => scenario(async root => {
    const controller = new AbortController();
    const expected = new Error('synthetic output sink failure');
    const running = runLifecycle([command(root, 'a', true), command(root, 'b', true), command(root, 'queued', true)], {
      signal: controller.signal,
      stdout: text => { if (text.includes('[lifecycle 2] START')) throw expected; }, stderr: () => {},
    });
    const rejected = assert.rejects(running, error => error === expected);
    try {
      await rejected;
      // Command one can be cancelled before reaching its fixture handshake.
      if (started(root, 'a')) {
        const pid = Number(readFileSync(path.join(root, 'a.pid'), 'utf8'));
        assert.throws(() => process.kill(pid, 0), /ESRCH/, 'sink rejection escaped without draining its scheduled sibling');
      }
      assert.equal(started(root, 'queued'), false);
    } finally { controller.abort(); await delay(3_100); }
  }));

  test('recycled ownership and ordinary directories fail closed before signalling', () => {
    const fd = openSync(new URL('.', import.meta.url), 'r');
    try {
      const identity = fstatSync(fd);
      assert.throws(() => ownedCgroupPath({ fd, dev: identity.dev, ino: identity.ino + 1 }), /pinned cgroup/);
      assert.throws(() => ownedCgroupPath({ fd, dev: identity.dev, ino: identity.ino }), /pinned cgroup/);
    } finally { closeSync(fd); }
  });

  test('missing Linux cgroup containment fails closed without executing the command', {
    skip: existsSync('/sys/fs/cgroup') ? 'requires the worker with no cgroup mount' : false,
  }, async () => scenario(async root => {
    await assert.rejects(runLifecycle([command(root, 'never')], { stdout: () => {}, stderr: () => {} }), /ENOENT|cgroup/);
    assert.equal(started(root, 'never'), false);
  }));

  test('real keeper bootstrap rejects a foreign directory before attachment and admission', async () => scenario(async root => {
    const fd = openSync(root, 'r');
    const child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./production-lifecycle-keeper.mts', import.meta.url)), '--bootstrap'],
      { stdio: ['ignore', 'ignore', 'ignore', 'ipc', fd] });
    closeSync(fd);
    const closed = new Promise<number | null>(resolve => child.once('close', code => resolve(code)));
    const response = new Promise<KeeperEvent | 'attached'>((resolve, reject) => {
      child.once('message', resolve); child.once('error', reject);
      child.once('close', code => reject(new Error(`bootstrap closed before ownership response: ${code}`)));
    });
    const launch: Launch = { command: command(root, 'never').command, cwd: process.cwd(), env: process.env,
      uid: process.getuid!(), gid: process.getgid!(), groups: process.getgroups!() };
    try {
      child.send(launch);
      const event = await response;
      assert.notEqual(event, 'attached');
      assert.ok(typeof event === 'object' && event.kind === 'error');
      assert.match(event.message, /pinned cgroup/);
      assert.equal(started(root, 'never'), false);
      assert.equal(existsSync(path.join(root, 'cgroup.procs')), false);
      assert.equal(await closed, 1);
    } finally { if (child.connected) child.disconnect(); }
  }));

  test('stdout data sink exception cancels and drains both admitted commands', async () => scenario(async (root, signal) => {
    const expected = new Error('synthetic data sink failure');
    const running = runLifecycle([command(root, 'a', true), command(root, 'b', true), command(root, 'queued', true)], {
      signal, stdout: text => { if (text.includes('synthetic stdout a')) throw expected; }, stderr: () => {},
    });
    // Register rejection before asynchronous child output can reach the sink.
    const rejected = assert.rejects(running, error => error === expected);
    await until(() => started(root, 'a') && started(root, 'b'));
    const sibling = Number(readFileSync(path.join(root, 'b.pid'), 'utf8'));
    await release(root, 'a');
    await rejected;
    assert.throws(() => process.kill(sibling, 0), /ESRCH/);
    assert.equal(started(root, 'queued'), false);
  }));

  test('cancellation drains setsid descendants even when numeric signalling is denied', async () => scenario(async root => {
    const controller = new AbortController();
    const running = runLifecycle([command(root, 'a', true, 'tree-setsid'), command(root, 'b', true, 'tree-setsid'), command(root, 'queued', true)],
      { signal: controller.signal, stdout: () => {}, stderr: () => {} });
    await until(() => started(root, 'a') && started(root, 'b'));
    const kill = process.kill;
    try {
      process.kill = (): true => { throw Object.assign(new Error('synthetic signal EPERM'), { code: 'EPERM' }); };
      controller.abort();
      assert.equal(await running, 130);
      const a = readFileSync(path.join(root, 'a-desc.heartbeat'), 'utf8');
      const b = readFileSync(path.join(root, 'b-desc.heartbeat'), 'utf8');
      await delay(100);
      assert.equal(readFileSync(path.join(root, 'a-desc.heartbeat'), 'utf8'), a);
      assert.equal(readFileSync(path.join(root, 'b-desc.heartbeat'), 'utf8'), b);
      assert.equal(started(root, 'queued'), false);
    } finally { process.kill = kill; controller.abort(); await running; }
  }));
  // Catches excess lanes, LIFO admissions, early barriers, skipped/duplicate jobs,
  // and treating future unannotated commands as safe.
  test('max two FIFO, exactly once, serial default and drain on both sides', async () => scenario(async (root, signal) => {
    let logs = '';
    const ids = ['a', 'b', 'c', 'barrier', 'd', 'e'];
    const jobs = ids.map(id => command(root, id, id === 'barrier' ? undefined : true));
    const running = runLifecycle(jobs, { signal, stdout: text => { logs += text; }, stderr: () => {} });
    await until(() => started(root, 'a') && started(root, 'b'));
    assert.equal((logs.match(/ START /g) ?? []).length, 2);
    await release(root, 'b');
    await until(() => started(root, 'c'));
    await release(root, 'c');
    await until(() => logs.includes('[lifecycle 3] END exit=0'));
    assert.equal(started(root, 'barrier'), false, 'barrier must wait for a');
    await release(root, 'a');
    await until(() => started(root, 'barrier'));
    assert.equal(started(root, 'd'), false, 'next segment must wait for barrier');
    await release(root, 'barrier');
    await until(() => started(root, 'd') && started(root, 'e'));
    await Promise.all([release(root, 'd'), release(root, 'e')]);
    assert.equal(await running, 0);
    assert.deepEqual(logs.split('\n').filter(line => line.includes(' START ')).map(line => jobs.findIndex(job => line.endsWith(job.command))), [0, 1, 2, 3, 4, 5]);
    const events = readFileSync(path.join(root, 'events'), 'utf8').trim().split('\n');
    const active = new Set<string>();
    let maximum = 0;
    for (const event of events) {
      const [kind, id] = event.split(' ');
      assert.ok(id);
      if (kind === 'start') {
        assert.equal(active.has(id), false);
        if (id === 'barrier') assert.equal(active.size, 0);
        else assert.equal(active.has('barrier'), false);
        active.add(id); maximum = Math.max(maximum, active.size);
      } else { assert.equal(active.delete(id), true); }
    }
    assert.equal(maximum, 2); assert.equal(active.size, 0);
    assert.deepEqual(events.filter(event => event.startsWith('start ')).sort(), ids.map(id => `start ${id}`).sort());
    assert.equal((logs.match(/ END exit=0/g) ?? []).length, jobs.length);
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'a.context'), 'utf8')), { cwd: process.cwd(), env: root });
    const context = (id: string): { group: string; session: string; uid: number; gid: number; groups: number[] } =>
      JSON.parse(readFileSync(path.join(root, `${id}.process-context`), 'utf8')) as { group: string; session: string; uid: number; gid: number; groups: number[] };
    const a = context('a'), b = context('b'), parent = processStat(process.pid);
    assert.notEqual(a.group, parent.group); assert.notEqual(b.group, parent.group);
    assert.notEqual(a.group, b.group); assert.notEqual(a.session, b.session);
    for (const current of [a, b]) {
      assert.equal(current.uid, process.getuid!()); assert.equal(current.gid, process.getgid!());
      assert.deepEqual(current.groups, process.getgroups!());
    }
  }));

  // Catches last-zero overwriting failure, early serial launch, missing output,
  // and abandoning an already active sibling instead of draining it.
  for (const siblingCode of [0, 9]) {
    test(`first failure stops queued SAFE and SERIAL, drains sibling exit=${siblingCode}`, async () => scenario(async (root, signal) => {
      let logs = '', errors = '', settled = false;
      const running = runLifecycle([
        command(root, 'a', true), command(root, 'b', true), command(root, 'queued', true), command(root, 'barrier'),
      ], { signal, stdout: text => { logs += text; }, stderr: text => { errors += text; } });
      void running.then(() => { settled = true; });
      await until(() => started(root, 'a') && started(root, 'b'));
      await release(root, 'a', 7);
      await until(() => logs.includes('[lifecycle 1] END exit=7'));
      assert.equal(settled, false); assert.equal(started(root, 'queued'), false);
      await release(root, 'b', siblingCode);
      assert.equal(await running, 7);
      assert.equal(started(root, 'barrier'), false); assert.equal(started(root, 'queued'), false);
      assert.match(logs, /synthetic stdout a/); assert.match(errors, /synthetic stderr a/);
      assert.match(logs, new RegExp(`END exit=${siblingCode}`));
    }));
  }

  // Catches observing only 'close': failure must stop admissions even when a
  // descendant keeps the failed child's stdout/stderr pipes open.
  test('failure stops admissions before inherited log pipes close', async () => scenario(async (root, signal) => {
    let logs = '';
    const running = runLifecycle([command(root, 'a', true, 'failure-pipe'), command(root, 'b', true), command(root, 'queued', true), command(root, 'barrier')],
      { signal, stdout: text => { logs += text; }, stderr: () => {} });
    await until(() => started(root, 'a') && started(root, 'b'));
    const pid = Number(readFileSync(path.join(root, 'a.pid'), 'utf8'));
    await release(root, 'a', 7);
    await until(() => {
      try { process.kill(pid, 0); return false; } catch { return true; }
    });
    // The keeper actively drains the inherited pipes after leader exit.
    // END may already be present; it must always retain the leader's status.
    await release(root, 'b');
    await until(() => logs.includes('[lifecycle 2] END exit=0'));
    assert.equal(started(root, 'queued'), false);
    assert.equal(await running, 7);
    assert.match(logs, /\[lifecycle 1\] END exit=7/);
    assert.equal(started(root, 'barrier'), false);
  }));

  // Catches a late failing sibling hidden by an earlier successful completion.
  test('successful first child cannot hide late sibling failure or admit barrier', async () => scenario(async (root, signal) => {
    let logs = '';
    const running = runLifecycle([command(root, 'a', true), command(root, 'b', true), command(root, 'barrier')],
      { signal, stdout: text => { logs += text; }, stderr: () => {} });
    await until(() => started(root, 'a') && started(root, 'b'));
    await release(root, 'a'); await until(() => logs.includes('[lifecycle 1] END exit=0'));
    assert.equal(started(root, 'barrier'), false);
    await release(root, 'b', 9); assert.equal(await running, 9);
    assert.equal(started(root, 'barrier'), false);
  }));

  // Catches killing only the shell, clearing escalation when the leader exits,
  // unbounded cancellation, launching queued work, and killing foreign processes.
  test('cancellation bounds owned cleanup including TERM-resistant detached-pipe descendants', async () => scenario(async (root) => {
    const foreign = spawn(process.execPath, ['--experimental-strip-types', self, '--fixture', root, 'foreign', 'stubborn'], { stdio: 'ignore' });
    const controller = new AbortController();
    let running: Promise<number> | undefined;
    try {
      await until(() => existsSync(path.join(root, 'foreign.heartbeat')));
      running = runLifecycle([command(root, 'a', true, 'tree'), command(root, 'b', true, 'tree'), command(root, 'queued', true), command(root, 'barrier')],
        { signal: controller.signal, stdout: () => {}, stderr: () => {} });
      await until(() => started(root, 'a') && started(root, 'b'));
      const before = Date.now(); controller.abort();
      assert.notEqual(await running, 0); assert.ok(Date.now() - before < 4_000);
      assert.equal(started(root, 'queued'), false); assert.equal(started(root, 'barrier'), false);
      const heartbeat = (id: string): string => readFileSync(path.join(root, `${id}.heartbeat`), 'utf8');
      const a = heartbeat('a-desc'), b = heartbeat('b-desc'), f = heartbeat('foreign');
      await delay(100);
      assert.equal(heartbeat('a-desc'), a); assert.equal(heartbeat('b-desc'), b);
      assert.notEqual(heartbeat('foreign'), f);
      assert.ok(foreign.pid); process.kill(foreign.pid, 0);
    } finally {
      controller.abort(); if (running) await running;
      const closed = new Promise<void>(resolve => foreign.once('close', () => resolve()));
      foreign.kill('SIGKILL'); await closed;
    }
  }));

  test('already cancelled admits nothing; shell failure remains nonzero', async () => {
    const controller = new AbortController(); controller.abort();
    let logs = '';
    assert.equal(await runLifecycle([{ command: 'exit 0', safe: true }], { signal: controller.signal, stdout: text => { logs += text; } }), 130);
    assert.equal(logs, '');
    assert.equal(await runLifecycle([{ command: 'exit 23' }, { command: 'exit 0', safe: true }], { stdout: () => {}, stderr: () => {} }), 23);
  });
}
