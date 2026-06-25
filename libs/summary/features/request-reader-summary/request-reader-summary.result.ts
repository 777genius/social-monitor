import type { ReaderSummaryJobStatus } from "../../domain";

export type RequestReaderSummaryResult = {
  readonly readerSummaryJobId: string;
  readonly status: ReaderSummaryJobStatus;
  readonly created: boolean;
};
