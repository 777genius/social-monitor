import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ScanJob, ScanJobStatus } from '../domain';

export type ListScanJobsBySourceBindingQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly statuses?: readonly ScanJobStatus[];
};

export type ListScanJobsBySourceBindingResult = {
  readonly scanJobs: readonly ScanJob[];
  readonly nextCursor?: string;
};

export type ListScanJobsBySourceBindingWindowQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly windowStartedAt: Date;
  readonly windowEndedAt: Date;
  readonly limit: number;
};

export type ListScanJobsBySourceBindingWindowResult = {
  readonly scanJobs: readonly ScanJob[];
  readonly truncated: boolean;
};

export interface ScanJobHistoryReadPort {
  listBySourceBinding(
    query: ListScanJobsBySourceBindingQuery,
  ): Promise<ListScanJobsBySourceBindingResult>;

  listBySourceBindingWindow(
    query: ListScanJobsBySourceBindingWindowQuery,
  ): Promise<ListScanJobsBySourceBindingWindowResult>;
}
