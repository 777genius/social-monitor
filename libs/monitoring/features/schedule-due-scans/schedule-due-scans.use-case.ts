import {
  type Clock,
  DomainError,
  type IdGenerator,
  type TenantId,
  type WorkspaceId,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { ScanJob } from '../../domain';
import type {
  ScanJobRepositoryPort,
  ScanJobHistoryReadPort,
  ScanPolicyRepositoryPort,
  ScanSchedulerDecisionHistoryPort,
  ScanSchedulerDecisionRecord,
  ScanQueuePort,
  SourceBindingRepositoryPort,
} from '../../ports';
import type { ScheduleDueScansCommand } from './schedule-due-scans.command';
import type {
  ScheduleDueScansDecision,
  ScheduleDueScansResult,
  ScheduleDueScansSkipBreakdown,
  ScheduleDueScansSkipReason,
} from './schedule-due-scans.result';
import { effectiveProviderScanCadence } from '../shared/scan-cadence-policy';
import {
  isFreshSuccessfulScan,
  providerFailureBackoffUntil,
  rateLimitBackoffUntil,
} from '../shared/scan-freshness-guard';
import {
  nextScanPolicyRunAfterDecision,
  scheduledScanIdempotencyKey,
} from '../shared/scan-scheduler-decision-policy';
import { sourceBindingScanQuery } from '../shared/source-binding-scan-query';

type ScheduleDueScansFailure = DomainError | Error;
type ScanJobRecentHistoryReadPort = Pick<
  ScanJobHistoryReadPort,
  'listBySourceBinding'
>;
type RecordedScheduleDueScansDecision = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly causationId?: string;
  readonly decision: ScheduleDueScansDecision;
};

