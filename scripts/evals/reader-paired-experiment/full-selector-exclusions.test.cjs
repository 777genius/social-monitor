'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { OLD, FINAL } = require('./revision-source.cjs');
const { fullSelector, exclusionDecisions } = require('./revision-full-selector.cjs');
const { compare } = require('./revision-selection.cjs');
const { syntheticTape, modelControls } = require('./full-selector-fixture.cjs');

test('FINAL rows preserve actual slate exclusions separately from assessment and noncandidates', async () => {
  const arm = await fullSelector({ revision: FINAL, tape: syntheticTape(), modelControls });
  assert.equal(arm.selectorReturned, true);
  for (const [id, status, assessmentReason] of [
    ['abstain', 'model_abstained', 'promotion_assessment_pending:needs_context'],
    ['hard-gate', 'deterministic_hard_gate', 'promotion_assessment_not_requested:hard_gate'],
  ]) {
    const row = arm.rows.find(r => r.candidateId === id);
    const exclusion = arm.selection.editorialSlate.excluded.find(e => e.candidateId === id);
    assert.ok(exclusion);
    assert.equal(arm.native.evaluatedEvidence.some(e => e.candidateId === id), false);
    assert.equal(row.placement, 'excluded');
    assert.deepEqual(row.reason, exclusion.reasonCodes);
    assert.equal(row.status, status);
    assert.equal(row.quality.reason, assessmentReason);
  }
  for (const exclusion of arm.selection.editorialSlate.excluded) {
    const row = arm.rows.find(r => r.candidateId === exclusion.candidateId);
    assert.equal(row.placement, 'excluded');
    assert.deepEqual(row.reason, exclusion.reasonCodes);
  }
  const noncandidates = arm.rows.filter(r => !arm.selection.editorialSlate.excluded.some(e => e.candidateId === r.candidateId)
    && !arm.native.evaluatedEvidence.some(e => e.candidateId === r.candidateId)
    && ![...arm.native.topReads, ...arm.native.additionalPosts].some(e => e.promotionCandidateId === r.candidateId));
  assert.ok(noncandidates.length > 0);
  assert.ok(noncandidates.every(r => r.placement === 'noncandidate' && r.reason === r.quality.reason));

  // A controlled reporting-only slate mutation is not a second historical selector outcome.
  const changedSelection = structuredClone(arm.selection);
  const changed = changedSelection.editorialSlate.excluded.find(e => e.candidateId === 'abstain');
  changed.reasonCodes = ['quality_floor_not_met'];
  assert.notDeepEqual(changed.reasonCodes, arm.rows.find(r => r.candidateId === 'abstain').reason);
  const decision = exclusionDecisions(FINAL, changedSelection, arm.native);
  const after = { ...arm, rows: arm.rows.map(row => row.candidateId === 'abstain'
    ? { ...row, ...decision(row.candidateId, row.quality.reason) } : row) };
  assert.deepEqual(compare(arm, after).changedDecisions, ['abstain']);
  assert.deepEqual(compare(arm, after).rankChanges, []);
});

test('OLD ignores FINAL slate reasons and retains native decisions and genuine noncandidates', async () => {
  const arm = await fullSelector({ revision: OLD, tape: syntheticTape(), modelControls });
  assert.equal(arm.selectorReturned, true);
  const decide = exclusionDecisions(OLD, { editorialSlate: { excluded: [
    { candidateId: 'absent', reasonCodes: ['quality_floor_not_met'] },
  ] } }, arm.native);
  assert.deepEqual(decide('absent', 'legacy_quality'), { placement: 'noncandidate', reason: 'legacy_quality' });
  for (const row of arm.rows) {
    assert.equal(row.status, 'deterministic_legacy');
    if (['top', 'additional'].includes(row.placement)) continue;
    const evaluated = arm.native.evaluatedEvidence.find(e => e.candidateId === row.candidateId);
    assert.equal(row.placement, evaluated ? 'excluded' : 'noncandidate');
    assert.deepEqual(row.reason, evaluated?.decision ?? row.quality.reason);
  }
});
