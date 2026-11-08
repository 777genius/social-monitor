import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateArtifactLiteralRedaction,
  validateArtifactStructuredRedaction,
  parseJsonEvidenceContent,
  isStructuredJsonEvidence,
} from './external-beta-evidence-artifact-redaction.mjs';

function literal(content) {
  const violations = [];
  validateArtifactLiteralRedaction(content, 'job-a', 'artifact', violations);
  return violations;
}

function structured(content) {
  const violations = [];
  validateArtifactStructuredRedaction(content, 'job-a', 'artifact', violations);
  return violations;
}

test('ordinary redacted diagnostic content is accepted', () => {
  assert.deepEqual(literal('safe diagnostic text with no credential'), []);
  assert.deepEqual(literal('access_token=redacted'), []);
});

test('forbidden literal prefixes are rejected without losing the original diagnostic', () => {
  assert.deepEqual(literal('sk-proj-placeholder'), [
    'job-a: artifact must not contain sensitive literal fragment "sk-proj-"',
  ]);
});

test('authorization and query credential patterns detect unmasked values', () => {
  assert.ok(literal('Authorization: unreplaced').some((x) => x.endsWith('pattern "header credential"')));
  assert.ok(literal('access_token=visible-value').some((x) => x.endsWith('pattern "query credential"')));
});

test('masked query and authorization values are allowed', () => {
  assert.deepEqual(literal('access_token=masked'), []);
  assert.deepEqual(literal('Authorization: redacted'), []);
});

test('a JWT-looking raw value is rejected using the original pattern', () => {
  assert.ok(literal('eyJaaaaaaaaaaaa.eyJbbbbbbbbbbbb.eyJcccccccccccc')
    .some((x) => x.endsWith('pattern "jwt credential"')));
});

test('pattern scans remain deterministic across repeated calls', () => {
  const input = 'access_token=not-redacted';
  assert.deepEqual(literal(input), literal(input));
  assert.equal(literal(input).length, 1);
});

test('forbidden literal fragments precede pattern diagnostics', () => {
  const hits = literal('Bearer rawvalue; authorization: rawvalue');
  assert.ok(hits[0].includes('literal fragment "bearer "'));
  assert.ok(hits.some((x) => x.includes('pattern "header credential"')));
});

test('fixtureOnly and fixture_example provenance are rejected at any depth', () => {
  assert.deepEqual(structured({ nested: { fixtureOnly: true } }), [
    'job-a: artifact must not contain fixture provenance',
  ]);
  assert.deepEqual(structured({ nested: { evidenceKind: 'fixture_example' } }), [
    'job-a: artifact must not contain fixture provenance',
  ]);
});

test('real artifacts reject nested fixture-marker strings with exact paths', () => {
  const result = structured({
    artifactFormat: 'security-final-sweep-staging-artifact-v1',
    evidence: { traceId: 'req-synthetic-001' },
  });
  assert.deepEqual(result, ['job-a: artifact evidence.traceId must not contain fixture marker "synthetic"']);
});

test('unregistered artifact formats retain the original marker-guard exception', () => {
  assert.deepEqual(structured({ artifactFormat: 'unregistered-format', traceId: 'req-synthetic-001' }), []);
});

test('real nested arrays retain original diagnostic path format and order', () => {
  const v = structured({
    artifactFormat: 'staging-reliability-artifact-v1',
    signals: [{ observed: 'trace-fixture-1' }, { observed: 'trace-example-1' }],
  });
  assert.deepEqual(v, [
    'job-a: artifact signals.0.observed must not contain fixture marker "fixture"',
    'job-a: artifact signals.1.observed must not contain fixture marker "example"',
  ]);
});

test('sensitive field keys are checked recursively and identify their full paths', () => {
  const v = structured({ items: [{ raw_access_token: 'visible-value' }] });
  assert.deepEqual(v, ['job-a: artifact must not contain unredacted sensitive key "items.0.raw_access_token"']);
});

test('redacted, null and false values remain permitted for forbidden keys', () => {
  assert.deepEqual(structured({ password: 'redacted', token: null, client_secret: false }), []);
});

test('non-redacted numeric and ordinary string values are not treated as redacted', () => {
  const v = structured({ password: 123, token: 'publicly-visible' });
  assert.deepEqual(v, [
    'job-a: artifact must not contain unredacted sensitive key "password"',
    'job-a: artifact must not contain unredacted sensitive key "token"',
  ]);
});

test('provenance, marker and sensitive field diagnostics retain their order', () => {
  const v = structured({
    artifactFormat: 'source-live-provider-evidence-v1',
    fixtureOnly: true,
    label: 'capture-example-1',
    password: 'plain-value',
  });
  assert.equal(v.length, 3);
  assert.ok(v[0].includes('fixture provenance'));
  assert.ok(v[1].includes('fixture marker "example"'));
  assert.ok(v[2].includes('unredacted sensitive key "password"'));
});

test('well-formed JSON parses as before, invalid JSON fails closed', () => {
  assert.deepEqual(parseJsonEvidenceContent('{"ok":true}'), { ok: true, value: { ok: true } });
  assert.deepEqual(parseJsonEvidenceContent('{bad'), { ok: false, value: undefined });
});

test('structured JSON evidence predicate preserves arrays, null and primitives', () => {
  assert.equal(isStructuredJsonEvidence({ ok: true }), true);
  assert.equal(isStructuredJsonEvidence([]), true);
  assert.equal(isStructuredJsonEvidence(null), false);
  assert.equal(isStructuredJsonEvidence('plain'), false);
});

test('security validation does not mutate the source document', () => {
  const obj = { artifactFormat: 'security-final-sweep-staging-artifact-v1', secret: 'raw-value' };
  const original = globalThis.structuredClone(obj);
  structured(obj);
  assert.deepEqual(obj, original);
});
