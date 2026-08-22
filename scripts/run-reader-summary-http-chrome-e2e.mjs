import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDirectory = resolve(repositoryRoot, 'apps/frontend/app');
const startupTimeoutMs = 180_000;
const flutterExecutable = process.env.READER_SUMMARY_E2E_FLUTTER_EXECUTABLE;
const chromeExecutable =
  process.env.READER_SUMMARY_E2E_CHROME_EXECUTABLE ??
  process.env.CHROME_EXECUTABLE;
const testPlatform = process.env.READER_SUMMARY_E2E_PLATFORM ?? 'chrome';
const children = new Set();
const processGroups = new Set();
let shuttingDown = false;

const spawnGroup = (command, args, options = {}) => {
  const child = spawn(command, args, {
    ...options,
    detached: process.platform !== 'win32',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  if (process.platform !== 'win32' && Number.isInteger(child.pid)) {
    processGroups.add(child.pid);
  }
  child.once('exit', () => children.delete(child));
  return child;
};

const stopChild = (child) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== 'win32' && !Number.isInteger(child.pid)) return;
  try {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
  setTimeout(() => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
  }, 3_000);
};

const cleanup = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) stopChild(child);
  if (process.platform !== 'win32') {
    for (const processGroup of processGroups) {
      try {
        process.kill(-processGroup, 'SIGTERM');
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
    }
    setTimeout(() => {
      for (const processGroup of processGroups) {
        try {
          process.kill(-processGroup, 'SIGKILL');
        } catch (error) {
          if (error?.code !== 'ESRCH') throw error;
        }
      }
    }, 3_000);
  }
};

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(signal, () => {
    cleanup();
    process.exitCode = 128 + (signal === 'SIGINT' ? 2 : signal === 'SIGHUP' ? 1 : 15);
  });
}

const waitForFixture = (child) =>
  new Promise((resolveReady, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      reject(new Error(`Reader summary fixture did not start within ${startupTimeoutMs}ms`));
    }, startupTimeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/u);
      stdout = lines.pop() ?? '';
      for (const line of lines) {
        process.stdout.write(`${line}\n`);
        try {
          const parsed = JSON.parse(line);
          if (parsed.status === 'ready' && typeof parsed.baseUrl === 'string') {
            clearTimeout(timer);
            resolveReady(parsed.baseUrl);
            return;
          }
        } catch {
          // Dart compilation progress is forwarded until the ready record arrives.
        }
      }
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Reader summary fixture exited before readiness (code=${code}, signal=${signal}). ${stderr}`,
        ),
      );
    });
  });

const waitForExit = (child) =>
  new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });

try {
  const fixture = spawnGroup(
    process.execPath,
    [
      resolve(repositoryRoot, 'node_modules/ts-node/dist/bin.js'),
      '-r',
      'tsconfig-paths/register',
      resolve(repositoryRoot, 'scripts/reader-summary-http-chrome-fixture-server.ts'),
    ],
    { cwd: repositoryRoot },
  );
  const baseUrl = await waitForFixture(fixture);
  const drive = spawnGroup(
    flutterExecutable ?? 'fvm',
    [
      ...(flutterExecutable === undefined ? ['flutter'] : []),
      'test',
      '--no-pub',
      ...(testPlatform === 'vm' ? [] : ['--platform=chrome']),
      'test/reader_summary_http_chrome_e2e_test.dart',
      `--dart-define=READER_SUMMARY_HTTP_FIXTURE_BASE_URL=${baseUrl}`,
    ],
    {
      cwd: appDirectory,
      env: {
        ...process.env,
        ...(chromeExecutable === undefined
          ? {}
          : { CHROME_EXECUTABLE: chromeExecutable }),
      },
      stdio: 'inherit',
    },
  );
  const result = await waitForExit(drive);
  if (result.code !== 0) {
    throw new Error(
      `Reader summary Chrome E2E failed (code=${result.code}, signal=${result.signal})`,
    );
  }
} finally {
  cleanup();
}
