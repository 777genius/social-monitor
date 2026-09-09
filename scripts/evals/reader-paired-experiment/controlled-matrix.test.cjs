'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { executeControlled, ARM_PLAN, inputDifference } = require('./controlled-matrix.cjs');
const { DAYS } = require('./frozen-input.cjs');
const { OLD, FINAL } = require('./revision-source.cjs');
const { controlledFixture } = require('./controlled-fixture.cjs');
const { clone } = require('./recorded-selector-ports.cjs');
function manifest() {
  return { format: 'paired-controlled-experiment.v1', mode: 'CONTROLLED', pins: { old: OLD, final: FINAL },
    schedule: 'successful_immediate_lexicographic_record.v1', days: DAYS.map(day => ({ day })) };
}
test('controlled matrix declares exactly 21 unique arms and two distinct seven-day comparisons', async () => {
  assert.deepEqual(ARM_PLAN, [['oldAfter', OLD, 'after'], ['finalAfter', FINAL, 'after'], ['finalBefore', FINAL, 'before']]);
  assert.equal(ARM_PLAN.length * DAYS.length, 21);
  const result = await executeControlled(manifest(), process.cwd());
  assert.equal(result.algorithm.length, 7);
  assert.equal(result.data.length, 7);
  assert.equal(result.comparisonCount, 14);
  assert.equal(result.executedArmCount, 0);
  assert.equal(result.controlledExperimentComplete, false);
  assert.equal(result.historicalTimingVerified, false);
  assert.equal(result.historicalReplayComplete, false);
  assert.equal(result.publicationComplete, false);
  for (const [i, day] of result.days.entries()) {
    assert.equal(day.day, DAYS[i]);
    assert.deepEqual(Object.keys(day.arms), ['oldAfter', 'finalAfter', 'finalBefore']);
    assert.equal(result.algorithm[i].afterArm, 'finalAfter');
    assert.equal(result.data[i].afterArm, 'finalAfter');
  }
  assert.equal(result.gaps.filter(g => g.kind === 'missing_valid_evaluation_view').length, 21);
});
test('omitted days, wrong revisions and unspecified scheduling are rejected before execution', async () => {
  for (const change of [m => m.days.pop(), m => { m.pins.old = FINAL; }, m => { delete m.schedule; }, m => { delete m.mode; }]) {
    const m = manifest(); change(m);
    await assert.rejects(executeControlled(m, process.cwd()));
  }
});
test('data contrast retains population, order, source, metric and authority differences without a metrics-only claim', () => {
  const before = controlledFixture().observation, after = clone(before);
  after.snapshot.candidates[0].canonical.metrics = { kind: 'hacker_news', points: 321 };
  after.snapshot.candidates[0].metricAuthority = { regressionState: 'confirmed_correction', observedAt: '2026-09-09T12:00:00.000Z' };
  after.snapshot.sourceContent[0].body += ' synthetic change';
  after.snapshot.supplementalItems.reverse();
  const diff = inputDifference(before, after);
  assert.equal(diff.metricsOnlyVerified, false);
  assert.equal(diff.rows.length, 16);
  assert.ok(diff.rows.some(r => r.changed && r.before.partition === 'primary'));
  assert.ok(diff.rows.some(r => r.changed && r.before.partition === 'supplemental'));
  assert.notDeepEqual(diff.rows[0].beforeSourceContent, diff.rows[0].afterSourceContent);
  assert.deepEqual(diff.rows[0].after.row.metricAuthority, after.snapshot.candidates[0].metricAuthority);
});

