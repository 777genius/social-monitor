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
      [...name].some((character) => character.charCodeAt(0) < 32 ||
        character.charCodeAt(0) === 127 || '\\:*?[]'.includes(character))) fail('noncanonical repository path');
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

// Enumerate syntax rather than the preprocessor's incomplete import list.
// Unknown computed module names are capabilities, not evidence of safety.
function moduleEdges(path: string, source: string): { specifiers: string[]; unknown: boolean } {
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false);
  const pending: ts.Node[] = [ast];
  const specifiers = new Set<string>();
  let unknown = false, visited = 0;
  const edge = (expression: ts.Node | undefined): void => {
    if (expression && ts.isStringLiteralLike(expression)) specifiers.add(expression.text);
    else unknown = true;
  };
  while (pending.length) {
    if (++visited > 200000) fail('source AST limit exceeded');
    const node = pending.pop()!;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) edge(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      edge(node.moduleReference.expression);
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      edge(node.arguments[0]);
    }
    ts.forEachChild(node, (child) => { pending.push(child); });
  }
  return { specifiers: [...specifiers], unknown };
}

const sourceExtensions = ['.d.ts', '.d.cts', '.d.mts', '.js', '.cjs', '.mjs', '.jsx', '.ts', '.cts', '.mts', '.tsx'];
function runtimeCandidates(path: string): string[] {
  const extension = sourceExtensions.find((value) => path.endsWith(value));
  const stem = extension ? path.slice(0, -extension.length) : path;
  return extension ? [path, ...sourceExtensions.map((value) => stem + value)] :
    [path, ...sourceExtensions.flatMap((value) => [path + value, resolve(path, 'index' + value)])];
}

type SourceGraph = Readonly<{ digest: string; native: boolean }>;
function graphReader(root: string): (suite: string) => SourceGraph {
  const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
  if (config.error) fail('unreadable TypeScript resolution config');
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) fail('invalid TypeScript resolution config');
  const aliasBases = (specifier: string): string[] => {
    const pathsRoot = parsed.options.baseUrl ??
      (typeof parsed.options.pathsBasePath === 'string' ? parsed.options.pathsBasePath : root);
    return Object.entries(parsed.options.paths ?? {}).flatMap(([pattern, replacements]) => {
      const star = pattern.indexOf('*');
      if (star < 0) return pattern === specifier ? replacements.map((value) => resolve(pathsRoot, value)) : [];
      const prefix = pattern.slice(0, star), suffix = pattern.slice(star + 1);
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix) || specifier.length < prefix.length + suffix.length) return [];
      const matched = specifier.slice(prefix.length, specifier.length - suffix.length);
      return replacements.map((value) => resolve(pathsRoot, value.replace('*', matched)));
    });
  };
  const excluded = (path: string): boolean => {
    const name = relative(root, path).split(sep).join('/');
    return name.startsWith('node_modules/') || name.startsWith('prisma/generated/');
  };
  const cache = new Map<string, { source: string; native: boolean; dependencies: string[] }>();
  return (suite: string): SourceGraph => {
    const sources = new Map<string, string>();
    let native = false;
    const pending = [resolve(root, suite)];
    while (pending.length) {
      const path = pending.pop()!;
      const name = repoPath(root, path);
      if (sources.has(name)) continue;
      if (sources.size >= 20000 || lstatSync(path).size > 4 * 1024 * 1024) fail('source graph limit exceeded');
      let entry = cache.get(name);
      if (!entry) {
        const source = readFileSync(path, 'utf8');
        entry = { source, native: /\b(?:initdb|pg_ctl|FIRSTPUB_NATIVE_PG18_BIN)\b/u.test(source) ||
          source.includes('/usr/lib/postgresql/18/bin'), dependencies: [] };
        const edges = moduleEdges(path, source);
        entry.native ||= edges.unknown;
        for (const specifier of edges.specifiers) {
          const aliases = aliasBases(specifier);
          const target = ts.resolveModuleName(specifier, path, parsed.options, ts.sys).resolvedModule;
          const bases = specifier.startsWith('.') || isAbsolute(specifier) ? [resolve(path, '..', specifier)] : aliases;
          if (target && !target.isExternalLibraryImport && !excluded(target.resolvedFileName)) {
            bases.push(resolve(target.resolvedFileName));
            if (!specifier.startsWith('.') && !isAbsolute(specifier) && parsed.options.baseUrl) bases.push(resolve(parsed.options.baseUrl, specifier));
          }
          if (!bases.length) {
            if (specifier.startsWith('@social-monitor/')) entry.native = true;
            continue;
          }
          // TS resolution can prefer declarations or a TS facade while Node
          // loads JS. Every existing runnable sibling participates in the hash.
          if (bases.every(excluded)) continue;
          const dependencies = new Set<string>();
          // Local directory packages may put types and runtime entrypoints in
          // different folders. Hash their manifest and inspect every condition.
          for (const base of [...bases]) {
            const manifest = resolve(base, 'package.json');
            if (excluded(base) || !ts.sys.directoryExists(base) || !ts.sys.fileExists(manifest)) continue;
            repoPath(root, manifest);
            if (lstatSync(manifest).size > 4 * 1024 * 1024) fail('package manifest limit exceeded');
            dependencies.add(manifest);
            const value: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
            if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid local package manifest');
            const pkg = value as Record<string, unknown>;
            const pending: unknown[] = [pkg.main, pkg.exports];
            let inspected = 0;
            while (pending.length) {
              if (++inspected > 10000) fail('package exports limit exceeded');
              const item = pending.pop();
              if (typeof item === 'string') {
                if (item.includes('*')) entry.native = true;
                else bases.push(resolve(base, item));
              } else if (item && typeof item === 'object') pending.push(...Object.values(item));
              else if (item !== undefined && item !== null) entry.native = true;
            }
          }
          let runnable = false;
          for (const candidate of new Set(bases.flatMap(runtimeCandidates))) {
            if (excluded(candidate) || !ts.sys.fileExists(candidate)) continue;
            repoPath(root, candidate);
            dependencies.add(candidate);
            if (!/\.d\.(?:ts|cts|mts)$/u.test(candidate)) {
              runnable = true;
              if (!sourceExtensions.some((extension) => candidate.endsWith(extension)) && !candidate.endsWith('.json')) entry.native = true;
            }
          }
          if (!runnable) entry.native = true; // Declarations alone prove nothing executable.
          entry.dependencies.push(...dependencies);
        }
        cache.set(name, entry);
      }
      sources.set(name, entry.source);
      native ||= entry.native;
      pending.push(...entry.dependencies);
    }
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
