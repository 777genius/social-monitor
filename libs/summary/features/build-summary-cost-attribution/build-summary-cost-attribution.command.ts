import type { SummaryModelBudget, SummaryModelPolicy } from '../../ports';
import type { SummaryEvalFixture } from '../evaluate-summary-quality/evaluate-summary-quality.command';
import type { EvaluateSummaryQualityResult } from '../evaluate-summary-quality/evaluate-summary-quality.result';

export type BuildSummaryCostAttributionCommand = {
  readonly reportId: string;
  readonly generatedBy: string;
  readonly fixtures: readonly SummaryEvalFixture[];
  readonly evalResult: EvaluateSummaryQualityResult;
  readonly policy: SummaryModelPolicy;
  readonly budget: SummaryModelBudget;
};