export class ScheduleDueScansUseCase {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly scanPolicies: ScanPolicyRepositoryPort,
    private readonly scanJobs: ScanJobRepositoryPort &
      ScanJobRecentHistoryReadPort,
    private readonly scanQueue: ScanQueuePort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly schedulerDecisions?: ScanSchedulerDecisionHistoryPort,
  ) {}

  async execute(
    command: ScheduleDueScansCommand,
  ): Promise<Result<ScheduleDueScansResult, ScheduleDueScansFailure>> {
    if (
      !Number.isInteger(command.limit) ||
      command.limit < 1 ||
      command.limit > 100
    ) {
      return err(
        new DomainError(
          'validation.failed',
          'Schedule due scans limit must be between 1 and 100',
        ),
      );
    }

    const now = this.clock.now();
    const policies = await this.scanPolicies.findDue({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      now,
      limit: command.limit,
    });
    let enqueued = 0;
    const skippedByReason = emptySkipBreakdown();
    const decisions =
      command.includeDecisions === true
        ? ([] as ScheduleDueScansDecision[])
        : undefined;
    const recordedDecisions: RecordedScheduleDueScansDecision[] = [];

    for (const policy of policies) {
      const policySnapshot = policy.toSnapshot();
      const binding = await this.sourceBindings.findById({
        tenantId: policySnapshot.tenantId,
        workspaceId: policySnapshot.workspaceId,
        sourceBindingId: policySnapshot.sourceBindingId,
      });

      const bindingSnapshot = binding?.toSnapshot();
      if (
        bindingSnapshot === undefined ||
        bindingSnapshot.status !== 'enabled'
      ) {
        const unavailableCadence =
          bindingSnapshot === undefined
            ? {
                intervalSeconds: policySnapshot.intervalSeconds,
                freshnessSeconds: policySnapshot.freshnessSeconds,
                providerMinimumIntervalEnforced: false,
              }
            : effectiveProviderScanCadence({
                providerKey: bindingSnapshot.providerKey,
                intervalSeconds: policySnapshot.intervalSeconds,
                freshnessSeconds: policySnapshot.freshnessSeconds,
              });
        const nextRunAt = nextScanPolicyRunAfterDecision({
          dueAt: policySnapshot.nextRunAt,
          intervalSeconds: unavailableCadence.intervalSeconds,
          now,
          backoffUntil: null,
        });
        recordSkipped(skippedByReason, 'source_unavailable');
        recordDecision(decisions, recordedDecisions, {
          tenantId: policySnapshot.tenantId,
          workspaceId: policySnapshot.workspaceId,
          decision: {
            scanPolicyId: policySnapshot.id,
            sourceBindingId: policySnapshot.sourceBindingId,
            providerKey: bindingSnapshot?.providerKey,
            decision: 'skipped',
            reason: 'source_unavailable',
            policyDueAt: policySnapshot.nextRunAt,
            nextRunAt,
            configuredIntervalSeconds: policySnapshot.intervalSeconds,
            effectiveIntervalSeconds: unavailableCadence.intervalSeconds,
            freshnessSeconds: unavailableCadence.freshnessSeconds,
            providerMinimumIntervalEnforced:
              unavailableCadence.providerMinimumIntervalEnforced,
          },
        });
        await this.scanPolicies.save(
          policy.scheduleNext({
            nextRunAt,
          }),
        );
        continue;
      }

      const activeJob = await this.scanJobs.findActiveBySourceBinding({
        tenantId: policySnapshot.tenantId,
        workspaceId: policySnapshot.workspaceId,
        sourceBindingId: policySnapshot.sourceBindingId,
      });
      const latestJob = await this.scanJobs.findLatestBySourceBinding({
        tenantId: policySnapshot.tenantId,
        workspaceId: policySnapshot.workspaceId,
        sourceBindingId: policySnapshot.sourceBindingId,
      });
      const recentJobs = await this.scanJobs.listBySourceBinding({
        tenantId: policySnapshot.tenantId,
        workspaceId: policySnapshot.workspaceId,
        sourceBindingId: policySnapshot.sourceBindingId,
        limit: 5,
      });
      const idempotencyKey = scheduledScanIdempotencyKey(
        policySnapshot.id,
        policySnapshot.nextRunAt,
      );
      const existingJob = await this.scanJobs.findByIdempotencyKey({
        tenantId: policySnapshot.tenantId,
        workspaceId: policySnapshot.workspaceId,
        idempotencyKey,
      });
      const cadence = effectiveProviderScanCadence({
        providerKey: bindingSnapshot.providerKey,
        intervalSeconds: policySnapshot.intervalSeconds,
        freshnessSeconds: policySnapshot.freshnessSeconds,
      });
      const rateLimitBackoff = rateLimitBackoffUntil({
        latestJob,
        backoffSeconds: cadence.intervalSeconds,
        now,
      });
      const freshSuccess = isFreshSuccessfulScan({
        latestJob,
        freshnessSeconds: cadence.freshnessSeconds,
        now,
      });
      const providerFailureBackoff = providerFailureBackoffUntil({
        recentJobs: recentJobs.scanJobs,
        backoffSeconds: cadence.intervalSeconds,
        now,
      });
      const skipReason = schedulerSkipReason({
        activeJob,
        existingJob,
        freshSuccess,
        rateLimitBackoff,
        providerFailureBackoff,
      });

      if (skipReason === null) {
        const queueCommand = {
          tenantId: policySnapshot.tenantId,
          workspaceId: policySnapshot.workspaceId,
          scanJobId: this.ids.generate(),
          topicId: bindingSnapshot.topicId,
          sourceBindingId: policySnapshot.sourceBindingId,
          scanPolicyId: policySnapshot.id,
          providerKey: bindingSnapshot.providerKey,
          sourceQuery: sourceBindingScanQuery(bindingSnapshot),
          retryBudget: policySnapshot.retryBudget,
          correlationId: command.correlationId,
          causationId: idempotencyKey,
        };
        if (!(await this.scanQueue.canAccept(queueCommand))) {
          const nextRunAt = nextScanPolicyRunAfterDecision({
            dueAt: policySnapshot.nextRunAt,
            intervalSeconds: cadence.intervalSeconds,
            now,
            backoffUntil: null,
          });
          recordSkipped(skippedByReason, 'queue_backpressure');
          recordDecision(decisions, recordedDecisions, {
            tenantId: policySnapshot.tenantId,
            workspaceId: policySnapshot.workspaceId,
            causationId: idempotencyKey,
            decision: {
              scanPolicyId: policySnapshot.id,
              sourceBindingId: policySnapshot.sourceBindingId,
              providerKey: bindingSnapshot.providerKey,
              decision: 'skipped',
              reason: 'queue_backpressure',
              policyDueAt: policySnapshot.nextRunAt,
              nextRunAt,
              configuredIntervalSeconds: policySnapshot.intervalSeconds,
              effectiveIntervalSeconds: cadence.intervalSeconds,
              freshnessSeconds: cadence.freshnessSeconds,
              providerMinimumIntervalEnforced:
                cadence.providerMinimumIntervalEnforced,
            },
          });
          await this.scanPolicies.save(
            policy.scheduleNext({
              nextRunAt,
            }),
          );
          continue;
        }

        const job = ScanJob.request({
          id: queueCommand.scanJobId,
          tenantId: policySnapshot.tenantId,
          workspaceId: policySnapshot.workspaceId,
          sourceBindingId: policySnapshot.sourceBindingId,
          scanPolicyId: policySnapshot.id,
          idempotencyKey,
          requestedAt: now,
        });
        await this.scanJobs.save(job);
        await this.scanQueue.enqueue(queueCommand);
        await this.scanJobs.save(job.markEnqueued({ enqueuedAt: now }));
        enqueued += 1;
        recordDecision(decisions, recordedDecisions, {
          tenantId: policySnapshot.tenantId,
          workspaceId: policySnapshot.workspaceId,
          causationId: idempotencyKey,
          decision: {
            scanPolicyId: policySnapshot.id,
            sourceBindingId: policySnapshot.sourceBindingId,
            providerKey: bindingSnapshot.providerKey,
            decision: 'enqueued',
            reason: 'scan_policy_due_now',
            scanJobId: queueCommand.scanJobId,
            policyDueAt: policySnapshot.nextRunAt,
            nextRunAt: nextScanPolicyRunAfterDecision({
              dueAt: policySnapshot.nextRunAt,
              intervalSeconds: cadence.intervalSeconds,
              now,
              backoffUntil: null,
            }),
            configuredIntervalSeconds: policySnapshot.intervalSeconds,
            effectiveIntervalSeconds: cadence.intervalSeconds,
            freshnessSeconds: cadence.freshnessSeconds,
            providerMinimumIntervalEnforced:
              cadence.providerMinimumIntervalEnforced,
          },
        });
      } else {
        recordSkipped(skippedByReason, skipReason);
        const backoffUntil =
          rateLimitBackoff ?? providerFailureBackoff ?? undefined;
        recordDecision(decisions, recordedDecisions, {
          tenantId: policySnapshot.tenantId,
          workspaceId: policySnapshot.workspaceId,
          causationId: idempotencyKey,
          decision: {
            scanPolicyId: policySnapshot.id,
            sourceBindingId: policySnapshot.sourceBindingId,
            providerKey: bindingSnapshot.providerKey,
            decision: 'skipped',
            reason: skipReason,
            policyDueAt: policySnapshot.nextRunAt,
            nextRunAt: nextScanPolicyRunAfterDecision({
              dueAt: policySnapshot.nextRunAt,
              intervalSeconds: cadence.intervalSeconds,
              now,
              backoffUntil: rateLimitBackoff ?? providerFailureBackoff,
            }),
            configuredIntervalSeconds: policySnapshot.intervalSeconds,
            effectiveIntervalSeconds: cadence.intervalSeconds,
            freshnessSeconds: cadence.freshnessSeconds,
            providerMinimumIntervalEnforced:
              cadence.providerMinimumIntervalEnforced,
            backoffUntil,
          },
        });
      }

      await this.scanPolicies.save(
        policy.scheduleNext({
          nextRunAt: nextScanPolicyRunAfterDecision({
            dueAt: policySnapshot.nextRunAt,
            intervalSeconds: cadence.intervalSeconds,
            now,
            backoffUntil: rateLimitBackoff ?? providerFailureBackoff,
          }),
        }),
      );
    }

    await this.recordSchedulerDecisions({
      decisions: recordedDecisions,
      evaluatedAt: now,
      correlationId: command.correlationId,
    });

    return ok({
      scannedAt: now,
      evaluated: policies.length,
      enqueued,
      skipped: totalSkipped(skippedByReason),
      skippedByReason,
      ...(decisions === undefined ? {} : { decisions }),
    });
  }

  private async recordSchedulerDecisions(params: {
    readonly decisions: readonly RecordedScheduleDueScansDecision[];
    readonly evaluatedAt: Date;
    readonly correlationId: string;
  }): Promise<void> {
    if (this.schedulerDecisions === undefined || params.decisions.length === 0) {
      return;
    }

    await this.schedulerDecisions.recordBatch({
      records: params.decisions.map((decision) =>
        schedulerDecisionRecordFromDecision({
          id: this.ids.generate(),
          decision,
          evaluatedAt: params.evaluatedAt,
          correlationId: params.correlationId,
        }),
      ),
    });
  }
}

