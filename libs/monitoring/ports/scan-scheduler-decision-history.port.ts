import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ScanSchedulerDecisionOutcome = 'enqueued' | 'skipped';

export type ScanSchedulerDecisionReason =
  | 'scan_policy_due_now'
  | 'active_scan'
  | 'duplicate_window'
  | 'fresh_success'
  | 'provider_failure_backoff'
  | 'queue_backpressure'
  | 'rate_limit_backoff'
  | 'source_unavailable';

export type ScanSchedulerDecisionRecord = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly decisionKey: string;
  readonly scanPolicyId: string;
  readonly sourceBindingId: string;
  readonly providerKey?: string;
  readonly decision: ScanSchedulerDecisionOutcome;
  readonly reason: ScanSchedulerDecisionReason;
  readonly scanJobId?: string;
  readonly policyDueAt: Date;
  readonly evaluatedAt: Date;
  readonly nextRunAt: Date;
  readonly configuredIntervalSeconds: number;
  readonly effectiveIntervalSeconds?: number;
  readonly freshnessSeconds?: number;
  readonly providerMinimumIntervalEnforced?: boolean;
  readonly backoffUntil?: Date;
  readonly correlationId?: string;
  readonly causationId?: string;
};

export type RecordScanSchedulerDecisionsCommand = {
  readonly records: readonly ScanSchedulerDecisionRecord[];
};

export type ListScanSchedulerDecisionsBySourceBindingWindowQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly windowStartedAt: Date;
  readonly windowEndedAt: Date;
  readonly limit: number;
};

export type ListScanSchedulerDecisionsBySourceBindingWindowResult = {
  readonly records: readonly ScanSchedulerDecisionRecord[];
  readonly truncated: boolean;
};

export interface ScanSchedulerDecisionHistoryPort {
  recordBatch(command: RecordScanSchedulerDecisionsCommand): Promise<void>;

  listBySourceBindingWindow(
    query: ListScanSchedulerDecisionsBySourceBindingWindowQuery,
  ): Promise<ListScanSchedulerDecisionsBySourceBindingWindowResult>;
}
