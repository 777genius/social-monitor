import type {
  ReaderSummaryArtifact,
  ReaderSummaryContent,
} from "../domain";

export type EnrichReaderSummaryPreviewMediaCommand = {
  readonly artifact: ReaderSummaryArtifact;
  readonly content: ReaderSummaryContent;
};

export interface ReaderSummaryPreviewMediaEnricherPort {
  enrich(
    command: EnrichReaderSummaryPreviewMediaCommand,
  ): Promise<ReaderSummaryContent>;
}

export const NOOP_READER_SUMMARY_PREVIEW_MEDIA_ENRICHER: ReaderSummaryPreviewMediaEnricherPort =
  {
    async enrich(
      command: EnrichReaderSummaryPreviewMediaCommand,
    ): Promise<ReaderSummaryContent> {
      return command.content;
    },
  };
