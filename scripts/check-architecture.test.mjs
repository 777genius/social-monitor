import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';

const guard = resolve('scripts/check-architecture.mjs');
const config = readFileSync('tsconfig.json', 'utf8');

function check(files) {
  const root = mkdtempSync(join(tmpdir(), 'social-monitor-architecture-'));
  try {
    writeFileSync(join(root, 'tsconfig.json'), config);
    for (const [path, source] of Object.entries(files)) {
      const file = join(root, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, source);
    }
    const result = spawnSync(process.execPath, [guard], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
    });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const [name, sourcePath, source, targetPath, expected] of [
  ['domain adapter alias', 'libs/monitoring/domain/model.ts',
    "import { adapter } from '@social-monitor/monitoring/adapters/fake.adapter';",
    'libs/monitoring/adapters/fake.adapter.ts', /domain must not import adapters/],
  ['domain application', 'libs/relevance/domain/model.ts',
    "export { adapter } from '../application/prepare.use-case';",
    'libs/relevance/application/prepare.use-case.ts', /domain must not import application/],
  ['feature adapter barrel', 'libs/monitoring/features/model.ts',
    "import { adapter } from '../adapters';",
    'libs/monitoring/adapters/index.ts', /features must not import adapters/],
  ['feature require barrel', 'libs/monitoring/features/model.ts',
    "const { adapter } = require('../adapters');",
    'libs/monitoring/adapters/index.ts', /features must not import adapters/],
  ['feature dynamic import', 'libs/monitoring/features/model.ts',
    "const module = import('../adapters');",
    'libs/monitoring/adapters/index.ts', /features must not import adapters/],
  ['application infrastructure', 'libs/relevance/application/model.ts',
    "import { adapter } from '../infrastructure';",
    'libs/relevance/infrastructure/index.ts', /application must not import infrastructure/],
  ['port interface barrel', 'libs/identity/ports/model.ts',
    "export { adapter } from '../interfaces';",
    'libs/identity/interfaces/index.ts', /ports must not import interfaces/],
  ['relative public contract', 'libs/monitoring/domain/model.ts',
    "import { adapter } from '../../contracts/public';",
    'libs/contracts/public.ts', /domain must not import public contracts/],
  ['platform adapter barrel', 'libs/monitoring/features/model.ts',
    "import { adapter } from '../../platform/queue/src/adapters';",
    'libs/platform/queue/src/adapters/index.ts', /features must not import adapters/],
  ['platform physical database client', 'libs/monitoring/features/model.ts',
    "import type { Client } from '@social-monitor/platform-persistence/prisma-conversation-client';",
    'libs/platform/persistence/src/prisma-conversation-client.ts', /features must not import infrastructure/],
  ['cross-context reader', 'libs/summary/adapters/reader.ts',
    "import { adapter } from '@social-monitor/conversation/adapters/fake.adapter';",
    'libs/conversation/adapters/fake.adapter.ts', /cross-context adapter import is forbidden/],
  ['cross-context controller', 'libs/summary/interfaces/rest/example.controller.ts',
    "import { adapter } from '@social-monitor/relevance/infrastructure/fake.adapter';",
    'libs/relevance/infrastructure/fake.adapter.ts', /cross-context adapter import is forbidden/],
  ['composition named reader', 'libs/summary/adapters/composition-reader.ts',
    "import { adapter } from '@social-monitor/conversation/adapters/fake.adapter';",
    'libs/conversation/adapters/fake.adapter.ts', /cross-context adapter import is forbidden/],
]) {
  test(`rejects ${name}`, () => {
    const result = check({ [sourcePath]: source, [targetPath]: 'export const adapter = 1;' });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, expected);
  });
}


