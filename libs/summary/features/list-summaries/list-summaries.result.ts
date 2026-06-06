import type { SummaryArtifactView } from '../shared/summary-artifact-presenter';

export type ListSummariesResult = {
  readonly items: readonly SummaryArtifactView[];
  readonly nextCursor?: string;
};
