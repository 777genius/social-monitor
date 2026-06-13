#!/usr/bin/env node
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const separatorIndex = args.indexOf('--');

if (separatorIndex === -1 || separatorIndex === args.length - 1) {
  console.error('Usage: node scripts/run-with-timeout.mjs --timeout-ms <ms> -- <command> [...args]');
  process.exit(2);
}

const timeoutFlagIndex = args.indexOf('--timeout-ms');
const timeoutMs = timeoutFlagIndex === -1
  ? Number(process.env.COMMAND_TIMEOUT_MS ?? 300_000)
  : Number(args[timeoutFlagIndex + 1]);

if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000) {
  console.error(`Invalid timeout: ${String(timeoutMs)}`);
  process.exit(2);
}

const command = args[separatorIndex + 1];
const commandArgs = args.slice(separatorIndex + 2);
const child = spawn(command, commandArgs, {
  detached: process.platform !== 'win32',
  env: process.env,
  shell: false,
  stdio: 'inherit',
});

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  console.error(`Command timed out after ${timeoutMs}ms: ${[command, ...commandArgs].join(' ')}`);
  terminate(child.pid);
}, timeoutMs);

child.on('error', (error) => {
  clearTimeout(timer);
  console.error(error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  clearTimeout(timer);

  if (timedOut) {
    process.exit(124);
  }

  if (signal !== null) {
    console.error(`Command exited with signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});

const terminate = (pid) => {
  if (pid === undefined) {
    process.exit(124);
  }

  const target = process.platform === 'win32' ? pid : -pid;

  try {
    process.kill(target, 'SIGTERM');
  } catch {
    process.exit(124);
  }

  setTimeout(() => {
    try {
      process.kill(target, 'SIGKILL');
    } catch {
      // The process may have already exited after SIGTERM.
    }
  }, 5_000).unref();
};
