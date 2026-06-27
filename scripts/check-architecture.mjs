import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, sep } from 'node:path';

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

const platformAliases = new Map([
  ['@social-monitor/platform-config', 'libs/platform/config/src/index.ts'],
  ['@social-monitor/platform-events', 'libs/platform/events/src/index.ts'],
  ['@social-monitor/platform-grpc', 'libs/platform/grpc/src/index.ts'],
  ['@social-monitor/platform-logging', 'libs/platform/logging/src/index.ts'],
  ['@social-monitor/platform-metrics', 'libs/platform/metrics/src/index.ts'],
  ['@social-monitor/platform-persistence', 'libs/platform/persistence/src/index.ts'],
  ['@social-monitor/platform-queue', 'libs/platform/queue/src/index.ts'],
  ['@social-monitor/platform-request-context', 'libs/platform/request-context/src/index.ts'],
  ['@social-monitor/platform-worker', 'libs/platform/worker/src/index.ts'],
  ['@social-monitor/shared-kernel', 'libs/shared-kernel/src/index.ts'],
]);

const boundedContexts = new Set([
  'delivery',
  'feed',
  'identity',
  'ingestion',
  'launch',
  'monitoring',
  'privacy',
  'relevance',
  'summary',
  'usage',
]);

const platformRootAdapterExportPattern = /(?:^|\/)(?:amqplib|rabbitmq|in-memory|prisma|http|sdk|noop|fake)[a-z0-9-]*(?:adapter|publisher|repository|channel|provider|store|client|connection|adapters)?$/i;
const platformAdapterShortcutImports = new Map([
  [
    '@social-monitor/platform-events/in-memory-event-adapters',
    '@social-monitor/platform-events/adapters/in-memory',
  ],
]);

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

  if (specifier.startsWith('@social-monitor/contracts/')) {
    return resolveCandidate(specifier.replace('@social-monitor/contracts/', 'libs/contracts/'));
  }

  for (const [alias, target] of platformAliases) {
    if (specifier === alias) {
      return target;
    }

    if (specifier.startsWith(`${alias}/`)) {
      return resolveCandidate(join(dirname(target), specifier.slice(alias.length + 1)));
    }
  }

  const contextImport = specifier.match(/^@social-monitor\/([^/]+)\/(.+)$/);
  if (contextImport && boundedContexts.has(contextImport[1])) {
    return resolveCandidate(`libs/${contextImport[1]}/${contextImport[2]}`);
  }

  return null;
}

function resolveCandidate(basePath) {
  const normalized = toProjectPath(basePath);
  const candidates = extname(normalized) ? [normalized] : [`${normalized}.ts`, `${normalized}/index.ts`];

  return candidates.find((candidate) => existsSync(candidate) && isProductionTsFile(candidate)) ?? null;
}

function boundedContextOf(file) {
  const match = toProjectPath(file).match(/^libs\/([^/]+)\//);
  return match && boundedContexts.has(match[1]) ? match[1] : null;
}

function architectureLayerOf(file) {
  return toProjectPath(file).match(/^libs\/[^/]+\/(domain|features|ports|adapters|interfaces)(?:\/|$)/)?.[1] ?? null;
}

function isAppAdapterCompositionFile(file) {
  const projectPath = toProjectPath(file);
  return (
    projectPath.endsWith('.module.ts') ||
    projectPath.endsWith('.provider-tokens.ts') ||
    projectPath.includes('/src/adapters/')
  );
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
  const source = readFileSync(file, 'utf8');
  for (const specifier of importsOf(source)) {
    const resolved = resolveLocalImport(file, specifier);
    const sourceContext = boundedContextOf(file);
    const targetContext = resolved ? boundedContextOf(resolved) : null;
    const targetLayer = resolved ? architectureLayerOf(resolved) : null;

    if (specifier.startsWith('.') && sourceContext && targetContext && sourceContext !== targetContext) {
      addViolation(file, `cross-context relative import is forbidden: "${specifier}" resolves to "${resolved}"`);
    }

    if (sourceContext && targetContext && sourceContext !== targetContext && targetLayer === 'adapters') {
      addViolation(file, `cross-context adapter import is forbidden: "${specifier}" resolves to "${resolved}"`);
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

    if (resolved && boundedContextOf(resolved) && architectureLayerOf(resolved) === 'adapters' && !isAppAdapterCompositionFile(file)) {
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
