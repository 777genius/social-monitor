#!/usr/bin/env node

import { existsSync } from 'node:fs';

import {
  assertMarionetteFrontendProcess,
  assertProcessIsRunning,
  readFrontendPid,
  readFrontendRuntimeConfig,
  runFrontendDevRuntimePreflight,
} from './lib/frontend-dev-runtime-support.mjs';

const requireFrontend = process.argv.includes('--require-frontend');
const config = readFrontendRuntimeConfig();

try {
  const preflight = await runFrontendDevRuntimePreflight({
    definesFile: config.definesFile,
  });

  if (existsSync(config.pidFile)) {
    const pid = readFrontendPid(config.pidFile);
    assertProcessIsRunning(pid);
    assertMarionetteFrontendProcess(pid);
    console.log(`Frontend process OK: pid=${pid}, entrypoint=main_marionette.dart`);
  } else if (requireFrontend) {
    throw new Error(`Missing Flutter frontend pid file: ${config.pidFile}`);
  } else {
    console.log('Frontend process not running; backend preflight only.');
  }

  console.log(
    'Frontend dev runtime OK: ' +
      `url=${config.launchUrl}, ` +
      `api=${preflight.apiBaseUrl}, ` +
      `health=${preflight.healthStatus}, ` +
      `summary=${preflight.summaryStatus}, ` +
      `items=${preflight.summaryItemCount ?? 'n/a'}, ` +
      `latest=${preflight.latestSummaryPeriod ?? 'n/a'}, ` +
      `tenant=${preflight.tenantFingerprint}, ` +
      `workspace=${preflight.workspaceFingerprint}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
