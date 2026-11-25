import type {
  RankingEvalCase,
  RankingEvalQualityGates,
} from '../domain';

export type RankingEvalDataset = {
  readonly schemaVersion: 1;
  readonly datasetVersion: string;
  readonly generatedBy: string;
  readonly labelingPolicy: string;
  readonly qualityGates?: RankingEvalQualityGates;
  readonly cases: readonly RankingEvalCase[];
};

export type LoadRankingEvalDatasetQuery = {
  readonly datasetVersion?: string;
};

export type EvalDatasetRepositoryPort = {
  loadDataset(
    query: LoadRankingEvalDatasetQuery,
  ): Promise<RankingEvalDataset>;
};
