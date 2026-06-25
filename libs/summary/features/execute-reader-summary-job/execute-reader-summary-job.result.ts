import type { ReaderSummaryJobStatus } from "../../domain";

export type ExecuteReaderSummaryJobResult = {
  readonly readerSummaryJobId: string;
  readonly status: ReaderSummaryJobStatus;
  readonly readerSummaryId?: string;
};
