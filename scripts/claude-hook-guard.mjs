import { readFileSync } from 'node:fs';

const input = parseHookInput(readStdin());
const cwd = String(input.cwd ?? process.cwd());
const hookEventName = String(input.hook_event_name ?? '');
const toolName = String(input.tool_name ?? '');
const commandText = collectText([
  input.tool_name,
  input.hook_event_name,
  input.tool_input?.command,
  input.tool_input?.description,
  input.tool_input?.prompt,
  input.tool_input?.file_path,
  input.tool_input?.path,
  input.tool_input?.notebook_path,
  input.tool_input?.pattern,
  input.tool_input?.glob,
  ...collectRecursiveText(input.tool_input),
  input.task_subject,
  input.task_description,
  input.teammate_name,
  input.team_name,
  input.agent_type,
]);

// Prohibited flows are named in prose, where the verb and the noun are separate
// words. Ordinary repository identifiers are instead hyphen/slash/dot-joined
// compounds such as apps/agent-runtime, AGENTS.md and
// vendor/vioxen-subscription-runtime-*.tgz. The boundaries below therefore
// refuse to split on `.`, `/` and `-`, so prose still matches while a file path
// stops reading as a flow. The dedicated app-path rule at the end keeps real
// flow invocations under that app directory blocked, which bare-word rules
// alone would miss.
const blockedPatterns = [
  {
    pattern: /(^|\s)(~\/dev\/projects\/ai\/claude-runtime|\/dev\/projects\/ai\/claude-runtime)(\s|$)/i,
    reason: 'Do not open or test claude-runtime without fresh explicit approval.',
  },
  {
    pattern: /(?<![\w./-])terminal[-_\s]*runtime(?![\w./-])/i,
    reason: 'Terminal runtime checks are prohibited on real user projects.',
  },
  {
    pattern: /(?<![\w./-])task[-_\s]*assignment(?![\w./-])/i,
    reason: 'Task assignment flows are prohibited on real user projects.',
  },
  {
    pattern: /(?<![\w./-])smoke[-_\s]*flow(?![\w./-])/i,
    reason: 'Agent smoke-flow checks are prohibited on real user projects.',
  },
  {
    pattern: /(?<![\w./-])(agent|agents)(?![\w./-]).*(?<![\w./-])(launch|provision|assign|runtime|smoke)(?![\w./-])/i,
    reason: 'Agent launch/provisioning/runtime/smoke checks are prohibited on real user projects.',
  },
  {
    pattern: /(?<![\w./-])(launch|provision|assign|runtime|smoke)(?![\w./-]).*(?<![\w./-])(agent|agents)(?![\w./-])/i,
    reason: 'Agent launch/provisioning/runtime/smoke checks are prohibited on real user projects.',
  },
  {
    pattern: /apps\/agent-runtime\/[^\s"']*(?:launch|provision|assign|smoke)/i,
    reason: 'Agent launch/provisioning/runtime/smoke checks are prohibited on real user projects.',
  },
];

const secretPathText = collectText([
  input.tool_input?.file_path,
  input.tool_input?.path,
  input.tool_input?.notebook_path,
  input.tool_input?.glob,
]);

if (referencesProtectedSecretPath(secretPathText)) {
  block('Secret files, private keys and credential directories are prohibited in Claude tool inputs.');
}

if (toolName === 'Bash') {
  if (bashReadsProtectedSecretPath(commandText)) {
    block('Bash subprocess access to secret files, private keys or credential directories is prohibited.');
  }

  if (bashUsesNetworkOrCredentialTool(commandText) && !isSandboxPath(cwd) && !isSandboxText(commandText)) {
    block('Network and credential CLI tools are prohibited from Claude Bash commands in real projects.');
  }

  if (bashUsesDestructiveCommand(commandText) && !isSandboxPath(cwd) && !isSandboxText(commandText)) {
    block('Destructive filesystem or git reset commands are prohibited from Claude Bash commands.');
  }
}

if (!isSandboxPath(cwd) && !isSandboxText(commandText)) {
  if (hookEventName === 'TaskCreated') {
    block('Task assignment flows are prohibited on real user projects.');
  }

  if (toolName === 'Agent') {
    block('Agent tool actions are prohibited on real user projects.');
  }
}

for (const { pattern, reason } of blockedPatterns) {
  if (pattern.test(commandText) && !isSandboxPath(cwd) && !isSandboxText(commandText)) {
    block(reason);
  }
}

process.exit(0);

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '{}';
  }
}

