import type { ReaderSummaryJob, ReaderSummaryPreparationManifest } from "../domain";

export type ReaderSummaryV3PreflightOutcome =
  | { readonly kind: "deferred"; readonly job: ReaderSummaryJob }
  | { readonly kind: "claimed"; readonly job: ReaderSummaryJob; readonly manifest: ReaderSummaryPreparationManifest }
  | { readonly kind: "terminal"; readonly job: ReaderSummaryJob }
  | { readonly kind: "already_running"; readonly job: ReaderSummaryJob };

/**
 * Infrastructure owned transaction boundary for V3 preparation. Implementations
 * freeze exact assessment identities and decide ready/fail against DB wall clock.
 */
export interface ReaderSummaryV3PreflightPort {
  advance(params: {
    readonly job: ReaderSummaryJob;
    readonly requestedAt: Date;
    readonly startedAt: Date;
  }): Promise<ReaderSummaryV3PreflightOutcome>;
}
