import type { IdGenerator } from '@social-monitor/shared-kernel';
import { prepareScanDispatch } from '../../application/scan-dispatch-plan';
import type { ScanPolicy } from '../../domain';
import type {
  ScanJobRepositoryPort,
  ScanDispatchPort,
  ScanJobHistoryReadPort,
  ScanPolicyRepositoryPort,
  ScanQueuePort,
  SourceBindingRepositoryPort,
} from '../../ports';
import { effectiveProviderScanCadence } from '../../domain/policies/provider-scan-cadence';
import { evaluateScheduledScanAdmission } from '../../domain/policies/scan-admission-policy';
import {
  nextScanPolicyRunAfterDecision,
  nextScanPolicyRunAfterFreshSuccess,
  nextScanPolicyRunAfterQueueBackpressure,
  scheduledScanIdempotencyKey,
} from '../../domain/policies/scan-schedule-policy';
import { sourceBindingScanQuery } from '../shared/source-binding-scan-query';
import type { ScheduleDueScansCommand } from './schedule-due-scans.command';
import type { ScheduleDueScansDecision } from './schedule-due-scans.result';
import {
  appliedSchedulerBackoffUntil,
  type emptySkipBreakdown,
  recordDecision,
  recordSkipped,
  type RecordedScheduleDueScansDecision,
} from './schedule-due-scans-decision-support';

type DuePolicyEvaluationPorts = {
  readonly sourceBindings: SourceBindingRepositoryPort;
  readonly scanPolicies: ScanPolicyRepositoryPort;
  readonly scanJobs: Omit<ScanJobRepositoryPort, 'save'> &
    Pick<ScanJobHistoryReadPort, 'listBySourceBinding'>;
  readonly scanQueue: Pick<ScanQueuePort, 'canAccept'>;
  readonly scanDispatch: ScanDispatchPort;
  readonly ids: IdGenerator;
};

/**
 * Evaluates and persists one due policy. The caller owns batch validation,
 * decision-history persistence and batch result aggregation.
 *
 * Every early return has already advanced the policy; never dispatch without
 * checking the durable idempotency window and queue admission.
 */
export async function evaluateDueScanPolicy(params: {
  readonly policy: ScanPolicy;
  readonly command: ScheduleDueScansCommand;
  readonly now: Date;
  readonly ports: DuePolicyEvaluationPorts;
  readonly skippedByReason: ReturnType<typeof emptySkipBreakdown>;
  readonly decisions?: ScheduleDueScansDecision[];
  readonly recordedDecisions: RecordedScheduleDueScansDecision[];
}): Promise<number> {
  const { policy, command, now, ports, skippedByReason, decisions, recordedDecisions } = params;
  let enqueued = 0;
  const policySnapshot = policy.toSnapshot();
  const binding = await ports.sourceBindings.findById({
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
    await ports.scanPolicies.save(
      policy.scheduleNext({
        nextRunAt,
      }),
    );
    return 0;
  }

  const activeJob = await ports.scanJobs.findActiveBySourceBinding({
    tenantId: policySnapshot.tenantId,
    workspaceId: policySnapshot.workspaceId,
    sourceBindingId: policySnapshot.sourceBindingId,
  });
  const latestJob = await ports.scanJobs.findLatestBySourceBinding({
    tenantId: policySnapshot.tenantId,
    workspaceId: policySnapshot.workspaceId,
    sourceBindingId: policySnapshot.sourceBindingId,
  });
  const recentJobs = await ports.scanJobs.listBySourceBinding({
    tenantId: policySnapshot.tenantId,
    workspaceId: policySnapshot.workspaceId,
    sourceBindingId: policySnapshot.sourceBindingId,
    limit: 5,
  });
  const idempotencyKey = scheduledScanIdempotencyKey(
    policySnapshot.id,
    policySnapshot.nextRunAt,
  );
  const existingJob = await ports.scanJobs.findByIdempotencyKey({
    tenantId: policySnapshot.tenantId,
    workspaceId: policySnapshot.workspaceId,
    idempotencyKey,
  });
  const cadence = effectiveProviderScanCadence({
    providerKey: bindingSnapshot.providerKey,
    intervalSeconds: policySnapshot.intervalSeconds,
    freshnessSeconds: policySnapshot.freshnessSeconds,
  });
  const admission = evaluateScheduledScanAdmission({
    activeScan: activeJob !== null,
    duplicateWindow: existingJob !== null,
    latestJob: latestJob?.toSnapshot() ?? null,
    recentJobs: recentJobs.scanJobs.map((job) => job.toSnapshot()),
    cadence,
    now,
  });
  const { rateLimitBackoff, providerFailureBackoff, freshSuccess, reason: skipReason } = admission;
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
  const appliedSkipBackoffUntil = appliedSchedulerBackoffUntil({
    skipReason,
    rateLimitBackoff,
    providerFailureBackoff,
  });

  if (skipReason === null) {
    const queueCommand = {
      tenantId: policySnapshot.tenantId,
      workspaceId: policySnapshot.workspaceId,
      scanJobId: ports.ids.generate(),
      interestId: bindingSnapshot.interestId,
      sourceBindingId: policySnapshot.sourceBindingId,
      scanPolicyId: policySnapshot.id,
      providerKey: bindingSnapshot.providerKey,
      sourceQuery: sourceBindingScanQuery(bindingSnapshot),
      retryBudget: policySnapshot.retryBudget,
      correlationId: command.correlationId,
      causationId: idempotencyKey,
    };
    if (!(await ports.scanQueue.canAccept(queueCommand))) {
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
      await ports.scanPolicies.save(
        policy.scheduleNext({
          nextRunAt,
        }),
      );
      return 0;
    }

    await ports.scanDispatch.storeEnqueuedScan(prepareScanDispatch({
      command: queueCommand,
      idempotencyKey,
      requestedAt: now,
    }));
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

  await ports.scanPolicies.save(
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
  return enqueued;
}
