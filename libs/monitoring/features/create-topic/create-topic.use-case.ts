import {
  type Clock,
  type IdGenerator,
  causationId,
  correlationId,
  eventId,
  ok,
  type Result,
  type DomainError,
} from '@social-monitor/shared-kernel';

import { Topic, type TopicCreatedEvent } from '../../domain';
import type { IdempotencyPort, OutboxPort, TopicRepositoryPort } from '../../ports';
import type { CreateTopicCommand } from './create-topic.command';
import type { CreateTopicResult } from './create-topic.result';

type CreateTopicFailure = DomainError | Error;

export class CreateTopicUseCase {
  constructor(
    private readonly topics: TopicRepositoryPort,
    private readonly outbox: OutboxPort,
    private readonly idempotency: IdempotencyPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: CreateTopicCommand): Promise<Result<CreateTopicResult, CreateTopicFailure>> {
    const existingResult = await this.idempotency.get<CreateTopicResult>({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.create-topic',
      key: command.idempotencyKey,
    });

    if (existingResult) {
      return ok({ ...existingResult.value, created: false });
    }

    const existingTopic = await this.topics.findByName({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      name: command.name.trim(),
    });

    if (existingTopic) {
      const snapshot = existingTopic.toSnapshot();
      const result = { topicId: snapshot.id, created: false };
      await this.idempotency.set({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        scope: 'monitoring.create-topic',
        key: command.idempotencyKey,
        value: result,
      });
      return ok(result);
    }

    const topic = Topic.create({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      name: command.name,
      query: command.query,
      createdAt: this.clock.now(),
    });
    const snapshot = topic.toSnapshot();

    await this.topics.save(topic);

    const event: TopicCreatedEvent = {
      eventId: eventId(this.ids.generate()),
      eventType: 'monitoring.topic.created',
      schemaVersion: 1,
      occurredAt: this.clock.now(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      correlationId: correlationId(command.correlationId),
      causationId: causationId(command.idempotencyKey),
      payload: {
        topicId: snapshot.id,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        name: snapshot.name,
        query: snapshot.query,
      },
    };

    await this.outbox.append(event);

    const result = { topicId: snapshot.id, created: true };
    await this.idempotency.set({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scope: 'monitoring.create-topic',
      key: command.idempotencyKey,
      value: result,
    });

    return ok(result);
  }
}
