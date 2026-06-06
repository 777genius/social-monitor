export type SummaryEvalFailureCode =
  | 'schema_invalid'
  | 'citation_invalid'
  | 'no_signal_incorrect'
  | 'required_quality_flag_missing'
  | 'prompt_injection_leaked'
  | 'cost_budget_exceeded'
  | 'provider_failure';

export type SummaryEvalFixtureResult = {
  readonly fixtureId: string;
  readonly datasetVersion: string;
  readonly blockingPassed: boolean;
  readonly failures: readonly {
    readonly code: SummaryEvalFailureCode;
    readonly message: string;
  }[];
  readonly metrics: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly estimatedCostUsd: number;
    readonly keyPointCount: number;
    readonly citationCount: number;
  };
};

export type EvaluateSummaryQualityResult = {
  readonly datasetVersions: readonly string[];
  readonly blockingPassed: boolean;
  readonly fixtureResults: readonly SummaryEvalFixtureResult[];
};
