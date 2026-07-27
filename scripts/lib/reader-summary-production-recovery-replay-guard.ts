import type {
  ReaderSummaryProductionRecoveryAuthorityBinding,
} from "@social-monitor/summary/ports";

import {
  readerSummaryProductionRecoveryDayIds,
  type ReaderSummaryProductionRecoveryReplayGuard,
} from "./reader-summary-production-recovery-cli";
import {
  recoveryProvenanceForDay,
  type ReaderSummaryProductionRecoveryDate,
} from "./reader-summary-production-recovery-data";

export type ReaderSummaryProductionRecoveryReplayGuardClient = Readonly<{
  $queryRaw: <T = unknown>(
    query: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => Promise<T>;
}>;

type ReplayRow = Readonly<{
  replayed: boolean;
}>;

export class PrismaReaderSummaryProductionRecoveryReplayGuard
  implements ReaderSummaryProductionRecoveryReplayGuard
{
  constructor(
    private readonly client: ReaderSummaryProductionRecoveryReplayGuardClient,
  ) {}

  async isReplayed(params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  }): Promise<boolean> {
    const ids = readerSummaryProductionRecoveryDayIds(
      params.binding,
      params.requestedUtcDate,
    );
    const provenance = JSON.stringify(
      recoveryProvenanceForDay(params.binding, params.requestedUtcDate),
    );
    const rows = await this.client.$queryRaw<readonly ReplayRow[]>`
      SELECT EXISTS (
        SELECT 1
        FROM "reader_summary_recovery_receipts" AS receipt
        JOIN "reader_summary_publications" AS publication
          ON publication."id" = receipt."publication_id"
          AND publication."reader_summary_job_id" =
            receipt."reader_summary_job_id"
          AND publication."reader_summary_artifact_id" =
            receipt."reader_summary_artifact_id"
        JOIN "reader_summary_artifacts" AS artifact
          ON artifact."id" = receipt."reader_summary_artifact_id"
          AND artifact."reader_summary_job_id" =
            receipt."reader_summary_job_id"
        WHERE receipt."tenant_id" = ${params.binding.tenantId}::uuid
          AND receipt."workspace_id" = ${params.binding.workspaceId}::uuid
          AND receipt."reader_summary_job_id" =
            ${ids.readerSummaryJobId}::uuid
          AND receipt."reader_summary_artifact_id" =
            ${ids.readerSummaryId}::uuid
          AND receipt."recovery_kind" = 'SUMMARY_ONLY'
          AND receipt."provenance" = ${provenance}::jsonb
          AND artifact."tenant_id" = receipt."tenant_id"
          AND artifact."workspace_id" = receipt."workspace_id"
          AND artifact."status" = 'COMPLETED'
      ) AS "replayed"
    `;
    return rows[0]?.replayed === true;
  }
}
