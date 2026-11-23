import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

type StringRecord = Record<string, unknown>;

function isRecord(value: unknown): value is StringRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

void test('TypeScript 7 configuration preserves the reviewed alias graph and strict metadata', () => {
  const parsed: unknown = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
  assert.ok(isRecord(parsed));
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
  const raw: unknown = JSON.parse(readFileSync('test/tsconfig.jest.json', 'utf8'));
  assert.ok(isRecord(raw));
  assert.equal(raw.extends, '../tsconfig.json');
  const options = raw.compilerOptions;
  assert.ok(isRecord(options));
  assert.equal(options.module, 'Node16');
  assert.equal(options.moduleResolution, 'Node16');
  assert.equal(options.isolatedModules, true);
  assert.equal(Object.hasOwn(options, 'ignoreDeprecations'), false);
});
