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
const childEnv = buildChildEnv(args.slice(0, separatorIndex));
const childCommand = process.platform === 'win32'
  ? [command, ...commandArgs].map(quoteShellArg).join(' ')
  : command;
const childArgs = process.platform === 'win32' ? [] : commandArgs;
const child = spawn(childCommand, childArgs, {
  detached: process.platform !== 'win32',
  env: childEnv,
  shell: process.platform === 'win32',
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

function buildChildEnv(optionArgs) {
  let cleanEnv = false;
  let nodeOptions;
  const copyEnvNames = [];
  const explicitEnv = new Map();

  for (let index = 0; index < optionArgs.length; index += 1) {
    const arg = optionArgs[index];

    if (arg === '--timeout-ms') {
      index += 1;
      continue;
    }

    if (arg === '--clean-env') {
      cleanEnv = true;
      continue;
    }

    if (arg === '--node-options') {
      nodeOptions = optionArgs[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--node-options=')) {
      nodeOptions = arg.slice('--node-options='.length);
      continue;
    }

    if (arg === '--copy-env') {
      copyEnvNames.push(optionArgs[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--env') {
      const [name, ...valueParts] = String(optionArgs[index + 1] ?? '').split('=');
      if (name.length > 0) {
        explicitEnv.set(name, valueParts.join('='));
      }
      index += 1;
    }
  }

  const env = cleanEnv ? buildCleanEnv() : { ...process.env };

  for (const name of copyEnvNames) {
    const value = getEnvValue(name);
    if (value !== undefined) {
      env[name] = value;
    }
  }

  for (const [name, value] of explicitEnv.entries()) {
    env[name] = value;
  }

  if (nodeOptions !== undefined) {
    env.NODE_OPTIONS = nodeOptions;
  }

  return env;
}

function buildCleanEnv() {
  const env = {};
  const preserveNames = process.platform === 'win32'
    ? ['Path', 'PATH', 'PATHEXT', 'ComSpec', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']
    : ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP'];

  for (const name of preserveNames) {
    const value = getEnvValue(name);
    if (value !== undefined) {
      env[name] = value;
    }
  }

  return env;
}

function getEnvValue(name) {
  if (process.env[name] !== undefined) {
    return process.env[name];
  }

  if (process.platform !== 'win32') {
    return undefined;
  }

  const lowerName = name.toLowerCase();
  const matchingKey = Object.keys(process.env).find((key) => key.toLowerCase() === lowerName);
  return matchingKey === undefined ? undefined : process.env[matchingKey];
}

function quoteShellArg(value) {
  if (/^[A-Za-z0-9_./:\\@%+=,-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/(["^&|<>])/g, '^$1')}"`;
}
