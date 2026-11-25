import { spawn } from 'node:child_process';

export type KeeperMessage = { readonly type: 'ready' } | { readonly type: 'status'; readonly status: number };

// This unprivileged leader outlives the command. Its PID pins the owned group
// until the supervisor's TERM/KILL drain, even when output has been redirected.
process.on('SIGTERM', () => {});
process.on('SIGINT', () => {});
process.on('SIGHUP', () => {});
setInterval(() => {}, 1000);
let draining = false;
const drain = (): void => {
  if (draining) return;
  draining = true;
  process.kill(-process.pid, 'SIGTERM');
  setTimeout(() => process.kill(-process.pid, 'SIGKILL'), 5000);
};
process.on('disconnect', drain);
const report = (message: KeeperMessage): void => {
  if (!process.connected || process.send === undefined) { drain(); return; }
  process.send(message, (error) => { if (error !== null) drain(); });
};
report({ type: 'ready' });
const command = process.argv[2];
if (command === undefined) report({ type: 'status', status: 1 });
else {
  // The actual command never inherits the private IPC channel.
  const child = spawn(command, process.argv.slice(3), { stdio: 'inherit' });
  child.once('error', (error) => {
    process.stderr.write(`${String(error)}\n`);
    report({ type: 'status', status: 1 });
  });
  child.once('exit', (code) => report({ type: 'status', status: code ?? 1 }));
}
