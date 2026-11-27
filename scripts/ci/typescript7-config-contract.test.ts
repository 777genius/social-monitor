import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';

type StringRecord = Record<string, unknown>;

function isRecord(value: unknown): value is StringRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(path: string): StringRecord {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(isRecord(parsed));
  return parsed;
}

const root = process.cwd();
const requireFromRoot = createRequire(resolve(root, 'package.json'));

function nativeCompilerPath(): string {
  const packagePath = requireFromRoot.resolve('@typescript/native/package.json');
  const manifest = readJson(packagePath);
  assert.equal(manifest.name, 'typescript');
  assert.equal(manifest.version, '7.0.2');
  assert.ok(isRecord(manifest.bin));
  assert.equal(typeof manifest.bin.tsc, 'string');
  return resolve(dirname(packagePath), manifest.bin.tsc as string);
}

function compileFixture(directory: string, ...args: string[]) {
  return spawnSync(
    process.execPath,
    [nativeCompilerPath(), '-p', join(directory, 'tsconfig.json'), '--pretty', 'false', ...args],
    { cwd: root, encoding: 'utf8', timeout: 60_000 },
  );
}

function makeFixture(context: TestContext, source: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'social-monitor-native-ts7-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  symlinkSync(resolve(root, 'node_modules'), join(directory, 'node_modules'), 'junction');
  writeFileSync(join(directory, 'fixture.ts'), source);
  writeFileSync(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      extends: resolve(root, 'tsconfig.json'),
      compilerOptions: {
        rootDir: directory,
        outDir: join(directory, 'dist'),
        incremental: false,
        declaration: false,
        sourceMap: false,
        noEmitOnError: true,
        types: ['node'],
      },
      include: ['fixture.ts'],
      exclude: [],
    }),
  );
  return directory;
}

