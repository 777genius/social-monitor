import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { Topic } from '../../domain';
import type { IdempotencyPort, ListTopicsQuery, ListTopicsResult, OutboxPort, TopicRepositoryPort } from '../../ports';
import type { CreateTopicResult } from './create-topic.result';
import { CreateTopicUseCase } from './create-topic.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `00000000-0000-7000-8000-${this.nextId.toString().padStart(12, '0')}`;
    this.nextId += 1;
    return id;
  }
}

class FakeTopicRepository implements TopicRepositoryPort {
  private readonly topics = new Map<string, Topic>();

  async save(topic: Topic): Promise<void> {
    const snapshot = topic.toSnapshot();
    this.topics.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, topic);
  }

  async findByName(params: Parameters<TopicRepositoryPort['findByName']>[0]): Promise<Topic | null> {
    for (const topic of this.topics.values()) {
      const snapshot = topic.toSnapshot();
      if (
        snapshot.tenantId === params.tenantId &&
        snapshot.workspaceId === params.workspaceId &&
        snapshot.name.toLowerCase() === params.name.trim().toLowerCase()
      ) {
        return topic;
      }
    }

    return null;
  }

  async findById(params: Parameters<TopicRepositoryPort['findById']>[0]): Promise<Topic | null> {
    return this.topics.get(`${params.tenantId}:${params.workspaceId}:${params.topicId}`) ?? null;
  }

  async list(query: ListTopicsQuery): Promise<ListTopicsResult> {
    return {
      topics: [...this.topics.values()].filter((topic) => {
        const snapshot = topic.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      }),
      nextCursor: undefined,
    };
  }
}

class FakeOutbox implements OutboxPort {
  readonly events: unknown[] = [];

  async append(event: Parameters<OutboxPort['append']>[0]): Promise<void> {
    this.events.push(event);
  }
}

class FakeIdempotency implements IdempotencyPort {
  private readonly records = new Map<string, CreateTopicResult>();

  async get<TValue>(params: Parameters<IdempotencyPort['get']>[0]) {
    const value = this.records.get(this.key(params));
    return value === undefined ? null : { value: value as TValue };
  }

  async set<TValue>(params: Parameters<IdempotencyPort['set']>[0] & { value: TValue }): Promise<void> {
    this.records.set(this.key(params), params.value as CreateTopicResult);
  }

  private key(params: { tenantId: string; workspaceId: string; scope: string; key: string }): string {
    return `${params.tenantId}:${params.workspaceId}:${params.scope}:${params.key}`;
  }
}

describe('CreateTopicUseCase', () => {
  it('creates a topic and appends an outbox event', async () => {
    const outbox = new FakeOutbox();
    const useCase = new CreateTopicUseCase(
      new FakeTopicRepository(),
      outbox,
      new FakeIdempotency(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      name: 'AI Monitoring',
      query: 'openai monitoring',
      idempotencyKey: 'request-1',
      correlationId: 'correlation-1',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.created).toBe(true);
    expect(outbox.events).toHaveLength(1);
  });

  it('returns the same topic for duplicate idempotency key', async () => {
    const useCase = new CreateTopicUseCase(
      new FakeTopicRepository(),
      new FakeOutbox(),
      new FakeIdempotency(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const command = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      name: 'AI Monitoring',
      query: 'openai monitoring',
      idempotencyKey: 'request-1',
      correlationId: 'correlation-1',
    };

    const first = await useCase.execute(command);
    const second = await useCase.execute(command);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.ok && second.ok && first.value.topicId).toBe(second.ok && second.value.topicId);
    expect(second.ok && second.value.created).toBe(false);
  });
});
