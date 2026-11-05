import {
  type Clock,
  type IdGenerator,
  causationId,
  correlationId,
  DomainError,
  eventId,
  err,
  type Result,
} from '@social-monitor/shared-kernel';

import { Interest, type InterestCreatedEvent } from '../../domain';
import type { IdempotencyPort } from '../../ports';
import { INTEREST_CREATION_SCOPE, type InterestCreationCommitPort } from '../../application/contracts/interest-creation-commit';
import { replayInterestCreation } from '../../application/interest-creation-decision';
import type { MonitoringCapacityLimits } from '../shared/monitoring-capacity-limits';
import type { CreateInterestCommand } from './create-interest.command';
import type { CreateInterestResult } from './create-interest.result';

type CreateInterestFailure = DomainError | Error;

export class CreateInterestUseCase {
  constructor(
    private readonly creation: InterestCreationCommitPort,
    private readonly idempotency: Pick<IdempotencyPort, 'get'>,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly capacityLimits: MonitoringCapacityLimits = {},
  ) {}

  async execute(command: CreateInterestCommand): Promise<Result<CreateInterestResult, CreateInterestFailure>> {
    const existingResult = await this.idempotency.get<CreateInterestResult>({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: INTEREST_CREATION_SCOPE,
      key: command.idempotencyKey,
    });

    if (existingResult) {
      return replayInterestCreation(existingResult.value);
    }
    let interest: Interest;
    const createdAt = this.clock.now();
    const interestId = this.ids.generate();
    try {
      interest = Interest.create({
        id: interestId,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        name: command.name,
        query: command.query,
        createdAt,
      });
    } catch (error) {
      return err(new DomainError('validation.failed', error instanceof Error ? error.message : 'Invalid interest'));
    }
    const snapshot = interest.toSnapshot();

    const event: InterestCreatedEvent = {
      eventId: eventId(this.ids.generate()),
      eventType: 'monitoring.interest.created',
      schemaVersion: 1,
      occurredAt: createdAt,
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

    return this.creation.commit({
      interest, event, idempotencyKey: command.idempotencyKey,
      receiptId: this.ids.generate(),
      maxInterestsPerWorkspace: this.capacityLimits.maxInterestsPerWorkspace,
    });
  }
}