void test('TypeScript 7 configuration preserves the reviewed alias graph and strict metadata', () => {
  const parsed = readJson('tsconfig.json');
  const options = parsed.compilerOptions;
  assert.ok(isRecord(options));
  assert.equal(Object.hasOwn(options, 'baseUrl'), false);
  assert.equal(Object.hasOwn(options, 'ignoreDeprecations'), false);
  assert.equal(options.strict, true);
  assert.equal(options.experimentalDecorators, true);
  assert.equal(options.emitDecoratorMetadata, true);
  assert.equal(options.module, 'commonjs');
  assert.equal(options.target, 'ES2023');

  const paths = options.paths;
  assert.ok(isRecord(paths));
  const entries = Object.entries(paths);
  assert.equal(entries.length, 34);
  const normalized: Record<string, string[]> = {};

  for (const [alias, targets] of entries) {
    assert.match(alias, /^@social-monitor\//);
    assert.ok(Array.isArray(targets) && targets.length > 0);
    assert.ok(targets.every((target: unknown) => typeof target === 'string'));
    const typedTargets = targets as string[];
    assert.ok(typedTargets.every((target) => target.startsWith('./libs/')));
    normalized[alias] = typedTargets.map((target) => target.slice(2));
  }

  // The literal keys, target order, and all original paths are covered by this
  // hash, computed from the reviewed main alias graph before prefix migration.
  let fingerprint = 0x811c9dc5;
  for (const character of JSON.stringify(normalized)) {
    fingerprint = Math.imul(fingerprint ^ character.charCodeAt(0), 0x01000193) >>> 0;
  }
  assert.equal(fingerprint.toString(16).padStart(8, '0'), 'de9321e4');
});

void test('Jest uses a supported explicit module-resolution pair without changing the production profile', () => {
  const raw = readJson('test/tsconfig.jest.json');
  assert.equal(raw.extends, '../tsconfig.json');
  const options = raw.compilerOptions;
  assert.ok(isRecord(options));
  assert.equal(options.module, 'Node16');
  assert.equal(options.moduleResolution, 'Node16');
  assert.equal(options.isolatedModules, true);
  assert.equal(Object.hasOwn(options, 'ignoreDeprecations'), false);
});

void test('native TypeScript 7 owns compilation and the explicitly declared TypeScript 6 API remains usable', () => {
  const manifest = readJson('package.json');
  assert.ok(isRecord(manifest.devDependencies));
  assert.equal(manifest.devDependencies['@typescript/native'], 'npm:typescript@7.0.2');
  assert.equal(manifest.devDependencies.typescript, 'npm:@typescript/typescript6@6.0.2');
  assert.ok(isRecord(manifest.scripts));
  assert.equal(
    manifest.scripts.build,
    'node node_modules/@typescript/native/bin/tsc -p tsconfig.build.json && node scripts/rewrite-build-aliases.mjs -p tsconfig.build.json',
  );
  assert.equal(
    manifest.scripts.typecheck,
    'node node_modules/@typescript/native/bin/tsc -p tsconfig.json --noEmit',
  );

  const nativeBin = nativeCompilerPath();
  const version = spawnSync(process.execPath, [nativeBin, '--version'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(version.error, undefined);
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout.trim(), /^Version 7\.0\.2$/);

  // Existing npx tsc callers must use the same native compiler as npm run build.
  if (process.platform === 'win32') {
    const shim = readFileSync(resolve(root, 'node_modules/.bin/tsc.cmd'), 'utf8');
    assert.match(shim, /@typescript[/\\]native[/\\]bin[/\\]tsc/);
  } else {
    assert.equal(realpathSync(resolve(root, 'node_modules/.bin/tsc')), realpathSync(nativeBin));
  }

  const compatibility = readJson(requireFromRoot.resolve('typescript/package.json'));
  assert.equal(compatibility.name, '@typescript/typescript6');
  assert.equal(compatibility.version, '6.0.2');
  const api: unknown = requireFromRoot('typescript');
  assert.ok(isRecord(api));
  assert.equal(api.version, '6.0.3');
  assert.equal(typeof api.createSourceFile, 'function');
  assert.equal(typeof api.transpileModule, 'function');
  assert.equal(readJson(requireFromRoot.resolve('ts-jest/package.json')).version, '29.4.15');
});

void test('the native compiler rejects type errors before emitting output', (context) => {
  const directory = makeFixture(context, 'export const value: string = 123;\n');
  const result = compileFixture(directory);
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /TS2322/);
  assert.equal(existsSync(join(directory, 'dist/fixture.js')), false);
});

void test('native decorator metadata supports real Nest dependency injection', (context) => {
  const directory = makeFixture(
    context,
    [
      "import 'reflect-metadata';",
      "import { strict as assert } from 'node:assert';",
      "import { Injectable, Module } from '@nestjs/common';",
      "import { NestFactory } from '@nestjs/core';",
      '@Injectable()',
      "class Dependency { readonly value = 'native-metadata'; }",
      '@Injectable()',
      'class Consumer { constructor(readonly dependency: Dependency) {} }',
      '@Module({ providers: [Dependency, Consumer] })',
      'class FixtureModule {}',
      'async function main(): Promise<void> {',
      "  assert.deepEqual(Reflect.getMetadata('design:paramtypes', Consumer), [Dependency]);",
      '  const app = await NestFactory.createApplicationContext(FixtureModule, {',
      '    logger: false, abortOnError: false,',
      '  });',
      '  try {',
      "    assert.equal(app.get(Consumer).dependency.value, 'native-metadata');",
      '  } finally {',
      '    await app.close();',
      '  }',
      '}',
      'void main().catch((error: unknown) => {',
      '  console.error(error);',
      '  process.exitCode = 1;',
      '});',
      '',
    ].join('\n'),
  );
  const compiled = compileFixture(directory);
  assert.equal(compiled.error, undefined);
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  const executed = spawnSync(process.execPath, [join(directory, 'dist/fixture.js')], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(executed.error, undefined);
  assert.equal(executed.status, 0, executed.stdout + executed.stderr);
});
