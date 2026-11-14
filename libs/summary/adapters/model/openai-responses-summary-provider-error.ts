import type { SummaryModelFailure } from '../../ports';

/** Carries the already-admitted provider failure without reclassifying it. */
export class SummaryModelProviderError extends Error {
  constructor(readonly failure: SummaryModelFailure) {
    super(failure.message);
  }
}
