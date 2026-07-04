import { readFileSync } from 'node:fs';

const pidFile =
  process.env.SOCIAL_MONITOR_FRONTEND_PID_FILE ??
  '/tmp/social-monitor-flutter-web.pid';

let pid;
try {
  pid = Number.parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
} catch {
  console.error(`Cannot read Flutter frontend pid file: ${pidFile}`);
  process.exit(1);
}

if (!Number.isInteger(pid) || pid <= 0) {
  console.error(`Invalid Flutter frontend pid in ${pidFile}`);
  process.exit(1);
}

try {
  process.kill(pid, 0);
} catch {
  console.error(`Flutter frontend process is not running: ${pid}`);
  process.exit(1);
}

process.kill(pid, 'SIGUSR2');
console.log(`Sent Flutter hot restart signal to pid ${pid}.`);
