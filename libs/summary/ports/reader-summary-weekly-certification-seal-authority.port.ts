import type {
  ReaderSummaryWeeklyCertificationSealBinding,
} from "../domain/value-objects/reader-summary-weekly-certification-seal";
import type { ReaderSummaryWeeklyManifestScope } from "../domain/value-objects/reader-summary-weekly-canonical-json";

export type LoadReaderSummaryWeeklyCertificationSealQuery = Readonly<{
  tenantId: string;
  workspaceId: string;
  scope: ReaderSummaryWeeklyManifestScope;
  weekStartedOn: string;
}>;

declare const readerSummaryWeeklyCertificationSealHandleBrand: unique symbol;

export type ReaderSummaryWeeklyCertificationSealHandle = Readonly<{
  readonly [readerSummaryWeeklyCertificationSealHandleBrand]:
    "reader_summary.weekly_certification_seal.opaque_handle";
}>;

export interface ReaderSummaryWeeklyCertificationSealAuthorityPort {
  load(
    query: LoadReaderSummaryWeeklyCertificationSealQuery,
  ): Promise<ReaderSummaryWeeklyCertificationSealHandle | null>;
  readVerifiedBinding(
    handle: ReaderSummaryWeeklyCertificationSealHandle,
  ): ReaderSummaryWeeklyCertificationSealBinding;
}
