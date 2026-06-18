import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'CLAUDE.md',
  '.claude/settings.json',
  '.claude/rules/quality-architecture.md',
  'docs/architecture-memory/392-ai-agent-code-quality-governance.md',
  'scripts/claude-hook-guard.mjs',
  'scripts/claude-hook-stop-quality.mjs',
  'scripts/check-claude-hooks.mjs',
];

const requiredRootPhrases = [
  '@.claude/rules/quality-architecture.md',
  'check:architecture',
  'check:claude-hooks',
  'check:code-quality',
  'check:runtime-profile-guards',
  'check:dependencies',
  'check:source-certification',
  'Do not run agent launch/provisioning/terminal-runtime/task-assignment smoke flows on real user projects',
  'hooks',
];

const requiredRulePhrases = [
  'Clean Architecture',
  'SOLID',
  'DRY',
  'Dependencies point inward',
  'Feature use cases depend on ports',
  'typed `Result` failures',
  'SOCIAL_MONITOR_RUNTIME_PROFILE=beta',
  'check:runtime-profile-guards',
  'Generated files are build artifacts',
  'Public contracts are outer-ring details',
  'process.env',
  'Ports are inner-boundary abstractions',
  'require(...)',
  'dynamic `import(...)`',
  'runtime circular dependencies',
  'deep-relative',
  'adapter-backed readiness data',
  'composition roots may import adapters',
  'Platform root barrels',
  'core ports/primitives only',
  'platform queue/event adapters',
  'legacy adapter shortcuts',
  'shared-kernel redaction helpers',
  'shared-kernel outbound URL policy',
  'SSRF',
  'AbortSignal.timeout',
  'Interface controllers, gateways',
  'env-derived config',
  'App controllers',
  'WorkspaceRoleHeaderParser',
  'RequestCorrelationIdFactory',
  'parsePaginationLimit',
  'Clock',
  'SystemClock`/`CryptoIdGenerator',
  'CLAUDE_PROJECT_DIR',
  'command` + `args',
  'Claude permissions',
  'credential CLIs',
  'destructive reset commands',
  'tenant and workspace scope',
  'runtimeReadiness',
  'live_beta_ready',
];

const requiredResearchPhrases = [
  'Claude Code memory and rules',
  'Claude Code hooks',
  'TaskCreated',
  'stop_hook_active',
  'Clean Architecture dependency rule',
  'No new runtime selector exists without beta fail-fast coverage',
  'No broad abstraction is added only to make code look DRY',
  'No adapter or port reads `process.env`',
  'dynamic `import(...)`',
  'circular dependencies',
  'deep-relative',
  'adapter-backed readiness data',
  'composition roots may import adapters',
  'Platform root barrels',
  'core ports/primitives only',
  'platform queue/event adapters',
  'legacy adapter shortcuts',
  'shared-kernel redaction helpers',
  'shared-kernel outbound URL policy',
  'SSRF',
  'AbortSignal.timeout',
  'env-derived config',
  'provider-backed reporters',
  'WorkspaceRoleHeaderParser',
  'RequestCorrelationIdFactory',
  'parsePaginationLimit',
  'ESLint import restrictions limitation',
  'CLAUDE_PROJECT_DIR',
  'command` + `args',
  'fail closed for secrets',
  'Bash subprocess secret reads',
  'Feature use cases return `Result`',
  'Claude Code hooks are enforcement',
  'SystemClock`/`CryptoIdGenerator',
];

const violations = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    violations.push(`${file}: required agent quality rule artifact is missing`);
  }
}

if (violations.length === 0) {
  const root = readFileSync('CLAUDE.md', 'utf8');
  const settings = readFileSync('.claude/settings.json', 'utf8');
  const rules = readFileSync('.claude/rules/quality-architecture.md', 'utf8');
  const research = readFileSync('docs/architecture-memory/392-ai-agent-code-quality-governance.md', 'utf8');
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const verifyScript = String(packageJson.scripts?.verify ?? '');

  assertLineLimit('CLAUDE.md', root, 200);
  assertLineLimit('.claude/rules/quality-architecture.md', rules, 180);
  assertContainsAll('CLAUDE.md', root, requiredRootPhrases);
  assertContainsAll('.claude/settings.json', settings, [
    'PreToolUse',
    'Bash|Read|Edit|Write|MultiEdit|NotebookEdit|Grep|Glob|Agent',
    'TaskCreated',
    'Stop',
    'CLAUDE_PROJECT_DIR',
    'disableAutoMode',
    'disableBypassPermissionsMode',
    'Read(//**/.env)',
    'Read(//**/.npmrc)',
    'Read(//**/.kube/**)',
    'Read(//**/.config/gh/**)',
    'Write(//**/*.pem)',
    'Write(//**/.docker/config.json)',
    'claude-hook-guard.mjs',
    'claude-hook-stop-quality.mjs',
  ]);
  assertContainsAll('.claude/rules/quality-architecture.md', rules, requiredRulePhrases);
  assertContainsAll('docs/architecture-memory/392-ai-agent-code-quality-governance.md', research, requiredResearchPhrases);

  if (!String(packageJson.scripts?.['check:agent-quality-rules'] ?? '').includes('check-agent-quality-rules.mjs')) {
    violations.push('package.json: missing check:agent-quality-rules script');
  }

  if (!String(packageJson.scripts?.['check:claude-hooks'] ?? '').includes('check-claude-hooks.mjs')) {
    violations.push('package.json: missing check:claude-hooks script');
  }

  if (!verifyScript.includes('npm run check:agent-quality-rules')) {
    violations.push('package.json: npm run verify must include check:agent-quality-rules');
  }

  if (!verifyScript.includes('npm run check:claude-hooks')) {
    violations.push('package.json: npm run verify must include check:claude-hooks');
  }

  if (!readFileSync('.gitignore', 'utf8').includes('CLAUDE.local.md')) {
    violations.push('.gitignore: CLAUDE.local.md must stay ignored for private per-worktree preferences');
  }

  if (!readFileSync('.gitignore', 'utf8').includes('!CLAUDE.md')) {
    violations.push('.gitignore: CLAUDE.md must stay unignored as shared project guidance');
  }

  if (!readFileSync('.gitignore', 'utf8').includes('!.claude/settings.json')) {
    violations.push('.gitignore: .claude/settings.json must stay unignored as a shared project hook config');
  }

  if (!readFileSync('.gitignore', 'utf8').includes('!.claude/rules/*.md')) {
    violations.push('.gitignore: .claude/rules/*.md must stay unignored as shared project rules');
  }

  if (!readFileSync('.gitignore', 'utf8').includes('.serena/')) {
    violations.push('.gitignore: .serena/ must stay ignored as local tool metadata');
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Agent quality rules OK');

function assertLineLimit(file, source, maxLines) {
  const lineCount = source.split('\n').length;
  if (lineCount > maxLines) {
    violations.push(`${file}: expected at most ${maxLines} lines, got ${lineCount}`);
  }
}

function assertContainsAll(file, source, phrases) {
  for (const phrase of phrases) {
    if (!source.includes(phrase)) {
      violations.push(`${file}: missing required phrase "${phrase}"`);
    }
  }
}
