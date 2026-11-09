import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceLiveNegativeSmokeScenarios } from './external-beta-source-live-negative-smoke-scenarios.mjs';

const labels = [
  'fixture provenance',
  'unredacted sensitive key',
  'raw duplicate-key credential hidden by JSON parser',
  'wrong artifact id',
  'missing provider key',
  'unexpected provider key',
  'stale artifact timestamp',
  'future artifact timestamp',
  'environment image digest mismatch',
  'environment commit sha mismatch',
  'nested fixture marker',
  'world-readable evidence artifact',
];

const fixture = () => ({
  sampledAt: '2026-11-09T00:00:00.000Z',
  environment: {
    sampledAt: '2026-11-09T00:00:00.000Z',
    imageDigest: 'sha256:original',
    commitSha: 'a'.repeat(40),
  },
  providerResults: [
    { providerKey: 'hacker-news', sampledAt: '2026-11-09T00:00:00.000Z',
      signalResults: [{ evidence: { sampleId: 'real-evidence-1' } }] },
    { providerKey: 'rss', sampledAt: '2026-11-09T00:00:00.000Z', signalResults: [] },
    { providerKey: 'github-issues', sampledAt: '2026-11-09T00:00:00.000Z', signalResults: [] },
  ],
});

function scenario(label) {
  const matches = sourceLiveNegativeSmokeScenarios().filter(item => item.label === label);
  assert.equal(matches.length, 1);
  return matches[0];
}

test('the original twelve negative scenarios retain order and distinct diagnostics', () => {
  const scenarios = sourceLiveNegativeSmokeScenarios();
  assert.deepEqual(scenarios.map(item => item.label), labels);
  assert.equal(new Set(scenarios.map(item => item.expectedOutput)).size, scenarios.length);
  assert.ok(scenarios.every(item => typeof item.expectedOutput === 'string' && item.expectedOutput.length > 0));
  assert.notStrictEqual(scenarios, sourceLiveNegativeSmokeScenarios());
});

test('fixture provenance and sensitive field remain explicitly negative', () => {
  assert.equal(scenario('fixture provenance').artifactPatch.fixtureOnly, true);
  assert.equal(scenario('fixture provenance').artifactPatch.source.evidenceKind, 'fixture_example');
  assert.ok(scenario('unredacted sensitive key').artifactPatch.diagnostics.password);
});

test('raw duplicate credential keys cannot disappear through JSON parsing', () => {
  const raw = scenario('raw duplicate-key credential hidden by JSON parser').artifactContent(fixture());
  assert.equal((raw.match(/"authorization":/g) ?? []).length, 2);
  assert.equal(JSON.parse(raw).diagnostics.authorization, 'redacted');
  assert.ok(raw.includes('raw-live-token-hidden-by-duplicate-key'));
});

test('wrong artifact identity remains a separate scenario', () => {
  assert.equal(scenario('wrong artifact id').artifactPatch.artifactId, 'wrong-live-open-connectors-evidence');
});

test('missing provider is removed without modifying original artifact', () => {
  const base = fixture();
  const modified = scenario('missing provider key').artifact(base);
  assert.deepEqual(modified.providerResults.map(item => item.providerKey), ['hacker-news', 'rss']);
  assert.equal(base.providerResults.length, 3);
});

test('unexpected provider remains present in the synthetic artifact only', () => {
  const base = fixture();
  const modified = scenario('unexpected provider key').artifact(base);
  assert.equal(modified.providerResults.at(-1).providerKey, 'mastodon');
  assert.equal(base.providerResults.length, 3);
});

test('stale timestamp covers top-level, environment and every provider', () => {
  const modified = scenario('stale artifact timestamp').artifact(fixture());
  assert.equal(modified.sampledAt, '2000-01-01T00:00:00.000Z');
  assert.equal(modified.environment.sampledAt, modified.sampledAt);
  assert.ok(modified.providerResults.every(item => item.sampledAt === modified.sampledAt));
});

test('future timestamp remains generated when a scenario is executed', () => {
  const before = Date.now();
  const modified = scenario('future artifact timestamp').artifact(fixture());
  const future = Date.parse(modified.sampledAt);
  assert.ok(future >= before + 23 * 60 * 60 * 1000);
  assert.equal(modified.environment.sampledAt, modified.sampledAt);
  assert.ok(modified.providerResults.every(item => item.sampledAt === modified.sampledAt));
});

test('image digest mismatch is isolated to environment identity', () => {
  const base = fixture();
  const modified = scenario('environment image digest mismatch').artifact(base);
  assert.equal(modified.environment.imageDigest, 'sha256:' + 'c'.repeat(64));
  assert.equal(base.environment.imageDigest, 'sha256:original');
});

test('commit SHA mismatch is isolated to environment identity', () => {
  const base = fixture();
  const modified = scenario('environment commit sha mismatch').artifact(base);
  assert.equal(modified.environment.commitSha, '0'.repeat(40));
  assert.equal(base.environment.commitSha, 'a'.repeat(40));
});

test('nested fixture marker changes a copy, not the input sample', () => {
  const base = fixture();
  const modified = scenario('nested fixture marker').artifact(base);
  assert.equal(modified.providerResults[0].signalResults[0].evidence.sampleId, 'live-open-example-001');
  assert.equal(base.providerResults[0].signalResults[0].evidence.sampleId, 'real-evidence-1');
});

test('unsafe world-readable mode is retained for its negative case', () => {
  const item = scenario('world-readable evidence artifact');
  assert.equal(item.fileMode, 0o644);
  const base = fixture();
  assert.strictEqual(item.artifact(base), base);
});
