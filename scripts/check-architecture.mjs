import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';
import ts from 'typescript';

const forbiddenInDomain = [
  '@nestjs/',
  '@prisma/',
  '@social-monitor/contracts',
  'prisma',
  'typeorm',
  'sequelize',
  'mongoose',
  'kafkajs',
  'amqplib',
  '@grpc/',
  '@agent-teams/',
  'class-validator',
  'class-transformer',
  '@nestjs/swagger',
  '/interfaces/',
];

const forbiddenInFeatures = [
  '/adapters/',
  '/interfaces/',
  '@social-monitor/contracts',
  '@nestjs/',
  '@prisma/',
  'kafkajs',
  'amqplib',
  '@grpc/',
  '@agent-teams/',
  '@nestjs/swagger',
  'class-validator',
  'class-transformer',
];

const forbiddenInPorts = [
  '@nestjs/',
  '@prisma/',
  '@social-monitor/contracts',
  '/adapters/',
  '/interfaces/',
  'prisma',
  'typeorm',
  'sequelize',
  'mongoose',
  'kafkajs',
  'amqplib',
  '@grpc/',
  '@agent-teams/',
  '@nestjs/swagger',
  'class-validator',
  'class-transformer',
];

const violations = [];

// The compiler's configured aliases are the source of truth. A new context or
// platform package must not silently disappear from dependency-cycle checks.
const compilerPaths = JSON.parse(readFileSync('tsconfig.json', 'utf8')).compilerOptions.paths;
const configuredAliases = Object.entries(compilerPaths)
  .sort(([left], [right]) => right.replace('*', '').length - left.replace('*', '').length);
const boundedContexts = new Set(Object.values(compilerPaths).flat()
  .map((target) => target.match(/^(?:\.\/)?libs\/([^/]+)\//)?.[1])
  .filter((context) => context && !['platform', 'shared-kernel', 'contracts'].includes(context)));
const businessContextImportPattern =
  /^@social-monitor\/([^/]+)\/(domain|features|adapters|interfaces)(?:\/|$)/;
const subscriptionMonitoringAdapter =
  'libs/subscriptions/adapters/monitoring/monitoring-interest-source-provisioner.adapter.ts';
const subscriptionCompositionRoot =
  'libs/subscriptions/interfaces/rest/subscriptions-rest.module.ts';
const identityCompositionRoot =
  'libs/identity/interfaces/rest/identity-rest.module.ts';

const platformRootAdapterExportPattern = /(?:^|\/)(?:amqplib|rabbitmq|in-memory|prisma|http|sdk|noop|fake)[a-z0-9-]*(?:adapter|publisher|repository|channel|provider|store|client|connection|adapters)?$/i;
const platformAdapterShortcutImports = new Map([
  [
    '@social-monitor/platform-events/in-memory-event-adapters',
    '@social-monitor/platform-events/adapters/in-memory',
  ],
]);

const socialResearchTransportInterfaceRoots = [
  'libs/social-research/interfaces/mcp/',
  'libs/social-research/interfaces/rest/',
  'libs/social-research/interfaces/grpc/',
  'libs/social-research/interfaces/tools/',
];

const forbiddenInSocialResearchApplication = [
  '@grpc/',
  '@agent-teams/',
  '@modelcontextprotocol/',
  '@nestjs/',
  '@prisma/',
  '@social-monitor/ingestion',
  '@social-monitor/contracts',
  '/interfaces/',
  '/infrastructure/',
];

const forbiddenInSocialResearchTransportInterfaces = [
  '@social-monitor/ingestion',
  '@social-monitor/social-research/cache',
  '@social-monitor/social-research/ingestion',
  '/infrastructure/',
  '/adapters/source/',
  'EphemeralSocialResearchResultCache',
  'PrismaSocialResearchResultCache',
  'reddit-client',
  'reddit-token',
  'SourceFetcherPort',
  'SourceFetcherSocialResearchGateway',
];

const forbiddenInSocialResearchMcpAdapter = [
  '@grpc/',
  '@nestjs/',
  '@social-monitor/contracts',
  '@social-monitor/identity',
  '@social-monitor/monitoring',
];

// The repository already uses TypeScript. Its syntax tree distinguishes real
// module references from comments, strings, regex literals and template text;
// regex matching here previously produced both false positives and bypasses.
// Keep type-only edges for the architecture gate, but exclude them from cycles.
function moduleReferencesOf(source) {
  const file = ts.createSourceFile('architecture.ts', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const imports = [];
  const runtimeImports = [];

  // Type assertions and grouping do not make an otherwise constant module
  // path dynamic. Inspect the wrapped literal without evaluating expressions.
  function unwrapTransparentExpression(expression) {
    let node = expression;
    while (node && (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node)
    )) {
      node = node.expression;
    }
    return node;
  }

  function add(specifier, isRuntime) {
    const literal = unwrapTransparentExpression(specifier);
    if (!literal || !(ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal))) return;
    imports.push(literal.text);
    if (isRuntime) runtimeImports.push(literal.text);
  }

  function runtimeImportClause(clause) {
    if (!clause) return true;
    if (clause.isTypeOnly) return false;
    if (clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return true;
    return clause.namedBindings.elements.length === 0 ||
      clause.namedBindings.elements.some((element) => !element.isTypeOnly);
  }

  function runtimeExportDeclaration(declaration) {
    if (declaration.isTypeOnly) return false;
    const clause = declaration.exportClause;
    return !clause || !ts.isNamedExports(clause) || clause.elements.length === 0 ||
      clause.elements.some((element) => !element.isTypeOnly);
  }

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      add(node.moduleSpecifier, runtimeImportClause(node.importClause));
    } else if (ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier, runtimeExportDeclaration(node));
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, !node.isTypeOnly);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal, false);
    } else if (ts.isCallExpression(node)) {
      const callee = unwrapTransparentExpression(node.expression);
      if (callee.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(callee) && callee.text === 'require')) {
        add(node.arguments[0], true);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return { imports, runtimeImports };
}