test('controlled CLI writes an incomplete report create-only and never promotes missing inputs', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const { sha } = require('./revision-source.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'controlled-cli-'));
  try {
    const file = path.join(directory, 'manifest.json'), out = path.join(directory, 'result.json');
    const bytes = JSON.stringify(manifest()); fs.writeFileSync(file, bytes);
    const args = [path.join(__dirname, 'run.cjs'), '--mode', 'controlled', '--manifest', file,
      '--sha256', sha(bytes), '--out', out];
    const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(first.status, 2, first.stderr);
    const original = fs.readFileSync(out), report = JSON.parse(original);
    assert.equal(report.mode, 'CONTROLLED');
    assert.equal(report.controlledExperimentComplete, false);
    assert.equal(report.comparisonCount, 14);
    assert.equal(fs.statSync(out).mode & 0o777, 0o600);
    const second = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(second.status, 2);
    assert.match(second.stderr, /EEXIST/);
    assert.deepEqual(fs.readFileSync(out), original);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('all 21 real pinned selectors run offline on seven synthetic observation pairs with common controls; missing authority stays incomplete', async () => {
  const { captureCoreFixture } = require('./capture-core-fixture.cjs');
  const { p2Fixture } = require('./p2-fixture.cjs');
  const { captureCore } = require('./capture-core-observation.cjs');
  const { p2Observation } = require('./p2-observation.cjs');
  const { controlsDigest } = require('./controlled-evaluation-view.cjs');
  const { modelControls } = require('./full-selector-fixture.cjs');
  const before = captureCoreFixture(), afterFixtures = [];
  try {
    const observations = captureCore(before.args), m = manifest(); m.before = before.args;
    for (const [i, day] of m.days.entries()) {
      const after = p2Fixture(tape => {
        const record = clone(before.records[i]), input = tape.files['inputs.json'];
        record.query.observedThrough = '2026-09-09T12:00:00.000Z';
        input.query = record.query; input.queryKeys = Object.keys(record.query); input.snapshot = record.snapshot;
        tape.files['snapshot-query.json'] = { query: clone(record.query), presentKeys: input.queryKeys };
        tape.seal.scope.observedThrough = record.query.observedThrough;
        tape.files['started.json'].scope = clone(tape.seal.scope);
        const selection = tape.files['selection-query.json'].query;
        selection.observedThrough = record.query.observedThrough;
        selection.period.startedAt = record.query.windowStartedAt; selection.period.endedAt = record.query.windowEndedAt;
      });
      afterFixtures.push(after);
      const observedAfter = p2Observation(after.ref).observation;
      day.after = after.ref;
      day.evaluationControls = { clock: observedAfter.observationQuery.observedThrough, locale: 'en',
        snapshot: clone(after.tape.files['snapshot-query.json']), selection: clone(after.tape.files['selection-query.json']),
        interests: clone(after.tape.files['interests.jsonl'].map(r => r.event)), model: clone(modelControls) };
      day.evaluationControls.snapshot.presentKeys.push('interestId');
      const declare = observation => ({ kind: 'common_evaluation_controls', observationSha256: observation.observationSha256,
        originalControlsSha256: controlsDigest({ observationQuery: observation.observationQuery,
          observationPresentKeys: observation.observationPresentKeys, controls: observation.originalControls, interests: observation.interests }),
        evaluationControlsSha256: controlsDigest(day.evaluationControls) });
      day.interventions = { before: declare(observations[i]), after: declare(observedAfter) };
    }
    const result = await executeControlled(m, process.cwd());
    assert.equal(result.executedArmCount, 21, JSON.stringify(result.gaps));
    assert.equal(result.comparisonCount, 14);
    assert.ok([...result.algorithm, ...result.data].every(c => c.matchedExogenousControls));
    for (const [i, day] of result.days.entries()) {
      for (const arm of Object.values(day.arms)) {
        assert.equal(arm.selectorReturned, true, JSON.stringify(arm.gaps));
        assert.equal(arm.rows.length, 16);
        assert.equal(arm.inventory.primary.length, 4);
        assert.equal(arm.inventory.supplemental.length, 12);
        assert.equal(arm.controlledExperimentComplete, false);
        assert.equal(arm.actualProducerVerified, false);
        assert.deepEqual(arm.observation.snapshot, before.records[i].snapshot);
      }
      assert.ok(day.arms.oldAfter.rows.every(r => r.status === 'deterministic_legacy'));
      assert.equal(result.algorithm[i].afterSha256, result.data[i].afterSha256);
    }
    assert.ok(result.gaps.some(g => g.kind === 'observation_origin_unverified'));
    assert.equal(result.controlledExperimentComplete, false);
    assert.equal(result.historicalTimingVerified, false);
    assert.equal(result.publicationComplete, false);
  } finally { before.cleanup(); afterFixtures.forEach(f => f.cleanup()); }
});
