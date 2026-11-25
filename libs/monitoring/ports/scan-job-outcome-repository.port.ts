import type { ScanJob } from '../domain';

/** Atomically complete the scoped enqueued job; false means the snapshot lost ownership. */
export interface ScanJobOutcomeRepositoryPort {
  saveTerminalOutcome(job: ScanJob): Promise<boolean>;
}
