'use strict';
const { clone } = require('./recorded-selector-ports.cjs');
// Observe terminal outcomes emitted by the actual revision's reconciliation.
// Never throw into the source's safelyRecord boundary or change publication.
function relationCompletionMetrics(source, gaps) {
  const defaults = source.load('libs/summary/ports/story-ranking-metrics.port.ts').NOOP_STORY_RANKING_METRICS;
  const terminal = (lane, metric) => {
    if (['failed_closed', 'timed_out'].includes(metric.status))
      gaps.add('relation_reconciliation_failed', { lane, metric: clone(metric) });
  };
  const aggregates = (lane, rows) => {
    for (const row of rows) if (['verifier_failed_closed', 'verifier_unavailable'].includes(row.disposition) && row.count > 0)
      gaps.add('relation_reconciliation_failed', { lane, aggregate: clone(row) });
  };
  return { ...defaults,
    recordStoryRelationVerification: metric => terminal('foreground', metric),
    recordRelatedTopicVerification: metric => terminal('related_topic', metric),
    recordStoryRelationDecisionAggregates: rows => aggregates('foreground', rows),
    recordStoryRelationSafeRecallShadowDecisions: rows => aggregates('safe_recall_shadow', rows),
  };
}
module.exports = { relationCompletionMetrics };
