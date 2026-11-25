import { globSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import * as ts from 'typescript';
import { readCompositionSource, type CompositionSource } from './persistence-composition-source';

export type CompositionInventory = {
  readonly moduleFile: string;
  readonly sources: readonly string[];
  readonly adapterSources: readonly string[];
  readonly inMemoryAdapters: readonly string[];
  readonly noopAdapters: readonly string[];
};

// Known business-state roles, not every class that keeps transient process data.
const memoryName = /^InMemory[A-Za-z0-9]*(?:Repository|Ledger|Log|Counter|QueueAdapter|QueuePublisher|OutboxAdapter|IdempotencyAdapter|ReplayStore|SecretVault|Reader|LeaseAdapter|EventPublisher|ReadModel|State|Publication|ProjectionStore)$/;
const noopName = /^Noop[A-Za-z0-9]*Adapter$/;
const isAdapterName = (name: string): boolean => memoryName.test(name) || noopName.test(name);
const normalize = (path: string): string => path.replaceAll('\\', '/');
const excludedSource = /(?:^|\/)(?:test|tests|test-fixtures|fixtures|node_modules|generated)(?:\/|$)|\.(?:spec|test|spec-support|fixture)\.[cm]?tsx?$|\.d\.ts$/;
const compositionName = /(?:^|\/)composition\/|(?:[.-](?:providers|composition)|\/composition)\.[cm]?tsx?$/;
const businessLayer = /(?:^|\/)(?:domain|features|application|infrastructure|ports)(?:\/|$)/;

/** Follow wiring, not adapter implementations or other independently inventoried modules. */
export function discoverCompositionInventory(root: string): {
  readonly modules: readonly CompositionInventory[];
  readonly violations: readonly string[];
} {
  const violations: string[] = [];
  const configPath = resolve(root, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const converted = ts.convertCompilerOptionsFromJson(config.config.compilerOptions ?? {}, root);
  if (converted.errors.length) throw new Error(converted.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'));
  const options = converted.options;
  const roots = [
    ...globSync('libs/*/interfaces/rest/*.module.ts', { cwd: root }),
    ...globSync('apps/*/src/*.module.ts', { cwd: root }),
  ].map(normalize).sort();
  const cache = new Map<string, CompositionSource>();
  const factsFor = (file: string, names?: readonly string[]): CompositionSource => {
    const key = `${file}:${names?.join(',') ?? '*'}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const facts = readCompositionSource(resolve(root, file), names);
    cache.set(key, facts);
    return facts;
  };
  const modules = roots.map((moduleFile): CompositionInventory => {
    const seen = new Set<string>();
    const adapterSources = new Set<string>();
    const memory = new Set<string>();
    const noop = new Set<string>();
    const visitedSelections = new Set<string>();
    const pending: { file: string; names?: readonly string[] }[] = [{ file: moduleFile }];
    while (pending.length) {
      const { file, names } = pending.pop()!;
      const key = `${file}:${names?.join(',') ?? '*'}`;
      if (visitedSelections.has(key)) continue;
      visitedSelections.add(key);
      seen.add(file);
      const facts = factsFor(file, names);
      const errors = (facts.source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
      for (const error of errors) violations.push(`${file}: cannot parse composition: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`);
      const adapters = facts.names.filter(isAdapterName);
      for (const name of adapters) (memoryName.test(name) ? memory : noop).add(name);
      if (file !== moduleFile && adapters.length) adapterSources.add(file);
      for (const { specifier, names: importedNames } of facts.imports) {
        const resolution = ts.resolveModuleName(specifier, resolve(root, file), options, ts.sys).resolvedModule;
        if (!resolution) {
          const configuredAlias = Object.keys(options.paths ?? {}).some((alias) =>
            alias.includes('*') ? specifier.startsWith(alias.split('*')[0]!) : specifier === alias);
          if (specifier.startsWith('.') || configuredAlias) violations.push(`${file}: unresolved runtime composition import "${specifier}"`);
          continue;
        }
        const target = normalize(relative(root, resolution.resolvedFileName));
        if (target.startsWith('../') || excludedSource.test(target) || roots.includes(target)) continue;
        const namedComposition = compositionName.test(target);
        if (!namedComposition && (businessLayer.test(target) || /(?:^|\/)adapters\//.test(target))) continue;
        // Inspect only local wiring candidates; never follow external packages or implementation trees.
        if (!/^(?:apps\/[^/]+\/src\/|libs\/[^/]+\/interfaces\/)/.test(target) && !namedComposition) continue;
        if (namedComposition) {
          pending.push({ file: target, names: importedNames });
          continue;
        }
        for (const name of importedNames) {
          const targetFacts = factsFor(target, [name]);
          if (targetFacts.hasProviders || targetFacts.hasRuntimeReexports ||
              (targetFacts.hasRuntimeFactory && targetFacts.names.some(isAdapterName))) {
            pending.push({ file: target, names: [name] });
          }
        }
      }
    }
    return {
      moduleFile,
      sources: [...seen].sort(),
      adapterSources: [...adapterSources].sort(),
      inMemoryAdapters: [...memory].sort(),
      noopAdapters: [...noop].sort(),
    };
  });
  return { modules, violations };
}
