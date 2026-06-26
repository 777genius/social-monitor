import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { ScanJob } from '../../domain';
import type {
  ScanJobRepositoryPort,
  ScanJobHistoryReadPort,
  ScanPolicyRepositoryPort,
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
import { sourceBindingScanQuery } from '../shared/source-binding-scan-query';

type ScheduleDueScansFailure = DomainError | Error;
type ScanJobRecentHistoryReadPort = Pick<
  ScanJobHistoryReadPort,
  'listBySourceBinding'
>;

export class ScheduleDueScansUseCase {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly scanPolicies: ScanPolicyRepositoryPort,
    private readonly scanJobs: ScanJobRepositoryPort &
      ScanJobRecentHistoryReadPort,
    private readonly scanQueue: ScanQueuePort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
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
        recordSkipped(skippedByReason, 'source_unavailable');
        recordDecision(decisions, {
          scanPolicyId: policySnapshot.id,
          sourceBindingId: policySnapshot.sourceBindingId,
          providerKey: bindingSnapshot?.providerKey,
          decision: 'skipped',
          reason: 'source_unavailable',
          policyDueAt: policySnapshot.nextRunAt,
          nextRunAt: policySnapshot.nextRunAt,
          configuredIntervalSeconds: policySnapshot.intervalSeconds,
        });
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
      const idempotencyKey = scheduledIdempotencyKey(
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
          recordSkipped(skippedByReason, 'queue_backpressure');
          recordDecision(decisions, {
            scanPolicyId: policySnapshot.id,
            sourceBindingId: policySnapshot.sourceBindingId,
            providerKey: bindingSnapshot.providerKey,
            decision: 'skipped',
            reason: 'queue_backpressure',
            policyDueAt: policySnapshot.nextRunAt,
            nextRunAt: policySnapshot.nextRunAt,
            configuredIntervalSeconds: policySnapshot.intervalSeconds,
            effectiveIntervalSeconds: cadence.intervalSeconds,
            freshnessSeconds: cadence.freshnessSeconds,
            providerMinimumIntervalEnforced:
              cadence.providerMinimumIntervalEnforced,
          });
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
        recordDecision(decisions, {
          scanPolicyId: policySnapshot.id,
          sourceBindingId: policySnapshot.sourceBindingId,
          providerKey: bindingSnapshot.providerKey,
          decision: 'enqueued',
          reason: 'scan_policy_due_now',
          scanJobId: queueCommand.scanJobId,
          policyDueAt: policySnapshot.nextRunAt,
          nextRunAt: nextRunAtAfterSchedulerDecision({
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
        });
      } else {
        recordSkipped(skippedByReason, skipReason);
        const backoffUntil =
          rateLimitBackoff ?? providerFailureBackoff ?? undefined;
        recordDecision(decisions, {
          scanPolicyId: policySnapshot.id,
          sourceBindingId: policySnapshot.sourceBindingId,
          providerKey: bindingSnapshot.providerKey,
          decision: 'skipped',
          reason: skipReason,
          policyDueAt: policySnapshot.nextRunAt,
          nextRunAt: nextRunAtAfterSchedulerDecision({
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
        });
      }

      await this.scanPolicies.save(
        policy.scheduleNext({
          nextRunAt: nextRunAtAfterSchedulerDecision({
            dueAt: policySnapshot.nextRunAt,
            intervalSeconds: cadence.intervalSeconds,
            now,
            backoffUntil: rateLimitBackoff ?? providerFailureBackoff,
          }),
        }),
      );
    }

    return ok({
      scannedAt: now,
      evaluated: policies.length,
      enqueued,
      skipped: totalSkipped(skippedByReason),
      skippedByReason,
      ...(decisions === undefined ? {} : { decisions }),
    });
  }
}

const recordDecision = (
  decisions: ScheduleDueScansDecision[] | undefined,
  decision: ScheduleDueScansDecision,
): void => {
  decisions?.push(decision);
};

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

const scheduledIdempotencyKey = (scanPolicyId: string, dueAt: Date): string =>
  `scheduled:${scanPolicyId}:${dueAt.toISOString()}`;

const nextRunAtAfterSchedulerDecision = (params: {
  readonly dueAt: Date;
  readonly intervalSeconds: number;
  readonly now: Date;
  readonly backoffUntil: Date | null;
}): Date => {
  const intervalMs = params.intervalSeconds * 1000;
  const intervalNextRunAt = new Date(params.dueAt.getTime() + intervalMs);

  if (params.backoffUntil !== null) {
    const backoffNextRunAt =
      params.backoffUntil.getTime() > intervalNextRunAt.getTime()
        ? params.backoffUntil
        : intervalNextRunAt;

    if (backoffNextRunAt.getTime() > params.now.getTime()) {
      return backoffNextRunAt;
    }
  }

  const elapsedMs = Math.max(0, params.now.getTime() - params.dueAt.getTime());
  const elapsedIntervals = Math.floor(elapsedMs / intervalMs) + 1;

  return new Date(params.dueAt.getTime() + elapsedIntervals * intervalMs);
};
