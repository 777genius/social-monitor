#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

// Fixed production entrypoint: no argv/env overrides or test budget seam.
const originalDeadlineMs = 120_000;
const totalDeadlineMs = 900_000;
const fixtureArgs = ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'scripts/check-retained-metric-refresh-postgres.ts'];
const started = performance.now();
// Linux parent-death enforcement is installed before the fixture can start.
const guard = fileURLToPath(new URL('./retained-metric-native-startup-guard.py', import.meta.url));
const child = spawn('/usr/bin/python3', ['-I', '-B', guard, String(process.pid), process.execPath, ...fixtureArgs], {
  detached: true,
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
});
let phase = 'original';
let forcedCode;
let finalized = false;
const elapsed = () => performance.now() - started;
const killGroup = () => {
  if (child.pid === undefined) return;
  try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); }
  catch { /* Already reaped. */ }
};
const stop = (code, message) => {
  if (finalized || forcedCode !== undefined) return;
  forcedCode = code;
  try { console.error(message); } catch { /* Still enforce timeout if stderr fails. */ } finally { killGroup(); }
};
const overdue = () => {
  if (elapsed() >= totalDeadlineMs) {
    stop(124, `Native metric fixture exceeded absolute ${totalDeadlineMs}ms process budget`);
    return true;
  }
  if (phase === 'original' && elapsed() >= originalDeadlineMs) {
    stop(124, `Original metric fixture exceeded absolute ${originalDeadlineMs}ms process budget`);
    return true;
  }
  return false;
};
const originalTimer = setTimeout(() => {
  if (phase === 'original') stop(124, `Original metric fixture exceeded absolute ${originalDeadlineMs}ms process budget`);
}, Math.max(0, originalDeadlineMs - elapsed()));
const totalTimer = setTimeout(() => stop(124, `Native metric fixture exceeded absolute ${totalDeadlineMs}ms process budget`),
  Math.max(0, totalDeadlineMs - elapsed()));
child.on('message', (message) => {
  if (finalized || forcedCode !== undefined || overdue()) return;
  if (message === 'native-metric:renewal' && phase === 'original') {
    phase = 'renewal';
    clearTimeout(originalTimer);
  } else if (message === 'native-metric:completed' && phase === 'renewal') {
    phase = 'completed';
  } else {
    stop(1, 'Invalid or repeated native metric deadline transition');
    return;
  }
  child.send(`${message}:accepted`, (error) => {
    if (error) stop(1, error.message);
    else if (!finalized && phase === 'completed' && child.connected) child.disconnect();
  });
});
child.on('error', (error) => {
  stop(1, error.message);
  if (child.pid === undefined) finalize(1, null); // Spawn failed: no exit event will follow.
});
// The outer 900s helper signals this parent group; relay to our fixture group.
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(signal, () => stop(1, `Native metric watchdog received ${signal}`));
}
function finalize(code, signal) {
  if (finalized) return;
  overdue();
  finalized = true;
  clearTimeout(originalTimer);
  clearTimeout(totalTimer);
  killGroup(); // Also remove descendants if the fixture exited before them.
  if (signal) console.error(`Command exited with signal ${signal}`);
  process.exitCode = forcedCode ?? (signal ? 1 : code === 0 && phase !== 'completed' ? 1 : code ?? 1);
}
// Node 24 may never emit close after parent-initiated IPC disconnect.
child.once('exit', finalize);
