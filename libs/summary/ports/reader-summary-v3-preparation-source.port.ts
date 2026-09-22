import type {
  ReaderSummaryJob,
  ReaderSummaryPreparationConfig,
  ReaderSummaryPreparationFailureCode,
  ReaderSummaryPreparationManifest,
} from "../domain";

export type ReaderSummaryV3Coverage =
  | { readonly status: "ready" }
  | { readonly status: "pending" }
  | { readonly status: "unavailable"; readonly code:
      Extract<ReaderSummaryPreparationFailureCode,
        "assessment_unavailable" | "assessment_snapshot_unavailable" |
        "assessment_inventory_over_budget" | "config_unavailable"> };

export interface ReaderSummaryV3PreparationSourcePort {
  configuration(job: ReaderSummaryJob): Promise<
    | { readonly ok: true; readonly config: ReaderSummaryPreparationConfig }
    | { readonly ok: false; readonly code: "config_unavailable" }>;
  prepare(job: ReaderSummaryJob, config: ReaderSummaryPreparationConfig): Promise<
    | { readonly ok: true; readonly config: ReaderSummaryPreparationConfig;
        readonly manifest: ReaderSummaryPreparationManifest;
        readonly manifestSha256: string }
    | { readonly ok: false; readonly code:
        Extract<ReaderSummaryPreparationFailureCode,
          "assessment_snapshot_unavailable" |
          "assessment_inventory_over_budget" | "config_unavailable"> }>;
  coverage(params: {
    readonly job: ReaderSummaryJob;
    readonly manifest: ReaderSummaryPreparationManifest;
    readonly deadlineAt: string;
  }): Promise<ReaderSummaryV3Coverage>;
}
