import type { ReaderSummaryJob } from "../../../domain";
import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";

export type LockedJob = {
  readonly status: string;
  readonly selection_strategy: string | null;
  readonly preparation_manifest: unknown | null;
  readonly preparation_config: unknown | null;
  readonly preparation_manifest_sha256: string | null;
  readonly period_key: string;
  readonly preparation_cutoff_at: string | null;
  readonly preparation_deadline_at: string | null;
  readonly started_at: Date | null;
  readonly preparation_next_check_at: Date | null;
  readonly terminal_failure_code: string | null;
  readonly failure_reason: string | null;
};

export const lockJob = (tx: Pick<PrismaReaderSummaryClient, "$queryRaw">,
  snapshot: ReturnType<ReaderSummaryJob["toSnapshot"]>) =>
  tx.$queryRaw<readonly LockedJob[]>`
    SELECT status, selection_strategy, preparation_manifest, preparation_config,
      preparation_manifest_sha256, period_key,
      CASE WHEN preparation_cutoff_at IS NULL THEN NULL ELSE
        to_char(preparation_cutoff_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS preparation_cutoff_at,
      CASE WHEN preparation_deadline_at IS NULL THEN NULL ELSE
        to_char(preparation_deadline_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS preparation_deadline_at,
      started_at, preparation_next_check_at, terminal_failure_code,
      failure_reason FROM reader_summary_jobs
    WHERE tenant_id=${snapshot.tenantId}::uuid
      AND workspace_id=${snapshot.workspaceId}::uuid AND id=${snapshot.id}::uuid
    FOR UPDATE
  `;