for (const [name, sourcePath, source, targetPath] of [
  ['type-only foreign domain', 'libs/summary/domain/example.ts',
    "import type { Foreign } from '@social-monitor/relevance/domain/example';",
    'libs/relevance/domain/example.ts'],
  ['foreign domain barrel', 'libs/delivery/domain/example.ts',
    "import { foreign } from '@social-monitor/feed/domain';",
    'libs/feed/domain/index.ts'],
  ['foreign domain re-export', 'libs/summary/domain/example.ts',
    "export type { Foreign } from '@social-monitor/ingestion/domain/example';",
    'libs/ingestion/domain/example.ts'],
  ['foreign domain require', 'libs/summary/domain/example.ts',
    "const foreign = require('@social-monitor/ingestion/domain/example');",
    'libs/ingestion/domain/example.ts'],
  ['foreign domain dynamic import', 'libs/summary/domain/example.ts',
    "void import('@social-monitor/ingestion/domain/example');",
    'libs/ingestion/domain/example.ts'],
  ['foreign domain require with comment trivia', 'libs/summary/domain/example.ts',
    "const foreign = require(/* dependency */ '@social-monitor/ingestion/domain/example');",
    'libs/ingestion/domain/example.ts'],
  ['foreign domain dynamic import with comment trivia', 'libs/summary/domain/example.ts',
    "void import(/* dependency */ '@social-monitor/ingestion/domain/example');",
    'libs/ingestion/domain/example.ts'],
  ['foreign domain dynamic import with multiline trivia', 'libs/summary/domain/example.ts',
    "void import(/* dependency */\n'@social-monitor/ingestion/domain/example');",
    'libs/ingestion/domain/example.ts'],
  ['foreign domain import type query', 'libs/summary/domain/example.ts',
    "export type Foreign = import('@social-monitor/ingestion/domain/example').Foreign;",
    'libs/ingestion/domain/example.ts'],
  ['foreign domain nested template expression', 'libs/summary/domain/example.ts',
    "export const loaded = `${import('@social-monitor/ingestion/domain/example')}`;",
    'libs/ingestion/domain/example.ts'],
  ['foreign domain import after regex containing apparent comment', 'libs/summary/domain/example.ts',
    "const re = /[/*]/;\nimport type { Foreign } from '@social-monitor/ingestion/domain/example';\n/* closing comment */",
    'libs/ingestion/domain/example.ts'],
  ['legacy permission is path-exact', 'libs/summary/domain/policies/extra.ts',
    "import type { Foreign } from '@social-monitor/relevance/domain/reader-value/reader-value-assessment';",
    'libs/relevance/domain/reader-value/reader-value-assessment.ts'],
  ['legacy permission is specifier-exact', 'libs/summary/domain/policies/reader-promotion-ranking.ts',
    "import type { Foreign } from '@social-monitor/relevance/domain/reader-value/other';",
    'libs/relevance/domain/reader-value/other.ts'],
  ['retired reader-v3 type-only edge', 'libs/summary/domain/policies/reader-post-promotion-v3.ts',
    "import type { Foreign } from '@social-monitor/relevance/domain/reader-value/reader-value-assessment';",
    'libs/relevance/domain/reader-value/reader-value-assessment.ts'],
  ['retired ranking type-only edge', 'libs/summary/domain/policies/reader-promotion-ranking.ts',
    "import type { Foreign } from '@social-monitor/relevance/domain/reader-value/reader-value-assessment';",
    'libs/relevance/domain/reader-value/reader-value-assessment.ts'],
  ['retired attestation type-only edge', 'libs/summary/domain/policies/reader-post-promotion-policy-contract.ts',
    "import type { Foreign } from '@social-monitor/relevance/domain/reader-value/reader-value-assessment';",
    'libs/relevance/domain/reader-value/reader-value-assessment.ts'],
]) {
  test('rejects ' + name, () => {
    const result = check({ [sourcePath]: source, [targetPath]: 'export type Foreign = number; export const foreign = 1;' });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /cross-context domain import is forbidden/);
  });
}

test('permits the exact current-main cross-context domain debt, without broadening', () => {
  const result = check({
    'libs/summary/domain/entities/reader-summary-promotion-order-validation.ts':
      "import { validateReaderValueAnswers } from '@social-monitor/relevance/domain/reader-value/reader-value-assessment';",
    'libs/relevance/domain/reader-value/reader-value-assessment.ts': 'export type Foreign = number;',
    'libs/delivery/domain/reader-summary-ready-projection.ts':
      "import type { Foreign } from '@social-monitor/summary/domain/value-objects/reader-summary-scope';",
    'libs/summary/domain/value-objects/reader-summary-scope.ts': 'export type Foreign = number;',
    'libs/conversation/domain/services/conversation-bundle-builder.ts':
      "import { foreign } from '@social-monitor/feed/domain';",
    'libs/feed/domain/index.ts': 'export const foreign = 1;',
  });
  assert.equal(result.status, 0, result.output);
});

