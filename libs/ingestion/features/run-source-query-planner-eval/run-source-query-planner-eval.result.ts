import type {
  RankingMetric,
  SourceQueryPlannerEvalCaseResult,
  SourceQueryPlannerEvalQualityGates,
} from '../../domain';

export type RunSourceQueryPlannerEvalResult = {
  readonly schemaVersion: 1;
  readonly datasetVersion: string;
  readonly generatedBy: string;
  readonly labelingPolicy: string;
  readonly qualityGates: SourceQueryPlannerEvalQualityGates;
  readonly blockingPassed: boolean;
  readonly metrics: readonly RankingMetric[];
  readonly caseResults: readonly SourceQueryPlannerEvalCaseResult[];
};
