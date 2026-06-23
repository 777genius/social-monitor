import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { BriefingScope, BriefingSourceWindow } from '../domain';

export type BriefingFreshness =
  | {
      readonly status: 'fresh';
      readonly checkedAt: Date;
    }
  | {
      readonly status: 'stale';
      readonly checkedAt: Date;
      readonly staleMarkedAt: Date;
      readonly reason:
        | 'new_evidence_after_window'
        | 'topic_bindings_changed'
        | 'briefing_policy_changed'
        | 'ranking_policy_changed';
      readonly newestFeedItemId?: string;
      readonly newestObservedAt?: Date;
    };

export interface BriefingFreshnessProbePort {
  evaluate(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly scope: BriefingScope;
    readonly sourceWindow: BriefingSourceWindow;
  }): Promise<BriefingFreshness>;
}
