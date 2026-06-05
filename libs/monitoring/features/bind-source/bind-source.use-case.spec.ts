import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { Topic, type SourceBinding } from '../../domain';
import type {
  IdempotencyPort,
  OutboxPort,
  SourceBindingRepositoryPort,
  SourceCatalogPort,
  SourceCapabilityProfile,
  TopicRepositoryPort,
} from '../../ports';
import type { BindSourceResult } from './bind-source.result';
import { BindSourceUseCase } from './bind-source.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `00000000-0000-7000-8000-${this.nextId.toString().padStart(12, '0')}`;
    this.nextId += 1;
    return id;
  }
}

class FakeTopics implements TopicRepositoryPort {
  private readonly topics = new Map<string, Topic>();

  add(topic: Topic): void {
    const snapshot = topic.toSnapshot();
    this.topics.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, topic);
  }

  async save(topic: Topic): Promise<void> {
    this.add(topic);
  }

  async findByName(): Promise<Topic | null> {
    return null;
  }

  async findById(params: Parameters<TopicRepositoryPort['findById']>[0]): Promise<Topic | null> {
    return this.topics.get(`${params.tenantId}:${params.workspaceId}:${params.topicId}`) ?? null;
  }
}

class FakeBindings implements SourceBindingRepositoryPort {
  private readonly bindings = new Map<string, SourceBinding>();

  async save(binding: SourceBinding): Promise<void> {
    const snapshot = binding.toSnapshot();
    this.bindings.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.topicId}:${snapshot.providerKey}`,
      binding,
    );
  }

  async findByTopicAndProvider(
    params: Parameters<SourceBindingRepositoryPort['findByTopicAndProvider']>[0],
  ): Promise<SourceBinding | null> {
    return this.bindings.get(`${params.tenantId}:${params.workspaceId}:${params.topicId}:${params.providerKey}`) ?? null;
  }
}

class FakeCatalog implements SourceCatalogPort {
  constructor(private readonly profile: SourceCapabilityProfile | null) {}

  async getCapability(): Promise<SourceCapabilityProfile | null> {
    return this.profile;
  }
}

class FakeOutbox implements OutboxPort {
  readonly events: unknown[] = [];

  async append(event: Parameters<OutboxPort['append']>[0]): Promise<void> {
    this.events.push(event);
  }
}

class FakeIdempotency implements IdempotencyPort {
  private readonly records = new Map<string, BindSourceResult>();

  async get<TValue>(params: Parameters<IdempotencyPort['get']>[0]) {
    const value = this.records.get(this.key(params));
    return value === undefined ? null : { value: value as TValue };
  }

  async set<TValue>(params: Parameters<IdempotencyPort['set']>[0] & { value: TValue }): Promise<void> {
    this.records.set(this.key(params), params.value as BindSourceResult);
  }

  private key(params: { tenantId: string; workspaceId: string; scope: string; key: string }): string {
    return `${params.tenantId}:${params.workspaceId}:${params.scope}:${params.key}`;
  }
}

const makeTopic = () =>
  Topic.create({
    id: 'topic-1',
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    name: 'AI Monitoring',
    query: 'openai monitoring',
    createdAt: new Date('2026-06-05T00:00:00.000Z'),
  });

describe('BindSourceUseCase', () => {
  it('binds a production-safe fake source and appends an event', async () => {
    const topics = new FakeTopics();
    topics.add(makeTopic());
    const outbox = new FakeOutbox();
    const useCase = new BindSourceUseCase(
      topics,
      new FakeBindings(),
      new FakeCatalog({
        providerKey: 'fake-source',
        version: 1,
        productionSafe: true,
        supportsCursor: true,
      }),
      outbox,
      new FakeIdempotency(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      providerKey: 'fake-source',
      config: { query: 'openai monitoring' },
      idempotencyKey: 'bind-1',
      correlationId: 'correlation-1',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.created).toBe(true);
    expect(outbox.events).toHaveLength(1);
  });

  it('rejects unsupported source provider', async () => {
    const topics = new FakeTopics();
    topics.add(makeTopic());
    const useCase = new BindSourceUseCase(
      topics,
      new FakeBindings(),
      new FakeCatalog(null),
      new FakeOutbox(),
      new FakeIdempotency(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      providerKey: 'unsafe-source',
      config: {},
      idempotencyKey: 'bind-1',
      correlationId: 'correlation-1',
    });

    expect(result.ok).toBe(false);
  });
});
