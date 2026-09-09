'use strict';
// Isolated synthetic data only. These fixtures are never exported as real evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OLD, FINAL, revisionSource, digest, sha } = require('./revision-source.cjs');
const { date, read, evidence, snapshot, bundle, controls, boundRecord } = require('./frozen-input.cjs');
const { select, compare } = require('./revision-selection.cjs');
const { execute } = require('./run.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paired-synthetic-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const day = '2026-09-02', clock = '2026-09-09T03:34:50.293Z';
const c = { tenantId: 'synthetic-tenant', workspaceId: 'synthetic-workspace', scope: { kind: 'workspace' },
  config: { synthetic: true }, limits: { top: 8, additional: 8 }, locale: 'en', shadow: 'disabled', relatedTopic: 'disabled',
  periodStartedAt: `${day}T00:00:00.000Z`, periodEndedAt: '2026-09-03T00:00:00.000Z', ingestionCutoff: clock, clock };
c.query = { tenantId: c.tenantId, workspaceId: c.workspaceId, timestampPolicy: 'published_at', windowStartedAt: c.periodStartedAt, windowEndedAt: c.periodEndedAt, observedThrough: clock };
const p = { id: 'synthetic-hn', tenantId: c.tenantId, workspaceId: c.workspaceId, sourceItemId: 'synthetic-source',
  sourceBindingId: 'synthetic-binding', interestId: 'synthetic-interest', providerKey: 'hacker-news', canonicalUrl: 'https://example.invalid/synthetic',
  title: 'Synthetic database release adds indexed search', bodyPreview: 'Synthetic fixture text only.', publishedAt: `${day}T10:00:00.000Z`, observedAt: `${day}T12:00:00.000Z`,
  providerMetadata: { untouchedTimestamp: '2026-09-02T12:00:00.000Z' } };
const candidate = { item: { props: p }, canonical: { eligible: true, providerFamily: 'hacker_news', metricsState: 'observed', metrics: { points: 500 } },
  exactTimestamps: { publishedAt: `${day}T10:00:00.000000Z`, observedAt: `${day}T12:00:00.000000Z` }, metricAuthority: { observedAt: p.observedAt, regressionState: 'stable' } };
const raw = { format: 'read-only-full-promotion-snapshot.v1', capturedAt: clock, observedThrough: clock,
  snapshot: { ok: true, exhausted: true, physicalRowsRead: 1, candidates: [candidate], supplementalItems: [], sourceContent: [{ feedItemId: p.id, sourceItemId: p.sourceItemId, body: p.bodyPreview }] } };
const e = { ...p, feedItemId: p.id, score: 80, whyImportant: ['Synthetic only'], contentQuality: {
  qualityScore: 0.9, interestRelevanceScore: 0.9, engagementIntegrityScore: 0.9, eligibleForSummary: true, eligibleForTopRead: true,
  needsLlmReview: false, decision: 'promote', flags: [], reason: 'Synthetic adapter fixture' }, promotionFacts: {
    contentKind: 'story', canonicalIdentity: p.canonicalUrl, safetyValid: true, freshnessValid: true, metricsState: 'observed',
    metrics: { provider: 'hacker_news', points: 500 }, engagementAuthority: candidate.metricAuthority,
    freshnessProvenance: { status: 'observed', publishedAt: p.publishedAt, observedAt: p.observedAt, ingestionCutoff: clock } } };
const selection = { rankingPolicyVersion: 'synthetic-preselection', sourceWindow: { windowId: 'synthetic-window',
  startedAt: c.periodStartedAt, endedAt: c.periodEndedAt, periodStartedAt: c.periodStartedAt, periodEndedAt: c.periodEndedAt,
  ingestionCutoff: clock, selectedFeedItemIds: [p.id], storyClusterIds: [] }, clusters: [], selectedEvidence: [e], approvedSameStoryRelations: [], relatedTopicRelations: [] };
const write = (name, value) => { const bytes = JSON.stringify(value), filename = path.join(dir, name); fs.writeFileSync(filename, bytes); return { path: filename, sha256: sha(bytes) }; };
const rawRef = write('raw.json', raw);
const receipt = request => ({ producer: 'synthetic-fixture-only', kind: 'deterministic', sourceRevision: FINAL,
  request, requestSha256: digest(request), snapshotSha256: rawRef.sha256, controlsSha256: digest(c) });
const b = { format: 'paired-policy-projection.v1', snapshotSha256: rawRef.sha256, controlsSha256: digest(c),
  selection, candidates: [e], supplemental: [], records: [{ ...receipt({ candidateId: p.id, providerKey: p.providerKey,
    promotion: { tenantId: p.tenantId, workspaceId: p.workspaceId, sourceItemId: p.sourceItemId, sourceBindingId: p.sourceBindingId, interestId: p.interestId } }),
    feedItemId: p.id, rawCandidateSha256: digest(candidate), sourceContentSha256: digest(raw.snapshot.sourceContent[0]), evidenceSha256: digest(e) }],
  grouping: write('grouping.json', { ...receipt({ synthetic: true }), inputIds: [p.id], unclusteredIds: [p.id],
    resultSha256: digest({ clusters: [], approvedSameStoryRelations: [], relatedTopicRelations: [] }) }) };
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
    const input = bundle(write('valid.json', b), rawRef, raw, c), out = select(source, revision, input);
    assert.equal(out.rows.length, 1); assert.equal(out.rows[0].placement, revision === OLD ? 'top' : 'excluded');
    if (revision === FINAL) {
      assert.deepEqual(Array.from(out.rows[0].reason), ['engagement_stale']);
      const fresh = { ...input, candidates: input.candidates.map(x => ({ ...x, promotionFacts: { ...x.promotionFacts, engagementAuthority: { observedAt: date(clock), regressionState: 'stable' } } })) };
      assert.equal(select(source, revision, fresh).rows[0].placement, 'top');
    }
    assert.equal(out.rows[0].artifactId, null); assert.equal(out.source.revision, revision);
    assert(Object.keys(out.source.closure).some(x => x.includes('reader-post-promotion-policy')));
    assert.equal(digest(select(source, revision, input)), digest(out)); outputs.push(out);
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
