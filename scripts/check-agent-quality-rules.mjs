import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'AGENTS.md',
  'apps/frontend/AGENTS.md',
  'CLAUDE.md',
  '.claude/settings.json',
  '.claude/rules/quality-architecture.md',
  '.claude/rules/ddd-clean-architecture-folders.md',
  'apps/frontend/docs/README.md',
  'apps/frontend/docs/frontend-ux-architecture.md',
  'apps/frontend/docs/design-system-component-roadmap.md',
  'apps/frontend/docs/frontend-state-playbook.md',
  'apps/frontend/docs/frontend-api-contract-playbook.md',
  'apps/frontend/docs/frontend-testing-strategy.md',
  'apps/frontend/docs/frontend-observability-decision.md',
  'apps/frontend/docs/frontend-security-privacy-policy.md',
  'docs/architecture-memory/392-ai-agent-code-quality-governance.md',
  'scripts/create-frontend-feature.mjs',
  'scripts/claude-hook-guard.mjs',
  'scripts/claude-hook-stop-quality.mjs',
  'scripts/check-claude-hooks.mjs',
];

const requiredRootPhrases = [
  '@.claude/rules/quality-architecture.md',
  '@.claude/rules/ddd-clean-architecture-folders.md',
  'check:architecture',
  'check:claude-hooks',
  'check:code-quality',
  'check:runtime-profile-guards',
  'check:dependencies',
  'check:source-certification',
  'Do not run agent launch/provisioning/terminal-runtime/task-assignment smoke flows on real user projects',
  'hooks',
];

const requiredAgentsPhrases = [
  'CLAUDE.md',
  '.claude/rules/quality-architecture.md',
  '.claude/rules/ddd-clean-architecture-folders.md',
  '.claude/rules/flutter-frontend-quality.md',
  '.claude/rules/flutter-clean-disk-deep-lessons.md',
  'apps/frontend/AGENTS.md',
  'apps/frontend/docs/README.md',
  'docs/iterations/04-mobile-app/15-change-control.md',
  'docs/iterations/04-mobile-app/18-decision-log.md',
  'Do not run agent launch, provisioning, terminal-runtime, task-assignment or smoke-flow checks on real user projects',
  'Do not weaken architecture tests',
  'Do not reintroduce a local `apps/frontend/packages/headless_adaptive` package directory',
  'Do not create frontend feature packages manually',
  'Do not import `modularity_flutter` outside frontend app root or feature `presentation/routes` and `presentation/composition`',
  'Do not call `ModuleProvider.of` outside `*_feature_module_host.dart`',
  'Do not export feature pages directly',
  'Do not model frontend async state as loose `isLoading`/`error` fields',
  'Do not let async stores apply stale results',
  'Do not put raw provider payloads, access tokens, API keys or realistic secrets',
  'Do not add `flutter_modular` or `get_it` to frontend packages without an ADR',
  'frontend:create-feature',
  'npm run check:frontend',
  'fvm flutter test app/test/architecture/frontend_architecture_boundaries_test.dart',
];

const requiredFrontendAgentsPhrases = [
  '../../AGENTS.md',
  '../../.claude/rules/ddd-clean-architecture-folders.md',
  '../../.claude/rules/flutter-frontend-quality.md',
  'docs/README.md',
  'Feature Architecture',
  'Package Boundaries',
  'shared_kernel` stays framework-neutral',
  'app` imports feature public barrels only',
  'strict analyzer options',
  'frontend:create-feature',
  'ModuleScope',
  'typed shared async state',
  'DTO mapping stays in infrastructure mappers',
  'Localization is presentation-only',
  'Do not add `flutter_modular` or `get_it` without an ADR',
  'npm run check:frontend',
  'Local Done Checks',
  'Do not run agent launch, provisioning, terminal-runtime, task-assignment or smoke-flow checks on this real project',
];

