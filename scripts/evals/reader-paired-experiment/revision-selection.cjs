'use strict';
const { OLD, digest, check } = require('./revision-source.cjs');
function select(source, revision, b) {
  const call = (file, symbol, ...args) => source.invoke(source.load(`libs/summary/${file}.ts`)[symbol], args);
  const aligned = call('adapters/evidence/relevance-reader-summary-promotion-candidates', 'promotionPolicySelection', b.selection, b.candidates);
  const projection = selection => call('domain/services/reader-post-promotion-projection', 'buildReaderPostPromotionProjection', {
    evidence: selection.selectedEvidence, clusters: selection.clusters, sourceWindow: selection.sourceWindow,
    approvedSameStoryRelations: selection.approvedSameStoryRelations, relatedTopicRelations: selection.relatedTopicRelations,
    editorialSlate: selection.editorialSlate, citations: selection.selectedEvidence.map(i => ({
      citationId: `promotion-preflight:${i.feedItemId}`, feedItemId: i.feedItemId, sourceItemId: i.sourceItemId,
      providerKey: i.providerKey, field: 'canonicalUrl', canonicalUrl: i.canonicalUrl })) });
  let slate = null, materialized = aligned;
  if (revision !== OLD) {
    slate = call('adapters/evidence/reader-summary-editorial-slate', 'composeReaderSummaryEditorialSlate', { selection: aligned, candidates: b.candidates });
    materialized = call('adapters/evidence/reader-summary-editorial-slate', 'materializeReaderSummaryEditorialSlate', {
      selection: aligned, slate, supplementalEvidence: b.supplemental });
  }
  const p = projection(materialized);
  const admitted = call('domain/services/reader-post-promotion-evidence-admission', 'admitReaderPostPromotionEvidence',
    revision === OLD ? { ...aligned, selectedEvidence: [...aligned.selectedEvidence, ...b.supplemental] } : materialized);
  const placement = new Map();
  for (const [kind, entries] of [['top', p.topReads], ['additional', p.additionalPosts]]) entries.forEach((entry, i) => {
    placement.set(entry.promotionCandidateId, { placement: kind, slot: i + 1, reason: entry.reason,
      supportIds: entry.citationIds.filter(x => x !== `promotion-preflight:${entry.promotionCandidateId}`).map(x => x.replace(/^promotion-preflight:/, '')) });
  });
  const evaluations = new Map(p.evaluatedEvidence.map(x => [x.candidateId, x.decision]));
  const exclusions = new Map((slate?.excluded || []).map(x => [x.candidateId, x.reasonCodes]));
  const rows = b.candidates.map(item => {
    const selected = placement.get(item.feedItemId), excluded = exclusions.get(item.feedItemId);
    check(!slate?.orderedCandidateIds.includes(item.feedItemId) || selected, 'slate/projection placement mismatch');
    return { candidateId: item.feedItemId, sourceItemId: item.sourceItemId, provider: item.providerKey,
      artifactId: null, placement: selected?.placement || (slate && !excluded ? 'noncandidate' : 'excluded'),
      slot: selected?.slot ?? null, reason: selected?.reason ?? excluded ?? evaluations.get(item.feedItemId) ?? null,
      supportIds: selected?.supportIds ?? [], headlineStatus: admitted.selectedEvidence.find(x => x.feedItemId === item.feedItemId)?.readerHeadline?.status ?? 'unavailable' };
  });
  return { rows, provenance: b.provenance, headlineAvailability: {
    inputAccepted: b.candidates.filter(x => x.readerHeadline?.status === 'accepted').length,
    inputUnavailable: b.candidates.filter(x => x.readerHeadline?.status !== 'accepted').length,
    admittedAccepted: admitted.selectedEvidence.filter(x => x.readerHeadline?.status === 'accepted').length }, native: { topReads: p.topReads, additionalPosts: p.additionalPosts,
    evaluations: p.evaluatedEvidence, attestations: p.attestations, slate },
    attestationArtifactId: null, citationKind: 'internal-preflight-not-published',
    supplementalIds: admitted.selectedEvidence.filter(x => b.supplemental.some(s => s.feedItemId === x.feedItemId)).map(x => x.feedItemId),
    clusters: admitted.clusters, source: source.identity(), normalizedBundleSha256: b.normalizedSha256 };
}
function compare(before, after) {
  const left = new Map(before.rows.map(x => [x.candidateId, x])), right = new Map(after.rows.map(x => [x.candidateId, x]));
  const common = [...left.keys()].filter(id => right.has(id));
  const changed = keys => common.filter(id => digest(keys.map(k => left.get(id)[k])) !== digest(keys.map(k => right.get(id)[k])));
  return { added: [...right.keys()].filter(id => !left.has(id)), removed: [...left.keys()].filter(id => !right.has(id)),
    changedDecisions: changed(['placement', 'reason']), rankChanges: changed(['placement', 'slot']),
    supportChanges: changed(['supportIds']), headlineChanges: changed(['headlineStatus']),
    clusterChanged: digest(before.clusters) !== digest(after.clusters), missingAssessmentCount: 0 };
}
module.exports = { select, compare };
