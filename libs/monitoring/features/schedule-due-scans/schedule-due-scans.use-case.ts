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
  ScanPolicyRepositoryPort,
  ScanQueuePort,
  SourceBindingRepositoryPort,
} from '../../ports';
import type { ScheduleDueScansCommand } from './schedule-due-scans.command';
import type { ScheduleDueScansResult } from './schedule-due-scans.result';
import { isFreshSuccessfulScan, rateLimitBackoffUntil } from '../shared/scan-freshness-guard';
import { sourceBindingScanQuery } from '../shared/source-binding-scan-query';

type ScheduleDueScansFailure = DomainError | Error;

export class ScheduleDueScansUseCase {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly scanPolicies: ScanPolicyRepositoryPort,
    private readonly scanJobs: ScanJobRepositoryPort,
    private readonly scanQueue: ScanQueuePort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: ScheduleDueScansCommand): Promise<Result<ScheduleDueScansResult, ScheduleDueScansFailure>> {
    if (!Number.isInteger(command.limit) || command.limit < 1 || command.limit > 100) {
      return err(new DomainError('validation.failed', 'Schedule due scans limit must be between 1 and 100'));
    }

    const now = this.clock.now();
    const policies = await this.scanPolicies.findDue({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      now,
      limit: command.limit,
    });
    let enqueued = 0;
    let skipped = 0;

    for (const policy of policies) {
      const policySnapshot = policy.toSnapshot();
      const binding = await this.sourceBindings.findById({
        tenantId: policySnapshot.tenantId,
        workspaceId: policySnapshot.workspaceId,
        sourceBindingId: policySnapshot.sourceBindingId,
      });

      const bindingSnapshot = binding?.toSnapshot();
      if (bindingSnapshot === undefined || bindingSnapshot.status !== 'enabled') {
        skipped += 1;
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
      const idempotencyKey = scheduledIdempotencyKey(policySnapshot.id, policySnapshot.nextRunAt);
      const existingJob = await this.scanJobs.findByIdempotencyKey({
        tenantId: policySnapshot.tenantId,
        workspaceId: policySnapshot.workspaceId,
        idempotencyKey,
      });
      const rateLimitBackoff = rateLimitBackoffUntil({
        latestJob,
        backoffSeconds: policySnapshot.intervalSeconds,
        now,
      });

      if (activeJob === null && existingJob === null && !isFreshSuccessfulScan({
        latestJob,
        freshnessSeconds: policySnapshot.freshnessSeconds,
        now,
      }) && rateLimitBackoff === null) {
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
          skipped += 1;
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
      } else {
        skipped += 1;
      }

      await this.scanPolicies.save(policy.scheduleNext({
        nextRunAt: nextRunAtAfterSchedulerDecision({
          dueAt: policySnapshot.nextRunAt,
          intervalSeconds: policySnapshot.intervalSeconds,
          now,
          rateLimitBackoff,
        }),
      }));
    }

    return ok({
      scannedAt: now,
      evaluated: policies.length,
      enqueued,
      skipped,
    });
  }
}

const scheduledIdempotencyKey = (scanPolicyId: string, dueAt: Date): string =>
  `scheduled:${scanPolicyId}:${dueAt.toISOString()}`;

const nextRunAtAfterSchedulerDecision = (params: {
  readonly dueAt: Date;
  readonly intervalSeconds: number;
  readonly now: Date;
  readonly rateLimitBackoff: Date | null;
}): Date => {
  const intervalMs = params.intervalSeconds * 1000;
  const intervalNextRunAt = new Date(params.dueAt.getTime() + intervalMs);

  if (params.rateLimitBackoff !== null) {
    const backoffNextRunAt = params.rateLimitBackoff.getTime() > intervalNextRunAt.getTime()
      ? params.rateLimitBackoff
      : intervalNextRunAt;

    if (backoffNextRunAt.getTime() > params.now.getTime()) {
      return backoffNextRunAt;
    }
  }

  const elapsedMs = Math.max(0, params.now.getTime() - params.dueAt.getTime());
  const elapsedIntervals = Math.floor(elapsedMs / intervalMs) + 1;

  return new Date(params.dueAt.getTime() + elapsedIntervals * intervalMs);
};
