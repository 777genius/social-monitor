import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { RetentionPolicyRepositoryPort, RetentionTablePolicy } from '../../ports';
import type { PlanRetentionPurgeCommand } from './plan-retention-purge.command';
import type {
  PlanRetentionPurgeResult,
  RetentionPurgePlanEntry,
  RetentionRetainedTableEntry,
} from './plan-retention-purge.result';

const DAY_MS = 24 * 60 * 60 * 1000;

export class PlanRetentionPurgeUseCase {
  constructor(private readonly retentionPolicies: RetentionPolicyRepositoryPort) {}

  async execute(
    command: PlanRetentionPurgeCommand,
  ): Promise<Result<PlanRetentionPurgeResult, DomainError>> {
    const policySet = await this.retentionPolicies.load();

    if (policySet.tables.length === 0) {
      return err(new DomainError('validation.failed', 'Retention policy set must contain table policies'));
    }

    const sortedPolicies = [...policySet.tables].sort((left, right) => left.table.localeCompare(right.table));
    const purgePlans = sortedPolicies
      .filter((policy) => policy.retentionDays > 0)
      .map((policy) => toPurgePlan(policy, command.now, policySet.defaultLegalHoldBehavior));
    const retainedTables = command.includeRetainedTables === true
      ? sortedPolicies.filter((policy) => policy.retentionDays === 0).map(toRetainedTable)
      : [];

    return ok({
      plannedAt: command.now,
      runbook: policySet.runbook,
      purgePlans,
      retainedTables,
    });
  }
}

const toPurgePlan = (
  policy: RetentionTablePolicy,
  now: Date,
  legalHoldBehavior: 'skip_purge_and_record_exception',
): RetentionPurgePlanEntry => ({
  table: policy.table,
  dataClass: policy.dataClass,
  owner: policy.owner,
  retentionDays: policy.retentionDays,
  eligibleBefore: new Date(now.getTime() - policy.retentionDays * DAY_MS),
  deleteMode: policy.deleteMode,
  purgeTrigger: policy.purgeTrigger,
  legalHoldBehavior,
  exportable: policy.exportable,
});

const toRetainedTable = (policy: RetentionTablePolicy): RetentionRetainedTableEntry => ({
  table: policy.table,
  dataClass: policy.dataClass,
  owner: policy.owner,
  deleteMode: policy.deleteMode,
  reason: 'retention_days_zero_requires_manual_or_release_driven_lifecycle',
});
