import { execFileSync } from 'node:child_process';
import { existsSync, statSync, watch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertMarionetteFrontendProcess,
  assertProcessIsRunning,
  readFrontendPid,
  readFrontendRuntimeConfig,
} from './lib/frontend-dev-runtime-support.mjs';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const debounceMs = positiveInteger(
  process.env.SOCIAL_MONITOR_FRONTEND_AUTO_RESTART_DEBOUNCE_MS,
  1200,
);
const cooldownMs = positiveInteger(
  process.env.SOCIAL_MONITOR_FRONTEND_AUTO_RESTART_COOLDOWN_MS,
  1800,
);
const browserReloadDelayMs = positiveInteger(
  process.env.SOCIAL_MONITOR_FRONTEND_AUTO_RELOAD_DELAY_MS,
  2200,
);
const shouldReloadBrowser =
  process.env.SOCIAL_MONITOR_FRONTEND_AUTO_RELOAD_BROWSER?.toLowerCase() !==
  'false';
const dryRun = process.argv.includes('--dry-run');

const watchedEntries = [
  'apps/frontend/app/lib',
  'apps/frontend/app/web',
  'apps/frontend/app/pubspec.yaml',
  'apps/frontend/features',
  'apps/frontend/packages',
  'apps/frontend/pubspec.lock',
];

const watchedRoots = watchedEntries
  .map((entry) => resolve(repoRoot, entry))
  .filter((entry) => existsSync(entry));

if (watchedRoots.length === 0) {
  throw new Error('No frontend paths found to watch.');
}

if (dryRun) {
  console.log('Frontend auto hot reload watcher dry run.');
  for (const root of watchedRoots) {
    console.log(`watch: ${relative(repoRoot, root)}`);
  }
  process.exit(0);
}

const config = readFrontendRuntimeConfig();
let debounceTimer = null;
let cooldownTimer = null;
let pendingChange = null;
let restartInFlight = false;
const watchers = [];

console.log('Frontend auto hot reload watcher is running.');
console.log(`Debounce: ${debounceMs}ms. Cooldown: ${cooldownMs}ms.`);
console.log(
  `Browser reload: ${shouldReloadBrowser ? `yes, after ${browserReloadDelayMs}ms` : 'no'}.`,
);
console.log(`PID file: ${config.pidFile}`);
console.log('Watching:');
for (const root of watchedRoots) {
  console.log(`- ${relative(repoRoot, root)}`);
}

