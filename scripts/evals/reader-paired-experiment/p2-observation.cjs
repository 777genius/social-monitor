'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { capture, clone, same } = require('./recorded-selector-ports.cjs');
const { check, digest } = require('./revision-source.cjs');
const { validateRaw, freeze } = require('./capture-core-observation.cjs');
const origins = new WeakMap();
const originFor = value => origins.get(value);
function p2Observation(ref, expectedReceiptSha256s = []) {
  const tape = capture(ref), { seal, files } = tape;
  check(seal.complete === true && Array.isArray(seal.failures) && seal.failures.length === 0, 'p2_capture_incomplete');
  const names = new Set(seal.files.map(f => f.name));
  for (const name of fs.readdirSync(path.dirname(ref.path))) {
    if (/\.(json|jsonl)$/.test(name) && name !== path.basename(ref.path)) check(names.has(name), 'p2_unsealed_capture_file');
  }
  for (const name of ['rank-command.json', 'canonical-bindings.json', 'promotion.json', 'preparation.json', 'selection.json', 'candidate-status.json'])
    check(files[name] !== undefined, `p2_missing_original_callback:${name}`);
  check(same(files['started.json'].scope, seal.scope), 'p2_started_scope_mismatch');
  const query = files['snapshot-query.json'].query, input = files['inputs.json'];
  check(query.observedThrough === seal.scope.observedThrough && query.tenantId === seal.scope.tenantId &&
    query.workspaceId === seal.scope.workspaceId && same(input.query, query) &&
    same(input.queryKeys, files['snapshot-query.json'].presentKeys), 'p2_input_query_mismatch');
  const scope = { tenantId: query.tenantId, workspaceId: query.workspaceId }, day = query.windowStartedAt.slice(0, 10);
  validateRaw({ day, query, snapshot: input.snapshot, endedAt: query.observedThrough }, scope);
  const primary = input.snapshot.candidates.map(c => c.item.id), supplemental = (input.snapshot.supplementalItems || []).map(i => i.id);
  check(same(primary, input.primaryIds) && same(supplemental, input.supplementalIds) &&
    same(files['candidate-status.json'].map(r => r.feedItemId), [...primary, ...supplemental]), 'p2_ordered_inventory_mismatch');
  const counts = seal.observationCounts;
  check(counts && ['snapshots', 'promotion', 'preparation', 'selections'].every(k => counts[k] === 1), 'p2_callback_counts_incomplete');
  const interestIds = new Set();
  for (const { event } of files['interests.jsonl'] || []) {
    check(event.query?.tenantId === scope.tenantId && event.query?.workspaceId === scope.workspaceId &&
      typeof event.query.interestId === 'string' && !interestIds.has(event.query.interestId), 'p2_interest_scope_or_duplicate');
    interestIds.add(event.query.interestId);
    if (event.result?.kind === 'available') check(['tenantId', 'workspaceId', 'interestId'].every(key =>
      event.result.interest[key] === event.query[key]) && event.result.interest.query?.trim(), 'p2_interest_result_mismatch');
  }
  const events = (files['models.jsonl'] || []).map(r => r.event);
  const starts = events.filter(e => e.kind === 'invocation_started');
  check(new Set(starts.map(e => e.command.requestId)).size === starts.length && counts.modelRequests === starts.length, 'p2_model_inventory_mismatch');
  check(events.every(event => starts.some(start => start.command.requestId ===
    (event.command?.requestId ?? event.requestId))), 'p2_orphan_model_callback');
  for (const start of starts) {
    const ends = events.filter(e => ['envelope_verified', 'envelope_not_consumed', 'invocation_failed'].includes(e.kind) &&
      (e.command?.requestId ?? e.requestId) === start.command.requestId);
    check(ends.length === 1, 'p2_model_unfinished_or_duplicate');
    if (ends[0].command) check(same(ends[0].command, start.command), 'p2_terminal_command_mismatch');
  }
  for (const [file, id, phase] of [['relations.jsonl', 'id', 'terminal'], ['assessments.jsonl', 'batch', 'completed']]) {
    const rows = (files[file] || []).map(r => r.event), attempts = rows.filter(e => e.phase === 'attempt');
    check(rows.every(row => attempts.some(attempt => attempt[id] === row[id])), 'p2_orphan_lane_callback');
    if (file === 'relations.jsonl') check(counts.relationAttempts === attempts.length, 'p2_relation_inventory_mismatch');
    check(new Set(attempts.map(e => e[id])).size === attempts.length, 'p2_duplicate_lane_attempt');
    for (const attempt of attempts) {
      const ends = rows.filter(e => e.phase !== 'attempt' && e[id] === attempt[id]);
      check(ends.length === 1 && (file === 'assessments.jsonl' || ends[0].phase === phase), 'p2_lane_unfinished_or_duplicate');
    }
  }
  let origin, originGap;
  try { origin = require('./capture-owner-receipt.cjs').p2OwnerReceipt(tape, ref.ownerReceipt, expectedReceiptSha256s); }
  catch (error) { originGap = error.message; }
  const observation = freeze({ format: 'paired-immutable-observation.v1', kind: 'P2', day, scope,
    observationRef: clone(ref), observationQuery: clone(query), observationPresentKeys: clone(input.queryKeys),
    // P2 does not provide snapshot read intervals. Retain that gap explicitly.
    startedAt: null, endedAt: null, captureStartedAtMs: files['started.json'].atMs,
    snapshot: clone(input.snapshot), interests: clone((files['interests.jsonl'] || []).map(r => r.event)),
    originalControls: { selection: clone(files['selection-query.json']), controls: clone(files['controls.json']) },
    provenance: { integrityVerified: true, independentOriginVerified: Boolean(origin), origin: origin ?? null, originGap: originGap ?? null, seal: clone(seal), hashes: clone(tape.hashes),
      modelInvocationHistory: 'original_P2_journal', historicalReadInterval: 'not_recorded' },
    observationSha256: digest({ query, snapshot: input.snapshot, sealSha256: tape.sealSha256 }) });
  freeze(tape);
  if (origin) { origins.set(tape, origin); origins.set(observation, origin); }
  return { tape, observation };
}
module.exports = { p2Observation, originFor };