function importsOf(source) {
  return moduleReferencesOf(source).imports;
}

function runtimeImportsOf(source) {
  return moduleReferencesOf(source).runtimeImports;
}

function addViolation(file, reason) {
  violations.push(`${relative(process.cwd(), file)}: ${reason}`);
}

function toProjectPath(file) {
  return normalize(file).split(sep).join('/');
}

function isProductionTsFile(file) {
  const projectPath = toProjectPath(file);
  return (
    (projectPath.startsWith('apps/') || projectPath.startsWith('libs/')) &&
    projectPath.endsWith('.ts') &&
    !projectPath.endsWith('.d.ts') &&
    !projectPath.endsWith('.spec.ts') &&
    !projectPath.endsWith('.test.ts') &&
    !projectPath.endsWith('.e2e-spec.ts') &&
    !projectPath.includes('/generated/')
  );
}

function resolveLocalImport(fromFile, specifier) {
  if (specifier.startsWith('.')) {
    return resolveCandidate(join(dirname(fromFile), specifier));
  }

  for (const [alias, targets] of configuredAliases) {
    const star = alias.indexOf('*');
    if (star === -1 && specifier !== alias) continue;
    const prefix = star === -1 ? alias : alias.slice(0, star);
    const suffix = star === -1 ? '' : alias.slice(star + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    const wildcard = star === -1 ? '' : specifier.slice(prefix.length, specifier.length - suffix.length);
    for (const target of targets) {
      const resolved = resolveCandidate(target.replace('*', wildcard));
      if (resolved !== null) return resolved;
    }
  }

  return null;
}

function resolveCandidate(basePath) {
  const normalized = toProjectPath(basePath);
  // Dotted source basenames such as *.use-case and *.adapter are not file
  // extensions. They still resolve to TypeScript files for boundary checks.
  const candidates = [normalized, `${normalized}.ts`, `${normalized}/index.ts`];

  return candidates.find((candidate) => existsSync(candidate) && isProductionTsFile(candidate)) ?? null;
}

function boundedContextOf(file) {
  const match = toProjectPath(file).match(/^libs\/([^/]+)\//);
  return match && boundedContexts.has(match[1]) ? match[1] : null;
}

function architectureLayerOf(file) {
  const path = toProjectPath(file);
  return path.match(/^libs\/[^/]+\/(domain|features|application|ports|adapters|infrastructure|interfaces|presentation)(?:\/|$)/)?.[1]
    ?? path.match(/^libs\/platform\/[^/]+\/src\/(adapters|infrastructure|interfaces)(?:\/|$)/)?.[1]
    ?? (/^libs\/platform\/persistence\/src\/prisma-/.test(path) ? 'infrastructure' : null)
    ?? null;
}

// A root alias that *only* republishes its own domain is a domain dependency,
// even though the root index file has no layer in its path. Do not infer a layer
// for mixed public/composition entrypoints or walk arbitrarily deep barrels.
function isDomainOnlyContextRoot(file) {
  const path = toProjectPath(file);
  if (!/^libs\/[^/]+\/index\.ts$/.test(path)) return false;
  const root = ts.createSourceFile(path, readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  return root.statements.length > 0 && root.statements.every((statement) =>
    ts.isExportDeclaration(statement) &&
    statement.moduleSpecifier &&
    ts.isStringLiteral(statement.moduleSpecifier) &&
    /^\.\/domain(?:\/|$)/.test(statement.moduleSpecifier.text));
}

// Exact current-main debt, not a permission to create new cross-context domain edges.
// Remove entries when a consumer-owned published-language contract replaces the import.
const legacyCrossContextDomainImports = new Set([
  'libs/conversation/domain/value-objects/conversation-signal-baseline-sample.ts|@social-monitor/feed/domain',
  'libs/conversation/domain/services/conversation-bundle-builder.ts|@social-monitor/feed/domain',
  'libs/summary/domain/policies/reader-summary-github-projection-audit-types.ts|@social-monitor/ingestion/domain',
  'libs/summary/domain/policies/reader-summary-github-archived-projection.ts|@social-monitor/ingestion/domain',
  'libs/summary/domain/policies/reader-post-promotion-v3.ts|@social-monitor/relevance/domain/reader-value/reader-value-assessment',
  'libs/summary/domain/policies/reader-promotion-ranking.ts|@social-monitor/relevance/domain/reader-value/reader-value-assessment',
  'libs/summary/domain/policies/reader-post-promotion-policy-contract.ts|@social-monitor/relevance/domain/reader-value/reader-value-assessment',
  'libs/summary/domain/entities/reader-summary-promotion-order-validation.ts|@social-monitor/relevance/domain/reader-value/reader-value-assessment',
  'libs/delivery/domain/reader-summary-ready-projection.ts|@social-monitor/summary/domain/value-objects/reader-summary-period',
  'libs/delivery/domain/reader-summary-ready-projection.ts|@social-monitor/summary/domain/value-objects/reader-summary-scope',
]);

const forbiddenTargetLayers = {
  domain: new Set(['features', 'application', 'adapters', 'infrastructure', 'interfaces', 'presentation']),
  features: new Set(['adapters', 'infrastructure', 'interfaces', 'presentation']),
  application: new Set(['adapters', 'infrastructure', 'interfaces', 'presentation']),
  ports: new Set(['features', 'adapters', 'infrastructure', 'interfaces', 'presentation']),
};

function isUnder(projectPath, root) {
  return projectPath === root.replace(/\/$/, '') || projectPath.startsWith(root);
}

function isAppAdapterCompositionFile(file) {
  const projectPath = toProjectPath(file);
  return (
    projectPath.endsWith('.module.ts') ||
    projectPath.endsWith('.provider-tokens.ts') ||
    projectPath.includes('/src/adapters/')
  );
}

function isContextCompositionFile(file) {
  const path = toProjectPath(file);
  return /^libs\/[^/]+\/interfaces\/.+(?:\.module|\.providers)\.ts$/.test(path)
    || /^libs\/[^/]+\/adapters\/composition\/[^/]+\.ts$/.test(path);
}

function addRuntimeCycleViolations() {
  const files = [...globSync('apps/**/*.ts'), ...globSync('libs/**/*.ts')]
    .map(toProjectPath)
    .filter(isProductionTsFile);
  const fileSet = new Set(files);
  const graph = new Map();

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const dependencies = runtimeImportsOf(source)
      .map((specifier) => resolveLocalImport(file, specifier))
      .filter((resolved) => resolved && fileSet.has(resolved));

    graph.set(file, [...new Set(dependencies)]);
  }

  for (const cycle of detectRuntimeCycles(graph)) {
    addViolation(
      cycle[0],
      `runtime circular dependency detected: ${cycle.map((file) => relative(process.cwd(), file)).join(' -> ')}`,
    );
  }
}

function detectRuntimeCycles(graph) {
  const cycles = [];
  const seenCycles = new Set();
  const state = new Map();
  const stack = [];
  const stackIndex = new Map();
  const maxCycles = 25;

  for (const node of graph.keys()) {
    if (!state.has(node)) {
      visit(node);
    }

    if (cycles.length >= maxCycles) {
      break;
    }
  }

  return cycles;

  function visit(node) {
    state.set(node, 'visiting');
    stackIndex.set(node, stack.length);
    stack.push(node);

    for (const next of graph.get(node) ?? []) {
      if (state.get(next) === 'visiting') {
        const cycle = [...stack.slice(stackIndex.get(next)), next];
        const key = canonicalCycleKey(cycle);
        if (!seenCycles.has(key)) {
          seenCycles.add(key);
          cycles.push(cycle);
        }
      } else if (!state.has(next)) {
        visit(next);
      }

      if (cycles.length >= maxCycles) {
        break;
      }
    }

    stack.pop();
    stackIndex.delete(node);
    state.set(node, 'visited');
  }
}

function canonicalCycleKey(cycle) {
  const nodes = cycle.slice(0, -1);
  return nodes
    .map((_, index) => [...nodes.slice(index), ...nodes.slice(0, index)].join(' -> '))
    .sort()[0];
}

for (const file of [
  ...globSync('apps/**/*.ts'),
  ...globSync('libs/**/*.ts'),
  ...globSync('scripts/**/*.{ts,mjs}'),
  ...globSync('test/**/*.ts'),
]) {
  const source = readFileSync(file, 'utf8');
  for (const specifier of importsOf(source)) {
    const replacement = platformAdapterShortcutImports.get(specifier);
    if (replacement !== undefined) {
      addViolation(file, `platform adapter shortcut "${specifier}" is forbidden; use "${replacement}"`);
    }
  }
}

for (const file of globSync('libs/**/domain/**/*.ts')) {
  const source = readFileSync(file, 'utf8');
  if (source.includes('process.env')) {
    addViolation(file, 'domain must not read process.env');
  }

  for (const specifier of importsOf(source)) {
    if (forbiddenInDomain.some((forbidden) => specifier.includes(forbidden))) {
      addViolation(file, `domain imports forbidden dependency "${specifier}"`);
    }
  }
}

for (const file of globSync('libs/**/features/**/*.ts')) {
  const source = readFileSync(file, 'utf8');
  if (source.includes('process.env')) {
    addViolation(file, 'feature use cases must receive runtime configuration through ports or commands, not process.env');
  }

  for (const specifier of importsOf(source)) {
    if (forbiddenInFeatures.some((forbidden) => specifier.includes(forbidden))) {
      addViolation(file, `feature imports forbidden dependency "${specifier}"`);
    }
  }
}

for (const file of globSync('libs/subscriptions/domain/**/*.ts').filter(isProductionTsFile)) {
  const source = readFileSync(file, 'utf8');
  for (const specifier of importsOf(source)) {
    const crossContextImport = specifier.match(businessContextImportPattern);
    if (
      crossContextImport !== null &&
      crossContextImport[1] !== 'subscriptions'
    ) {
      addViolation(
        file,
        `subscription domain must own its language instead of importing "${specifier}"`,
      );
    }
  }
}

for (const file of globSync('libs/subscriptions/features/**/*.ts').filter(isProductionTsFile)) {
  const source = readFileSync(file, 'utf8');
  for (const specifier of importsOf(source)) {
    const crossContextImport = specifier.match(businessContextImportPattern);
    if (
      crossContextImport !== null &&
      crossContextImport[1] !== 'subscriptions'
    ) {
      addViolation(
        file,
        `subscription features must use consumer-owned ports instead of private cross-context import "${specifier}"`,
      );
    }
  }
}

for (const file of globSync('libs/subscriptions/**/*.ts').filter(isProductionTsFile)) {
  if (
    file === subscriptionMonitoringAdapter ||
    file === subscriptionCompositionRoot
  ) {
    continue;
  }
  const source = readFileSync(file, 'utf8');
  for (const specifier of importsOf(source)) {
    if (specifier.startsWith('@social-monitor/monitoring/features/')) {
      addViolation(
        file,
        `monitoring feature integration must stay behind the subscription provisioner adapter: "${specifier}"`,
      );
    }
  }
}

for (const file of globSync('libs/identity/interfaces/**/*.ts').filter(isProductionTsFile)) {
  if (file === identityCompositionRoot) {
    continue;
  }
  const source = readFileSync(file, 'utf8');
  for (const specifier of importsOf(source)) {
    if (specifier.startsWith('@social-monitor/usage/')) {
      addViolation(
        file,
        `identity interfaces must use identity-owned audit and rate-limit ports instead of "${specifier}"`,
      );
    }
  }
}

for (const file of globSync('libs/**/ports/**/*.ts')) {
  const source = readFileSync(file, 'utf8');
  if (source.includes('process.env')) {
    addViolation(file, 'ports must receive runtime configuration explicitly from interfaces/composition roots, not process.env');
  }

  for (const specifier of importsOf(source)) {
    if (forbiddenInPorts.some((forbidden) => specifier.includes(forbidden))) {
      addViolation(file, `port imports forbidden dependency "${specifier}"`);
    }
  }
}

for (const file of globSync('libs/platform/*/src/index.ts')) {
  const source = readFileSync(file, 'utf8');
  for (const specifier of importsOf(source)) {
    if (isPlatformRootAdapterExport(specifier)) {
      addViolation(file, `platform root barrel must not re-export adapter implementation "${specifier}"`);
    }
  }
}

function isPlatformRootAdapterExport(specifier) {
  if (specifier.startsWith('./adapters/')) {
    return true;
  }

  return platformRootAdapterExportPattern.test(specifier.replace(/^\.\//, ''));
}

for (const file of globSync('libs/**/*.ts')) {
  // Integration tests compose concrete fakes across contexts. The existing
  // dependency-string gates above still cover test inner-layer imports.
  if (!isProductionTsFile(file)) continue;
  const source = readFileSync(file, 'utf8');
  for (const specifier of importsOf(source)) {
    const resolved = resolveLocalImport(file, specifier);
    const sourceContext = boundedContextOf(file);
    const targetContext = resolved ? boundedContextOf(resolved) : null;
    const targetLayer = resolved ? architectureLayerOf(resolved) : null;
    const sourceLayer = architectureLayerOf(file);

    if (sourceLayer === 'domain' && sourceContext && targetContext &&
        sourceContext !== targetContext &&
        (targetLayer === 'domain' ||
          (targetLayer === null && isDomainOnlyContextRoot(resolved))) &&
        !legacyCrossContextDomainImports.has(toProjectPath(file) + '|' + specifier)) {
      addViolation(file, 'cross-context domain import is forbidden: ' + JSON.stringify(specifier) +
        ' resolves to ' + JSON.stringify(resolved));
    }

    if (resolved && forbiddenTargetLayers[sourceLayer]?.has(targetLayer)) {
      addViolation(file, `${sourceLayer} must not import ${targetLayer}: "${specifier}" resolves to "${resolved}"`);
    }
    if (resolved?.startsWith('libs/contracts/') && forbiddenTargetLayers[sourceLayer]) {
      addViolation(file, `${sourceLayer} must not import public contracts: "${specifier}" resolves to "${resolved}"`);
    }

    if (specifier.startsWith('.') && sourceContext && targetContext && sourceContext !== targetContext) {
      addViolation(file, `cross-context relative import is forbidden: "${specifier}" resolves to "${resolved}"`);
    }

    if (sourceContext && targetContext && sourceContext !== targetContext && ['adapters', 'infrastructure'].includes(targetLayer) && !isContextCompositionFile(file)) {
      addViolation(file, `cross-context adapter import is forbidden: "${specifier}" resolves to "${resolved}"`);
    }
  }
}

for (const file of globSync('libs/social-research/application/**/*.ts')) {
  if (!isProductionTsFile(file)) {
    continue;
  }

  const source = readFileSync(file, 'utf8');
  for (const specifier of importsOf(source)) {
    if (forbiddenInSocialResearchApplication.some((forbidden) => specifier.includes(forbidden))) {
      addViolation(file, `social-research application imports forbidden dependency "${specifier}"`);
    }

    const resolved = resolveLocalImport(file, specifier);
    if (
      resolved?.startsWith('libs/social-research/interfaces/') ||
      resolved?.startsWith('libs/social-research/infrastructure/')
    ) {
      addViolation(file, `social-research application must not depend on interface/infrastructure code: "${specifier}" resolves to "${resolved}"`);
    }
  }
}

for (const file of globSync('libs/social-research/interfaces/**/*.ts')) {
  if (!isProductionTsFile(file)) {
    continue;
  }

  const projectPath = toProjectPath(file);
  if (!socialResearchTransportInterfaceRoots.some((root) => isUnder(projectPath, root))) {
    continue;
  }

  const source = readFileSync(file, 'utf8');
  for (const specifier of importsOf(source)) {
    if (forbiddenInSocialResearchTransportInterfaces.some((forbidden) => specifier.includes(forbidden))) {
      addViolation(file, `social-research transport adapter imports provider/runtime dependency "${specifier}"`);
    }

    if (
      isUnder(projectPath, 'libs/social-research/interfaces/mcp/') &&
      forbiddenInSocialResearchMcpAdapter.some((forbidden) => specifier.includes(forbidden))
    ) {
      addViolation(file, `social-research MCP adapter must stay transport-thin; forbidden dependency "${specifier}"`);
    }

    const resolved = resolveLocalImport(file, specifier);
    if (resolved?.startsWith('libs/social-research/infrastructure/')) {
      addViolation(file, `social-research transport adapter must not depend on infrastructure code: "${specifier}" resolves to "${resolved}"`);
    }
  }
}

{
  const coreEntryPoint = 'libs/social-research/index.ts';
  if (existsSync(coreEntryPoint)) {
    const source = readFileSync(coreEntryPoint, 'utf8');
    for (const specifier of importsOf(source)) {
      if (specifier.includes('./interfaces/') || specifier.includes('./infrastructure/')) {
        addViolation(coreEntryPoint, `core social-research entrypoint must not export interface/infrastructure dependency "${specifier}"`);
      }
    }
  }
}

for (const file of globSync('apps/**/*.ts').map(toProjectPath).filter(isProductionTsFile)) {
  const source = readFileSync(file, 'utf8');
  for (const specifier of importsOf(source)) {
    const resolved = resolveLocalImport(file, specifier);
    if (specifier.startsWith('.') && resolved?.startsWith('libs/')) {
      addViolation(file, `apps must import libs through @social-monitor aliases, not deep-relative path "${specifier}"`);
    }

    if (resolved && boundedContextOf(resolved) && ['adapters', 'infrastructure'].includes(architectureLayerOf(resolved)) && !isAppAdapterCompositionFile(file)) {
      addViolation(
        file,
        `app services/controllers/reporters must receive adapter-backed data through module providers; only composition roots may import "${specifier}"`,
      );
    }
  }
}

addRuntimeCycleViolations();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Architecture boundaries OK');
