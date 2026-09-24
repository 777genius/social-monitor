import type { ReaderSummaryOperatorCancellationPort } from "../../../ports";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import { requireSerializableReaderSummaryTransactions,
  runSerializableReaderSummaryTransaction } from "./prisma-summary-transaction";
import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";

type StatusRow = { readonly id: string; readonly status: string;
  readonly published: boolean };

export class PrismaReaderSummaryOperatorCancellation
implements ReaderSummaryOperatorCancellationPort {
  constructor(private readonly prisma: PrismaSummaryClient) {
    requireSerializableReaderSummaryTransactions(prisma);
  }

  async preview(params: Parameters<ReaderSummaryOperatorCancellationPort["preview"]>[0]) {
    assertIds(params.jobIds);
    const rows = await this.prisma.$queryRaw<readonly StatusRow[]>`
      SELECT j.id::text, j.status::text,
        EXISTS (SELECT 1 FROM reader_summary_publications p
          WHERE p.reader_summary_job_id=j.id) AS published
      FROM reader_summary_jobs j WHERE j.tenant_id=${params.tenantId}::uuid
        AND j.workspace_id=${params.workspaceId}::uuid
        AND j.id=ANY(${params.jobIds}::uuid[]) ORDER BY j.id
    `;
    const byId = new Map(rows.map((row) => [row.id, row]));
    return params.jobIds.map((jobId) => ({ jobId,
      status: byId.get(jobId)?.status.toLowerCase() ?? "not_found" }));
  }

  async cancel(params: Parameters<ReaderSummaryOperatorCancellationPort["cancel"]>[0]) {
    assertIds(params.jobIds);
    return withPrismaWriteRetry(() => runSerializableReaderSummaryTransaction(
      this.prisma,
      async (tx) => {
        const rows = await tx.$queryRaw<readonly StatusRow[]>`
          SELECT j.id::text, j.status::text,
            EXISTS (SELECT 1 FROM reader_summary_publications p
              WHERE p.reader_summary_job_id=j.id) AS published
          FROM reader_summary_jobs j WHERE j.tenant_id=${params.tenantId}::uuid
            AND j.workspace_id=${params.workspaceId}::uuid
            AND j.id=ANY(${params.jobIds}::uuid[]) ORDER BY j.id FOR UPDATE OF j
        `;
        const byId = new Map(rows.map((row) => [row.id, row]));
        const cancellable = rows.filter((row) => !row.published &&
          (row.status === "REQUESTED" || row.status === "RUNNING")).map((row) => row.id);
        if (cancellable.length > 0) {
          await tx.$queryRaw`
            UPDATE reader_summary_jobs SET status='FAILED', failed_at=clock_timestamp(),
              completed_at=NULL, reader_summary_artifact_id=NULL,
              failure_reason='Reader summary job cancelled by operator',
              terminal_failure_code='operator_cancelled', preparation_next_check_at=NULL
            WHERE tenant_id=${params.tenantId}::uuid AND workspace_id=${params.workspaceId}::uuid
              AND id=ANY(${cancellable}::uuid[]) RETURNING id
          `;
        }
        return params.jobIds.map((jobId) => {
          const row = byId.get(jobId);
          return { jobId, status: row === undefined ? "not_found" as const
            : row.published ? "already_published" as const
              : row.status === "REQUESTED" || row.status === "RUNNING"
                ? "cancelled" as const : "already_terminal" as const };
        });
      },
    ));
  }
}

const assertIds = (ids: readonly string[]): void => {
  if (ids.length === 0 || ids.length > 100 || new Set(ids).size !== ids.length ||
      ids.some((id) => !/^[0-9a-f-]{36}$/u.test(id))) {
    throw new Error("Operator cancellation requires 1..100 unique job UUIDs");
  }
};
