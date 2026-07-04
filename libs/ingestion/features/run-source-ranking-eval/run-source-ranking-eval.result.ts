import type {
  RankingEvalCaseResult,
  RankingEvalQualityGates,
  RankingMetric,
} from '../../domain';

export type RunSourceRankingEvalResult = {
  readonly schemaVersion: 1;
  readonly datasetVersion: string;
  readonly generatedBy: string;
  readonly labelingPolicy: string;
  readonly qualityGates: RankingEvalQualityGates;
  readonly blockingPassed: boolean;
  readonly metrics: readonly RankingMetric[];
  readonly caseResults: readonly RankingEvalCaseResult[];
};
