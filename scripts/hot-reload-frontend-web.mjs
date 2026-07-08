import {
  assertMarionetteFrontendProcess,
  assertProcessIsRunning,
  readFrontendPid,
  readFrontendRuntimeConfig,
} from './lib/frontend-dev-runtime-support.mjs';

let pid;
try {
  const config = readFrontendRuntimeConfig();
  pid = readFrontendPid(config.pidFile);
  assertProcessIsRunning(pid);
  assertMarionetteFrontendProcess(pid);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

process.kill(pid, 'SIGUSR1');
console.log(`Sent Flutter hot reload signal to pid ${pid}.`);
