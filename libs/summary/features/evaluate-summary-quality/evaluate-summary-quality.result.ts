export type SummaryEvalFailureCode =
  | 'schema_invalid'
  | 'citation_invalid'
  | 'claim_not_grounded'
  | 'no_signal_incorrect'
  | 'required_quality_flag_missing'
  | 'required_output_missing'
  | 'prompt_injection_leaked'
  | 'secret_leaked'
  | 'stale_marker_missing'
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
    readonly checkedKeyPointCount: number;
    readonly groundedKeyPointCount: number;
    readonly secretLeakCount: number;
  };
};

export type EvaluateSummaryQualityResult = {
  readonly datasetVersions: readonly string[];
  readonly blockingPassed: boolean;
  readonly fixtureResults: readonly SummaryEvalFixtureResult[];
};
