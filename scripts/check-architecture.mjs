import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';

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
  .map((target) => target.match(/^libs\/([^/]+)\//)?.[1])
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

function importsOf(source) {
  const specifiers = [];
  const patterns = [
    /(?:import|export)\s+(?:type\s+)?(?:[^'"]+from\s+)?['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

function runtimeImportsOf(source) {
  const specifiers = [];
  const staticPatterns = [
    /\b(import|export)\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ];
  const dynamicPatterns = [
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const match of source.matchAll(staticPatterns[0])) {
    const clause = match[2].trim();
    if (!isTypeOnlyImportExport(clause)) {
      specifiers.push(match[3]);
    }
  }

  for (const match of source.matchAll(staticPatterns[1])) {
    specifiers.push(match[1]);
  }

  for (const pattern of dynamicPatterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

function isTypeOnlyImportExport(clause) {
  if (clause.startsWith('type ')) {
    return true;
  }

  const namedExports = clause.match(/^\{\s*([\s\S]*?)\s*\}$/);
  if (!namedExports) {
    return false;
  }

  return namedExports[1]
    .split(',')
    .map((specifier) => specifier.trim())
    .filter(Boolean)
    .every((specifier) => specifier.startsWith('type '));
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
    ?? null;
}

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
