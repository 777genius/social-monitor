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

import { ScanPolicy, type ScanPolicySetEvent } from '../../domain';
import type {
  IdempotencyPort,
  OutboxPort,
  ScanPolicyRepositoryPort,
  SourceBindingRepositoryPort,
} from '../../ports';
import type { SetScanPolicyCommand } from './set-scan-policy.command';
import type { SetScanPolicyResult } from './set-scan-policy.result';

type SetScanPolicyFailure = DomainError | Error;

export class SetScanPolicyUseCase {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly scanPolicies: ScanPolicyRepositoryPort,
    private readonly outbox: OutboxPort,
    private readonly idempotency: IdempotencyPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: SetScanPolicyCommand): Promise<Result<SetScanPolicyResult, SetScanPolicyFailure>> {
    const cached = await this.idempotency.get<SetScanPolicyResult>({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.set-scan-policy',
      key: command.idempotencyKey,
    });
    if (cached) {
      return ok({ ...cached.value, created: false });
    }

    const binding = await this.sourceBindings.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });
    if (!binding) {
      return err(
        new DomainError('resource.not_found', 'Source binding not found', {
          sourceBindingId: command.sourceBindingId,
        }),
      );
    }

    const existing = await this.scanPolicies.findBySourceBinding({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });
    if (existing) {
      const snapshot = existing.toSnapshot();
      const result = { scanPolicyId: snapshot.id, created: false };
      await this.idempotency.set({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        scope: 'monitoring.set-scan-policy',
        key: command.idempotencyKey,
        value: result,
      });
      return ok(result);
    }

    const policy = ScanPolicy.create({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
      intervalSeconds: command.intervalSeconds,
      freshnessSeconds: command.freshnessSeconds,
      retryBudget: command.retryBudget,
      nextRunAt: this.clock.now(),
      createdAt: this.clock.now(),
    });
    const snapshot = policy.toSnapshot();

    await this.scanPolicies.save(policy);

    const event: ScanPolicySetEvent = {
      eventId: eventId(this.ids.generate()),
      eventType: 'monitoring.scan-policy.set',
      schemaVersion: 1,
      occurredAt: this.clock.now(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      correlationId: correlationId(command.correlationId),
      causationId: causationId(command.idempotencyKey),
      payload: {
        scanPolicyId: snapshot.id,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        sourceBindingId: snapshot.sourceBindingId,
        intervalSeconds: snapshot.intervalSeconds,
        freshnessSeconds: snapshot.freshnessSeconds,
        retryBudget: snapshot.retryBudget,
      },
    };
    await this.outbox.append(event);

    const result = { scanPolicyId: snapshot.id, created: true };
    await this.idempotency.set({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.set-scan-policy',
      key: command.idempotencyKey,
      value: result,
    });

    return ok(result);
  }
}
