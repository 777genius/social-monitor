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
  ScanSchedulerDecisionHistoryPort,
  ScanQueuePort,
  SourceBindingRepositoryPort,
} from '../../ports';
import type { ScheduleDueScansCommand } from './schedule-due-scans.command';
import type {
  ScheduleDueScansDecision,
  ScheduleDueScansResult,
} from './schedule-due-scans.result';
import {
  appliedSchedulerBackoffUntil,
  emptySkipBreakdown,
  recordDecision,
  recordSkipped,
  schedulerDecisionRecordFromDecision,
  schedulerSkipReason,
  totalSkipped,
  type RecordedScheduleDueScansDecision,
} from './schedule-due-scans-decision-support';
import { effectiveProviderScanCadence } from '../shared/scan-cadence-policy';
import {
  boundedTransientProviderBackoffSeconds,
  isFreshSuccessfulScan,
  providerFailureBackoffUntil,
  rateLimitBackoffUntil,
} from '../shared/scan-freshness-guard';
import {
  nextScanPolicyRunAfterDecision,
  nextScanPolicyRunAfterFreshSuccess,
  nextScanPolicyRunAfterQueueBackpressure,
  scheduledScanIdempotencyKey,
} from '../shared/scan-scheduler-decision-policy';
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
      const transientProviderBackoffSeconds =
        boundedTransientProviderBackoffSeconds({
          intervalSeconds: cadence.intervalSeconds,
        });
      const rateLimitBackoff = rateLimitBackoffUntil({
        latestJob,
        backoffSeconds: transientProviderBackoffSeconds,
        now,
      });
      const freshSuccess = isFreshSuccessfulScan({
        latestJob,
        freshnessSeconds: cadence.freshnessSeconds,
        now,
      });
      const latestJobSnapshot = latestJob?.toSnapshot();
      const freshSuccessNextRunAt =
        freshSuccess && latestJobSnapshot?.completedAt !== undefined
          ? nextScanPolicyRunAfterFreshSuccess({
              dueAt: policySnapshot.nextRunAt,
              intervalSeconds: cadence.intervalSeconds,
              freshnessDeadlineAt: new Date(
                latestJobSnapshot.completedAt.getTime() +
                  cadence.freshnessSeconds * 1000,
              ),
              now,
            })
          : null;
      const providerFailureBackoff = providerFailureBackoffUntil({
        recentJobs: recentJobs.scanJobs,
        backoffSeconds: transientProviderBackoffSeconds,
        now,
      });
      const skipReason = schedulerSkipReason({
        activeJob,
        existingJob,
        freshSuccess,
        rateLimitBackoff,
        providerFailureBackoff,
      });
      const appliedSkipBackoffUntil = appliedSchedulerBackoffUntil({
        skipReason,
        rateLimitBackoff,
        providerFailureBackoff,
      });

      if (skipReason === null) {
        const queueCommand = {
          tenantId: policySnapshot.tenantId,
          workspaceId: policySnapshot.workspaceId,
          scanJobId: this.ids.generate(),
          interestId: bindingSnapshot.interestId,
          sourceBindingId: policySnapshot.sourceBindingId,
          scanPolicyId: policySnapshot.id,
          providerKey: bindingSnapshot.providerKey,
          sourceQuery: sourceBindingScanQuery(bindingSnapshot),
          retryBudget: policySnapshot.retryBudget,
          correlationId: command.correlationId,
          causationId: idempotencyKey,
        };
        if (!(await this.scanQueue.canAccept(queueCommand))) {
          const nextRunAt = nextScanPolicyRunAfterQueueBackpressure({
            intervalSeconds: cadence.intervalSeconds,
            now,
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
        const backoffUntil = appliedSkipBackoffUntil ?? undefined;
        const nextRunAt =
          freshSuccessNextRunAt ??
          appliedSkipBackoffUntil ??
          nextScanPolicyRunAfterDecision({
            dueAt: policySnapshot.nextRunAt,
            intervalSeconds: cadence.intervalSeconds,
            now,
            backoffUntil: null,
          });
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
            nextRunAt,
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
          nextRunAt:
            freshSuccessNextRunAt ??
            appliedSkipBackoffUntil ??
            nextScanPolicyRunAfterDecision({
              dueAt: policySnapshot.nextRunAt,
              intervalSeconds: cadence.intervalSeconds,
              now,
              backoffUntil: null,
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
    if (
      this.schedulerDecisions === undefined ||
      params.decisions.length === 0
    ) {
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
