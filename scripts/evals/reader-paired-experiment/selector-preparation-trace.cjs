'use strict';
const { types } = require('node:util');
const { FINAL, check, digest } = require('./revision-source.cjs');
const { clone, canonical, same } = require('./recorded-selector-ports.cjs');
// Trace-only wrappers around actual revision exports. Values are detached only
// for reporting; the original arguments, return values and promises are kept.
const detach = value => JSON.parse(JSON.stringify(value, (_key, item) =>
  types.isSet(item) ? [...item] : types.isMap(item) ? [...item.entries()] : item));
function preparationTrace(source) {
  const stages = [], restorers = [], failures = [];
  function wrap(file, symbol, kind, asynchronous = false) {
    const module = source.load(file), original = module[symbol];
    check(typeof original === 'function', `missing_preparation_seam:${symbol}`);
    const record = (args, output) => {
      try { stages.push({ kind, input: detach(args), output: detach(output) }); }
      catch { failures.push({ kind, code: 'trace_serialization_failed' }); }
    };
    module[symbol] = function (...args) {
      const output = original.apply(this, args);
      if (asynchronous) {
        output.then(value => record(args, value), () => {});
        return output;
      }
      record(args, output); return output;
    };
    restorers.push(() => { module[symbol] = original; });
  }
  const evidence = 'libs/summary/adapters/evidence/';
  wrap(evidence + 'relevance-reader-summary-evidence-support.ts', 'filterItemsByReaderSummaryPeriod', 'period');
  wrap(evidence + 'relevance-reader-summary-evidence-support.ts', 'filterItemsByDefaultReaderSummaryProviders', 'default_provider');
  wrap('libs/summary/domain/policies/reader-summary-github-trending-policy.ts', 'selectGitHubTrendingSupplementalEvidence', 'supplemental');
  wrap(evidence + 'relevance-reader-summary-story-relation-decisions.ts', 'verifiedReaderSummaryStoryRelations', 'verified_relations', true);
  wrap(evidence + 'relevance-reader-summary-promotion-candidates.ts', 'promotionPolicySelection', 'promotion_policy');
  return { stages, failures, restore() { while (restorers.length) restorers.pop()(); } };
}
const excluded = (input, output) => {
  const ids = new Set(output.map(i => i.feedItemId));
  return input.filter(i => !ids.has(i.feedItemId)).map(i => i.feedItemId);
};
const unclustered = (items, selection) => {
  const ids = new Set(selection.clusters.flatMap(c => [c.representativeFeedItemId, ...c.duplicateFeedItemIds]));
  return items.filter(i => !ids.has(i.feedItemId)).map(i => i.feedItemId);
};
function observedPreparation({ revision, stages, groups, rankedItems, mappedItems, primaryIds, supplementalIds, requests }) {
  const byId = new Map(mappedItems.map(i => [i.feedItemId, i]));
  const ranked = new Map(rankedItems.map(i => [i.feedItemId, i]));
  // P2 observes before the source's final rank assignment. Compare all source
  // values after undoing that one documented assignment, retaining rank order
  // separately. This is derived normalization, not a claimed pre-sort callback.
  const beforeRankAssignment = ids => ids.map(id => ({ ...ranked.get(id), rank: 0 }));
  const promotion = { ranked: { primary: beforeRankAssignment(primaryIds), supplemental: beforeRankAssignment(supplementalIds),
    requestedCandidateIds: requests.map(r => r.candidateId) },
  primary: primaryIds.map(id => byId.get(id)), supplemental: supplementalIds.map(id => byId.get(id)) };
  if (revision !== FINAL) return { promotion, preparation: null, status: 'OLD_stages_retained_without_FINAL_preparation_interpretation' };
  const one = kind => {
    const rows = stages.filter(s => s.kind === kind);
    check(rows.length === 1, `preparation_seam_count:${kind}`); return rows[0];
  };
  const period = one('period'), providers = one('default_provider'), supplemental = one('supplemental');
  const relations = one('verified_relations'), policy = one('promotion_policy');
  check(groups.length === 2, 'preparation_grouping_call_count');
  const initial = groups[0].output, authoritative = groups[1].output, groupingInput = groups[0].input.items;
  check(same(groupingInput, groups[1].input.items), 'preparation_grouping_input_changed');
  const preparation = {
    rankingOrder: rankedItems.map(({ feedItemId, rank }) => ({ feedItemId, rank })), rankedInventory: mappedItems,
    periodExcludedIds: excluded(mappedItems, period.output), defaultProviderExcludedIds: excluded(period.output, providers.output),
    periodFiltered: period.output, defaultProviderFiltered: providers.output,
    candidateItems: supplemental.input[0], groupingInput,
    initialGrouping: initial, authoritativeGrouping: authoritative,
    initialUnclusteredIds: unclustered(groupingInput, initial), authoritativeUnclusteredIds: unclustered(groupingInput, authoritative),
    relationCandidates: relations.output.candidates, verifiedPairs: relations.output.pairs,
    strictTitlePairs: relations.output.strictTitlePairs, approvedRelations: relations.output.relations,
    graduatedRelations: policy.input[0].approvedSameStoryRelations, policyItems: policy.input[1],
    prePolicySelection: policy.input[0], admittedSupplemental: supplemental.output,
  };
  return detach({ promotion, preparation, status: 'derived_from_actual_revision_calls' });
}
function auditPreparation(tape, observed, selection, revision, gaps) {
  if (revision !== FINAL) return { status: 'not_applicable_to_OLD', fields: [] };
  const fields = [];
  for (const [file, rawValue] of [['promotion.json', observed.promotion], ['preparation.json', observed.preparation], ['selection.json', selection]]) {
    // P2 serializes value records as JSON; undefined optional values disappear.
    // Query present-key semantics are guarded separately at the port boundary.
    const value = clone(rawValue);
    const expected = tape.files[file];
    if (!expected) { gaps.add('preparation_capture_missing', { file }); fields.push({ file, equal: false, missing: true }); continue; }
    const keys = [...new Set([...Object.keys(value), ...Object.keys(expected)])];
    for (const key of keys) {
      const equal = Object.hasOwn(value, key) && Object.hasOwn(expected, key) && same(clone(value[key] ?? null), clone(expected[key] ?? null));
      fields.push({ file, key, equal, actualSha256: digest(canonical(clone(value[key] ?? null))), expectedSha256: digest(canonical(expected[key] ?? null)) });
      if (!equal) gaps.add('producer_preparation_mismatch', { file, key });
    }
  }
  return { status: fields.every(f => f.equal) ? 'content_equal_origin_unverified' : 'incomplete_or_mismatched', fields };
}
module.exports = { detach, preparationTrace, observedPreparation, auditPreparation };
