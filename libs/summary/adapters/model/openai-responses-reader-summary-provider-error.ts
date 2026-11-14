import type { ReaderSummaryModelFailure } from "../../ports";

/** Model-provider failure identity shared by admission, response trust and transport. */
export class ReaderSummaryModelProviderError extends Error {
  constructor(readonly failure: ReaderSummaryModelFailure) {
    super(failure.message);
  }
}
