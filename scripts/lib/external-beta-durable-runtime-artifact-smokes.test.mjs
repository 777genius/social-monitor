import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { createExternalBetaDurableRuntimeArtifactSmokes } from './external-beta-durable-runtime-artifact-smokes.mjs';

const fixturePath = 'ops/release/fixtures/durable-runtime-selector-artifact-examples.json';
const observedAt = '2026-11-24T10:00:00.000Z';

function harness({ scenarios = [], select = () => true, run, write, read } = {}) {
  const directories = [], calls = [], reads = [], violations = [], options = [];
  const smokes = createExternalBetaDurableRuntimeArtifactSmokes({
    contract: { runnerFile: 'fixture-runner.mjs' }, violations,
    shouldRunNegativeSmoke: select,
    negativeSmokeOptions(label) {
      const result = { contractSmokeArtifactOnly: label !== 'strict-semantic' };
      options.push({ label, result });
      return result;
    },
    durableRuntimeNegativeSmokeScenarios: () => scenarios,
    runRunnerDurableRuntimeArtifactSmoke(path, settings) {
      calls.push({ path, settings, content: readFileSync(path, 'utf8'), mode: statSync(path).mode & 0o777 });
      return run?.(path, settings, calls.length) ?? { exitCode: 0, output: '' };
    },
    smokeOutputSnippet: (output) => output.slice(0, 12),
    mkdtempSync(prefix) {
      const path = mkdtempSync(prefix);
      directories.push(path);
      return path;
    },
    tmpdir, join, rmSync,
    writeFileSync: write ?? writeFileSync,
    readJson(path) {
      reads.push(path);
      return read?.(path) ?? JSON.parse(readFileSync(path, 'utf8'));
    },
    nowIso: () => observedAt,
  });
  return { directories, calls, reads, violations, options, smokes };
}

function assertCleaned(h) {
  for (const directory of h.directories) assert.equal(existsSync(directory), false, directory);
}

test('valid durable-runtime smoke creates private, fresh evidence and cleans its directory', () => {
  const original = readFileSync(fixturePath, 'utf8');
  const h = harness();
  h.smokes.validateRunnerPositiveDurableRuntimeArtifactSmoke();
  assert.deepStrictEqual(h.violations, []);
  assert.deepStrictEqual(h.reads, [fixturePath]);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].mode, 0o600);
  assert.equal(dirname(h.calls[0].path), h.directories[0]);
  assert.deepStrictEqual(h.calls[0].settings, { contractSmokeArtifactOnly: true });
  const artifact = JSON.parse(h.calls[0].content);
  assert.equal(artifact.provenance.evidenceKind, 'staging_runtime_selector');
  assert.equal(artifact.provenance.fixtureOnly, false);
  assert.equal(artifact.environment.imageDigest, `sha256:${'d'.repeat(64)}`);
  assert.equal(artifact.environment.sampledAt, observedAt);
  assert.ok(artifact.services.every((service) => service.healthCheck.checkedAt === observedAt));
  assert.equal(readFileSync(fixturePath, 'utf8'), original);
  assertCleaned(h);
});

test('positive runner rejection preserves the bounded failure diagnostic and cleanup', () => {
  const h = harness({ run: () => ({ exitCode: 7, output: 'failure output that must be shortened' }) });
  h.smokes.validateRunnerPositiveDurableRuntimeArtifactSmoke();
  assert.deepStrictEqual(h.violations, [
    'fixture-runner.mjs: runner positive durable runtime artifact smoke must accept a valid runtime selector artifact: failure outp',
  ]);
  assertCleaned(h);
});

test('negative smokes reject false acceptance and wrong diagnostics in scenario order', () => {
  const h = harness({
    scenarios: [
      { label: 'false-acceptance', expectedOutput: 'expected-rejection' },
      { label: 'wrong-reason', expectedOutput: 'expected-rejection' },
      { label: 'strict-semantic', expectedOutput: 'expected-rejection' },
    ],
    run: (_path, _options, index) => index === 1
      ? { exitCode: 0, output: 'expected-rejection' }
      : { exitCode: 1, output: index === 2 ? 'different failure' : 'expected-rejection' },
  });
  h.smokes.validateRunnerNegativeDurableRuntimeArtifactSmokes();
  assert.deepStrictEqual(h.violations, [
    'fixture-runner.mjs: runner negative durable runtime smoke must reject false-acceptance',
    'fixture-runner.mjs: runner negative durable runtime smoke for wrong-reason must report "expected-rejection"',
  ]);
  assert.strictEqual(h.calls[2].settings, h.options[2].result);
  assert.equal(h.calls[2].settings.contractSmokeArtifactOnly, false);
  assert.ok(h.calls.every((call) => call.mode === 0o600));
  assertCleaned(h);
});

test('skipped negative scenarios perform no fixture or subprocess I/O', () => {
  const h = harness({
    scenarios: [{ label: 'skipped', expectedOutput: 'irrelevant', mutateArtifact() { assert.fail('skipped mutation'); } }],
    select: () => false,
  });
  h.smokes.validateRunnerNegativeDurableRuntimeArtifactSmokes();
  assert.deepStrictEqual([h.directories, h.calls, h.reads, h.options, h.violations], [[], [], [], [], []]);
});

test('negative mutations and raw JSON overrides cannot contaminate later artifacts', () => {
  const h = harness({
    scenarios: [
      { label: 'mutated', expectedOutput: 'rejected', mutateArtifact: (artifact) => { artifact.services = []; } },
      { label: 'raw-json', expectedOutput: 'rejected', artifactContent: () => 'invalid-json' },
      { label: 'fresh', expectedOutput: 'rejected' },
    ],
    run: () => ({ exitCode: 1, output: 'rejected' }),
  });
  h.smokes.validateRunnerNegativeDurableRuntimeArtifactSmokes();
  assert.deepStrictEqual(JSON.parse(h.calls[0].content).services, []);
  assert.equal(h.calls[1].content, 'invalid-json');
  assert.ok(JSON.parse(h.calls[2].content).services.length > 0);
  assert.deepStrictEqual(h.violations, []);
  assertCleaned(h);
});

test('write, runner and mutation failures propagate after temporary directory cleanup', () => {
  const failure = new Error('fixture failure');
  for (const configuration of [
    { write: (...args) => { writeFileSync(...args); throw failure; } },
    { run: () => { throw failure; } },
    { read: () => { throw failure; } },
  ]) {
    const h = harness(configuration);
    assert.throws(() => h.smokes.validateRunnerPositiveDurableRuntimeArtifactSmoke(), (error) => error === failure);
    assertCleaned(h);
  }
  const h = harness({ scenarios: [{ label: 'mutation-failure', mutateArtifact() { throw failure; } }] });
  assert.throws(() => h.smokes.validateRunnerNegativeDurableRuntimeArtifactSmokes(), (error) => error === failure);
  assertCleaned(h);
});

test('checker retains one durable artifact binding and its positive-before-negative execution', () => {
  const source = readFileSync('scripts/check-external-beta-evidence-runner.mjs', 'utf8');
  assert.equal((source.match(/createExternalBetaDurableRuntimeArtifactSmokes\(/g) ?? []).length, 1);
  assert.match(source, /validateRunnerPositiveDurableRuntimeArtifactSmoke\(\);\nvalidateRunnerNegativeDurableRuntimeArtifactSmokes\(\);/);
  assert.equal(source.includes('function durableRuntimeSelectorArtifact('), false);
  assert.equal(source.includes('function validateRunnerPositiveDurableRuntimeArtifactSmoke('), false);
});
