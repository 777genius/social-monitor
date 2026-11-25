import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummarySourceWindow } from '../domain';

export type SummaryFreshness =
  | {
      readonly status: 'fresh';
      readonly checkedAt: Date;
    }
  | {
      readonly status: 'stale';
      readonly checkedAt: Date;
      readonly staleMarkedAt: Date;
      readonly reason: 'new_evidence_after_window';
      readonly newestFeedItemId: string;
      readonly newestObservedAt: Date;
    };

export interface SummaryFreshnessPort {
  evaluate(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly interestId: string;
    readonly sourceWindow: SummarySourceWindow;
  }): Promise<SummaryFreshness>;
}
