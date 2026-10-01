import { readFileSync } from 'node:fs';
import { posix, relative, resolve } from 'node:path';
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

// Reviewed source/destination allowlist, independent of Dockerfile parsing.
const expectedScripts = [
  'scripts/check-feed-promotion-index-recovery.ts',
  'scripts/recover-hn-verified-remainder.ts',
  'scripts/import-hn-verified-remainder.ts',
  'scripts/import-hn-verified-sep28.ts',
  'scripts/import-rss-sep24-verified.ts',
  'scripts/recover-rss-sep24-verified.ts',
  'scripts/run-with-timeout.mjs',
  'scripts/run-reader-summary-clean-real-day-collection.ts',
  'scripts/lib/clean-real-day-collection-report.ts',
  'scripts/lib/clean-real-day-provider-acquisition.ts',
  'scripts/lib/clean-real-day-scan-policy-targets.ts',
  'scripts/lib/clean-real-day-source-config-reader.ts',
  'scripts/lib/clean-real-day-target-discovery.ts',
  'scripts/lib/collection-scan-execution.ts',
  'scripts/lib/env-file.ts',
  'scripts/lib/github-trending-durable-snapshot-candidate-budget.ts',
  'scripts/lib/github-trending-durable-snapshot-reuse.ts',
  'scripts/lib/private-evaluation-file.ts',
  'scripts/lib/production-collection-quality-policy.ts',
  'scripts/lib/production-collection-scan-job-reporter.ts',
  'scripts/lib/provider-collection-observability.ts',
  'scripts/lib/provider-scan-result-selection.ts',
  'scripts/lib/quality-gates.ts',
  'scripts/lib/reader-summary-clean-real-day-collection-artifact.ts',
  'scripts/lib/reader-summary-clean-real-day-collection-cli.ts',
  'scripts/lib/reader-summary-daily-maintenance-bounds.ts',
  'scripts/lib/reader-summary-daily-maintenance-scope.ts',
  'scripts/lib/reader-summary-daily-provider-catch-up.ts',
  'scripts/lib/reader-summary-multi-day-corpus-security.ts',
  'scripts/lib/reader-summary-quality-eval-support.ts',
  'scripts/lib/targeted-provider-collection.ts',
  'scripts/lib/x-collection-retry-policy.ts',
  'scripts/lib/yesterday-social-replay-support.ts',
];
type ScriptCopy = { source: string; destination: string };

function scriptCopies(dockerfile: string): ScriptCopy[] {
  // Only the recipe's whitespace-delimited, relative file COPY form is supported.
  // Ignore full-line comments before joining Docker's backslash continuations.
  const instructions = dockerfile.split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line)).join('\n')
    .replace(/\\[ \t]*\n\s*/g, ' ').split('\n');
  return instructions.flatMap((line) => {
    if (!/^\s*COPY\s/i.test(line)) return [];
    const tokens = line.trim().split(/\s+/).slice(1);
    if (tokens.slice(0, -1).some((token) => ['.', './', '*', './*'].includes(token))) {
      throw new Error('Script COPY requires explicit bounded file sources');
    }
    if (!tokens.some((token) => /\bscripts\b/.test(token))) return [];
    const destination = tokens.pop();
    if (!destination || !/^\.\/scripts(?:\/lib)?\/$/.test(destination)) {
      throw new Error('Script COPY requires an explicit scripts destination directory');
    }
    return tokens.map((source) => {
      if (!/^scripts\/(?:lib\/)?[a-z0-9-]+\.(?:ts|mjs)$/.test(source)) {
        throw new Error('Script COPY requires explicit bounded file sources');
      }
      return { source, destination: posix.join(destination, posix.basename(source)) };
    });
  });
}

function expectScriptSurface(copies: ScriptCopy[]) {
  expect([...copies].sort((a, b) => a.source.localeCompare(b.source))).toEqual(
    expectedScripts.map((source) => ({ source, destination: source }))
      .sort((a, b) => a.source.localeCompare(b.source)),
  );
}

