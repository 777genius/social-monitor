import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const appDir = join(repoRoot, 'apps/frontend/app');

const port = process.env.SOCIAL_MONITOR_FRONTEND_PORT ?? '53217';
const host = process.env.SOCIAL_MONITOR_FRONTEND_HOST ?? '127.0.0.1';
const device = process.env.SOCIAL_MONITOR_FRONTEND_DEVICE ?? 'chrome';
const runHeadless =
  process.env.SOCIAL_MONITOR_FRONTEND_HEADLESS?.toLowerCase() === 'true';
const browserDebugPort = process.env.SOCIAL_MONITOR_FRONTEND_BROWSER_DEBUG_PORT;
const browserFlags = (
  process.env.SOCIAL_MONITOR_FRONTEND_BROWSER_FLAGS ?? ''
)
  .split(/\s+/)
  .map((flag) => flag.trim())
  .filter((flag) => flag.length > 0);
const launchPath = process.env.SOCIAL_MONITOR_FRONTEND_LAUNCH_PATH ?? '/summaries';
const launchUrl = `http://${host}:${port}${launchPath}`;
const pidFile =
  process.env.SOCIAL_MONITOR_FRONTEND_PID_FILE ??
  '/tmp/social-monitor-flutter-web.pid';
const definesFile =
  process.env.SOCIAL_MONITOR_FRONTEND_DEFINES_FILE ??
  join(homedir(), '.cache/social-monitor/frontend/connected-web-defines.json');

if (!existsSync(definesFile)) {
  console.error(
    `Missing connected frontend defines file: ${definesFile}\n` +
      'Create it or pass SOCIAL_MONITOR_FRONTEND_DEFINES_FILE.',
  );
  process.exit(1);
}

const args = [
  'flutter',
  'run',
  '-d',
  device,
  `--web-hostname=${host}`,
  `--web-port=${port}`,
];

if (device !== 'web-server') {
  args.push(`--web-launch-url=${launchUrl}`);
}

if (runHeadless) {
  args.push('--web-run-headless');
}

if (browserDebugPort !== undefined && browserDebugPort.length > 0) {
  args.push(`--web-browser-debug-port=${browserDebugPort}`);
}

for (const flag of browserFlags) {
  args.push(`--web-browser-flag=${flag}`);
}

args.push(
  '-t',
  'lib/main_marionette.dart',
  `--pid-file=${pidFile}`,
  `--dart-define-from-file=${definesFile}`,
);

console.log(`Frontend web: ${launchUrl}`);
console.log(`Flutter device: ${device}`);
console.log(`Headless browser: ${runHeadless ? 'yes' : 'no'}`);
console.log(`PID file: ${pidFile}`);
console.log('Use npm run frontend:hot-restart for full Flutter-tool restart.');

const child = spawn('fvm', args, {
  cwd: appDir,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
