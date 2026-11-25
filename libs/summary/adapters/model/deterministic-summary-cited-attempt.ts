import type {
  ProviderSummaryAttempt,
  SummaryModelEstimate,
  SummaryModelInput,
  SummaryModelRoute,
} from '../../ports';
import { buildSummaryHeadline } from './deterministic-summary-headline';
import { formatSourceHighlight } from './deterministic-summary-source-highlights';
import { buildExecutiveSummary } from './deterministic-summary-text';

/** Selected evidence alone determines ordered citations and their attached claims. */
export const buildDeterministicSummaryCitedAttempt = (
  input: SummaryModelInput,
  selectedRoute: SummaryModelRoute,
  usage: SummaryModelEstimate,
  lineage: ProviderSummaryAttempt['draft']['lineage'],
): ProviderSummaryAttempt => {
    const selectedItems = input.evidence.items.slice(
      0,
      input.policy.maxKeyPoints,
    );
    const citationMap = selectedItems.map((item, index) => ({
      citationId: `c${index + 1}`,
      feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId,
      providerKey: item.providerKey,
      field: 'title' as const,
      canonicalUrl: item.canonicalUrl,
    }));
    const keyPoints = selectedItems.map((item, index) => ({
      claim: item.title,
      citationIds: [`c${index + 1}`],
    }));

    return {
      route: selectedRoute,
      draft: {
        headline: buildSummaryHeadline(selectedItems),
        executiveSummary: buildExecutiveSummary(input),
        keyPoints,
        risksAndUnknowns: input.policy.includeRisks
          ? [
              {
                description:
                  'This deterministic MVP summary only uses selected evidence titles.',
                citationIds: ['c1'],
                reason: 'source_limit',
              },
            ]
          : [],
        sourceHighlights: input.policy.includeSourceHighlights
          ? selectedItems.map(formatSourceHighlight)
          : [],
        citationMap,
        qualityFlags:
          input.evidence.items.length < 3 ? ['limited_sources'] : [],
        confidence: {
          level: input.evidence.items.length < 3 ? 'low' : 'medium',
          score: input.evidence.items.length < 3 ? 0.35 : 0.6,
          rationale:
            'Confidence is derived from the number of selected evidence items in this MVP adapter.',
        },
        lineage,
        usage,
      },
    };
};
