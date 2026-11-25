'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DAYS } = require('./frozen-input.cjs');
const { executeFull } = require('./full-selector-matrix.cjs');
const { sha } = require('./revision-source.cjs');
test('full matrix retains fourteen partial pair slots and names every missing population', async () => {
  const manifest = { format: 'paired-full-selector-matrix.v1', synthetic: false, days: DAYS.map(day => ({ day })) };
  const result = await executeFull(manifest, process.cwd());
  assert.equal(result.algorithm.length, 7); assert.equal(result.data.length, 7);
  assert.equal(result.gaps.filter(g => g.kind === 'missing_original_capture').length, 7);
  assert.equal(result.gaps.filter(g => g.kind === 'missing_current_capture').length, 7);
  assert.ok(result.days.every(d => Object.values(d.arms).every(arm => arm === null)));
  assert.ok(result.gaps.every(g => g.unresolvedCandidateCount === null));
  assert.equal(result.complete, false);
  await assert.rejects(executeFull({ ...manifest, days: manifest.days.slice().reverse() }), /exact_ordered/);
});
test('full-selector CLI preserves missing evidence, exits 2 and writes create-only private output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paired-full-cli-'));
  try {
    const filename = path.join(dir, 'manifest.json'), out = path.join(dir, 'result.json');
    const bytes = JSON.stringify({ format: 'paired-full-selector-matrix.v1', days: DAYS.map(day => ({ day })) });
    fs.writeFileSync(filename, bytes);
    const args = [path.join(__dirname, 'run.cjs'), '--mode', 'full-selector', '--manifest', filename, '--sha256', sha(bytes), '--out', out];
    assert.throws(() => execFileSync(process.execPath, args, { stdio: 'pipe', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1536' } }), error => error.status === 2);
    assert.equal(JSON.parse(fs.readFileSync(out)).format, 'paired-full-selector-results.v1');
    assert.equal(fs.statSync(out).mode & 0o777, 0o600);
    const original = fs.readFileSync(out);
    assert.throws(() => execFileSync(process.execPath, args, { stdio: 'pipe' }));
    assert.deepEqual(fs.readFileSync(out), original);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('actual three-arm slice separates algorithm/data changes and reuses exact FINAL/current digest', async () => {
  const { syntheticTape, writeTape, modelControls } = require('./full-selector-fixture.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paired-full-matrix-'));
  try {
    const original = syntheticTape(), input = original.files['inputs.json'];
    const removed = new Set(input.supplementalIds.slice(-3));
    input.supplementalIds = input.supplementalIds.slice(0, -3);
    input.snapshot.supplementalItems = input.snapshot.supplementalItems.slice(0, -3);
    input.snapshot.sourceContent = input.snapshot.sourceContent.filter(s => !removed.has(s.feedItemId));
    const refs = { original: { capture: writeTape(path.join(dir, 'original'), original) },
      current: { capture: writeTape(path.join(dir, 'current')) } };
    const manifest = { format: 'paired-full-selector-matrix.v1', days: DAYS.map(day =>
      day === '2026-09-03' ? { day, ...refs, modelControls } : { day }) };
    const result = await executeFull(manifest);
    const algorithm = result.algorithm.find(p => p.day === '2026-09-03');
    const data = result.data.find(p => p.day === '2026-09-03');
    assert.equal(algorithm.status, 'partial_controlled_comparison');
    assert.equal(data.status, 'partial_controlled_comparison');
    assert.equal(algorithm.afterSha256, data.afterSha256);
    assert.equal(algorithm.changes.added.length, 0);
    assert.deepEqual(new Set(data.changes.added), removed);
    const arms = result.days.find(d => d.day === '2026-09-03').arms;
    assert.equal(arms.finalOriginal.rows.length, 13);
    assert.equal(arms.finalCurrent.rows.length, 16);
    assert.equal(arms.oldCurrent.assessmentCoverage.attemptedCount, 0);
    assert.equal(result.gaps.filter(g => g.kind === 'missing_original_capture').length, 6);
    assert.equal(result.complete, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an invalid union tape retains other verified tapes and their actual parser results', async () => {
  const { syntheticTape, writeTape, modelControls } = require('./full-selector-fixture.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paired-union-partial-'));
  try {
    const current = syntheticTape(); current.files['models.jsonl'] = [];
    const currentRef = writeTape(path.join(dir, 'current'), current);
    const responses = writeTape(path.join(dir, 'responses'));
    const invalid = { ...responses, sha256: '0'.repeat(64) };
    const manifest = { format: 'paired-full-selector-matrix.v1', days: DAYS.map(day =>
      day === '2026-09-03' ? { day, current: { capture: currentRef },
        responsePool: [invalid, responses], modelControls } : { day }) };
    const result = await executeFull(manifest);
    assert.ok(result.gaps.some(g => g.day === '2026-09-03' && g.responsePoolIndex === 0));
    const arm = result.days.find(d => d.day === '2026-09-03').arms.finalCurrent;
    assert.equal(arm.selectorReturned, true);
    assert.equal(arm.replay.consumed.length, 2);
    assert.equal(arm.rows.find(r => r.candidateId === 'promote').status, 'model_resolved');
    assert.equal(arm.replay.replayMissingRequestCount, 0);
    assert.equal(result.complete, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
