import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const genuine = 'scripts/lib/reader-summary-first-publication-pg18.spec.ts';
// These three suites mock native commands or bind explicit offline ports. Only
// their reviewed source dependency closures may bypass the conservative rule.
// Any edit invalidates the exemption and supplies PG18 until reviewed again.
const offlineClosures: Readonly<Record<string, string>> = {
  'scripts/lib/reader-summary-first-publication-pg18-lifecycle.spec.ts': '2fc8e702ec0f7b55b94deb0960a608298eb964475c84ef08611bc88a88439c6b',
  'scripts/lib/reader-summary-first-publication-pg18-error-evidence.spec.ts': '3c0f8b037ea8c00e951af2349359a93db17c4367ab539f55ba6a28e64f23d349',
  'scripts/lib/reader-summary-first-publication-pg18-crash-loader.spec.ts': '8ac4f1c37120cd4a55fa666f5c52e8021deddb8a8fa72b7051e95b13f19f2089',
};
function fail(message: string): never { throw new Error(`PG18 selection: ${message}`); }

function repoPath(root: string, path: string): string {
  const name = relative(root, path).split(sep).join('/');
  if (!name || name.startsWith('../') || isAbsolute(name) ||
      name.split('/').some((part) => !part || part === '.' || part === '..') ||
      /[\x00-\x1f\x7f\\:*?\[\]]/u.test(name)) fail('noncanonical repository path');
  if (realpathSync(path) !== path || !lstatSync(path).isFile()) fail('nonregular or linked source');
  return name;
}

function readSuites(root: string, file: string): string[] {
  if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink() ||
      lstatSync(file).size > 4 * 1024 * 1024) fail('invalid selection file');
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(value) || value.length === 0 || value.length > 20000) fail('nonempty suite array required');
  const paths = value.map((path: unknown) => {
    if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path ||
        path.length > 1024 || !path.endsWith('.spec.ts')) fail('absolute canonical repo spec required');
    return repoPath(root, path);
  });
  if (new Set(paths).size !== paths.length) fail('duplicate suite');
  return paths;
}

type SourceGraph = Readonly<{ digest: string; native: boolean }>;
function graphReader(root: string): (suite: string) => SourceGraph {
  const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
  if (config.error) fail('unreadable TypeScript resolution config');
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) fail('invalid TypeScript resolution config');
  const cache = new Map<string, { source: string; native: boolean; dependencies: string[] }>();
  return (suite: string): SourceGraph => {
    const sources = new Map<string, string>();
    let native = false;
    const visit = (path: string): void => {
      const name = repoPath(root, path);
      if (sources.has(name)) return;
      let entry = cache.get(name);
      if (!entry) {
        const source = readFileSync(path, 'utf8');
        entry = { source, native: /\b(?:initdb|pg_ctl|FIRSTPUB_NATIVE_PG18_BIN)\b/u.test(source) ||
          source.includes('/usr/lib/postgresql/18/bin'), dependencies: [] };
        // Follow static relative imports/re-exports, literal require/dynamic imports
        // and project aliases. New native helper consumers inherit the capability.
        for (const dependency of ts.preProcessFile(source, true, true).importedFiles) {
          const specifier = dependency.fileName;
          if (!specifier.startsWith('.') && !specifier.startsWith('@social-monitor/')) continue;
          const target = ts.resolveModuleName(specifier, path, parsed.options, ts.sys).resolvedModule;
          if (!target) { entry.native = true; continue; } // Unknown local edges fail closed.
          if (relative(root, target.resolvedFileName).startsWith('node_modules/') ||
              relative(root, target.resolvedFileName).startsWith('prisma/generated/')) continue;
          entry.dependencies.push(resolve(target.resolvedFileName));
        }
        cache.set(name, entry);
      }
      sources.set(name, entry.source);
      native ||= entry.native;
      for (const dependency of entry.dependencies) visit(dependency);
    };
    visit(resolve(root, suite));
    const digest = offlineClosures[suite] ? createHash('sha256').update(JSON.stringify([...sources].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0))).digest('hex') : '';
    return { digest, native };
  };
}

export function needPg18(rootInput: string, inventoryFile: string, selectionFile: string, shard: string): boolean {
  if (!/^[1-6]\/6$/u.test(shard)) fail('shard must be 1..6 with denominator 6');
  const root = realpathSync(resolve(rootInput));
  const inventory = new Set(readSuites(root, inventoryFile));
  const selection = readSuites(root, selectionFile);
  if (selection.some((suite) => !inventory.has(suite))) fail('selected suite absent from full inventory');
  const graph = graphReader(root);
  // Validate the entire selection before returning, even if native is first.
  return selection.some((suite) => {
    if (suite === genuine) return true;
    const result = graph(suite);
    return result.native && offlineClosures[suite] !== result.digest;
  });
}

function main(args: string[]): void {
  if (args.length !== 8 || args[0] !== '--root' || args[2] !== '--inventory' ||
      args[4] !== '--selection' || args[6] !== '--shard') fail('exact root/inventory/selection/shard arguments required');
  const result = needPg18(args[1]!, args[3]!, args[5]!, args[7]!);
  process.stdout.write(`need_pg18=${result}\n`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
