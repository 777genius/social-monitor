'use strict';
// Isolated synthetic data only. These fixtures are never exported as real evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { OLD, FINAL, revisionSource, digest } = require('./revision-source.cjs');
const { date, read, evidence, snapshot, bundle, controls, boundRecord } = require('./frozen-input.cjs');
const { select, compare } = require('./revision-selection.cjs');
const { execute } = require('./run.cjs');
const { dir, day, clock, c, p, candidate, raw, e, selection, write, rawRef, receipt, b } = require('./synthetic-fixture.cjs');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
test('exact artifact, request, UTC and common-clock binding fail closed', () => {
  controls(day, c); assert.throws(() => controls(day, { ...c, clock: c.periodEndedAt }));
  assert.throws(() => date('2026-02-30T00:00:00.000Z')); assert.throws(() => date('2026-09-02T00:00:00+02:00'));
  assert.throws(() => read({ ...rawRef, sha256: '0'.repeat(64) }));
  const r = receipt({ candidateId: 'synthetic' }); assert.throws(() => boundRecord({ ...r, request: {} }, {}));
  assert.throws(() => execute({ format: 'paired-policy-matrix.v1', days: [{ day }] }, process.cwd()));
});
test('projection rejects missing assessments, wrong joins, hashes, grouping and selected slates', () => {
  assert.equal(bundle(write('b.json', b), rawRef, raw, c).candidates.length, 1);
  for (const change of [{ records: [] }, { snapshotSha256: '0'.repeat(64) }, { candidates: [] },
    { selection: { ...selection, editorialSlate: {} } }, { selection: { ...selection, clusters: [{ representativeFeedItemId: 'unknown', duplicateFeedItemIds: [] }] } },
    { records: [{ ...b.records[0], request: { ...b.records[0].request, promotion: {} } }] }]) {
    assert.throws(() => bundle(write('bad.json', { ...b, ...change }), rawRef, raw, c));
  }
});
test('both actual revision closures execute with typed dates and complete primary output', () => {
  const outputs = [];
  for (const revision of [OLD, FINAL]) {
    const source = revisionSource(process.cwd(), revision, clock), FeedItem = source.load('libs/feed/domain/entities/feed-item.ts').FeedItem;
    const hydrated = snapshot(raw, day, c, FeedItem);
    assert(hydrated.candidates[0].item instanceof FeedItem);
    assert(hydrated.candidates[0].metricAuthority.observedAt instanceof Date);
    assert.equal(hydrated.candidates[0].exactTimestamps.observedAt, candidate.exactTimestamps.observedAt);
    assert.equal(typeof hydrated.candidates[0].item.toSnapshot().providerMetadata.untouchedTimestamp, 'string');
    assert.throws(() => snapshot({ ...raw, snapshot: { ...raw.snapshot, candidates: [candidate, candidate] } }, day, c, FeedItem));
    assert.throws(() => snapshot({ ...raw, snapshot: { ...raw.snapshot, sourceContent: [] } }, day, c, FeedItem));
    assert.throws(() => snapshot(raw, day, { ...c, tenantId: 'wrong' }, FeedItem));
    const input = bundle(write('valid.json', b), rawRef, raw, c), out = select(source, revision, input, { syntheticPolicyTest: true, clock });
    assert.equal(out.rows.length, 1); assert.equal(out.rows[0].placement, revision === OLD ? 'top' : 'excluded');
    if (revision === FINAL) {
      assert.deepEqual(Array.from(out.rows[0].reason), ['engagement_stale']);
      const fresh = { ...input, candidates: input.candidates.map(x => ({ ...x, promotionFacts: { ...x.promotionFacts, engagementAuthority: { observedAt: date(clock), regressionState: 'stable' } } })) };
      assert.equal(select(source, revision, fresh, { syntheticPolicyTest: true, clock }).rows[0].placement, 'top');
    }
    assert.equal(out.rows[0].artifactId, null); assert.equal(out.source.revision, revision);
    assert(Object.keys(out.source.closure).some(x => x.includes('reader-post-promotion-policy')));
    assert.equal(digest(select(source, revision, input, { syntheticPolicyTest: true, clock })), digest(out)); outputs.push(out);
  }
  assert.deepEqual(compare(outputs[0], outputs[1]).added, []);
  const after = { ...outputs[1], rows: [...outputs[1].rows, { ...outputs[1].rows[0], candidateId: 'synthetic-added' }] };
  assert.deepEqual(compare(outputs[0], after).added, ['synthetic-added']);
});
test('explicit GitHub dates hydrate without converting arbitrary metadata', () => {
  const item = evidence({ ...e, promotionFacts: { ...e.promotionFacts, metrics: { provider: 'github_radar', windowStartedAt: c.periodStartedAt, windowEndedAt: c.periodEndedAt } } });
  assert(item.promotionFacts.metrics.windowStartedAt instanceof Date);
});
test('seven-day missing-evidence matrix never becomes a complete result', () => {
  const { DAYS } = require('./frozen-input.cjs');
  const days = DAYS.map(day => {
    const start = `${day}T00:00:00.000Z`, end = new Date(Date.parse(start) + 86400000).toISOString();
    return { day, controls: { ...c, periodStartedAt: start, periodEndedAt: end,
      query: { ...c.query, windowStartedAt: start, windowEndedAt: end } }, current: { snapshot: null, projection: null }, original: { snapshot: null, projection: null } };
  });
  const out = execute({ format: 'paired-policy-matrix.v1', days }, process.cwd());
  assert.equal(out.complete, false); assert.equal(out.conditionalPolicyComplete, false);
  assert.equal(out.gaps.length, 21); assert.equal(out.algorithm.length, 0); assert.equal(out.data.length, 0);
  assert.equal(out.fullAlgorithmExperiment.status, 'required_not_executed');
});
test('model provenance files and evidence digests cannot be substituted', () => {
  const provenance = write('model.json', { model: 'synthetic-only' });
  const r = { ...receipt({ candidateId: p.id }), kind: 'model', model: provenance, prompt: provenance, schema: provenance };
  boundRecord(r, { snapshotSha256: rawRef.sha256 });
  assert.throws(() => boundRecord({ ...r, prompt: { ...provenance, sha256: '0'.repeat(64) } }, {}));
  assert.throws(() => boundRecord(r, { snapshotSha256: '0'.repeat(64) }));
  const changed = { ...b, records: [{ ...b.records[0], evidenceSha256: '0'.repeat(64) }] };
  assert.throws(() => bundle(write('substituted.json', changed), rawRef, raw, c));
});
