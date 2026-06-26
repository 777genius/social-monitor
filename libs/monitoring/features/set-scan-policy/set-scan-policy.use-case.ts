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
import { validateProviderScanCadence } from '../shared/scan-cadence-policy';

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
    const validation = validate(command);

    if (validation !== null) {
      return err(validation);
    }

    const cached = await this.idempotency.get<SetScanPolicyResult>({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.set-scan-policy',
      key: command.idempotencyKey,
    });
    if (cached) {
      return ok(replayedResult(cached.value));
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
    const bindingSnapshot = binding.toSnapshot();
    const providerCadenceValidation = validateProviderScanCadence({
      providerKey: bindingSnapshot.providerKey,
      intervalSeconds: command.intervalSeconds,
    });
    if (providerCadenceValidation !== null) {
      return err(providerCadenceValidation);
    }

    const existing = await this.scanPolicies.findBySourceBinding({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });
    if (existing) {
      const snapshot = existing.toSnapshot();
      if (existing.hasConfiguration(command)) {
        const result = { scanPolicyId: snapshot.id, created: false, updated: false };
        await this.idempotency.set({
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          scope: 'monitoring.set-scan-policy',
          key: command.idempotencyKey,
          value: result,
        });
        return ok(result);
      }

      const updated = existing.reconfigure({
        intervalSeconds: command.intervalSeconds,
        freshnessSeconds: command.freshnessSeconds,
        retryBudget: command.retryBudget,
        nextRunAt: nextRunAfterUpdate(snapshot, command, this.clock.now()),
      });
      const updatedSnapshot = updated.toSnapshot();
      await this.scanPolicies.save(updated);
      await this.outbox.append(this.scanPolicySetEvent(command, updatedSnapshot));
      const result = { scanPolicyId: updatedSnapshot.id, created: false, updated: true };
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
    await this.outbox.append(this.scanPolicySetEvent(command, snapshot));

    const result = { scanPolicyId: snapshot.id, created: true, updated: false };
    await this.idempotency.set({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.set-scan-policy',
      key: command.idempotencyKey,
      value: result,
    });

    return ok(result);
  }

  private scanPolicySetEvent(command: SetScanPolicyCommand, snapshot: ReturnType<ScanPolicy['toSnapshot']>): ScanPolicySetEvent {
    return {
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
  }
}

const replayedResult = (result: SetScanPolicyResult): SetScanPolicyResult => ({
  scanPolicyId: result.scanPolicyId,
  created: false,
  updated: false,
});

const nextRunAfterUpdate = (
  previous: ReturnType<ScanPolicy['toSnapshot']>,
  command: SetScanPolicyCommand,
  now: Date,
): Date =>
  previous.intervalSeconds === command.intervalSeconds
    ? previous.nextRunAt
    : new Date(now.getTime() + command.intervalSeconds * 1000);

const validate = (command: SetScanPolicyCommand): DomainError | null => {
  if (command.sourceBindingId.trim().length === 0) {
    return new DomainError('validation.failed', 'Source binding id is required');
  }

  if (!Number.isInteger(command.intervalSeconds) || command.intervalSeconds < 60) {
    return new DomainError('validation.failed', 'Scan interval must be at least 60 seconds', {
      intervalSeconds: command.intervalSeconds,
    });
  }

  if (!Number.isInteger(command.freshnessSeconds) || command.freshnessSeconds < command.intervalSeconds) {
    return new DomainError('validation.failed', 'Freshness target must be greater than or equal to scan interval', {
      intervalSeconds: command.intervalSeconds,
      freshnessSeconds: command.freshnessSeconds,
    });
  }

  if (!Number.isInteger(command.retryBudget) || command.retryBudget < 0 || command.retryBudget > 10) {
    return new DomainError('validation.failed', 'Retry budget must be between 0 and 10', {
      retryBudget: command.retryBudget,
    });
  }

  return null;
};
