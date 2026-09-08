import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Test-only source injection into a private disposable copy. Production exposes no overrides.
const source = readFileSync('scripts/run-retained-metric-native-gate.mjs', 'utf8');
function probe(body, original = 1500, total = 3000, startup = '') {
  const root = mkdtempSync(join(tmpdir(), 'native-watchdog-test-'));
  try {
    const fixture = join(root, 'fixture.cjs');
    const preload = join(root, 'preload.cjs');
    writeFileSync(preload, startup);
    writeFileSync(fixture, body);
    let copy = source;
    for (const [from, to] of [
      ['const originalDeadlineMs = 120_000;', `const originalDeadlineMs = ${original};`],
      ['const totalDeadlineMs = 900_000;', `const totalDeadlineMs = ${total};`],
      ["const fixtureArgs = ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'scripts/check-retained-metric-refresh-postgres.ts'];", `const fixtureArgs = ${JSON.stringify(['-r', preload, fixture])};`],
    ]) {
      assert.equal(copy.split(from).length, 2);
      copy = copy.replace(from, to);
    }
    const runner = join(root, 'runner.mjs');
    writeFileSync(runner, copy);
    const started = performance.now();
    const result = spawnSync(process.execPath, [runner], { encoding: 'utf8', timeout: 8000 });
    assert.equal(result.error, undefined);
    return { ...result, elapsed: performance.now() - started };
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const block = 'console.error("BLOCK_STARTED"); while (true) {}';
const renewal = `process.send('native-metric:renewal'); process.once('message', () => { BODY });`;
for (const mode of ['import', 'original']) {
  test(`independent parent kills nonyielding ${mode} before block can return`, () => {
    const result = probe(mode === 'original' ? block : 'console.log("UNREACHABLE")', 1500, 6000, mode === 'import' ? block : '');
    assert.equal(result.status, 124);
    assert.match(result.stderr, /BLOCK_STARTED/);
    assert.match(result.stderr, /absolute 1500ms/);
    assert.ok(result.elapsed >= 1500 && result.elapsed < 5000, String(result.elapsed));
    assert.doesNotMatch(result.stdout, /UNREACHABLE/);
  });
}
test('renewal keeps absolute total deadline through blocked cleanup', () => {
  const result = probe(renewal.replace('BODY', block));
  assert.equal(result.status, 124);
  assert.match(result.stderr, /absolute 3000ms/);
  assert.ok(result.elapsed >= 3000 && result.elapsed < 5000, String(result.elapsed));
});
for (const body of [
  'process.exit(0)',
  "process.send('native-metric:completed')",
  renewal.replace('BODY', "process.send('native-metric:renewal')"),
  "process.send({phase:'renewal'})",
]) test(`fails closed: ${body}`, () => { assert.equal(probe(body).status, 1); });
test('accepts mandatory renewal and completed cleanup exactly once', () => {
  const result = probe(renewal.replace('BODY', "process.send('native-metric:completed'); process.once('message', () => process.disconnect())"));
  assert.equal(result.status, 0, result.stderr);
});
test('preserves stderr and nonzero exit code', () => {
  const result = probe('console.error("fixture failure"); process.exit(17)');
  assert.equal(result.status, 17);
  assert.match(result.stderr, /fixture failure/);
});
test('reports child signal', () => {
  const result = probe("process.kill(process.pid, 'SIGTERM')");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SIGTERM/);
});

test('late exceptional original/renewal work and cleanup exit 124; early errors survive', async () => {
  const { createRequire } = await import('node:module');
  const ts = createRequire(import.meta.url)('typescript');
  const compiled = ts.transpileModule(readFileSync('scripts/lib/retained-metric-native-budget.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  }).outputText;
  const integrated = probe(compiled + '\nexports.runWithNativeMetricBudget(async budget => { await budget.runRenewal(async () => {}); }).catch(error => { console.error(error); process.exitCode = 1; });');
  assert.equal(integrated.status, 0, integrated.stderr);
  for (const phase of ['original', 'renewal', 'outer-cleanup']) for (const cleanup of [false, true]) for (const late of [false, true]) {
    const body = `
      let elapsed = 0;
      process.uptime = () => elapsed / 1000;
      process.connected = true;
      process.send = (message, callback) => { queueMicrotask(() => process.emit('message', message + ':accepted')); callback(null); };
      ${compiled}
      const fail = async () => {
        const reject = () => { elapsed = ${late ? phase === 'original' ? 120001 : 900001 : 100}; throw new Error('TEST settlement failure'); };
        if (${cleanup}) { try { await Promise.resolve(); } finally { reject(); } }
        else reject();
      };
      exports.runWithNativeMetricBudget(async budget => {
        ${phase === 'original' ? 'await fail();' : phase === 'renewal' ? 'await budget.runRenewal(fail);' : 'await budget.runRenewal(async () => {}); await fail();'}
      }).catch(error => { console.error(error.message); process.exitCode = 19; });
    `;
    const result = spawnSync(process.execPath, ['-e', body], { encoding: 'utf8', timeout: 3000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, late ? 124 : 19, `${phase} cleanup=${cleanup} late=${late}: ${result.stderr}`);
    assert.match(result.stderr, late ? /process budget/ : /TEST settlement failure/);
  }
});

 test('watchdog kills descendants that ignore SIGTERM', () => {
  const result = probe(`
    const child = require('node:child_process').spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'], {stdio:'ignore'});
    console.log('DESCENDANT=' + child.pid);
    while (true) {}
  `);
  assert.equal(result.status, 124);
  const pid = Number(/DESCENDANT=(\d+)/.exec(result.stdout)?.[1]);
  assert.ok(pid > 0);
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    assert.match(stat, /\) Z /); // Dead; adopted zombie awaiting the host init reaper.
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
 });
test('late valid transition never resets the absolute total timer', () => {
  const result = probe(`setTimeout(() => { ${renewal.replace('BODY', block)} }, 1000);`, 2200, 3000);
  assert.equal(result.status, 124);
  assert.match(result.stderr, /BLOCK_STARTED/);
  assert.match(result.stderr, /absolute 3000ms/);
  assert.ok(result.elapsed >= 3000 && result.elapsed < 3950, String(result.elapsed));
});
test('relays outer watchdog termination to the blocked fixture group', () => {
  const result = probe("process.kill(process.ppid, 'SIGTERM'); while (true) {}", 1500, 3000);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /watchdog received SIGTERM/);
  assert.match(result.stderr, /SIGKILL/);
});
