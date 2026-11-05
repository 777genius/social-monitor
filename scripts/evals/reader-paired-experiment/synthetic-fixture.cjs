'use strict';
// Synthetic fixtures only; no production provenance.
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {FINAL,digest,sha}=require('./revision-source.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paired-synthetic-'));

const day = '2026-09-02', clock = '2026-09-09T03:34:50.293Z';
const c = { tenantId: 'synthetic-tenant', workspaceId: 'synthetic-workspace', scope: { kind: 'workspace' },
  config: { synthetic: true }, limits: { top: 8, additional: 8 }, locale: 'en', shadow: 'disabled', relatedTopic: 'disabled',
  periodStartedAt: `${day}T00:00:00.000Z`, periodEndedAt: '2026-09-03T00:00:00.000Z', ingestionCutoff: clock, clock };
c.query = { tenantId: c.tenantId, workspaceId: c.workspaceId, timestampPolicy: 'published_at', windowStartedAt: c.periodStartedAt, windowEndedAt: c.periodEndedAt, observedThrough: clock };
const p = { id: 'synthetic-hn', tenantId: c.tenantId, workspaceId: c.workspaceId, sourceItemId: 'synthetic-source',
  sourceBindingId: 'synthetic-binding', interestId: 'synthetic-interest', providerKey: 'hacker-news', canonicalUrl: 'https://example.invalid/synthetic',
  title: 'Synthetic database release adds indexed search', bodyPreview: 'Synthetic fixture text only.', publishedAt: `${day}T10:00:00.000Z`, observedAt: `${day}T12:00:00.000Z`,
  providerMetadata: { untouchedTimestamp: '2026-09-02T12:00:00.000Z' } };
const candidate = { item: { props: p }, canonical: { eligible: true, providerFamily: 'hacker_news', metricsState: 'observed', metrics: { points: 500 } },
  exactTimestamps: { publishedAt: `${day}T10:00:00.000000Z`, observedAt: `${day}T12:00:00.000000Z` }, metricAuthority: { observedAt: p.observedAt, regressionState: 'stable' } };
const raw = { format: 'read-only-full-promotion-snapshot.v1', capturedAt: clock, observedThrough: clock,
  snapshot: { ok: true, exhausted: true, physicalRowsRead: 1, candidates: [candidate], supplementalItems: [], sourceContent: [{ feedItemId: p.id, sourceItemId: p.sourceItemId, body: p.bodyPreview }] } };
const e = { ...p, feedItemId: p.id, score: 80, whyImportant: ['Synthetic only'], contentQuality: {
  qualityScore: 0.9, interestRelevanceScore: 0.9, engagementIntegrityScore: 0.9, eligibleForSummary: true, eligibleForTopRead: true,
  needsLlmReview: false, decision: 'promote', flags: [], reason: 'Synthetic adapter fixture' }, promotionFacts: {
    contentKind: 'story', canonicalIdentity: p.canonicalUrl, safetyValid: true, freshnessValid: true, metricsState: 'observed',
    metrics: { provider: 'hacker_news', points: 500 }, engagementAuthority: candidate.metricAuthority,
    freshnessProvenance: { status: 'observed', publishedAt: p.publishedAt, observedAt: p.observedAt, ingestionCutoff: clock } } };
const selection = { rankingPolicyVersion: 'synthetic-preselection', sourceWindow: { windowId: 'synthetic-window',
  startedAt: c.periodStartedAt, endedAt: c.periodEndedAt, periodStartedAt: c.periodStartedAt, periodEndedAt: c.periodEndedAt,
  ingestionCutoff: clock, selectedFeedItemIds: [p.id], storyClusterIds: [] }, clusters: [], selectedEvidence: [e], approvedSameStoryRelations: [], relatedTopicRelations: [] };
const write = (name, value) => { const bytes = JSON.stringify(value), filename = path.join(dir, name); fs.writeFileSync(filename, bytes); return { path: filename, sha256: sha(bytes) }; };
const rawRef = write('raw.json', raw);
const receipt = request => ({ producer: 'synthetic-fixture-only', kind: 'deterministic', sourceRevision: FINAL,
  request, requestSha256: digest(request), snapshotSha256: rawRef.sha256, controlsSha256: digest(c) });
const b = { format: 'paired-policy-projection.v1', snapshotSha256: rawRef.sha256, controlsSha256: digest(c),
  selection, candidates: [e], supplemental: [], records: [{ ...receipt({ candidateId: p.id, providerKey: p.providerKey,
    promotion: { tenantId: p.tenantId, workspaceId: p.workspaceId, sourceItemId: p.sourceItemId, sourceBindingId: p.sourceBindingId, interestId: p.interestId } }),
    feedItemId: p.id, rawCandidateSha256: digest(candidate), sourceContentSha256: digest(raw.snapshot.sourceContent[0]), evidenceSha256: digest(e) }],
  grouping: write('grouping.json', { ...receipt({ synthetic: true }), inputIds: [p.id], unclusteredIds: [p.id],
    resultSha256: digest({ clusters: [], approvedSameStoryRelations: [], relatedTopicRelations: [] }) }) };

module.exports={dir,day,clock,c,p,candidate,raw,e,selection,write,rawRef,receipt,b};