function compileCopiedScripts(copies: ScriptCopy[]) {
  const copiedSources = new Map(copies.map(({ source, destination }) => [destination, source]));
  const available = (file: string) => {
    const path = projectPath(file);
    return !path.startsWith('scripts/') || copiedSources.has(path);
  };
  const sourcePath = (file: string) => resolve(root, copiedSources.get(projectPath(file)) ?? file);
  const build = config('tsconfig.build.json');
  const options = { ...build.options, noEmit: true, incremental: false };
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  const exists = host.fileExists.bind(host);
  host.readFile = (file) => available(file) ? read(sourcePath(file)) : undefined;
  host.fileExists = (file) => available(file) && exists(sourcePath(file));
  const program = ts.createProgram(build.fileNames.filter(available), options, host);
  return { program, diagnostics: ts.getPreEmitDiagnostics(program) };
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

  it('maps multiline COPY sources to their destination, including CRLF and comments', () => {
    expect(scriptCopies([
      'COPY apps ./apps',
      'COPY scripts/run-with-timeout.mjs \\',
      '  # continuation comment',
      '  scripts/run-reader-summary-clean-real-day-collection.ts ./scripts/',
      'COPY scripts/lib/env-file.ts \\',
      '  scripts/lib/quality-gates.ts ./scripts/lib/',
      'COPY scripts/lib/private-evaluation-file.ts ./scripts/',
    ].join('\r\n'))).toEqual([
      { source: 'scripts/run-with-timeout.mjs', destination: 'scripts/run-with-timeout.mjs' },
      { source: 'scripts/run-reader-summary-clean-real-day-collection.ts', destination: 'scripts/run-reader-summary-clean-real-day-collection.ts' },
      { source: 'scripts/lib/env-file.ts', destination: 'scripts/lib/env-file.ts' },
      { source: 'scripts/lib/quality-gates.ts', destination: 'scripts/lib/quality-gates.ts' },
      { source: 'scripts/lib/private-evaluation-file.ts', destination: 'scripts/private-evaluation-file.ts' },
    ]);
  });

  it('rejects a recipe missing the non-TypeScript timeout wrapper', () => {
    const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8');
    const mutated = dockerfile.replace('scripts/run-with-timeout.mjs ', '');
    expect(mutated).not.toBe(dockerfile);
    expect(() => expectScriptSurface(scriptCopies(mutated))).toThrow();
  });

  it('reports an unresolved real CLI dependency when a transitive library is not copied', () => {
    const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8');
    const mutated = dockerfile.replace('scripts/lib/yesterday-social-replay-support.ts ', '');
    expect(mutated).not.toBe(dockerfile);
    const copies = scriptCopies(mutated);
    expect(() => expectScriptSurface(copies)).toThrow();
    // Compile the mutated real recipe even though the allowlist already rejects it.
    // This proves the host hides on-disk files absent from the image import closure.
    const { diagnostics } = compileCopiedScripts(copies);
    expect(diagnostics.some((diagnostic) => diagnostic.code === 2307
      && diagnostic.file && projectPath(diagnostic.file.fileName)
        === 'scripts/lib/reader-summary-clean-real-day-collection-cli.ts'
      && ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
        .includes('./yesterday-social-replay-support'))).toBe(true);
  }, 60_000);

  it.each(['scripts', 'scripts/', 'scripts/*', 'scripts/lib/', 'scripts/lib/*.ts'])(
    'rejects broad script copying: %s', (source) => {
      const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8');
      expect(() => scriptCopies(`${dockerfile}\nCOPY ${source} ./scripts/\n`))
        .toThrow('explicit bounded file sources');
    },
  );

  it.each(['COPY ["scripts/", "./scripts/"]', 'COPY "scripts/*" ./scripts/'])(
    'rejects unsupported script COPY syntax rather than ignoring it: %s', (instruction) => {
      expect(() => scriptCopies(instruction)).toThrow();
    },
  );

  it.each(['.', './', '*', './*'])('rejects copying the entire build context: %s', (source) => {
    const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8');
    expect(() => scriptCopies(`${dockerfile}\nCOPY ${source} ./\n`))
      .toThrow('explicit bounded file sources');
  });

  it('rejects flattening the library destination in the real recipe', () => {
    const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8');
    const mutated = dockerfile.replace('./scripts/lib/', './scripts/');
    expect(mutated).not.toBe(dockerfile);
    expect(() => expectScriptSurface(scriptCopies(mutated))).toThrow();
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
    const copies = scriptCopies(dockerfile);
    expectScriptSurface(copies);
    // Includes the non-TypeScript wrapper, which cannot enter the TS program.
    for (const { source } of copies) expect(ts.sys.fileExists(resolve(root, source))).toBe(true);
    const { program, diagnostics } = compileCopiedScripts(copies);
    expect(ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    })).toBe('');
    const compiledScripts = program.getSourceFiles().map((file) => projectPath(file.fileName))
      .filter((file) => file.startsWith('scripts/')).sort();
    expect(compiledScripts).toEqual(expectedScripts.filter((file) => file.endsWith('.ts')).sort());
    expect(program.getSourceFiles().map((file) => projectPath(file.fileName)))
      .not.toContain(bindingSupport);
    expect(program.getSourceFiles().map((file) => projectPath(file.fileName)))
      .toContain('scripts/check-feed-promotion-index-recovery.ts');
    expect(program.getSourceFiles().map((file) => projectPath(file.fileName)))
      .toContain('scripts/import-hn-verified-sep28.ts');
    expect(program.getSourceFiles().map((file) => projectPath(file.fileName)))
      .toContain('scripts/import-rss-sep24-verified.ts');
    expect(program.getSourceFiles().map((file) => projectPath(file.fileName)))
      .toContain('scripts/recover-rss-sep24-verified.ts');
  }, 60_000);
});
