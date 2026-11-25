'use strict';
const { check, digest } = require('./revision-source.cjs');
const { date } = require('./frozen-input.cjs');
const { clone, canonical, same, withKeys } = require('./recorded-selector-ports.cjs');
const { freeze, validateRaw } = require('./capture-core-observation.cjs');
const controlsDigest = value => digest(canonical(value));
function queryRecord(record) {
  check(record && record.query && Array.isArray(record.presentKeys), 'explicit_query_and_present_keys_required');
  withKeys(record.query, record.presentKeys);
  return record;
}
function evaluationView(observation, controls, declaration) {
  check(observation.format === 'paired-immutable-observation.v1', 'immutable_observation_required');
  const query = queryRecord(controls.snapshot).query;
  const selection = queryRecord(controls.selection).query;
  const cutoff = controls.clock, original = observation.observationQuery;
  check(date(cutoff) >= date(original.observedThrough), 'evaluation_precedes_observation');
  check(query.observedThrough === cutoff && selection.observedThrough === cutoff, 'evaluation_clock_query_mismatch');
  for (const key of ['tenantId', 'workspaceId']) check(query[key] === observation.scope[key] &&
    selection[key] === observation.scope[key], 'evaluation_scope_mismatch');
  check(same({ ...query, observedThrough: original.observedThrough }, original), 'evaluation_population_query_changed');
  check(selection.period?.startedAt === query.windowStartedAt && selection.period.endedAt === query.windowEndedAt &&
    selection.period.cadence === 'daily' && selection.period.timezone === 'UTC', 'evaluation_period_mismatch');
  check(selection.scope && ['workspace', 'user'].includes(selection.scope.type) &&
    Number.isSafeInteger(selection.maxItems) && selection.maxItems > 0 &&
    typeof controls.locale === 'string' && controls.locale.trim(), 'explicit_selector_controls_required');
  check(controls.model?.assessment && controls.model.relation && Array.isArray(controls.interests), 'explicit_model_and_interest_controls_required');
  // The complete original context and complete common target are both bound.
  // Even an unchanged target requires the declaration, so no caller can
  // silently reinterpret missing capture-core selector options as observations.
  const originalControls = { observationQuery: original, observationPresentKeys: observation.observationPresentKeys,
    controls: observation.originalControls, interests: observation.interests };
  check(declaration?.kind === 'common_evaluation_controls' && declaration.observationSha256 === observation.observationSha256 &&
    declaration.originalControlsSha256 === controlsDigest(originalControls) &&
    declaration.evaluationControlsSha256 === controlsDigest(controls), 'undeclared_evaluation_intervention');
  const rows = validateRaw({ day: observation.day, snapshot: observation.snapshot, query: original,
    endedAt: observation.endedAt }, observation.scope);
  const needed = new Set(rows.map(row => row.interestId)), seen = new Set();
  for (const interest of controls.interests) {
    check(interest.query && same(Object.keys(interest.query).sort(), ['interestId', 'tenantId', 'workspaceId']) &&
      ['tenantId', 'workspaceId'].every(k => interest.query[k] === observation.scope[k]) &&
      typeof interest.query.interestId === 'string' && interest.query.interestId.trim() && !seen.has(interest.query.interestId), 'evaluation_interest_inventory_mismatch');
    check(interest.result?.kind === 'available' && ['tenantId', 'workspaceId', 'interestId'].every(k =>
      interest.result.interest[k] === interest.query[k]) && typeof interest.result.interest.query === 'string' &&
      interest.result.interest.query.trim(), 'evaluation_interest_unavailable');
    seen.add(interest.query.interestId);
  }
  check([...needed].every(id => seen.has(id)), 'evaluation_interest_inventory_incomplete');
  return freeze({ format: 'paired-controlled-evaluation-view.v1', observation, controls: clone(controls),
    declaration: clone(declaration), controlsSha256: controlsDigest(controls),
    originalControlsSha256: controlsDigest(originalControls), evaluationClock: cutoff });
}
module.exports = { evaluationView, controlsDigest, queryRecord };
