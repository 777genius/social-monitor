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
