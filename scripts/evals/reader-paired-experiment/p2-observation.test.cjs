'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { p2Observation } = require('./p2-observation.cjs');
const { p2Fixture: fixture } = require('./p2-fixture.cjs');

test('P2 integrity reader preserves full original journals and never treats a synthetic seal as origin authority', () => {
  const f = fixture();
  try {
    const result = p2Observation(f.ref);
    assert.deepEqual(result.tape.files, f.tape.files);
    assert.deepEqual(result.observation.snapshot, f.tape.files['inputs.json'].snapshot);
    assert.equal(result.observation.provenance.independentOriginVerified, false);
    assert.equal(result.observation.startedAt, null);
    assert.equal(result.observation.endedAt, null);
    assert.equal(result.observation.provenance.historicalReadInterval, 'not_recorded');
  } finally { f.cleanup(); }
});
test('incomplete seals, unfinished models/lanes, omitted rows and mismatched scopes fail closed', () => {
  const cases = [
    [t => { t.seal.complete = false; }, /p2_capture_incomplete/],
    [t => { t.seal.failures.push('late_callback'); }, /p2_capture_incomplete/],
    [t => { t.files['models.jsonl'] = t.files['models.jsonl'].filter(r => r.event.kind !== 'envelope_verified'); }, /p2_model_unfinished/],
    [t => { t.files['relations.jsonl'] = t.files['relations.jsonl'].filter(r => r.event.phase === 'attempt'); }, /p2_lane_unfinished/],
    [t => { t.files['candidate-status.json'].pop(); }, /p2_ordered_inventory/],
    [t => { t.files['started.json'].scope.tenantId = 'different'; }, /p2_started_scope/],
    [t => { delete t.files['preparation.json']; }, /p2_missing_original_callback/],
    [t => { t.seal.observationCounts.relationAttempts++; }, /p2_relation_inventory/],
    [t => { t.files['interests.jsonl'][0].event.query.workspaceId = 'other'; }, /p2_interest_scope/],
    [t => { t.files['relations.jsonl'].find(r => r.event.phase === 'terminal').event.id = 900; }, /p2_orphan_lane/],
  ];
  for (const [mutate, code] of cases) {
    const f = fixture(mutate);
    try { assert.throws(() => p2Observation(f.ref), code); } finally { f.cleanup(); }
  }
});
test('unsealed late journals cannot be silently omitted', () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.directory, 'failures.jsonl'), '{"late":true}\n');
    assert.throws(() => p2Observation(f.ref), /p2_unsealed_capture_file/);
  } finally { f.cleanup(); }
});

test('provenance flags and receipt hashes inside an untrusted reference cannot register owner authority', () => {
  const { originFor } = require('./p2-observation.cjs');
  const f = fixture();
  try {
    const result = p2Observation({ ...f.ref, actualProducer: true, trustedAnchor: f.ref.sha256,
      ownerReceipt: { path: f.ref.path, sha256: f.ref.sha256 } });
    assert.equal(result.observation.provenance.independentOriginVerified, false);
    assert.match(result.observation.provenance.originGap, /out_of_band_anchor_missing/);
    assert.equal(originFor(result.tape), undefined);
    assert.equal(originFor({ ...result.observation, provenance: { independentOriginVerified: true } }), undefined);
    assert.throws(() => { result.tape.files['models.jsonl'].pop(); }, TypeError);
  } finally { f.cleanup(); }
});
