import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const realProjectCwd = process.cwd();
const sandboxCwd = '/tmp/social-monitor-sandbox-project';
const settings = readFileSync('.claude/settings.json', 'utf8');
const settingsJson = JSON.parse(settings);

const guardCases = [
  {
    name: 'allows ordinary bash command',
    input: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      cwd: realProjectCwd,
      tool_input: { command: 'npm run check:architecture' },
    },
    expectedStatus: 0,
  },
  {
    name: 'blocks prohibited agent runtime bash command',
    input: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      cwd: realProjectCwd,
      tool_input: { command: 'agent launch smoke-flow' },
    },
    expectedStatus: 2,
  },
  {
    name: 'blocks direct Agent tool on real project',
    input: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      cwd: realProjectCwd,
      tool_input: { prompt: 'Inspect the current repository' },
    },
    expectedStatus: 2,
  },
  {
    name: 'blocks built-in read access to env secrets',
    input: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      cwd: realProjectCwd,
      tool_input: { file_path: `${realProjectCwd}/.env` },
    },
    expectedStatus: 2,
  },
  {
    name: 'allows reading env example documentation',
    input: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      cwd: realProjectCwd,
      tool_input: { file_path: `${realProjectCwd}/.env.example` },
    },
    expectedStatus: 0,
  },
  {
    name: 'blocks bash subprocess secret reads',
    input: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      cwd: realProjectCwd,
      tool_input: { command: 'cat .env' },
    },
    expectedStatus: 2,
  },
  {
    name: 'blocks credential cli usage',
    input: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      cwd: realProjectCwd,
      tool_input: { command: 'gh auth token' },
    },
    expectedStatus: 2,
  },
  {
    name: 'blocks destructive git reset',
    input: {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      cwd: realProjectCwd,
      tool_input: { command: 'git reset --hard HEAD' },
    },
    expectedStatus: 2,
  },
  {
    name: 'blocks task creation on real project',
    input: {
      hook_event_name: 'TaskCreated',
      cwd: realProjectCwd,
      task_subject: 'Run assignment smoke checks',
      task_description: 'Check current project runtime',
    },
    expectedStatus: 2,
  },
  {
    name: 'allows task creation in sandbox path',
    input: {
      hook_event_name: 'TaskCreated',
      cwd: sandboxCwd,
      task_subject: 'Run assignment smoke checks',
      task_description: 'Check sandbox runtime',
    },
    expectedStatus: 0,
  },
];

const failures = [];

for (const required of [
  '${CLAUDE_PROJECT_DIR}/scripts/claude-hook-guard.mjs',
  '${CLAUDE_PROJECT_DIR}/scripts/claude-hook-stop-quality.mjs',
  'disableAutoMode',
  'disableBypassPermissionsMode',
  'Read(//**/.env)',
  'Read(//**/.npmrc)',
  'Read(//**/.kube/**)',
  'Read(//**/.config/gh/**)',
  'Edit(//**/secrets/**)',
  'Edit(//**/credentials/**)',
  'Write(//**/*.pem)',
  'Write(//**/.docker/config.json)',
]) {
  if (!settings.includes(required)) {
    failures.push(`.claude/settings.json missing required guardrail: ${required}`);
  }
}

for (const hook of allConfiguredHooks(settingsJson)) {
  if (hook.command !== 'node') {
    failures.push('.claude/settings.json command hooks must use "command": "node" with script paths in args');
  }

  if (!Array.isArray(hook.args) || !hook.args.some((arg) => String(arg).startsWith('${CLAUDE_PROJECT_DIR}/scripts/'))) {
    failures.push('.claude/settings.json command hooks must pass project-rooted script paths through args');
  }
}

for (const testCase of guardCases) {
  const result = runHook('scripts/claude-hook-guard.mjs', testCase.input);
  if (result.status !== testCase.expectedStatus) {
    failures.push(formatFailure(testCase.name, testCase.expectedStatus, result));
  }
}

const stopActiveResult = runHook('scripts/claude-hook-stop-quality.mjs', {
  hook_event_name: 'Stop',
  stop_hook_active: true,
});

if (stopActiveResult.status !== 0 || stopActiveResult.stdout.trim().length > 0) {
  failures.push(formatFailure('allows active stop hook without recursive block', 0, stopActiveResult));
}

const stopActiveFromSubdirResult = runHook(`${realProjectCwd}/scripts/claude-hook-stop-quality.mjs`, {
  hook_event_name: 'Stop',
  stop_hook_active: true,
}, {
  cwd: `${realProjectCwd}/libs`,
  env: {
    ...process.env,
    CLAUDE_PROJECT_DIR: realProjectCwd,
  },
});

if (stopActiveFromSubdirResult.status !== 0 || stopActiveFromSubdirResult.stdout.trim().length > 0) {
  failures.push(formatFailure('allows stop hook from subdir when CLAUDE_PROJECT_DIR is set', 0, stopActiveFromSubdirResult));
}

const malformedGuardInputResult = runHookRaw('scripts/claude-hook-guard.mjs', '{not-json');

if (malformedGuardInputResult.status !== 2) {
  failures.push(formatFailure('fails closed when guard input is malformed', 2, malformedGuardInputResult));
}

const malformedStopInputResult = runHookRaw('scripts/claude-hook-stop-quality.mjs', '{not-json', {
  env: {
    ...process.env,
    CLAUDE_PROJECT_DIR: realProjectCwd,
  },
});

if (malformedStopInputResult.status !== 0) {
  failures.push(formatFailure('still runs stop quality gate when stop input is malformed', 0, malformedStopInputResult));
}

if (failures.length > 0) {
  console.error(failures.join('\n\n'));
  process.exit(1);
}

console.log('Claude hook guardrails OK');

function runHook(script, input, options = {}) {
  return runHookRaw(script, JSON.stringify(input), options);
}

function runHookRaw(script, input, options = {}) {
  return spawnSync(process.execPath, [script], {
    input,
    encoding: 'utf8',
    cwd: options.cwd,
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function formatFailure(name, expectedStatus, result) {
  return [
    `${name}: expected exit ${expectedStatus}, got ${result.status}`,
    result.stdout.trim(),
    result.stderr.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

function allConfiguredHooks(settingsSource) {
  return Object.values(settingsSource.hooks ?? {})
    .flatMap((eventHooks) => eventHooks)
    .flatMap((eventHook) => eventHook.hooks ?? [])
    .filter((hook) => hook.type === 'command');
}
