import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import * as ts from 'typescript';

const root = resolve(__dirname, '..');
const bindingSupport = 'libs/ingestion/features/refresh-retained-metrics/metric-refresh-result-binding.spec-support.ts';
const isSupport = (file: string) => file.endsWith('.spec-support.ts');
const projectPath = (file: string) => relative(root, file).replaceAll('\\', '/');

function config(name: string) {
  const path = resolve(root, name);
  const read = ts.readConfigFile(path, ts.sys.readFile);
  expect(read.error).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, resolve(path, '..'));
  expect(parsed.errors).toEqual([]);
  return parsed;
}

describe('migration image production compilation', () => {
  it('excludes sibling test support from build roots while retaining test typechecking', () => {
    const build = config('tsconfig.build.json');
    const tests = config('test/tsconfig.jest.json');
    // Jest supplies matched specs as roots; helpers enter via their imports.
    const testRoot = resolve(root, 'libs/ingestion/features/refresh-retained-metrics/metric-refresh-result-binding.spec.ts');
    const testProgram = ts.createProgram([testRoot], { ...tests.options, noEmit: true });
    expect(testProgram.getSourceFiles().map((file) => projectPath(file.fileName)))
      .toContain(bindingSupport);
    expect(build.fileNames.filter(isSupport)).toEqual([]);
    expect(tests.options.noCheck).not.toBe(true);
  });

  it('has no production consumer of the retained metric binding fixture', () => {
    const build = config('tsconfig.build.json');
    const program = ts.createProgram(build.fileNames, { ...build.options, noEmit: true });
    // TypeScript follows imports even when their targets match exclude patterns.
    // This covers aliases, re-exports, require and dynamic import dependencies.
    expect(program.getSourceFiles().map((file) => projectPath(file.fileName)))
      .not.toContain(bindingSupport);
  });

  it('typechecks with only the scripts copied by the migration Dockerfile', () => {
    const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8');
    const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8');
    expect(compose).toMatch(/\n {2}migrate:\n {4}build:\n {6}context: \./);
    expect(dockerfile).toContain('COPY apps ./apps');
    expect(dockerfile).toContain('COPY libs ./libs');
    expect(dockerfile).toContain('COPY prisma ./prisma');
    expect(dockerfile).toContain('COPY tsconfig.json tsconfig.build.json ./');
    expect(dockerfile).toContain('npm run build');
    const scriptCopies = dockerfile.split('\n').filter((line) => /^COPY .*scripts/.test(line));
    expect(scriptCopies).toEqual([
      'COPY scripts/check-feed-promotion-index-recovery.ts ./scripts/',
    ]);
    const copiedScripts = new Set(scriptCopies.map((line) => line.split(' ')[1]));
    const available = (file: string) => {
      const path = projectPath(file);
      return !path.startsWith('scripts/') || copiedScripts.has(path);
    };
    const build = config('tsconfig.build.json');
    const options = { ...build.options, noEmit: true, incremental: false };
    const host = ts.createCompilerHost(options);
    const read = host.readFile.bind(host);
    const exists = host.fileExists.bind(host);
    host.readFile = (file) => available(file) ? read(file) : undefined;
    host.fileExists = (file) => available(file) && exists(file);
    const program = ts.createProgram(build.fileNames.filter(available), options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    })).toBe('');
    expect(program.getSourceFiles().map((file) => projectPath(file.fileName)))
      .not.toContain(bindingSupport);
    expect(program.getSourceFiles().map((file) => projectPath(file.fileName)))
      .toContain('scripts/check-feed-promotion-index-recovery.ts');
  }, 60_000);
});
