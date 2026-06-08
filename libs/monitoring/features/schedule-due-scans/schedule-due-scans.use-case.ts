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

      if (binding === null || binding.toSnapshot().status !== 'enabled') {
        skipped += 1;
        continue;
      }

      const activeJob = await this.scanJobs.findActiveBySourceBinding({
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

      if (activeJob === null && existingJob === null) {
        const queueCommand = {
          tenantId: policySnapshot.tenantId,
          workspaceId: policySnapshot.workspaceId,
          scanJobId: this.ids.generate(),
          sourceBindingId: policySnapshot.sourceBindingId,
          scanPolicyId: policySnapshot.id,
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
        nextRunAt: new Date(policySnapshot.nextRunAt.getTime() + policySnapshot.intervalSeconds * 1000),
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
