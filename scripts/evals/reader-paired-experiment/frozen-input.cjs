'use strict';
const fs = require('node:fs');
const { check, sha, digest, OLD, FINAL, revisionSource } = require('./revision-source.cjs');
const DAYS = ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'];
const hash = value => check(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'missing/invalid SHA256');
function read(ref) {
  check(ref && typeof ref.path === 'string', 'missing artifact'); hash(ref.sha256);
  check(fs.statSync(ref.path).size <= 64 * 1024 * 1024, 'artifact exceeds 64 MiB');
  const bytes = fs.readFileSync(ref.path);
  check(sha(bytes) === ref.sha256, 'artifact SHA256 mismatch'); try { return JSON.parse(bytes); } catch { throw new Error('invalid JSON artifact'); }
}
function date(value) {
  check(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,6}Z$/.test(value), 'non-UTC typed date');
  const result = new Date(value); check(Number.isFinite(result.getTime()) && result.toISOString().slice(0, 19) === value.slice(0, 19), 'invalid typed date');
  return result;
}
function dates(value, keys) { const copy = { ...value };
  for (const key of keys) if (copy[key] !== undefined) copy[key] = date(copy[key]); return copy; }
function unique(items, key) {
  const result = new Map(items.map(item => [item[key], item]));
  check(result.size === items.length && [...result.keys()].every(id => typeof id === 'string' && id.length > 0), `duplicate/invalid ${key}`); return result;
}
function controls(day, c) {
  check(DAYS.includes(day) && c && c.tenantId && c.workspaceId && c.scope && c.config && c.limits && c.locale, 'missing frozen controls');
  check(c.periodStartedAt === `${day}T00:00:00.000Z` &&
    date(c.periodEndedAt).getTime() === date(c.periodStartedAt).getTime() + 86400000, 'not one fixed UTC day');
  date(c.clock); check(c.ingestionCutoff === c.clock, 'clock/cutoff mismatch');
  if (day === '2026-09-02') check(c.clock === '2026-09-09T03:34:50.293Z', 'Sep2 common cutoff mismatch');
  const q = c.query; check(q && q.tenantId === c.tenantId && q.workspaceId === c.workspaceId &&
    q.windowStartedAt === c.periodStartedAt && q.windowEndedAt === c.periodEndedAt &&
    q.observedThrough === c.clock && q.timestampPolicy === 'published_at', 'query/control mismatch');
  check(c.shadow === 'disabled' && c.relatedTopic === 'disabled', 'unrecorded optional lanes');
}
function snapshot(raw, day, c, FeedItem) {
  check(raw.format === 'read-only-full-promotion-snapshot.v1' && raw.snapshot?.ok === true && raw.snapshot.exhausted === true, 'incomplete snapshot');
  check(date(raw.observedThrough) <= date(c.clock), 'capture exceeds evaluation cutoff'); date(raw.capturedAt);
  const s = raw.snapshot; check(s.candidates.length <= 10000 && (s.supplementalItems || []).length <= 10000, 'candidate bound exceeded');
  check(Number.isSafeInteger(s.physicalRowsRead) && s.physicalRowsRead >= s.candidates.length, 'invalid physical rows');
  const all = [...s.candidates.map(x => x.item.props), ...(s.supplementalItems || []).map(x => x.props)];
  unique(all, 'id'); const content = unique(s.sourceContent, 'feedItemId');
  check(content.size === all.length, 'source-content coverage mismatch');
  for (const p of all) {
    date(p.publishedAt); date(p.observedAt);
    check(p.tenantId === c.tenantId && p.workspaceId === c.workspaceId &&
      (!c.query.interestId || p.interestId === c.query.interestId), 'scope mismatch');
    check(content.get(p.id)?.sourceItemId === p.sourceItemId && typeof content.get(p.id)?.body === 'string', 'source-content join mismatch');
  }
  const item = p => FeedItem.rehydrate(dates(p, ['publishedAt', 'observedAt']));
  const candidates = s.candidates.map(candidate => {
    check(candidate.item.props.publishedAt.slice(0, 10) === day, 'primary outside UTC day');
    const exact = candidate.exactTimestamps;
    if (exact) for (const key of ['publishedAt', 'observedAt']) check(date(exact[key]).getTime() === date(candidate.item.props[key]).getTime(), 'exact timestamp mismatch');
    if (candidate.metricAuthority) check(['stable', 'confirmed_correction', 'unresolved_regression'].includes(candidate.metricAuthority.regressionState), 'invalid metric authority');
    const canonical = { ...candidate.canonical }; check(canonical.eligible === true, 'invalid canonical candidate');
    // Feed canonical GitHub checkedAt is a string at both revisions; keep it a string.
    return { ...candidate, item: item(candidate.item.props), canonical,
      ...(candidate.metricAuthority ? { metricAuthority: dates(candidate.metricAuthority, ['observedAt']) } : {}) };
  });
  return { ...s, candidates, supplementalItems: (s.supplementalItems || []).map(x => item(x.props)) };
}
function evidence(item) {
  const result = dates(item, ['publishedAt', 'observedAt']);
  check(Number.isFinite(item.score) && Array.isArray(item.whyImportant), 'invalid evidence score/reasons');
  if (item.promotionFacts) {
    const f = dates(item.promotionFacts, ['checkedAt']);
    if (f.engagementAuthority) f.engagementAuthority = dates(f.engagementAuthority, ['observedAt']);
    if (f.freshnessProvenance?.status === 'observed') f.freshnessProvenance = dates(f.freshnessProvenance, ['publishedAt', 'observedAt', 'ingestionCutoff']);
    if (f.metrics?.provider === 'github_radar') f.metrics = dates(f.metrics, ['windowStartedAt', 'windowEndedAt']);
    result.promotionFacts = f;
  }
  const q = item.contentQuality; check(q && ['qualityScore', 'interestRelevanceScore', 'engagementIntegrityScore'].every(k => Number.isFinite(q[k]) && q[k] >= 0 && q[k] <= 1) &&
    ['eligibleForSummary', 'eligibleForTopRead', 'needsLlmReview'].every(k => typeof q[k] === 'boolean') && Array.isArray(q.flags), 'missing recorded quality');
  check(q.needsLlmReview === false && !/^promotion_assessment_(pending|not_requested):/.test(q.reason ?? ''), 'unresolved assessment');
  return result;
}
function boundRecord(record, expected) {
  check(record && typeof record.producer === 'string' && record.producer.trim() && record.request && typeof record.request === 'object', 'missing producer request receipt');
  hash(record.requestSha256); check(digest(record.request) === record.requestSha256, 'request SHA256 mismatch');
  for (const [key, value] of Object.entries(expected)) check(record[key] === value, `record binding mismatch: ${key}`);
  check(['model', 'deterministic'].includes(record.kind), 'unknown assessment origin');
  if (record.kind === 'model') for (const key of ['model', 'prompt', 'schema']) read(record[key]);
  else check([OLD, FINAL].includes(record.sourceRevision), 'deterministic provenance missing');
}
function bundle(ref, rawRef, raw, c, repo = process.cwd()) {
  const b = read(ref); check(b.format === 'paired-policy-projection.v1', 'unsupported projection');
  check(b.snapshotSha256 === rawRef.sha256 && b.controlsSha256 === digest(c), 'projection/input binding mismatch');
  check(Array.isArray(b.selection.clusters) && Array.isArray(b.selection.approvedSameStoryRelations), 'missing explicit grouping controls');
  check(!b.selection.editorialSlate && !b.selection.promotionAttestations, 'already selected slate/attestations forbidden');
  const all = [...b.candidates, ...b.supplemental]; unique(all, 'feedItemId');
  const source = unique(raw.snapshot.sourceContent, 'feedItemId');
  const raws = [...raw.snapshot.candidates, ...(raw.snapshot.supplementalItems || [])];
  const rawIds = raws.map(x => (x.item || x).props.id);
  check(digest(b.candidates.map(x => x.feedItemId)) === digest(raw.snapshot.candidates.map(x => x.item.props.id)), 'primary coverage/order mismatch');
  check(digest(b.supplemental.map(x => x.feedItemId)) === digest((raw.snapshot.supplementalItems || []).map(x => x.props.id)), 'supplemental coverage/order mismatch');
  const unresolved = all.filter(x => !x.contentQuality || x.contentQuality.needsLlmReview !== false ||
    /^promotion_assessment_(pending|not_requested):/.test(x.contentQuality.reason ?? '')).map(x => x.feedItemId);
  if (unresolved.length) throw assessmentGap('unresolved_assessment', unresolved);
  const records = unique(b.records, 'feedItemId'); check(records.size === all.length, 'assessment coverage mismatch');
  all.forEach((item, i) => {
    const p = (raws[i].item || raws[i]).props;
    for (const k of ['sourceItemId', 'sourceBindingId', 'interestId', 'providerKey', 'canonicalUrl', 'publishedAt', 'observedAt']) check(item[k] === p[k], `evidence join mismatch: ${k}`);
    const r = records.get(item.feedItemId);
    boundRecord(r, { snapshotSha256: rawRef.sha256, controlsSha256: digest(c),
      rawCandidateSha256: digest(raws[i]), sourceContentSha256: digest(source.get(item.feedItemId)), evidenceSha256: digest(item) });
    check(r.request.candidateId === item.feedItemId && r.request.providerKey === item.providerKey, 'request candidate mismatch');
    for (const k of ['tenantId', 'workspaceId']) check(r.request.promotion?.[k] === c[k], 'request scope mismatch');
    for (const k of ['sourceItemId', 'sourceBindingId', 'interestId']) check(r.request.promotion?.[k] === p[k], 'request promotion binding mismatch');
    const h = item.readerHeadline;
    if (h?.status === 'accepted') {
      const source = revisionSource(repo, FINAL, c.clock);
      const validate = source.load('libs/summary/domain/services/reader-post-display-headline.ts').readerPostDisplayHeadline;
      if (source.invoke(validate, [item, c]).status !== 'accepted') throw assessmentGap('invalid_accepted_headline', [item.feedItemId]);
    }
    if (h?.status === 'accepted') for (const [k, v] of Object.entries({ candidateId: item.feedItemId, tenantId: c.tenantId, workspaceId: c.workspaceId, sourceItemId: p.sourceItemId })) check(h.binding[k] === v, 'headline scope mismatch');
  });
  check(digest(b.selection.selectedEvidence) === digest(b.candidates), 'preselection must contain all primary candidates');
  const grouping = read(b.grouping);
  boundRecord(grouping, { snapshotSha256: rawRef.sha256, controlsSha256: digest(c),
    resultSha256: digest({ clusters: b.selection.clusters, approvedSameStoryRelations: b.selection.approvedSameStoryRelations,
      relatedTopicRelations: b.selection.relatedTopicRelations }) });
  check(digest(grouping.inputIds) === digest(raw.snapshot.candidates.map(x => x.item.props.id)), 'grouping coverage mismatch');
  check(Array.isArray(grouping.unclusteredIds), 'missing explicit unclustered inventory');
  const members = [...grouping.unclusteredIds, ...b.selection.clusters.flatMap(x => [x.representativeFeedItemId, ...x.duplicateFeedItemIds])];
  check(new Set(members).size === members.length && digest([...members].sort()) === digest(b.candidates.map(x => x.feedItemId).sort()), 'cluster membership mismatch');
  for (const r of b.selection.approvedSameStoryRelations || []) check(members.includes(r.leftFeedItemId) && members.includes(r.rightFeedItemId) && Number.isFinite(r.confidence) && r.confidence >= 0 && r.confidence <= 1, 'invalid relation join');
  check(Array.isArray(b.selection.relatedTopicRelations) && b.selection.relatedTopicRelations.length === 0, 'related topic lane must be explicitly disabled');
  const w = b.selection.sourceWindow;
  unique(b.selection.clusters, 'id');
  check(digest(w.selectedFeedItemIds) === digest(b.candidates.map(x => x.feedItemId)) &&
    digest(w.storyClusterIds) === digest(b.selection.clusters.map(x => x.id)), 'source-window membership mismatch');
  for (const cluster of b.selection.clusters) check(Number.isFinite(cluster.score) &&
    date(cluster.observedAtRange.startedAt) <= date(cluster.observedAtRange.endedAt), 'invalid cluster score/range');
  for (const key of ['periodStartedAt', 'periodEndedAt', 'ingestionCutoff']) check(w[key] === c[key], 'source-window control mismatch');
  check(w.startedAt === c.periodStartedAt && w.endedAt === c.periodEndedAt, 'source-window period mismatch');
  const candidates = b.candidates.map(evidence), supplemental = b.supplemental.map(evidence);
  const hydratedSelection = { ...b.selection, selectedEvidence: candidates,
    sourceWindow: dates(w, ['startedAt', 'endedAt', 'periodStartedAt', 'periodEndedAt', 'ingestionCutoff']),
    clusters: b.selection.clusters.map(x => ({ ...x, observedAtRange: dates(x.observedAtRange, ['startedAt', 'endedAt']) })) };
  return { candidates, supplemental, selection: hydratedSelection,
    assessmentCoverage: { status: 'pending_producer_contract', pendingIds: rawIds, missingAssessmentCount: rawIds.length },
    normalizedSha256: digest({ candidates, supplemental, selection: hydratedSelection }),
    provenance: { projection: ref, grouping: b.grouping,
      records: b.records.map(r => ({ feedItemId: r.feedItemId, producer: r.producer, kind: r.kind, sourceRevision: r.sourceRevision ?? null,
        requestSha256: r.requestSha256, model: r.model ?? null, prompt: r.prompt ?? null, schema: r.schema ?? null })) } };
}
function assessmentGap(code, pendingIds) {
  return Object.assign(new Error(code), { code, pendingIds, missingAssessmentCount: pendingIds.length });
}
module.exports = { assessmentGap, DAYS, read, date, digest, sha, hash, check, unique, controls, snapshot, evidence, boundRecord, bundle };
