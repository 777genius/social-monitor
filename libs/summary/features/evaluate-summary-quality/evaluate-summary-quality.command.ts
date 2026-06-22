import type { SummaryModelBudget, SummaryModelInput, SummaryModelPolicy } from '../../ports';
import type { SummaryQualityFlag } from '../../domain';
import type { SummaryFreshness } from '../../ports';

export type SummaryEvalExpectation = {
  readonly expectedNoSignal: boolean;
  readonly requiredQualityFlags: readonly SummaryQualityFlag[];
  readonly requiredOutputFragments?: readonly string[];
  readonly forbiddenOutputFragments: readonly string[];
  readonly minGroundedKeyPointRatio?: number;
  readonly expectedFreshnessStatus?: SummaryFreshness['status'];
  readonly maxEstimatedCostUsd: number;
};

export type SummaryEvalFixtureGroup =
  | 'empty_no_signal'
  | 'hn_golden'
  | 'rss_golden'
  | 'prompt_injection'
  | 'secret_redaction'
  | 'citation_regression'
  | 'stale_marker'
  | 'cost_regression';

export type SummaryEvalFixture = {
  readonly fixtureId: string;
  readonly datasetVersion: string;
  readonly group: SummaryEvalFixtureGroup;
  readonly input: SummaryModelInput;
  readonly freshness?: SummaryFreshness;
  readonly expectation: SummaryEvalExpectation;
};

export type EvaluateSummaryQualityCommand = {
  readonly fixtures: readonly SummaryEvalFixture[];
  readonly policy: SummaryModelPolicy;
  readonly budget: SummaryModelBudget;
};
