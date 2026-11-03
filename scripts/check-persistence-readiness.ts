import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { discoverCompositionInventory } from './lib/persistence-composition-inventory';

const contractPath = 'ops/release/persistence-readiness-contract.json';
const normalizePath = (value: string): string => value.replaceAll('\\', '/');
type ModuleContract = {
  readonly moduleFile: string;
  readonly context: string;
  readonly owner: string;
  readonly risk: string;
  readonly durableReplacementPlan: string;
  readonly adapterSourceFiles?: readonly string[];
  readonly inMemoryStateAdapters: readonly string[];
};
type NoopContract = {
  readonly moduleFile: string;
  readonly adapter: string;
  readonly owner: string;
  readonly risk: string;
  readonly durableReplacementPlan: string;
};
type ReadinessContract = {
  readonly schemaVersion: number;
  readonly posture: string;
  readonly mvpRuntimeDecision?: {
    readonly blocksExternalBeta: boolean;
    readonly allowedRuntime: string;
    readonly owner: string;
    readonly exitCriteria: readonly string[];
  };
  readonly runtimeModules?: readonly ModuleContract[];
  readonly runtimeNoopAdapters?: readonly NoopContract[];
};

export function checkPersistenceReadiness(root: string): readonly string[] {
  const contract = JSON.parse(readFileSync(resolve(root, contractPath), 'utf8')) as ReadinessContract;
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts?: { verify?: string } };
  const discovery = discoverCompositionInventory(root);
  const violations = [...discovery.violations];
  const inventories = new Map(discovery.modules.map((module) => [module.moduleFile, module]));
  const nonempty = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;

  if (contract.schemaVersion !== 1) violations.push(`${contractPath}: schemaVersion must be 1`);
  if (contract.posture !== 'durability_gap_declared') violations.push(`${contractPath}: posture must be durability_gap_declared`);
  if (contract.mvpRuntimeDecision?.blocksExternalBeta !== true) {
    violations.push(`${contractPath}: mvpRuntimeDecision.blocksExternalBeta must be true until deployed beta evidence exists`);
  }
  for (const field of ['allowedRuntime', 'owner'] as const) {
    if (!nonempty(contract.mvpRuntimeDecision?.[field])) violations.push(`${contractPath}: mvpRuntimeDecision.${field} must be non-empty`);
  }
  if (!Array.isArray(contract.mvpRuntimeDecision?.exitCriteria) || contract.mvpRuntimeDecision.exitCriteria.length < 3) {
    violations.push(`${contractPath}: mvpRuntimeDecision.exitCriteria must list concrete durable-adapter exit criteria`);
  }
  if (!String(contract.mvpRuntimeDecision?.allowedRuntime ?? '').includes('durable_beta_profile')) {
    violations.push(`${contractPath}: mvpRuntimeDecision.allowedRuntime must require the durable_beta_profile`);
  }

  const moduleContracts = new Map<string, ModuleContract>();
  for (const moduleContract of contract.runtimeModules ?? []) {
    const moduleFile = normalizePath(moduleContract.moduleFile);
    if (moduleContracts.has(moduleFile)) violations.push(`${contractPath}: duplicate runtime module "${moduleFile}"`);
    moduleContracts.set(moduleFile, moduleContract);
    const inventory = inventories.get(moduleFile);
    if (!inventory) violations.push(`${contractPath}: runtime module "${moduleFile}" is not a discovered module root`);
    const sources = (moduleContract.adapterSourceFiles ?? []).map(normalizePath);
    const declaredAdapterSources = new Set<string>();
    for (const sourceFile of sources) {
      if (!existsSync(resolve(root, sourceFile))) violations.push(`${contractPath}: adapter source "${sourceFile}" for "${moduleFile}" does not exist`);
      if (declaredAdapterSources.has(sourceFile)) violations.push(`${contractPath}: duplicate adapter source "${sourceFile}" for "${moduleFile}"`);
      declaredAdapterSources.add(sourceFile);
      if (!inventory?.adapterSources.includes(sourceFile)) {
        violations.push(`${contractPath}: stale adapter source "${sourceFile}" is not runtime adapter wiring reachable from "${moduleFile}"`);
      }
    }
    for (const sourceFile of inventory?.adapterSources ?? []) {
      if (!sources.includes(sourceFile)) violations.push(`${moduleFile}: missing adapterSourceFiles declaration for "${sourceFile}"`);
    }
    for (const field of ['context', 'owner', 'risk', 'durableReplacementPlan'] as const) {
      if (!nonempty(moduleContract[field])) violations.push(`${contractPath}: runtime module "${moduleFile}" must define ${field}`);
    }
    if (!Array.isArray(moduleContract.inMemoryStateAdapters) || moduleContract.inMemoryStateAdapters.length === 0) {
      violations.push(`${contractPath}: runtime module "${moduleFile}" must list inMemoryStateAdapters`);
    }
    if (moduleFile === 'libs/delivery/interfaces/rest/delivery-rest.module.ts') {
      const plan = String(moduleContract.durableReplacementPlan ?? '');
      if (!plan.includes('DELIVERY_ENABLED_CHANNELS=webhook')) violations.push(`${contractPath}: delivery durableReplacementPlan must require DELIVERY_ENABLED_CHANNELS=webhook for beta runtime`);
      if (!plan.includes('email/in_app delivery cannot look successful')) violations.push(`${contractPath}: delivery durableReplacementPlan must document fake email/in_app delivery risk`);
    }
  }
  for (const inventory of discovery.modules) {
    const declaredModule = moduleContracts.get(inventory.moduleFile);
    if (!declaredModule && inventory.inMemoryAdapters.length) {
      violations.push(`${inventory.moduleFile}: stateful in-memory runtime adapters are not declared in ${contractPath}: ${inventory.inMemoryAdapters.join(', ')}`);
      continue;
    }
    const declared = [...new Set(declaredModule?.inMemoryStateAdapters ?? [])];
    const missing = inventory.inMemoryAdapters.filter((adapter) => !declared.includes(adapter));
    const stale = declared.filter((adapter) => !inventory.inMemoryAdapters.includes(adapter));
    if (missing.length) violations.push(`${inventory.moduleFile}: missing persistence readiness declarations for ${missing.join(', ')}`);
    if (stale.length) violations.push(`${contractPath}: runtime module "${inventory.moduleFile}" declares stale adapters: ${stale.join(', ')}`);
  }

  const noopContracts = new Set<string>();
  for (const noopContract of contract.runtimeNoopAdapters ?? []) {
    const moduleFile = normalizePath(noopContract.moduleFile);
    const key = `${moduleFile}:${noopContract.adapter}`;
    if (noopContracts.has(key)) violations.push(`${contractPath}: duplicate noop adapter declaration "${key}"`);
    noopContracts.add(key);
    for (const field of ['moduleFile', 'adapter', 'owner', 'risk', 'durableReplacementPlan'] as const) {
      if (!nonempty(noopContract[field])) violations.push(`${contractPath}: noop adapter declaration "${key}" must define ${field}`);
    }
    if (!inventories.get(moduleFile)?.noopAdapters.includes(noopContract.adapter)) {
      violations.push(`${contractPath}: stale noop adapter declaration "${key}"`);
    }
  }
  for (const inventory of discovery.modules) {
    for (const adapter of inventory.noopAdapters) {
      if (!noopContracts.has(`${inventory.moduleFile}:${adapter}`)) {
        violations.push(`${inventory.moduleFile}: runtime noop adapter "${adapter}" must be declared in ${contractPath}`);
      }
    }
  }
  if (!String(packageJson.scripts?.verify ?? '').includes('npm run check:persistence-readiness')) {
    violations.push('package.json: npm run verify must include check:persistence-readiness');
  }
  return violations;
}

if (require.main === module) {
  try {
    const violations = checkPersistenceReadiness(process.cwd());
    if (violations.length) {
      console.error(violations.join('\n'));
      process.exitCode = 1;
    } else {
      console.log('Persistence readiness contract OK');
    }
  } catch (error) {
    console.error(`Persistence readiness check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
