import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  readFrontendRuntimeConfig,
  runFrontendDevRuntimePreflight,
} from './lib/frontend-dev-runtime-support.mjs';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const appDir = join(repoRoot, 'apps/frontend/app');

const config = readFrontendRuntimeConfig();
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
if (!config.skipApiPreflight) {
  try {
    const preflight = await runFrontendDevRuntimePreflight({
      definesFile: config.definesFile,
    });
    console.log(
      'Backend preflight: ' +
        `health=${preflight.healthStatus}, ` +
        `summary=${preflight.summaryStatus}, ` +
        `items=${preflight.summaryItemCount ?? 'n/a'}, ` +
        `latest=${preflight.latestSummaryPeriod ?? 'n/a'}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(
      'Start the API with the same DATABASE_URL as your collected local data, ' +
        'or set SOCIAL_MONITOR_FRONTEND_SKIP_API_PREFLIGHT=true to bypass.',
    );
    process.exit(1);
  }
}

const args = [
  'flutter',
  'run',
  '-d',
  device,
  `--web-hostname=${config.host}`,
  `--web-port=${config.port}`,
];

if (device !== 'web-server') {
  args.push(`--web-launch-url=${config.launchUrl}`);
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
  `--pid-file=${config.pidFile}`,
  `--dart-define-from-file=${config.definesFile}`,
);

console.log(`Frontend web: ${config.launchUrl}`);
console.log(`Flutter device: ${device}`);
console.log(`Headless browser: ${runHeadless ? 'yes' : 'no'}`);
console.log(`PID file: ${config.pidFile}`);
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
