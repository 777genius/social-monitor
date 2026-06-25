import type { ReaderSummaryArtifactView } from "../shared/reader-summary-artifact-presenter";

export type ListReaderSummariesResult = {
  readonly items: readonly ReaderSummaryArtifactView[];
  readonly nextCursor?: string;
};
