import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

export const EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE =
  "reader_summary.job.execute";

export type EnqueueReaderSummaryJobCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly readerSummaryJobId: string;
  readonly correlationId: string;
  readonly causationId: string;
};

export interface ReaderSummaryJobQueuePort {
  canAccept(command: EnqueueReaderSummaryJobCommand): Promise<boolean>;
  enqueue(command: EnqueueReaderSummaryJobCommand): Promise<void>;
}
