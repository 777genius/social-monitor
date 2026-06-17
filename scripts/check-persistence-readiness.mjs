import { existsSync, globSync, readFileSync } from 'node:fs';

const normalizePath = (value) => value.replaceAll('\\', '/');

const contractPath = 'ops/release/persistence-readiness-contract.json';
const packagePath = 'package.json';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const verifyScript = String(packageJson.scripts?.verify ?? '');
const violations = [];

const statefulInMemoryPattern =
  /\bInMemory[A-Za-z0-9]*(?:Repository|Ledger|Log|Counter|QueueAdapter|QueuePublisher|OutboxAdapter|IdempotencyAdapter|ReplayStore|SecretVault|Reader|LeaseAdapter|EventPublisher)\b/g;
const noopAdapterPattern = /\bNoop[A-Za-z0-9]*Adapter\b/g;
const runtimeModuleFiles = [
  ...globSync('libs/*/interfaces/rest/*.module.ts'),
  ...globSync('apps/*/src/*.module.ts'),
].sort();

if (contract.schemaVersion !== 1) {
  violations.push(`${contractPath}: schemaVersion must be 1`);
}

if (contract.posture !== 'durability_gap_declared') {
  violations.push(`${contractPath}: posture must be durability_gap_declared`);
}

if (contract.mvpRuntimeDecision?.blocksExternalBeta !== true) {
  violations.push(`${contractPath}: mvpRuntimeDecision.blocksExternalBeta must be true until durable adapters exist`);
}

for (const field of ['allowedRuntime', 'owner']) {
  if (typeof contract.mvpRuntimeDecision?.[field] !== 'string' || contract.mvpRuntimeDecision[field].trim().length === 0) {
    violations.push(`${contractPath}: mvpRuntimeDecision.${field} must be non-empty`);
  }
}

if (!Array.isArray(contract.mvpRuntimeDecision?.exitCriteria) || contract.mvpRuntimeDecision.exitCriteria.length < 3) {
  violations.push(`${contractPath}: mvpRuntimeDecision.exitCriteria must list concrete durable-adapter exit criteria`);
}

const moduleContracts = new Map();
for (const moduleContract of contract.runtimeModules ?? []) {
  const moduleFile = normalizePath(moduleContract.moduleFile);
  if (moduleContracts.has(moduleFile)) {
    violations.push(`${contractPath}: duplicate runtime module "${moduleContract.moduleFile}"`);
  }
  moduleContracts.set(moduleFile, {
    ...moduleContract,
    moduleFile,
  });

  if (!existsSync(moduleContract.moduleFile)) {
    violations.push(`${contractPath}: runtime module "${moduleContract.moduleFile}" does not exist`);
  }

  for (const field of ['context', 'owner', 'risk', 'durableReplacementPlan']) {
    if (typeof moduleContract[field] !== 'string' || moduleContract[field].trim().length === 0) {
      violations.push(`${contractPath}: runtime module "${moduleContract.moduleFile}" must define ${field}`);
    }
  }

  if (!Array.isArray(moduleContract.inMemoryStateAdapters) || moduleContract.inMemoryStateAdapters.length === 0) {
    violations.push(`${contractPath}: runtime module "${moduleContract.moduleFile}" must list inMemoryStateAdapters`);
  }
}

for (const moduleFile of runtimeModuleFiles) {
  const normalizedModuleFile = normalizePath(moduleFile);
  const source = readFileSync(moduleFile, 'utf8');
  const discovered = uniqueMatches(source, statefulInMemoryPattern);
  const moduleContract = moduleContracts.get(normalizedModuleFile);

  if (discovered.length === 0) {
    continue;
  }

  if (!moduleContract) {
    violations.push(
      `${normalizedModuleFile}: stateful in-memory runtime adapters are not declared in ${contractPath}: ${discovered.join(', ')}`,
    );
    continue;
  }

  const declared = [...new Set(moduleContract.inMemoryStateAdapters ?? [])].sort();
  const missing = discovered.filter((adapter) => !declared.includes(adapter));
  const stale = declared.filter((adapter) => !discovered.includes(adapter));

  if (missing.length > 0) {
    violations.push(`${normalizedModuleFile}: missing persistence readiness declarations for ${missing.join(', ')}`);
  }

  if (stale.length > 0) {
    violations.push(`${contractPath}: runtime module "${moduleFile}" declares stale adapters: ${stale.join(', ')}`);
  }
}

const noopContracts = new Map();
for (const noopContract of contract.runtimeNoopAdapters ?? []) {
  const moduleFile = normalizePath(noopContract.moduleFile);
  const key = `${moduleFile}:${noopContract.adapter}`;
  if (noopContracts.has(key)) {
    violations.push(`${contractPath}: duplicate noop adapter declaration "${key}"`);
  }
  noopContracts.set(key, {
    ...noopContract,
    moduleFile,
  });

  for (const field of ['moduleFile', 'adapter', 'owner', 'risk', 'durableReplacementPlan']) {
    if (typeof noopContract[field] !== 'string' || noopContract[field].trim().length === 0) {
      violations.push(`${contractPath}: noop adapter declaration "${key}" must define ${field}`);
    }
  }
}

for (const moduleFile of runtimeModuleFiles) {
  const normalizedModuleFile = normalizePath(moduleFile);
  const source = readFileSync(moduleFile, 'utf8');
  for (const noopAdapter of uniqueMatches(source, noopAdapterPattern)) {
    const key = `${normalizedModuleFile}:${noopAdapter}`;
    if (!noopContracts.has(key)) {
      violations.push(`${normalizedModuleFile}: runtime noop adapter "${noopAdapter}" must be declared in ${contractPath}`);
    }
  }
}

if (!verifyScript.includes('npm run check:persistence-readiness')) {
  violations.push(`${packagePath}: npm run verify must include check:persistence-readiness`);
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Persistence readiness contract OK');

function uniqueMatches(source, pattern) {
  return [...new Set([...source.matchAll(pattern)].map((match) => match[0]))].sort();
}