const requiredRulePhrases = [
  'Clean Architecture',
  'SOLID',
  'DRY',
  'Dependencies point inward',
  'New feature and bounded-context folders should use DDD names',
  'Feature use cases depend on domain/application contracts',
  'typed `Result` failures',
  'SOCIAL_MONITOR_RUNTIME_PROFILE=beta',
  'check:runtime-profile-guards',
  'Generated files are build artifacts',
  'Public contracts are outer-ring details',
  'process.env',
  'Inner contracts are Clean Architecture ports by role',
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

const requiredDddFolderPhrases = [
  'Use DDD for feature meaning and Clean Architecture for dependency direction',
  '`port` and `adapter` are architectural roles, not default folder names',
  'A frontend feature package is a bounded context',
  'New frontend features must be created with `npm run frontend:create-feature',
  'New frontend features use the canonical DDD scaffold by default',
  'Every feature exposes a route entrypoint from `presentation/routes`',
  'Every feature keeps module wiring in `presentation/composition`',
  'Presentation stores use shared typed async state and stale-result guards',
  'Generated API DTOs are translated in infrastructure mappers or anti-corruption folders',
  'Localization is presentation-only',
  'Do not create default `ports/` and `adapters/` folders for new frontend feature slices',
  'Every frontend feature folder must have its own `AGENTS.md`',
  'Dart files under `features/<bounded_context>/lib/src` must live inside a DDD layer and tactical subfolder',
  'Required Scaffold Files',
  'Feature AGENTS.md Template',
  'docs/',
  'presentation/routes',
  'presentation/composition',
  'aggregates/',
  'domain_events/',
  'specifications/',
  'domain_services/',
  'application/contracts',
  'infrastructure/',
  'presentation pages/components/stores -> application -> domain',
  'Feature package dependencies may include MobX for presentation state, `generated_api` for infrastructure adapters and `modularity_flutter`',
  'Put repository/gateway abstractions in `domain`',
  'Put generated client wrappers, DTO mapping, cache and SDK code in `infrastructure`',
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

const requiredFrontendPlaybookPhrases = [
  'frontend-ux-architecture.md',
  'design-system-component-roadmap.md',
  'frontend-state-playbook.md',
  'frontend-api-contract-playbook.md',
  'frontend-testing-strategy.md',
  'frontend-observability-decision.md',
  'frontend-security-privacy-policy.md',
  'Workspace Switcher',
  'AppPermissionRepairSurface',
  'Recipe: Polling And Realtime Merge',
  'Problem Details',
  'Responsive Test Matrix',
  'Sentry',
  'Credential Repair UX',
];

const violations = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    violations.push(`${file}: required agent quality rule artifact is missing`);
  }
}

if (violations.length === 0) {
  const agents = readFileSync('AGENTS.md', 'utf8');
  const frontendAgents = readFileSync('apps/frontend/AGENTS.md', 'utf8');
  const root = readFileSync('CLAUDE.md', 'utf8');
  const settings = readFileSync('.claude/settings.json', 'utf8');
  const rules = readFileSync('.claude/rules/quality-architecture.md', 'utf8');
  const dddFolderRules = readFileSync('.claude/rules/ddd-clean-architecture-folders.md', 'utf8');
  const frontendPlaybooks = [
    readFileSync('apps/frontend/docs/README.md', 'utf8'),
    readFileSync('apps/frontend/docs/frontend-ux-architecture.md', 'utf8'),
    readFileSync('apps/frontend/docs/design-system-component-roadmap.md', 'utf8'),
    readFileSync('apps/frontend/docs/frontend-state-playbook.md', 'utf8'),
    readFileSync('apps/frontend/docs/frontend-api-contract-playbook.md', 'utf8'),
    readFileSync('apps/frontend/docs/frontend-testing-strategy.md', 'utf8'),
    readFileSync('apps/frontend/docs/frontend-observability-decision.md', 'utf8'),
    readFileSync('apps/frontend/docs/frontend-security-privacy-policy.md', 'utf8'),
  ].join('\n');
  const research = readFileSync('docs/architecture-memory/392-ai-agent-code-quality-governance.md', 'utf8');
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const verifyScript = String(packageJson.scripts?.verify ?? '');

  assertLineLimit('AGENTS.md', agents, 140);
  assertLineLimit('apps/frontend/AGENTS.md', frontendAgents, 80);
  assertLineLimit('CLAUDE.md', root, 200);
  assertLineLimit('.claude/rules/quality-architecture.md', rules, 180);
  assertLineLimit('.claude/rules/ddd-clean-architecture-folders.md', dddFolderRules, 240);
  assertContainsAll('AGENTS.md', agents, requiredAgentsPhrases);
  assertContainsAll('apps/frontend/AGENTS.md', frontendAgents, requiredFrontendAgentsPhrases);
  assertContainsAll('CLAUDE.md', root, requiredRootPhrases);
  assertContainsAll('.claude/rules/ddd-clean-architecture-folders.md', dddFolderRules, requiredDddFolderPhrases);
  assertContainsAll('apps/frontend/docs pre-scale playbooks', frontendPlaybooks, requiredFrontendPlaybookPhrases);
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

  if (!String(packageJson.scripts?.['check:frontend'] ?? '').includes('fvm flutter test packages/design_system')) {
    violations.push('package.json: missing check:frontend script covering frontend packages');
  }

  if (!String(packageJson.scripts?.['frontend:create-feature'] ?? '').includes('create-frontend-feature.mjs')) {
    violations.push('package.json: missing frontend:create-feature scaffold script');
  }

  if (!verifyScript.includes('npm run check:agent-quality-rules')) {
    violations.push('package.json: npm run verify must include check:agent-quality-rules');
  }

  if (!verifyScript.includes('npm run check:claude-hooks')) {
    violations.push('package.json: npm run verify must include check:claude-hooks');
  }

  if (!verifyScript.includes('npm run check:frontend')) {
    violations.push('package.json: npm run verify must include check:frontend');
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
