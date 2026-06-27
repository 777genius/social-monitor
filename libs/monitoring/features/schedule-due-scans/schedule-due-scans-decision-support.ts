import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ScanJob } from '../../domain';
import type { ScanSchedulerDecisionRecord } from '../../ports';
import type {
  ScheduleDueScansDecision,
  ScheduleDueScansSkipBreakdown,
  ScheduleDueScansSkipReason,
} from './schedule-due-scans.result';

export type RecordedScheduleDueScansDecision = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly causationId?: string;
  readonly decision: ScheduleDueScansDecision;
};

export const recordDecision = (
  decisions: ScheduleDueScansDecision[] | undefined,
  recordedDecisions: RecordedScheduleDueScansDecision[],
  decision: RecordedScheduleDueScansDecision,
): void => {
  decisions?.push(decision.decision);
  recordedDecisions.push(decision);
};

export const schedulerDecisionRecordFromDecision = (params: {
  readonly id: string;
  readonly decision: RecordedScheduleDueScansDecision;
  readonly evaluatedAt: Date;
  readonly correlationId: string;
}): ScanSchedulerDecisionRecord => {
  const decision = params.decision.decision;

  return {
    id: params.id,
    tenantId: params.decision.tenantId,
    workspaceId: params.decision.workspaceId,
    decisionKey: schedulerDecisionKey(decision),
    scanPolicyId: decision.scanPolicyId,
    sourceBindingId: decision.sourceBindingId,
    ...(decision.providerKey === undefined
      ? {}
      : { providerKey: decision.providerKey }),
    decision: decision.decision,
    reason: decision.reason,
    ...(decision.decision === 'enqueued'
      ? { scanJobId: decision.scanJobId }
      : {}),
    policyDueAt: decision.policyDueAt,
    evaluatedAt: params.evaluatedAt,
    nextRunAt: decision.nextRunAt,
    configuredIntervalSeconds: decision.configuredIntervalSeconds,
    ...(decision.effectiveIntervalSeconds === undefined
      ? {}
      : { effectiveIntervalSeconds: decision.effectiveIntervalSeconds }),
    ...(decision.freshnessSeconds === undefined
      ? {}
      : { freshnessSeconds: decision.freshnessSeconds }),
    ...(decision.providerMinimumIntervalEnforced === undefined
      ? {}
      : {
          providerMinimumIntervalEnforced:
            decision.providerMinimumIntervalEnforced,
        }),
    ...(decision.decision === 'skipped' && decision.backoffUntil !== undefined
      ? { backoffUntil: decision.backoffUntil }
      : {}),
    correlationId: params.correlationId,
    ...(params.decision.causationId === undefined
      ? {}
      : { causationId: params.decision.causationId }),
  };
};

export const emptySkipBreakdown = (): Record<
  ScheduleDueScansSkipReason,
  number
> => ({
  active_scan: 0,
  duplicate_window: 0,
  fresh_success: 0,
  provider_failure_backoff: 0,
  queue_backpressure: 0,
  rate_limit_backoff: 0,
  source_unavailable: 0,
});

export const recordSkipped = (
  breakdown: Record<ScheduleDueScansSkipReason, number>,
  reason: ScheduleDueScansSkipReason,
): void => {
  breakdown[reason] += 1;
};

export const totalSkipped = (
  breakdown: ScheduleDueScansSkipBreakdown,
): number =>
  Object.values(breakdown).reduce((total, value) => total + value, 0);

export const schedulerSkipReason = (params: {
  readonly activeJob: ScanJob | null;
  readonly existingJob: ScanJob | null;
  readonly freshSuccess: boolean;
  readonly rateLimitBackoff: Date | null;
  readonly providerFailureBackoff: Date | null;
}): ScheduleDueScansSkipReason | null => {
  if (params.activeJob !== null) {
    return 'active_scan';
  }

  if (params.existingJob !== null) {
    return 'duplicate_window';
  }

  if (params.freshSuccess) {
    return 'fresh_success';
  }

  if (params.rateLimitBackoff !== null) {
    return 'rate_limit_backoff';
  }

  if (params.providerFailureBackoff !== null) {
    return 'provider_failure_backoff';
  }

  return null;
};

export const appliedSchedulerBackoffUntil = (params: {
  readonly skipReason: ScheduleDueScansSkipReason | null;
  readonly rateLimitBackoff: Date | null;
  readonly providerFailureBackoff: Date | null;
}): Date | null => {
  if (params.skipReason === 'rate_limit_backoff') {
    return params.rateLimitBackoff;
  }

  if (params.skipReason === 'provider_failure_backoff') {
    return params.providerFailureBackoff;
  }

  return null;
};

const schedulerDecisionKey = (decision: ScheduleDueScansDecision): string =>
  `scan-policy:${decision.scanPolicyId}:due-at:${decision.policyDueAt.toISOString()}`;
