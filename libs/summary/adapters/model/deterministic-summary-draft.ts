import type {
  ProviderSummaryAttempt,
  SummaryModelEstimate,
  SummaryModelInput,
  SummaryModelRoute,
} from '../../ports';
import { buildDeterministicSummaryNoSignalAttempt } from './deterministic-summary-no-signal-attempt';
import { buildDeterministicSummaryCitedAttempt } from './deterministic-summary-cited-attempt';

/** Routes local draft construction by evidence presence; no budget or provider side effects. */
export const buildDeterministicSummaryAttempt = (
  input: SummaryModelInput,
  selectedRoute: SummaryModelRoute,
  usage: SummaryModelEstimate,
): ProviderSummaryAttempt => {
    const firstItem = input.evidence.items[0];
    const lineage = {
      promptVersion: selectedRoute.promptVersion,
      schemaVersion: selectedRoute.schemaVersion,
      modelVersion: selectedRoute.model,
      providerVersion: selectedRoute.provider,
      rulesVersion: input.policy.rulesVersion,
      evalDatasetVersion: 'summary.eval.mvp.v1',
    } as const;

    if (firstItem === undefined) {
      return buildDeterministicSummaryNoSignalAttempt(input, selectedRoute, usage, lineage);
    }
    return buildDeterministicSummaryCitedAttempt(input, selectedRoute, usage, lineage);
};
