import type {
  DomainError,
  Result,
  TenantId,
  WorkspaceId,
} from "@social-monitor/shared-kernel";

export type ReserveSummaryJobQuotaCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId?: string;
  readonly scopeKey?: string;
  readonly operation:
    | "summary.request"
    | "summary.regenerate"
    | "reader_summary.request";
};

export type ReserveSummaryJobQuotaResult = {
  readonly remaining: number;
  readonly resetAt: string;
};

export interface SummaryQuotaPort {
  reserveSummaryJob(
    command: ReserveSummaryJobQuotaCommand,
  ): Promise<Result<ReserveSummaryJobQuotaResult, DomainError>>;
}
