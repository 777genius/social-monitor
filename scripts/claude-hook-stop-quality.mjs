import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const input = parseHookInput(readStdin());
const projectRoot = (process.env.CLAUDE_PROJECT_DIR ?? '').trim() || process.cwd();
process.chdir(projectRoot);

if (input.stop_hook_active === true) {
  process.exit(0);
}

const checks = [
  ['node', ['scripts/check-agent-quality-rules.mjs']],
  ['node', ['scripts/check-architecture.mjs']],
  ['node', ['scripts/check-code-quality.mjs']],
];
const failures = [];

for (const [command, args] of checks) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    failures.push(output.length > 0 ? output : `${command} ${args.join(' ')} failed`);
  }
}

if (failures.length > 0) {
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason: `Quality gates failed before Claude can stop:\n${failures.join('\n\n')}`,
    }),
  );
  process.exit(0);
}

process.exit(0);

function readStdin() {
  try {
    const source = readFileSync(0, 'utf8').trim();
    return source.length > 0 ? source : '{}';
  } catch {
    return '{}';
  }
}

function parseHookInput(source) {
  try {
    return JSON.parse(source);
  } catch {
    return {};
  }
}
