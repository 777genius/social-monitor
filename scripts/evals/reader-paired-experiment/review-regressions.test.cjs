'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const { bundle, DAYS, digest } = require('./frozen-input.cjs');
const { select, compare } = require('./revision-selection.cjs');
const { FINAL, revisionSource } = require('./revision-source.cjs');
const { dir, clock, c, p, raw, e, b, write, rawRef } = require('./synthetic-fixture.cjs');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
function altered(item) {
  return { ...b, candidates: [item], selection: { ...b.selection, selectedEvidence: [item] },
    records: [{ ...b.records[0], evidenceSha256: digest(item) }] };
}
test('self-hashed assertions remain pending, including rewritten source and metrics', () => {
  for (const item of [e, { ...e, title: 'Synthetic altered title', sourceText: 'Synthetic altered body',
    promotionFacts: { ...e.promotionFacts, metrics: { provider: 'hacker_news', points: 999999 } } }]) {
    const input = bundle(write('assertions.json', altered(item)), rawRef, raw, c);
    assert.equal(input.assessmentCoverage.status, 'pending_producer_contract');
    assert.throws(() => select(null, FINAL, input), error => error.code === 'producer_contract_missing' &&
      error.missingAssessmentCount === 1 && error.pendingIds[0] === p.id);
  }
});
test('primary and supplemental populations cannot move in either direction', () => {
  const moved = { ...b, candidates: [], supplemental: [e] };
  assert.throws(() => bundle(write('moved.json', moved), rawRef, raw, c), /primary coverage/);
  const supplementalRaw = { ...raw, snapshot: { ...raw.snapshot, candidates: [], supplementalItems: [raw.snapshot.candidates[0].item] } };
  const ref = write('supplemental-raw.json', supplementalRaw);
  assert.throws(() => bundle(write('reverse.json', { ...b, snapshotSha256: ref.sha256 }), ref, supplementalRaw, c), /primary coverage/);
  assert.throws(() => bundle(write('missing-supplemental.json', { ...b, snapshotSha256: ref.sha256, candidates: [], supplemental: [] }), ref, supplementalRaw, c), /supplemental coverage/);
});
test('unresolved flag and pending reasons preserve IDs/counts without policy rejection', () => {
  for (const quality of [{ ...e.contentQuality, needsLlmReview: true },
    { ...e.contentQuality, reason: 'promotion_assessment_pending:needs_context' },
    { ...e.contentQuality, reason: 'promotion_assessment_not_requested:deadline' }]) {
    assert.throws(() => bundle(write('pending.json', altered({ ...e, contentQuality: quality })), rawRef, raw, c),
      error => error.code === 'unresolved_assessment' && error.missingAssessmentCount === 1 && error.pendingIds[0] === p.id);
  }
});
test('FINAL validator rejects malformed accepted headlines; legacy unavailable remains usable synthetically', () => {
  assert.throws(() => bundle(write('headline.json', altered({ ...e, sourceText: p.bodyPreview,
    readerHeadline: { status: 'accepted', binding: { candidateId: p.id, tenantId: c.tenantId, workspaceId: c.workspaceId, sourceItemId: p.sourceItemId } } })), rawRef, raw, c),
    error => error.code === 'invalid_accepted_headline');
  const input = bundle(write('legacy.json', altered({ ...e, readerHeadline: { status: 'unavailable', reasonCode: 'not_assessed' } })), rawRef, raw, c);
  const out = select(revisionSource(process.cwd(), FINAL, clock), FINAL, input, { syntheticPolicyTest: true });
  assert.equal(out.headlineAvailability.inputAccepted, 0);
  assert.equal(out.rows[0].inputHeadlineStatus, 'unavailable');
  assert.equal(compare(out, out).missingAssessmentCount, 1);
  assert.equal(out.evidenceStatus, 'synthetic_policy_test_only');
});
test('CLI seven-day assertions and unresolved assessments exit 2 and retain gaps', () => {
  // Original non-Sep2 accepts a synthetic raw pin; current production pins remain intact.
  for (const pending of [false, true]) {
    const days = DAYS.map(day => {
      const start = `${day}T00:00:00.000Z`, end = new Date(Date.parse(start) + 86400000).toISOString();
      const controls = { ...c, periodStartedAt: start, periodEndedAt: end, query: { ...c.query, windowStartedAt: start, windowEndedAt: end } };
      const candidate = structuredClone(raw.snapshot.candidates[0]);
      candidate.item.props.publishedAt = `${day}T10:00:00.000Z`;
      candidate.exactTimestamps.publishedAt = `${day}T10:00:00.000000Z`;
      const snapshot = { ...raw, snapshot: { ...raw.snapshot, candidates: [candidate] } };
      const snapRef = write(`${day}-raw.json`, snapshot);
      const item = { ...e, publishedAt: candidate.item.props.publishedAt,
        contentQuality: { ...e.contentQuality, needsLlmReview: pending } };
      const projection = altered(item);
      projection.snapshotSha256 = snapRef.sha256; projection.controlsSha256 = digest(controls);
      projection.records = projection.records.map(r => ({ ...r, snapshotSha256: snapRef.sha256, controlsSha256: digest(controls), rawCandidateSha256: digest(candidate) }));
      projection.selection.sourceWindow = { ...projection.selection.sourceWindow, startedAt: start, endedAt: end, periodStartedAt: start, periodEndedAt: end };
      const grouping = JSON.parse(fs.readFileSync(b.grouping.path));
      projection.grouping = write(`${day}-group.json`, { ...grouping, snapshotSha256: snapRef.sha256, controlsSha256: digest(controls) });
      const arm = { snapshot: snapRef, projection: write(`${day}-projection.json`, projection) };
      return { day, controls, original: arm, current: arm };
    });
    const manifest = write(`manifest-${pending}.json`, { format: 'paired-policy-matrix.v1', days, syntheticPolicyTest: true });
    const out = path.join(dir, `cli-${pending}.json`);
    const result = spawnSync(process.execPath, [path.join(__dirname, 'run.cjs'), '--mode', 'policy', '--manifest', manifest.path, '--sha256', manifest.sha256, '--out', out], { encoding: 'utf8' });
    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(fs.readFileSync(out));
    assert.equal(report.conditionalPolicyComplete, false); assert.equal(report.complete, false);
    assert.equal(report.algorithm.length, 0); assert.equal(report.data.length, 0);
    const gaps = report.gaps.filter(g => g.kind === (pending ? 'unresolved_assessment' : 'producer_contract_missing'));
    assert.equal(gaps.length, 6);
    assert(gaps.every(g => g.missingAssessmentCount === 1 && g.pendingIds[0] === p.id));
  }
});
test('valid synthetic headline stays available when excluded; tampered support fails FINAL validation', () => {
  const source = revisionSource(process.cwd(), FINAL, clock);
  const build = source.load('libs/summary/test-fixtures/accepted-reader-headline.ts').acceptedFixtureReaderHeadline;
  const item = JSON.parse(JSON.stringify(source.invoke(build, [e, { tenantId: c.tenantId, workspaceId: c.workspaceId }])));
  const input = bundle(write('valid-headline.json', altered(item)), rawRef, raw, c);
  assert.throws(() => select(source, FINAL, input), /producer_contract_missing/);
  const out = select(source, FINAL, input, { syntheticPolicyTest: true });
  assert.equal(out.rows[0].placement, 'excluded');
  assert.equal(out.rows[0].inputHeadlineStatus, 'accepted');
  assert.equal(out.headlineAvailability.inputAccepted, 1);
  assert.equal(out.headlineAvailability.admittedAccepted, 0);
  for (const change of [{ text: '' }, { support: [] }, { wholeInput: {} },
    { binding: { ...item.readerHeadline.binding, reviewedInputDigest: '0'.repeat(64) } }]) {
    assert.throws(() => bundle(write('tampered-headline.json', altered({ ...item,
      readerHeadline: { ...item.readerHeadline, ...change } })), rawRef, raw, c),
      error => error.code === 'invalid_accepted_headline');
  }
});