const recordDecision = (
  decisions: ScheduleDueScansDecision[] | undefined,
  recordedDecisions: RecordedScheduleDueScansDecision[],
  decision: RecordedScheduleDueScansDecision,
): void => {
  decisions?.push(decision.decision);
  recordedDecisions.push(decision);
};

const schedulerDecisionRecordFromDecision = (params: {
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
    ...(decision.decision === 'enqueued' ? { scanJobId: decision.scanJobId } : {}),
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

const schedulerDecisionKey = (decision: ScheduleDueScansDecision): string =>
  `scan-policy:${decision.scanPolicyId}:due-at:${decision.policyDueAt.toISOString()}`;

const emptySkipBreakdown = (): Record<ScheduleDueScansSkipReason, number> => ({
  active_scan: 0,
  duplicate_window: 0,
  fresh_success: 0,
  provider_failure_backoff: 0,
  queue_backpressure: 0,
  rate_limit_backoff: 0,
  source_unavailable: 0,
});

const recordSkipped = (
  breakdown: Record<ScheduleDueScansSkipReason, number>,
  reason: ScheduleDueScansSkipReason,
): void => {
  breakdown[reason] += 1;
};

const totalSkipped = (breakdown: ScheduleDueScansSkipBreakdown): number =>
  Object.values(breakdown).reduce((total, value) => total + value, 0);

const schedulerSkipReason = (params: {
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
