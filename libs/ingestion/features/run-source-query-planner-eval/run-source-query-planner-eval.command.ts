import type { SourceQueryPlannerEvalQualityGates } from '../../domain';

export type RunSourceQueryPlannerEvalCommand = {
  readonly datasetVersion?: string;
  readonly qualityGates?: SourceQueryPlannerEvalQualityGates;
};
