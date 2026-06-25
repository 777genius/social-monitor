import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ScanJob } from '../domain';

export type ListScanJobsBySourceBindingQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly limit: number;
  readonly cursor?: string;
};

export type ListScanJobsBySourceBindingResult = {
  readonly scanJobs: readonly ScanJob[];
  readonly nextCursor?: string;
};

export interface ScanJobHistoryReadPort {
  listBySourceBinding(
    query: ListScanJobsBySourceBindingQuery,
  ): Promise<ListScanJobsBySourceBindingResult>;
}
