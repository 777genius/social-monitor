import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

const runnerSource = readFileSync('scripts/run-retained-metric-native-gate.mjs', 'utf8');
const guardSource = readFileSync('scripts/retained-metric-native-startup-guard.py', 'utf8');
function live(pid) {
  try { return !['Z', 'X'].includes(readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[0]); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function until(check) {
  const deadline = performance.now() + 2500;
  while (!check()) {
    assert.ok(performance.now() < deadline, 'process observation exceeded 2500ms');
    await sleep(10);
  }
}
for (const beforeInit of [false, true]) {
  test(`watchdog SIGKILL cleans private fixture group; before guard init=${beforeInit}`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'native-parent-death-'));
    const pidFile = join(root, 'pids.json');
    const release = join(root, 'release');
    const fixture = join(root, 'fixture.cjs');
    const preload = join(root, 'preload.cjs');
    const runner = join(root, 'runner.mjs');
    let ownedPids = [];
    let watchdog;
    try {
      writeFileSync(fixture, 'throw new Error("Blocked preload must not return");');
      writeFileSync(preload, `
        const fs = require('node:fs');
        const descendant = require('node:child_process').spawn(process.execPath,
          ['-e', 'process.on("SIGTERM", () => {}); while (true) {}'], {stdio: 'ignore'});
        fs.writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify([process.ppid, process.pid, descendant.pid]));
        while (true) {}
      `);
      let copy = runnerSource;
      for (const [from, to] of [
        ['const originalDeadlineMs = 120_000;', 'const originalDeadlineMs = 800;'],
        ['const totalDeadlineMs = 900_000;', 'const totalDeadlineMs = 1600;'],
        ["const fixtureArgs = ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'scripts/check-retained-metric-refresh-postgres.ts'];", `const fixtureArgs = ${JSON.stringify(['-r', preload, fixture])};`],
      ]) {
        assert.equal(copy.split(from).length, 2);
        copy = copy.replace(from, to);
      }
      writeFileSync(runner, copy);
      // Disposable instrumentation pauses BEFORE the production guard installs prctl.
      // The real guard then runs unchanged after its original parent is already dead.
      const pause = `import os, time, json\nwith open(${JSON.stringify(pidFile)}, 'w') as f: json.dump([os.getpid()], f)\nwhile not os.path.exists(${JSON.stringify(release)}): time.sleep(0.01)\n`;
      writeFileSync(join(root, 'retained-metric-native-startup-guard.py'), (beforeInit ? pause : '') + guardSource);
      watchdog = spawn(process.execPath, [runner], { cwd: root, stdio: 'ignore' });
      const exited = new Promise(resolve => watchdog.once('exit', (code, signal) => resolve({ code, signal })));
      await until(() => existsSync(pidFile));
      ownedPids = JSON.parse(readFileSync(pidFile, 'utf8'));
      assert.ok(ownedPids.every(live));
      const started = performance.now();
      assert.equal(watchdog.kill('SIGKILL'), true); // Only our watchdog; no fixture/guard kill.
      await until(() => watchdog.signalCode !== null);
      assert.deepEqual(await exited, { code: null, signal: 'SIGKILL' });
      if (beforeInit) writeFileSync(release, 'release');
      await until(() => ownedPids.every(pid => !live(pid)));
      assert.ok(performance.now() - started < 2500);
      assert.deepEqual(JSON.parse(readFileSync(pidFile, 'utf8')), ownedPids, 'No fixture may start after parent death');
    } finally {
      // Emergency cleanup is after all no-live assertions and cannot make them pass.
      if (watchdog?.exitCode === null && watchdog?.signalCode === null) watchdog.kill('SIGKILL');
      if (ownedPids[0]) {
        try { process.kill(-ownedPids[0], 'SIGKILL'); }
        catch (error) { assert.equal(error.code, 'ESRCH'); }
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
}
