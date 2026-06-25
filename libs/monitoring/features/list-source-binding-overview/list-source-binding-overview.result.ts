import type { GetSourceBindingHealthResult } from '../get-source-binding-health/get-source-binding-health.result';

export type ListSourceBindingOverviewResult = {
  readonly items: readonly GetSourceBindingHealthResult[];
  readonly nextCursor?: string;
};
