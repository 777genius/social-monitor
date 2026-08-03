import type {
  ReaderSummaryWeeklyReviewManifest,
} from "../domain/value-objects/reader-summary-weekly-review-manifest";
import type {
  ReaderSummaryWeeklyManifestScope,
} from "../domain/value-objects/reader-summary-weekly-canonical-json";

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