for (const root of watchedRoots) {
  await watchTree(root);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function watchTree(root) {
  const stat = statSync(root);
  const watchRoot = stat.isDirectory() ? root : dirname(root);

  try {
    watchers.push(
      watch(watchRoot, { recursive: true }, (_eventType, fileName) => {
        const changedPath = fileName
          ? resolve(watchRoot, String(fileName))
          : watchRoot;
        handleChange(changedPath);
      }),
    );
    return;
  } catch (error) {
    if (!isRecursiveWatchUnsupported(error)) {
      throw error;
    }
  }

  for (const directory of await listDirectories(watchRoot)) {
    watchers.push(
      watch(directory, (_eventType, fileName) => {
        const changedPath = fileName
          ? resolve(directory, String(fileName))
          : directory;
        handleChange(changedPath);
      }),
    );
  }
}

function handleChange(changedPath) {
  if (!shouldRestartForPath(changedPath)) {
    return;
  }

  const nextMode = restartRequiredForPath(changedPath) ? 'restart' : 'reload';
  pendingChange = {
    mode: pendingChange?.mode === 'restart' ? 'restart' : nextMode,
    path: relative(repoRoot, changedPath),
  };
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(sendFlutterRefresh, debounceMs);
}

function shouldRestartForPath(changedPath) {
  const relativePath = relative(repoRoot, changedPath);
  if (
    relativePath.startsWith('..') ||
    relativePath.length === 0 ||
    ignoredPathSegments(relativePath)
  ) {
    return false;
  }

  const normalized = relativePath.split(sep).join('/');
  if (normalized.includes('/test/') || normalized.endsWith('_test.dart')) {
    return false;
  }

  if (
    normalized === 'apps/frontend/pubspec.lock' ||
    normalized.endsWith('/pubspec.yaml') ||
    normalized.startsWith('apps/frontend/app/web/')
  ) {
    return true;
  }

  return ['.dart', '.json', '.yaml', '.yml', '.html', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp']
    .includes(extname(normalized).toLowerCase());
}

function restartRequiredForPath(changedPath) {
  const normalized = relative(repoRoot, changedPath).split(sep).join('/');
  return (
    normalized === 'apps/frontend/pubspec.lock' ||
    normalized.endsWith('/pubspec.yaml') ||
    normalized.startsWith('apps/frontend/app/web/')
  );
}

function sendFlutterRefresh() {
  if (restartInFlight) {
    debounceTimer = setTimeout(sendFlutterRefresh, cooldownMs);
    return;
  }

  restartInFlight = true;
  const change = pendingChange ?? { mode: 'reload', path: 'frontend change' };
  pendingChange = null;

  try {
    const pid = readFrontendPid(config.pidFile);
    assertProcessIsRunning(pid);
    assertMarionetteFrontendProcess(pid);
    const signal = change.mode === 'restart' ? 'SIGUSR2' : 'SIGUSR1';
    process.kill(pid, signal);
    console.log(`[frontend:auto-refresh] hot ${change.mode} sent for ${change.path}`);
    if (shouldReloadBrowser) {
      setTimeout(() => {
        reloadFlutterBrowserPages(pid).catch((error) => {
          console.error(
            `[frontend:auto-refresh] browser reload skipped: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      }, browserReloadDelayMs).unref();
    }
  } catch (error) {
    console.error(
      `[frontend:auto-refresh] skipped: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(cooldownTimer);
    cooldownTimer = setTimeout(() => {
      restartInFlight = false;
      if (pendingChange !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(sendFlutterRefresh, debounceMs);
      }
    }, cooldownMs);
  }
}

async function listDirectories(root) {
  const result = [root];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || ignoredDirectoryName(entry.name)) {
      continue;
    }

    result.push(...(await listDirectories(join(root, entry.name))));
  }

  return result;
}

async function reloadFlutterBrowserPages(frontendPid) {
  const ports = findFlutterBrowserDebugPorts(frontendPid);
  let reloadCount = 0;

  for (const port of ports) {
    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    for (const target of targets) {
      if (!isFrontendTarget(target)) {
        continue;
      }

      await fetch(`http://127.0.0.1:${port}/json/reload/${target.id}`);
      reloadCount += 1;
    }
  }

  if (reloadCount > 0) {
    console.log(`[frontend:auto-refresh] reloaded ${reloadCount} browser page(s)`);
  }
}

function findFlutterBrowserDebugPorts(frontendPid) {
  const output = execFileSync('ps', ['-ax', '-o', 'pid=,ppid=,command='], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ports = new Set();

  for (const line of output.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
    if (match === null) {
      continue;
    }

    const [, , parentPidText, command] = match;
    if (!command.includes('--remote-debugging-port=')) {
      continue;
    }

    const parentPid = Number.parseInt(parentPidText, 10);
    if (parentPid !== frontendPid && !command.includes(`:${config.port}`)) {
      continue;
    }

    const port = command.match(/--remote-debugging-port=(\d+)/)?.[1];
    if (port !== undefined) {
      ports.add(port);
    }
  }

  return Array.from(ports);
}

function isFrontendTarget(target) {
  if (target?.type !== 'page' || typeof target.url !== 'string') {
    return false;
  }

  return (
    target.url.startsWith(`http://${config.host}:${config.port}/`) ||
    target.url === `http://${config.host}:${config.port}`
  );
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.json();
}

function ignoredPathSegments(relativePath) {
  return relativePath.split(/[\\/]/).some(ignoredDirectoryName);
}

function ignoredDirectoryName(name) {
  return ['.dart_tool', '.git', '.idea', '.vscode', 'build', 'node_modules'].includes(
    name,
  );
}

function isRecursiveWatchUnsupported(error) {
  return (
    error instanceof Error &&
    (error.message.includes('recursive') || error.message.includes('ERR_FEATURE_UNAVAILABLE'))
  );
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function shutdown() {
  for (const watcher of watchers) {
    watcher.close();
  }
  process.exit(0);
}
