import type {
  ReaderSummaryJob,
  ReaderSummaryPreparationManifest,
  SummaryEvidenceSelection,
} from "../domain";

export type ReaderSummaryV3PromotionOutcome =
  | { readonly kind: "ready"; readonly evidence: SummaryEvidenceSelection }
  | { readonly kind: "no_signal" }
  | { readonly kind: "presentation_unavailable" }
  | { readonly kind: "budget_exhausted" }
  /**
   * The frozen manifest predates a field the current policy needs
   * (`engagementObservedAt`). It can never be ranked; only a new job with a
   * fresh manifest can publish the day.
   */
  | { readonly kind: "manifest_outdated" }
  | { readonly kind: "dependency_failure"; readonly reason: string };

/** Materializes only the exact assessment inputs frozen in the job manifest. */
export interface ReaderSummaryV3PromotionPort {
  build(params: {
    readonly job: ReaderSummaryJob;
    readonly manifest: ReaderSummaryPreparationManifest;
  }): Promise<ReaderSummaryV3PromotionOutcome>;
}
