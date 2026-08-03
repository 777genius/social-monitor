import type {
  ReaderSummaryWeeklyReviewManifest,
} from "../domain/value-objects/reader-summary-weekly-review-manifest";
import type {
  ReaderSummaryWeeklyManifestScope,
} from "../domain/value-objects/reader-summary-weekly-canonical-json";

export type ReaderSummaryWeeklyReviewManifestCorruptionReason =
  | "ambiguous_lookup"
  | "canonical_divergence"
  | "invalid_canonical_scope"
  | "persistence_proof_divergence";

export class ReaderSummaryWeeklyReviewManifestCorruptionError extends Error {
  readonly reason: ReaderSummaryWeeklyReviewManifestCorruptionReason;

  constructor(
    reason: ReaderSummaryWeeklyReviewManifestCorruptionReason,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "ReaderSummaryWeeklyReviewManifestCorruptionError";
    this.reason = reason;
    if (cause !== undefined) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        enumerable: false,
        value: cause,
      });
    }
  }
}

export type FindReaderSummaryWeeklyReviewManifestQuery = Readonly<{
  tenantId: string;
  workspaceId: string;
  scope: ReaderSummaryWeeklyManifestScope;
  weekStartedOn: string;
  sealId: string;
}>;

export type PersistReaderSummaryWeeklyReviewManifestCommand = Readonly<{
  manifest: ReaderSummaryWeeklyReviewManifest;
}>;

export type PersistReaderSummaryWeeklyReviewManifestResult = Readonly<{
  outcome: "persisted" | "replayed";
  manifest: ReaderSummaryWeeklyReviewManifest;
}>;

export interface ReaderSummaryWeeklyReviewManifestPort {
  findBySeal(
    query: FindReaderSummaryWeeklyReviewManifestQuery,
  ): Promise<ReaderSummaryWeeklyReviewManifest | null>;
  persist(
    command: PersistReaderSummaryWeeklyReviewManifestCommand,
  ): Promise<PersistReaderSummaryWeeklyReviewManifestResult>;
}
