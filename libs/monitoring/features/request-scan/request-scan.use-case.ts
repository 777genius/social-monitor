import {
  type Clock,
  DomainError,
  type IdGenerator,
  causationId,
  correlationId,
  eventId,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { ScanJob, type ScanRequestedEvent } from '../../domain';
import type {
  IdempotencyPort,
  OutboxPort,
  ScanJobRepositoryPort,
  ScanPolicyRepositoryPort,
  ScanRequestQuotaPort,
  ScanQueuePort,
  SourceBindingRepositoryPort,
} from '../../ports';
import type { RequestScanCommand } from './request-scan.command';
import type { RequestScanResult } from './request-scan.result';
import { sourceBindingScanQuery } from '../shared/source-binding-scan-query';

type RequestScanFailure = DomainError | Error;

export class RequestScanUseCase {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly scanPolicies: ScanPolicyRepositoryPort,
    private readonly scanJobs: ScanJobRepositoryPort,
    private readonly scanQueue: ScanQueuePort,
    private readonly outbox: OutboxPort,
    private readonly idempotency: IdempotencyPort,
    private readonly scanRequestQuota: ScanRequestQuotaPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: RequestScanCommand): Promise<Result<RequestScanResult, RequestScanFailure>> {
    const cached = await this.idempotency.get<RequestScanResult>({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.request-scan',
      key: command.idempotencyKey,
    });
    if (cached) {
      return ok({ ...cached.value, created: false });
    }

    const existingJob = await this.scanJobs.findByIdempotencyKey({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      idempotencyKey: command.idempotencyKey,
    });
    if (existingJob) {
      const snapshot = existingJob.toSnapshot();
      const result = { scanJobId: snapshot.id, status: snapshot.status, created: false };
      await this.cacheResult(command, result);
      return ok(result);
    }

    const binding = await this.sourceBindings.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });
    if (!binding) {
      return err(new DomainError('resource.not_found', 'Source binding not found', { sourceBindingId: command.sourceBindingId }));
    }
    const bindingSnapshot = binding.toSnapshot();

    if (bindingSnapshot.status !== 'enabled') {
      return err(new DomainError('validation.failed', 'Source binding is paused and cannot accept new scan requests', {
        sourceBindingId: command.sourceBindingId,
        status: bindingSnapshot.status,
      }));
    }

    const policy = await this.scanPolicies.findBySourceBinding({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });
    if (!policy) {
      return err(new DomainError('validation.failed', 'Scan policy must be set before requesting a scan', {
        sourceBindingId: command.sourceBindingId,
      }));
    }

    const activeJob = await this.scanJobs.findActiveBySourceBinding({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });
    if (activeJob !== null) {
      const snapshot = activeJob.toSnapshot();
      const result = { scanJobId: snapshot.id, status: snapshot.status, created: false };
      await this.cacheResult(command, result);
      return ok(result);
    }

    const policySnapshot = policy.toSnapshot();
    const now = this.clock.now();
    const latestJob = await this.scanJobs.findLatestBySourceBinding({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });
    if (latestJob !== null && isFreshLatestScan({
      latestJob,
      freshnessSeconds: policySnapshot.freshnessSeconds,
      now,
    })) {
      const snapshot = latestJob.toSnapshot();
      const result = { scanJobId: snapshot.id, status: snapshot.status, created: false };
      await this.cacheResult(command, result);
      return ok(result);
    }

    const queueCommand = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scanJobId: this.ids.generate(),
      topicId: bindingSnapshot.topicId,
      sourceBindingId: command.sourceBindingId,
      scanPolicyId: policySnapshot.id,
      providerKey: bindingSnapshot.providerKey,
      sourceQuery: sourceBindingScanQuery(bindingSnapshot),
      retryBudget: policySnapshot.retryBudget,
      correlationId: command.correlationId,
      causationId: command.idempotencyKey,
    };
    if (!(await this.scanQueue.canAccept(queueCommand))) {
      return err(new DomainError('operation.backpressure', 'Scan queue backpressure limit reached', {
        sourceBindingId: command.sourceBindingId,
      }));
    }

    const quota = await this.scanRequestQuota.reserveManualScanRequest({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });
    if (!quota.ok) {
      return err(quota.error);
    }

    const job = ScanJob.request({
      id: queueCommand.scanJobId,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
      scanPolicyId: policySnapshot.id,
      idempotencyKey: command.idempotencyKey,
      requestedAt: now,
    });
    const snapshot = job.toSnapshot();

    await this.scanJobs.save(job);

    const event: ScanRequestedEvent = {
      eventId: eventId(this.ids.generate()),
      eventType: 'monitoring.scan.requested',
      schemaVersion: 1,
      occurredAt: now,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      correlationId: correlationId(command.correlationId),
      causationId: causationId(command.idempotencyKey),
      payload: {
        scanJobId: snapshot.id,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        sourceBindingId: snapshot.sourceBindingId,
        scanPolicyId: snapshot.scanPolicyId,
        providerKey: bindingSnapshot.providerKey,
      },
    };
    await this.outbox.append(event);
    await this.scanQueue.enqueue({
      ...queueCommand,
    });
    const enqueuedJob = job.markEnqueued({ enqueuedAt: now });
    await this.scanJobs.save(enqueuedJob);

    const result = { scanJobId: snapshot.id, status: enqueuedJob.toSnapshot().status, created: true };
    await this.cacheResult(command, result);
    return ok(result);
  }

  private async cacheResult(command: RequestScanCommand, result: RequestScanResult): Promise<void> {
    await this.idempotency.set({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.request-scan',
      key: command.idempotencyKey,
      value: result,
    });
  }
}

const isFreshLatestScan = (params: {
  readonly latestJob: ScanJob | null;
  readonly freshnessSeconds: number;
  readonly now: Date;
}): boolean => {
  const latestSnapshot = params.latestJob?.toSnapshot();

  return (
    latestSnapshot?.status === 'succeeded' &&
    latestSnapshot.completedAt !== undefined &&
    latestSnapshot.completedAt.getTime() + params.freshnessSeconds * 1000 > params.now.getTime()
  );
};
