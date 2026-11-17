import type {
  ProviderSummaryAttempt,
  SummaryModelEstimate,
  SummaryModelInput,
  SummaryModelRoute,
} from '../../ports';
import { buildNoSignalSummary } from './deterministic-summary-text';

/** A no-evidence result must never borrow citations or claim positive confidence. */
export const buildDeterministicSummaryNoSignalAttempt = (
  input: SummaryModelInput,
  selectedRoute: SummaryModelRoute,
  usage: SummaryModelEstimate,
  lineage: ProviderSummaryAttempt['draft']['lineage'],
): ProviderSummaryAttempt => {
      return {
        route: selectedRoute,
        draft: {
          headline: 'No reliable signal yet',
          executiveSummary: buildNoSignalSummary(input),
          keyPoints: [],
          risksAndUnknowns: [
            {
              description:
                'The summary window did not contain enough source material to produce claims.',
              reason: 'insufficient_evidence',
            },
          ],
          sourceHighlights: [],
          citationMap: [],
          qualityFlags: ['no_signal', 'limited_sources'],
          confidence: {
            level: 'none',
            score: 0,
            rationale: 'No evidence was selected for the summary window.',
          },
          lineage,
          usage,
          noSignalReason: 'No eligible evidence items selected for this interest.',
        },
      };
};