function parseHookInput(source) {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return {};
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    block('Hook input could not be parsed, so the guard failed closed.');
  }
}

function collectText(values) {
  return values
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value))
    .join('\n');
}

function collectRecursiveText(value) {
  if (value === undefined || value === null) {
    return [];
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectRecursiveText(item));
  }

  if (typeof value === 'object') {
    return Object.values(value).flatMap((item) => collectRecursiveText(item));
  }

  return [];
}

function isSandboxPath(value) {
  return /(^|\/)(tmp|temp|sandbox|test-projects?|fixtures?)(\/|$)/i.test(value);
}

function isSandboxText(value) {
  return /(^|\s)(tmp|temp|sandbox|test-projects?|fixtures?)(\/|\s|$)/i.test(value);
}

function block(reason) {
  console.error(`Blocked by Social Monitor Claude hook: ${reason} Use a sandbox/test project.`);
  process.exit(2);
}

function referencesProtectedSecretPath(value) {
  return protectedSecretPatterns().some((pattern) => pattern.test(value));
}

function bashReadsProtectedSecretPath(value) {
  if (!referencesProtectedSecretPath(value)) {
    return false;
  }

  return /\b(cat|head|tail|less|more|sed|grep|rg|awk|find|stat|wc|diff|node|python|python3|perl|ruby)\b/i.test(value);
}

function bashUsesNetworkOrCredentialTool(value) {
  return /\b(curl|wget|nc|netcat|scp|sftp|ssh|rsync|aws|gcloud|az|gh\s+auth|docker\s+login|npm\s+token|op\s+read|op\s+item|vault\s+(read|kv|get)|pass\s+show|doppler\s+secrets|kubectl\s+config\s+view|security\s+find-generic-password)\b/i.test(value);
}

function bashUsesDestructiveCommand(value) {
  return /\b(rm\s+-[^\n]*r|git\s+reset\s+--hard|git\s+checkout\s+--|git\s+clean\s+-[^\n]*[df]|chmod\s+-R\s+777|chown\s+-R)\b/i.test(value);
}

function protectedSecretPatterns() {
  return [
    /(^|[/\s"'=:])\.env($|[/\s"'])/i,
    /(^|[/\s"'=:])\.env\.(local|production|prod|staging|stage|beta|development|dev|test)($|[/\s"'])/i,
    /(^|[/\s"'=:])\.envrc($|[/\s"'])/i,
    /(^|[/\s"'=:])\.npmrc($|[/\s"'])/i,
    /(^|[/\s"'=:])\.pypirc($|[/\s"'])/i,
    /(^|[/\s"'=:])\.netrc($|[/\s"'])/i,
    /(^|\/)(secrets?|credentials?)(\/|$)/i,
    /(^|\/)\.ssh(\/|$)/i,
    /(^|\/)\.aws(\/|$)/i,
    /(^|\/)\.azure(\/|$)/i,
    /(^|\/)\.kube(\/|$)/i,
    /(^|\/)\.config\/(gh|gcloud|stripe|vercel|supabase)(\/|$)/i,
    /(^|\/)\.docker\/config\.json($|[\s"'])/i,
    /\.(pem|key|p12|pfx)($|[\s"'])/i,
    /(^|\/)(id_rsa|id_ed25519)($|[\s"'])/i,
  ];
}
