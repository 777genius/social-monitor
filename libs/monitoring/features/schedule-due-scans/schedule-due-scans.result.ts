import type {
  ScanSchedulerDecisionReason,
} from '../../ports';

export type ScheduleDueScansSkipReason =
  Exclude<ScanSchedulerDecisionReason, 'scan_policy_due_now'>;

export type ScheduleDueScansSkipBreakdown = Readonly<
  Record<ScheduleDueScansSkipReason, number>
>;

export type ScheduleDueScansDecision =
  | {
      readonly scanPolicyId: string;
      readonly sourceBindingId: string;
      readonly providerKey: string;
      readonly decision: 'enqueued';
      readonly reason: 'scan_policy_due_now';
      readonly scanJobId: string;
      readonly policyDueAt: Date;
      readonly nextRunAt: Date;
      readonly configuredIntervalSeconds: number;
      readonly effectiveIntervalSeconds: number;
      readonly freshnessSeconds: number;
      readonly providerMinimumIntervalEnforced: boolean;
    }
  | {
      readonly scanPolicyId: string;
      readonly sourceBindingId: string;
      readonly providerKey?: string;
      readonly decision: 'skipped';
      readonly reason: ScheduleDueScansSkipReason;
      readonly policyDueAt: Date;
      readonly nextRunAt: Date;
      readonly configuredIntervalSeconds: number;
      readonly effectiveIntervalSeconds?: number;
      readonly freshnessSeconds?: number;
      readonly providerMinimumIntervalEnforced?: boolean;
      readonly backoffUntil?: Date;
    };

export type ScheduleDueScansResult = {
  readonly scannedAt: Date;
  readonly evaluated: number;
  readonly enqueued: number;
  readonly skipped: number;
  readonly skippedByReason: ScheduleDueScansSkipBreakdown;
  readonly decisions?: readonly ScheduleDueScansDecision[];
};
