import type { SourceQueryPlan, SourceQueryPlannerIntent } from '../domain';

export type SourceQueryPlannerPort = {
  compilePlan(params: {
    readonly intent: SourceQueryPlannerIntent;
  }): Promise<SourceQueryPlan>;
};
