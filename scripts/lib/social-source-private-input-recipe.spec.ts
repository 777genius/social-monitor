import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isBuiltin } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const repository = resolve(__dirname, '../..');
const entrypoints = ['scripts/materialize-social-sep24-private-inputs.ts', 'scripts/export-reddit-sep24-public.ts',
  'scripts/export-rss-sep24-selected.ts', 'scripts/diagnose-rss-sep24-source-only.ts'];

/** Positive COPY closure only: comments, earlier stages and blanket scripts copies cannot prove packaging. */
function packaged(recipe: string): Set<string> {
  const lines = recipe.replace(/\\\r?\n/gu, ' ').split(/\r?\n/u).map((line) => line.trim()).filter((line) => !line.startsWith('#'));
  const finalStage = lines.findLastIndex((line) => /^FROM\s/iu.test(line));
  const files = new Set<string>();
  for (const line of lines.slice(finalStage + 1)) {
    if (!/^COPY\s/iu.test(line)) continue;
    const tokens = line.split(/\s+/u).slice(1).filter((token) => !token.startsWith('--'));
    for (const source of tokens.slice(0, -1)) files.add(source);
  }
  return files;
}
async function scriptClosure(): Promise<string[]> {
  const config = ts.readConfigFile(join(repository, 'tsconfig.json'), ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, repository).options;
  const visited = new Set<string>();
  const visit = async (name: string): Promise<void> => {
    if (visited.has(name)) return;
    visited.add(name);
    const filename = join(repository, name);
    const source = ts.createSourceFile(filename, await readFile(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    const imports: string[] = [];
    const scan = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && node.arguments.length === 1 &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        ts.isStringLiteral(node.arguments[0]!)) imports.push((node.arguments[0] as ts.StringLiteral).text);
      ts.forEachChild(node, scan);
    };
    scan(source);
    for (const imported of imports) {
      if (isBuiltin(imported)) continue;
      const resolved = ts.resolveModuleName(imported, filename, options, ts.sys).resolvedModule;
      if (!resolved) throw new Error('Recipe closure unresolved');
      const local = relative(repository, resolved.resolvedFileName);
      if (local.startsWith('scripts/')) await visit(local);
      else if (!resolved.isExternalLibraryImport && !local.startsWith('libs/') && !local.startsWith('apps/')) throw new Error('Recipe closure unsupported');
    }
  };
  for (const entry of entrypoints) await visit(entry);
  return [...visited].sort();
}
describe('focused Sep24 recipe regression and fake-only module load', () => {
  it('packages the complete explicit script closure and rejects each missing COPY or a stale-stage recipe', async () => {
    const recipe = await readFile(join(repository, 'Dockerfile'), 'utf8');
    const files = packaged(recipe);
    const closure = await scriptClosure();
    expect(files.has('libs')).toBe(true); expect(files.has('apps')).toBe(true);
    expect(files.has('scripts')).toBe(false);
    expect(closure).toContain('scripts/recover-rss-sep24-verified.ts');
    expect(closure).toHaveLength(9);
    const complete = (copies: Set<string>): boolean => closure.every((name) => copies.has(name));
    expect(complete(files)).toBe(true);
    for (const name of closure) { const missing = new Set(files); missing.delete(name); expect(complete(missing)).toBe(false); }
    expect(complete(packaged(`${recipe}\nFROM node:22 AS empty\n`))).toBe(false);
    expect(complete(packaged(`FROM node:22\n${closure.map((name) => `# COPY ${name} ./scripts/`).join('\n')}`))).toBe(false);
    // Use the existing pinned TypeScript/runtime dependencies and repository library fixture surface.
    // No Docker daemon, image build, install, database, auth or actual outbound transport.
    const stage = await mkdtemp(join(tmpdir(), 'social-sep24-recipe-'));
    for (const name of closure) { await mkdir(dirname(join(stage, name)), { recursive: true }); await copyFile(join(repository, name), join(stage, name)); }
    for (const name of ['tsconfig.json', 'tsconfig.build.json']) await copyFile(join(repository, name), join(stage, name));
    for (const name of ['libs', 'apps', 'node_modules', 'prisma']) await symlink(join(repository, name), join(stage, name));
    const guard = join(stage, 'synthetic-deny-io.cjs');
    await writeFile(guard, `const Module = require('node:module');
const original = Module._load;
const forbidden = () => process.exit(91);
Module._load = function(name, ...rest) {
  if (name === 'pg') return { Pool: class { constructor() { forbidden(); } } };
  return original.call(this, name, ...rest);
};
globalThis.fetch = forbidden;
for (const name of ['node:http', 'node:https']) {
  const transport = require(name); transport.request = forbidden; transport.get = forbidden;
}
require('node:net').Socket.prototype.connect = forbidden;
require('node:net').Server.prototype.listen = forbidden;
require('node:tls').connect = forbidden;
for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6']) require('node:dns')[name] = forbidden;
`, { flag: 'wx', mode: 0o600 });
    for (const entry of entrypoints) {
      const result = spawnSync(process.execPath, ['-r', guard, '-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register', entry], {
        cwd: stage, env: { PATH: process.env.PATH, TMPDIR: tmpdir(), TS_NODE_PROJECT: join(stage, 'tsconfig.build.json') },
        timeout: 20_000, encoding: 'utf8', maxBuffer: 16_384,
      });
      expect(result.error).toBeUndefined(); expect(result.status).toBe(1);
      if (entry.endsWith('diagnose-rss-sep24-source-only.ts')) {
        expect(JSON.parse(result.stdout)).toEqual({ reasons: { INPUT_REJECTED: 1 }, httpStatuses: {}, selectedCount: null,
          warningCount: null, unitCount: null, exported: false, imported: false });
        expect(result.stderr).toBe('');
      } else {
        expect(result.stdout).toBe('');
        expect(result.stderr).toMatch(/private_input_refused:arguments|Sep24 .*failed/u);
      }
      expect(result.stderr).not.toMatch(/Cannot find module|TSError|synthetic-deny|https:|postgresql:/u);
    }
  });
});
