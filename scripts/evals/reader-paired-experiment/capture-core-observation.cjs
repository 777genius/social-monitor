'use strict';
const path = require('node:path');
const { read, date, DAYS, snapshot } = require('./frozen-input.cjs');
const { check, digest } = require('./revision-source.cjs');
const { clone, same } = require('./recorded-selector-ports.cjs');
const absentFilters = ['interestId', 'searchQuery', 'providerKey', 'repositoryTrendWindow', 'repositoryLanguage', 'repositoryTopic'];
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function interval(start, end, lower, upper) {
  check(date(start) >= date(lower) && date(end) >= date(start) && date(end) <= date(upper), 'capture_interval_invalid');
}
function validateRaw(record, scope) {
  const raw = record.snapshot;
  const rows = [...raw.candidates.map(c => c.item), ...(raw.supplementalItems || [])];
  check(Number.isSafeInteger(raw.physicalRowsRead) && raw.physicalRowsRead >= rows.length, 'physical_count_invalid');
  for (const row of rows) check(['interestId', 'sourceBindingId', 'providerKey'].every(k =>
    typeof row[k] === 'string' && row[k].trim()), 'inventory_identity_invalid');
  // Reuse the existing full snapshot invariants. The validation-only entity
  // retains plain properties; the revision ports hydrate real FeedItem objects.
  snapshot({ format: 'read-only-full-promotion-snapshot.v1', capturedAt: record.endedAt ?? record.query.observedThrough,
    observedThrough: record.query.observedThrough, snapshot: { ...raw,
      candidates: raw.candidates.map(c => ({ ...c, item: { props: c.item } })),
      supplementalItems: (raw.supplementalItems || []).map(props => ({ props })) } }, record.day,
  { ...scope, clock: record.query.observedThrough, query: record.query }, { rehydrate: props => props });
  return rows;
}
// Reads original capture-core bytes directly. No P2 seal, callback, model log,
// journal sequence or synthetic zero-call claim is created by this adapter.
const ownerObservations = new WeakSet();
const coreOriginVerified = observation => ownerObservations.has(observation);
function captureCore({ preflight: preflightRef, receipt: receiptRef, hostReceipt: hostRef, directory }, expectedReceiptSha256s = []) {
  const preflight = read(preflightRef), receipt = read(receiptRef), host = read(hostRef);
  check(preflight.format === 'current-freshness-preflight.v1' && preflight.status === 'complete', 'preflight_incomplete');
  check(receipt.format === 'current-freshness-capture.v1' && receipt.status === 'capture_only_diagnostics_remaining', 'capture_receipt_invalid');
  check(host.format === 'current-freshness-host-receipt.v1' && host.status === 'capture_container_completed' &&
    host.container?.State?.Status === 'exited' && host.container.State.ExitCode === 0, 'host_receipt_incomplete');
  check(preflight.captureReceiptSha256 === receiptRef.sha256 && preflight.hostReceiptSha256 === hostRef.sha256 &&
    host.captureReceiptSha256 === receiptRef.sha256, 'capture_receipt_join_mismatch');
  check(same(preflight.identity, receipt.identity) && same(host.identity, receipt.identity) &&
    host.container.Image === receipt.identity.imageId, 'capture_identity_mismatch');
  check(/^[a-f0-9]{40}$/.test(receipt.identity.commit) && /^[a-f0-9]{64}$/.test(receipt.identity.sourceSha256) &&
    /^sha256:[a-f0-9]{64}$/.test(receipt.identity.imageId), 'capture_identity_invalid');
  check(receipt.cutoff === '2026-09-09T11:47:10.523Z' && preflight.cutoff === receipt.cutoff &&
    host.capturedThrough === receipt.cutoff, 'capture_cutoff_mismatch');
  check(same(preflight.snapshots, receipt.days) && same(preflight.controls, receipt.controls), 'capture_inventory_receipt_mismatch');
  check(same(receipt.days.map(d => d.file), DAYS.map(day => `${day}.json`)) && receipt.controls.file === 'controls.json', 'exact_ordered_seven_UTC_days_required');
  const load = ref => read({ path: path.join(directory, ref.file), sha256: ref.sha256 });
  const controls = load(receipt.controls), records = receipt.days.map(load), scope = controls.scope;
  check(same(scope, preflight.scope) && same(Object.keys(scope).sort(), ['tenantId', 'workspaceId']) &&
    Object.values(scope).every(v => typeof v === 'string' && v.trim()), 'capture_scope_mismatch');
  check(controls.cutoff === receipt.cutoff && date(receipt.endedAt) >= date(receipt.cutoff), 'control_cutoff_mismatch');
  check(same(records.map(r => r.day), DAYS) && same(controls.queries.map(q => q.day), DAYS), 'exact_ordered_seven_UTC_days_required');
  const needed = new Set();
  let previousEnd = receipt.cutoff;
  records.forEach((record, i) => {
    interval(record.startedAt, record.endedAt, previousEnd, receipt.endedAt);
    previousEnd = record.endedAt;
    const start = `${record.day}T00:00:00.000Z`, end = new Date(+date(start) + 86400000).toISOString();
    check(same(record.query, { ...scope, windowStartedAt: start, windowEndedAt: end,
      timestampPolicy: 'published_at', observedThrough: receipt.cutoff }), 'snapshot_control_query_mismatch');
    check(same(controls.queries[i], { day: record.day, timezone: 'UTC', cadence: 'daily',
      rankingQuery: { ...scope, rankingProfile: 'reader_post_promotion', limit: 200,
        publishedAtOrAfter: start, publishedBefore: end, observedAtOrBefore: receipt.cutoff }, absentFilters }), 'ranking_control_query_mismatch');
    validateRaw(record, scope).forEach(row => needed.add(row.interestId));
  });
  const seen = new Set();
  for (const control of controls.interests) {
    const query = control.scope, result = control.result;
    check(same(Object.keys(query).sort(), ['interestId', 'tenantId', 'workspaceId']) &&
      query.tenantId === scope.tenantId && query.workspaceId === scope.workspaceId &&
      needed.has(query.interestId) && !seen.has(query.interestId), 'interest_inventory_mismatch');
    check(result.kind === 'available' && ['tenantId', 'workspaceId', 'interestId'].every(k => result.interest[k] === query[k]) &&
      typeof result.interest.query === 'string' && result.interest.query.trim(), 'configured_interest_invalid');
    interval(control.readStartedAt, control.readEndedAt, receipt.cutoff, receipt.endedAt);
    seen.add(query.interestId);
  }
  check(seen.size === needed.size, 'interest_inventory_incomplete');
  let originGap;
  try { require('./capture-owner-receipt.cjs').anchored(hostRef, expectedReceiptSha256s); }
  catch (error) { originGap = error.message; }
  const observations = freeze(records.map((record, i) => ({
    format: 'paired-immutable-observation.v1', kind: 'capture-core', day: record.day, scope: clone(scope),
    observationRef: { path: path.join(directory, receipt.days[i].file), sha256: receipt.days[i].sha256 },
    observationQuery: clone(record.query), observationPresentKeys: Object.keys(record.query),
    startedAt: record.startedAt, endedAt: record.endedAt, snapshot: clone(record.snapshot),
    interests: clone(controls.interests), originalControls: clone(controls.queries[i]),
    controlsRef: { path: path.join(directory, receipt.controls.file), sha256: receipt.controls.sha256 },
    provenance: { preflight: preflightRef, receipt: receiptRef, hostReceipt: hostRef, identity: clone(receipt.identity),
      limitations: clone(receipt.limitations || []), integrityVerified: true, independentOriginVerified: !originGap, originGap: originGap ?? null,
      modelInvocationHistory: 'not_recorded' },
    observationSha256: digest(record),
  })));
  if (!originGap) observations.forEach(observation => ownerObservations.add(observation));
  return observations;
}
module.exports = { captureCore, validateRaw, freeze, absentFilters, coreOriginVerified };