test('permits same-context domain imports and does not turn composition into domain', () => {
  const result = check({
    'libs/summary/domain/model.ts':
      "import { value } from './value'; export const model = value;",
    'libs/summary/domain/value.ts': 'export const value = 1;',
    'libs/summary/interfaces/rest/summary-rest.module.ts':
      "import { foreign } from '@social-monitor/feed/domain'; export const wired = foreign;",
    'libs/feed/domain/index.ts': 'export const foreign = 1;',
  });
  assert.equal(result.status, 0, result.output);
});

test('ignores commented-out import, export, require and dynamic import declarations', () => {
  const result = check({
    'libs/summary/domain/example.ts': [
      "// import type { Foreign } from '@social-monitor/ingestion/domain/example';",
      "/* export type { Foreign } from '@social-monitor/ingestion/domain/example'; */",
      "// const unused = require('@social-monitor/ingestion/domain/example');",
      "/* void import('@social-monitor/ingestion/domain/example'); */",
      "const url = 'https://example.test/source';",
      "export const ok = url;",
    ].join('\n'),
    'libs/ingestion/domain/example.ts': 'export type Foreign = number;',
  });
  assert.equal(result.status, 0, result.output);
});

test('preserves executable imports adjacent to line and block comments', () => {
  const result = check({
    'libs/summary/domain/example.ts': [
      "// an ordinary comment before an actual import",
      "/* a header */",
      "import type { Foreign } from '@social-monitor/ingestion/domain/example';",
    ].join('\n'),
    'libs/ingestion/domain/example.ts': 'export type Foreign = number;',
  });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /cross-context domain import is forbidden/);
});

test('does not mistake string, template or regex content for real imports', () => {
  const result = check({
    'libs/summary/domain/example.ts': [
      "const documentation = \"import { Foreign } from '@social-monitor/ingestion/domain/example'\";",
      "const template = `export type { Foreign } from '@social-monitor/ingestion/domain/example'`;",
      "const matcher = /[/*]/;",
      "const notAnImport = \"require('@social-monitor/ingestion/domain/example')\";",
      "export const accepted = [documentation, template, matcher, notAnImport];",
    ].join('\n'),
    'libs/ingestion/domain/example.ts': 'export type Foreign = number;',
  });
  assert.equal(result.status, 0, result.output);
});

const contextAliases = Object.keys(JSON.parse(config).compilerOptions.paths)
  .filter((alias) => /^@social-monitor\/[^/]+\/\*$/.test(alias))
  .filter((alias) => !/platform-|contracts/.test(alias));

for (const alias of contextAliases) {
  const context = alias.split('/')[1];
  test(`detects dotted runtime alias cycle in ${context}`, () => {
    const result = check({
      [`libs/${context}/domain/left.policy.ts`]:
        `import { right } from '@social-monitor/${context}/domain/right.policy'; export const left = () => right();`,
      [`libs/${context}/domain/right.policy.ts`]:
        `import { left } from '@social-monitor/${context}/domain/left.policy'; export const right = () => left();`,
    });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /runtime circular dependency detected/);
  });
}

test('permits module, provider and adapter composition roots to wire contexts', () => {
  const imported = "import { adapter } from '@social-monitor/conversation/adapters/fake.adapter'; export const wired = adapter;";
  const result = check({
    'libs/conversation/adapters/fake.adapter.ts': 'export const adapter = 1;',
    'libs/summary/interfaces/rest/example.module.ts': imported,
    'libs/summary/interfaces/rest/example.providers.ts': imported,
    'libs/summary/adapters/composition/example.ts': imported,
    'libs/summary/domain/model.ts': 'export const value = 1;',
    'libs/summary/features/example.use-case.ts': "import { value } from '../domain/model'; export const result = value;",
  });
  assert.equal(result.status, 0, result.output);
});

test('does not treat type-only cycles as runtime cycles or restrict integration fixtures', () => {
  const result = check({
    'libs/subscriptions/domain/left.ts': "import type { Right } from './right'; export type Left = { right?: Right };",
    'libs/subscriptions/domain/right.ts': "import { type Left } from './left'; export type Right = { left?: Left };",
    'libs/subscriptions/domain/integration.spec.ts': "import { adapter } from '../adapters';",
    'libs/subscriptions/adapters/index.ts': 'export const adapter = 1;',
  });
  assert.equal(result.status, 0, result.output);
});
