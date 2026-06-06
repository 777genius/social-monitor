import type { SummaryModelBudget, SummaryModelInput, SummaryModelPolicy } from '../../ports';
import type { SummaryQualityFlag } from '../../domain';

export type SummaryEvalExpectation = {
  readonly expectedNoSignal: boolean;
  readonly requiredQualityFlags: readonly SummaryQualityFlag[];
  readonly forbiddenOutputFragments: readonly string[];
  readonly maxEstimatedCostUsd: number;
};

export type SummaryEvalFixture = {
  readonly fixtureId: string;
  readonly datasetVersion: string;
  readonly group:
    | 'empty_no_signal'
    | 'hn_golden'
    | 'rss_golden'
    | 'prompt_injection'
    | 'citation_regression'
    | 'cost_regression';
  readonly input: SummaryModelInput;
  readonly expectation: SummaryEvalExpectation;
};

export type EvaluateSummaryQualityCommand = {
  readonly fixtures: readonly SummaryEvalFixture[];
  readonly policy: SummaryModelPolicy;
  readonly budget: SummaryModelBudget;
};
