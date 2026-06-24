export type ProjectRelevanceMemoryBatchResult = {
  readonly evaluated: number;
  readonly projected: number;
  readonly skipped: number;
  readonly failed: number;
};
