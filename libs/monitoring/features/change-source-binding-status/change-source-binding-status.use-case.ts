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

import { type SourceBindingStatusChangedEvent } from '../../domain';
import type {
  IdempotencyPort,
  OutboxPort,
  SourceBindingRepositoryPort,
} from '../../ports';
import type { ChangeSourceBindingStatusCommand } from './change-source-binding-status.command';
import type { ChangeSourceBindingStatusResult } from './change-source-binding-status.result';

type ChangeSourceBindingStatusFailure = DomainError | Error;

export class ChangeSourceBindingStatusUseCase {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly outbox: OutboxPort,
    private readonly idempotency: IdempotencyPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: ChangeSourceBindingStatusCommand,
  ): Promise<Result<ChangeSourceBindingStatusResult, ChangeSourceBindingStatusFailure>> {
    const cached = await this.idempotency.get<ChangeSourceBindingStatusResult>({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.change-source-binding-status',
      key: command.idempotencyKey,
    });
    if (cached) {
      return ok({ ...cached.value, changed: false });
    }

    if (command.status !== 'enabled' && command.status !== 'paused') {
      return err(new DomainError('validation.failed', 'Source binding status is not supported', {
        status: command.status,
      }));
    }

    const binding = await this.sourceBindings.findById({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });
    if (!binding) {
      return err(new DomainError('resource.not_found', 'Source binding not found', {
        sourceBindingId: command.sourceBindingId,
      }));
    }

    const snapshot = binding.toSnapshot();
    if (snapshot.interestId !== command.interestId) {
      return err(new DomainError('resource.not_found', 'Source binding not found for interest', {
        interestId: command.interestId,
        sourceBindingId: command.sourceBindingId,
      }));
    }

    if (snapshot.status === command.status) {
      const result = {
        sourceBindingId: snapshot.id,
        status: snapshot.status,
        changed: false,
      };
      await this.cacheResult(command, result);

      return ok(result);
    }

    const updatedBinding = command.status === 'paused'
      ? binding.pause()
      : binding.resume();
    const updatedSnapshot = updatedBinding.toSnapshot();

    await this.sourceBindings.save(updatedBinding);

    const event: SourceBindingStatusChangedEvent = {
      eventId: eventId(this.ids.generate()),
      eventType: 'monitoring.source-binding.status-changed',
      schemaVersion: 1,
      occurredAt: this.clock.now(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      correlationId: correlationId(command.correlationId),
      causationId: causationId(command.idempotencyKey),
      payload: {
        sourceBindingId: updatedSnapshot.id,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        interestId: updatedSnapshot.interestId,
        providerKey: updatedSnapshot.providerKey,
        previousStatus: snapshot.status,
        status: updatedSnapshot.status,
      },
    };
    await this.outbox.append(event);

    const result = {
      sourceBindingId: updatedSnapshot.id,
      status: updatedSnapshot.status,
      changed: true,
    };
    await this.cacheResult(command, result);

    return ok(result);
  }

  private async cacheResult(
    command: ChangeSourceBindingStatusCommand,
    result: ChangeSourceBindingStatusResult,
  ): Promise<void> {
    await this.idempotency.set({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.change-source-binding-status',
      key: command.idempotencyKey,
      value: result,
    });
  }
}
