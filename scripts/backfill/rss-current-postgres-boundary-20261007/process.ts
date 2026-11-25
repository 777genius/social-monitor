import { spawn } from 'node:child_process';
export type CommandResult = Readonly<{ command: string; args: readonly string[]; cwd: string;
  stdout: string; stderr: string; exit: number | null; signal: string | null }>;
export function execute(command: string, args: readonly string[], cwd: string,
  env: NodeJS.ProcessEnv, timeout = 120000): Promise<CommandResult> {
  return new Promise((accept, reject) => {
    const child = spawn(command, [...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (v: string) => { stdout += v; });
    child.stderr.on('data', (v: string) => { stderr += v; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', (exit, signal) => { clearTimeout(timer); accept({ command, args, cwd, stdout, stderr, exit, signal }); });
  });
}
