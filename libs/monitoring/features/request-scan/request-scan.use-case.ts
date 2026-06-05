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
  ScanQueuePort,
  SourceBindingRepositoryPort,
} from '../../ports';
import type { RequestScanCommand } from './request-scan.command';
import type { RequestScanResult } from './request-scan.result';

type RequestScanFailure = DomainError | Error;

export class RequestScanUseCase {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly scanPolicies: ScanPolicyRepositoryPort,
    private readonly scanJobs: ScanJobRepositoryPort,
    private readonly scanQueue: ScanQueuePort,
    private readonly outbox: OutboxPort,
    private readonly idempotency: IdempotencyPort,
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
      const result = { scanJobId: snapshot.id, created: false };
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

    const policySnapshot = policy.toSnapshot();
    const job = ScanJob.request({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
      scanPolicyId: policySnapshot.id,
      idempotencyKey: command.idempotencyKey,
      requestedAt: this.clock.now(),
    });
    const snapshot = job.toSnapshot();

    await this.scanJobs.save(job);

    const event: ScanRequestedEvent = {
      eventId: eventId(this.ids.generate()),
      eventType: 'monitoring.scan.requested',
      schemaVersion: 1,
      occurredAt: this.clock.now(),
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
      },
    };
    await this.outbox.append(event);
    await this.scanQueue.enqueue({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scanJobId: snapshot.id,
      sourceBindingId: snapshot.sourceBindingId,
      scanPolicyId: snapshot.scanPolicyId,
      correlationId: command.correlationId,
      causationId: command.idempotencyKey,
    });

    const result = { scanJobId: snapshot.id, created: true };
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
