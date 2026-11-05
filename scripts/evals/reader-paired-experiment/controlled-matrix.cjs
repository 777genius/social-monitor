'use strict';
const { OLD, FINAL, digest, check } = require('./revision-source.cjs');
const { DAYS, date } = require('./frozen-input.cjs');
const { captureCore } = require('./capture-core-observation.cjs');
const { p2Observation } = require('./p2-observation.cjs');
const { evaluationView } = require('./controlled-evaluation-view.cjs');
const { fullSelector } = require('./revision-full-selector.cjs');
const { compare } = require('./revision-selection.cjs');
const { same } = require('./recorded-selector-ports.cjs');
const ARM_PLAN = [['oldAfter', OLD, 'after'], ['finalAfter', FINAL, 'after'], ['finalBefore', FINAL, 'before']];
function inputDifference(before, after) {
  const rows = observation => [
    ...observation.snapshot.candidates.map((row, index) => ({ id: row.item.id, partition: 'primary', index, row })),
    ...(observation.snapshot.supplementalItems || []).map((row, index) => ({ id: row.id, partition: 'supplemental', index, row })),
  ];
  const left = new Map(rows(before).map(r => [r.id, r])), right = new Map(rows(after).map(r => [r.id, r]));
  const source = observation => new Map(observation.snapshot.sourceContent.map(s => [s.feedItemId, s]));
  const leftSource = source(before), rightSource = source(after);
  return { estimand: 'all_observed_input_changes', metricsOnlyVerified: false,
    beforeObservationSha256: before.observationSha256, afterObservationSha256: after.observationSha256,
    rows: [...new Set([...left.keys(), ...right.keys()])].map(id => ({ candidateId: id,
      before: left.get(id) ?? null, after: right.get(id) ?? null,
      beforeSourceContent: leftSource.get(id) ?? null, afterSourceContent: rightSource.get(id) ?? null,
      changed: !same(left.get(id), right.get(id)) || !same(leftSource.get(id), rightSource.get(id)) })) };
}
async function executeControlled(manifest, repo, expectedReceiptSha256s = []) {
  check(manifest.format === 'paired-controlled-experiment.v1' && manifest.mode === 'CONTROLLED', 'explicit_controlled_manifest_required');
  check(same(manifest.pins, { old: OLD, final: FINAL }), 'exact_algorithm_pins_required');
  check(same(manifest.days.map(d => d.day), DAYS), 'exact_ordered_seven_UTC_days_required');
  check(manifest.schedule === 'successful_immediate_lexicographic_record.v1', 'explicit_frozen_schedule_required');
  const result = { format: 'paired-controlled-results.v1', mode: 'CONTROLLED', complete: false,
    controlledExperimentComplete: false, historicalTimingVerified: false, historicalReplayComplete: false,
    publicationComplete: false, artifactId: null, algorithm: [], data: [], days: [], gaps: [],
    estimands: ['algorithm_change_on_identical_AFTER', 'all_observed_BEFORE_AFTER_input_changes_under_FINAL'],
    excludedFromEstimand: ['transport_latency', 'model_latency', 'deadline_frequency', 'historical_ordering'],
    manifestSha256: digest(manifest), schedule: manifest.schedule, expectedReceiptSha256s: [...expectedReceiptSha256s] };
  let beforeDays = [];
  try { beforeDays = captureCore(manifest.before, expectedReceiptSha256s); }
  catch (error) { result.gaps.push({ kind: 'before_capture_invalid', code: error.message }); }
  for (const day of manifest.days) {
    const observations = { before: beforeDays.find(o => o.day === day.day) }, views = {}, arms = {}, pool = [];
    try {
      const after = p2Observation(day.after, expectedReceiptSha256s);
      check(after.observation.day === day.day, 'after_observation_day_mismatch');
      observations.after = after.observation; pool.push(after.tape);
      if (!after.observation.provenance.independentOriginVerified) result.gaps.push({ day: day.day, kind: 'after_origin_unverified', code: after.observation.provenance.originGap });
    } catch (error) { result.gaps.push({ day: day.day, kind: 'after_capture_invalid', code: error.message }); }
    for (const [index, ref] of (day.responsePool || []).entries()) {
      try {
        const response = p2Observation(ref, expectedReceiptSha256s); pool.push(response.tape);
        if (!response.observation.provenance.independentOriginVerified) result.gaps.push({ day: day.day, responsePoolIndex: index, kind: 'response_origin_unverified', code: response.observation.provenance.originGap });
      }
      catch (error) { result.gaps.push({ day: day.day, responsePoolIndex: index, kind: 'response_capture_invalid', code: error.message }); }
    }
    try {
      check(observations.after && day.evaluationControls.clock === observations.after.observationQuery.observedThrough, 'evaluation_clock_must_derive_from_AFTER');
      if (observations.before) check(date(day.evaluationControls.clock) > date(observations.before.observationQuery.observedThrough), 'AFTER_must_follow_BEFORE');
      for (const population of ['before', 'after']) if (observations[population])
        views[population] = evaluationView(observations[population], day.evaluationControls, day.interventions?.[population]);
    } catch (error) { result.gaps.push({ day: day.day, kind: 'evaluation_controls_invalid', code: error.message }); }
    for (const [arm, revision, population] of ARM_PLAN) {
      arms[arm] = null;
      if (!views[population]) { result.gaps.push({ day: day.day, arm, kind: 'missing_valid_evaluation_view' }); continue; }
      try {
        arms[arm] = await fullSelector({ repo, revision, mode: 'CONTROLLED', evaluation: views[population],
          responseTapes: pool, modelControls: day.evaluationControls.model });
        result.gaps.push(...arms[arm].gaps.map(g => ({ day: day.day, arm, ...g })));
      } catch (error) { result.gaps.push({ day: day.day, arm, kind: 'controlled_arm_failed', code: error.message }); }
    }
    for (const [experiment, leftKey, rightKey] of [['algorithm', 'oldAfter', 'finalAfter'], ['data', 'finalBefore', 'finalAfter']]) {
      const left = arms[leftKey], right = arms[rightKey];
      const matched = left && right && left.evaluationControlsSha256 === right.evaluationControlsSha256;
      const complete = Boolean(matched && left.controlledExperimentComplete && right.controlledExperimentComplete);
      let changes = null;
      if (matched && left.rows && right.rows) {
        const { missingAssessmentCount, ...difference } = compare(left, right);
        changes = { ...difference, unresolvedCandidateCount: missingAssessmentCount,
          replayMissingRequestCount: new Set([...left.gaps, ...right.gaps].filter(g => g.kind.startsWith('missing_')).map(g => g.kind + ':' + g.requestSha256)).size };
      }
      result[experiment].push({ day: day.day, beforeArm: leftKey, afterArm: rightKey, controlledExperimentComplete: complete,
        matchedExogenousControls: Boolean(matched), changes,
        beforeSha256: left ? digest(left) : null, afterSha256: right ? digest(right) : null });
    }
    result.days.push({ day: day.day, arms, inputDifference: observations.before && observations.after
      ? inputDifference(observations.before, observations.after) : null });
  }
  result.executedArmCount = result.days.flatMap(d => Object.values(d.arms)).filter(Boolean).length;
  result.comparisonCount = result.algorithm.length + result.data.length;
  result.controlledExperimentComplete = result.executedArmCount === 21 && result.comparisonCount === 14 &&
    result.gaps.length === 0 && [...result.algorithm, ...result.data].every(c => c.controlledExperimentComplete);
  return result;
}
module.exports = { executeControlled, inputDifference, ARM_PLAN };
