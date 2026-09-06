import type { ReaderSummaryJobProps } from "../../domain";

export const readerSummaryNewInputRefreshPrefix = "new-input-refresh:v1:";

/** A consumed, reviewed operation; never supplied by ordinary queue composition. */
export interface ReaderSummaryNewInputRefreshAuthority {
  claim(job: ReaderSummaryJobProps): Promise<Date>;
}
