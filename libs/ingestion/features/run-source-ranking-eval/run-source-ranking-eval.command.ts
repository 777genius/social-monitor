import type { RankingEvalQualityGates } from '../../domain';

export type RunSourceRankingEvalCommand = {
  readonly datasetVersion?: string;
  readonly qualityGates?: RankingEvalQualityGates;
};
