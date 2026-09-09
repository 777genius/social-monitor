'use strict';
const { OLD, FINAL, digest, check } = require('./revision-source.cjs');
const { DAYS } = require('./frozen-input.cjs');
const { capture, same } = require('./recorded-selector-ports.cjs');
const { fullSelector } = require('./revision-full-selector.cjs');
const { compare } = require('./revision-selection.cjs');
async function executeFull(manifest, repo) {
  check(manifest.format === 'paired-full-selector-matrix.v1' && digest(manifest.days.map(d => d.day)) === digest(DAYS), 'exact_ordered_seven_UTC_days_required');
  const result = { format: 'paired-full-selector-results.v1', complete: false,
    evidenceStatus: 'uncertified_offline_full_selector_slice', algorithm: [], data: [], days: [], gaps: [],
    requiredRemaining: ['historical_event_timing_replay', 'producer_origin_and_capture_controls_authority',
      'complete_original_populations_and_request_union', 'real_population_preparation_audits_and_remaining_stress_coverage'] };
  for (const day of manifest.days) {
    const arms = {}, tapes = {};
    for (const population of ['current', 'original']) {
      try {
        check(day[population]?.capture, `missing_${population}_capture`);
        tapes[population] = capture(day[population].capture);
        check(tapes[population].files['snapshot-query.json'].query.windowStartedAt.slice(0, 10) === day.day, 'capture_day_mismatch');
      } catch (error) { result.gaps.push({ day: day.day, population, kind: error.message, unresolvedCandidateCount: null }); delete tapes[population]; }
    }
    const pool = [];
    for (const [responsePoolIndex, ref] of (day.responsePool || []).entries()) {
      try { pool.push(capture(ref)); }
      catch (error) { result.gaps.push({ day: day.day, responsePoolIndex, kind: error.message }); }
    }
    const available = [...Object.values(tapes), ...pool];
    for (const [arm, revision, population] of [['oldCurrent', OLD, 'current'], ['finalCurrent', FINAL, 'current'], ['finalOriginal', FINAL, 'original']]) {
      if (!tapes[population]) { arms[arm] = null; continue; }
      try {
        arms[arm] = await fullSelector({ repo, revision, tape: tapes[population], responseTapes: available, modelControls: day.modelControls });
        for (const gap of arms[arm].gaps) result.gaps.push({ day: day.day, arm, ...gap });
      } catch (error) { arms[arm] = null; result.gaps.push({ day: day.day, arm, kind: error.message, unresolvedCandidateCount: null }); }
    }
    for (const [experiment, before, after] of [['algorithm', 'oldCurrent', 'finalCurrent'], ['data', 'finalOriginal', 'finalCurrent']]) {
      const left = arms[before], right = arms[after];
      const matchedControls = experiment === 'algorithm' || (tapes.original && tapes.current &&
        same(tapes.original.files['selection-query.json'], tapes.current.files['selection-query.json']) &&
        same(tapes.original.files['snapshot-query.json'], tapes.current.files['snapshot-query.json']) &&
        same(tapes.original.files['interests.jsonl']?.map(r => r.event), tapes.current.files['interests.jsonl']?.map(r => r.event)));
      if (left && right && !matchedControls) result.gaps.push({ day: day.day, kind: 'data_pair_exogenous_controls_mismatch' });
      let changes = null;
      if (left?.rows && right?.rows && matchedControls) {
        const { missingAssessmentCount, ...differences } = compare(left, right);
        changes = { ...differences, unresolvedCandidateCount: new Set([...left.assessmentCoverage.pendingIds, ...right.assessmentCoverage.pendingIds]).size,
          replayMissingRequestCount: new Set([...left.gaps, ...right.gaps].filter(g => g.kind.startsWith('missing_')).map(g => g.kind + ':' + g.requestSha256)).size };
      }
      result[experiment].push({ day: day.day, complete: false,
        status: changes ? 'partial_controlled_comparison' : matchedControls ? 'missing_arm' : 'controls_mismatch',
        beforeArm: before, afterArm: after, beforeSha256: left ? digest(left) : null, afterSha256: right ? digest(right) : null,
        changes });
    }
    result.days.push({ day: day.day, arms });
  }
  result.manifestSha256 = digest(manifest);
  return result;
}
module.exports = { executeFull };
