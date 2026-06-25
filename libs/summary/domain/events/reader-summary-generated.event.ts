import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

export type ReaderSummaryGeneratedEvent = {
  readonly type: "reader_summary.generated";
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly readerSummaryId: string;
  readonly generatedAt: Date;
  readonly topReadCount: number;
  readonly providerKeys: readonly string[];
};
