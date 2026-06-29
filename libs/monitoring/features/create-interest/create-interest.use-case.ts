import {
  type Clock,
  type IdGenerator,
  causationId,
  correlationId,
  DomainError,
  eventId,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { Interest, type InterestCreatedEvent } from '../../domain';
import type { IdempotencyPort, OutboxPort, InterestRepositoryPort } from '../../ports';
import type { MonitoringCapacityLimits } from '../shared/monitoring-capacity-limits';
import type { CreateInterestCommand } from './create-interest.command';
import type { CreateInterestResult } from './create-interest.result';

type CreateInterestFailure = DomainError | Error;

export class CreateInterestUseCase {
  constructor(
    private readonly interests: InterestRepositoryPort,
    private readonly outbox: OutboxPort,
    private readonly idempotency: IdempotencyPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly capacityLimits: MonitoringCapacityLimits = {},
  ) {}

  async execute(command: CreateInterestCommand): Promise<Result<CreateInterestResult, CreateInterestFailure>> {
    const existingResult = await this.idempotency.get<CreateInterestResult>({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.create-interest',
      key: command.idempotencyKey,
    });

    if (existingResult) {
      return ok({ ...existingResult.value, created: false });
    }

    const existingInterest = await this.interests.findByName({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      name: command.name.trim(),
    });

    if (existingInterest) {
      const snapshot = existingInterest.toSnapshot();
      const result = { interestId: snapshot.id, created: false };
      await this.idempotency.set({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        scope: 'monitoring.create-interest',
        key: command.idempotencyKey,
        value: result,
      });
      return ok(result);
    }

    const maxInterestsPerWorkspace = this.capacityLimits.maxInterestsPerWorkspace;
    if (maxInterestsPerWorkspace !== undefined) {
      const currentInterests = await this.interests.list({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        limit: maxInterestsPerWorkspace,
      });
      if (currentInterests.interests.length >= maxInterestsPerWorkspace) {
        return err(new DomainError('operation.quota_exceeded', 'Workspace interest capacity limit reached', {
          limit: String(maxInterestsPerWorkspace),
        }));
      }
    }

    const interest = Interest.create({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      name: command.name,
      query: command.query,
      createdAt: this.clock.now(),
    });
    const snapshot = interest.toSnapshot();

    await this.interests.save(interest);

    const event: InterestCreatedEvent = {
      eventId: eventId(this.ids.generate()),
      eventType: 'monitoring.interest.created',
      schemaVersion: 1,
      occurredAt: this.clock.now(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      correlationId: correlationId(command.correlationId),
      causationId: causationId(command.idempotencyKey),
      payload: {
        interestId: snapshot.id,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        name: snapshot.name,
        query: snapshot.query,
      },
    };

    await this.outbox.append(event);

    const result = { interestId: snapshot.id, created: true };
    await this.idempotency.set({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.create-interest',
      key: command.idempotencyKey,
      value: result,
    });

    return ok(result);
  }
}
