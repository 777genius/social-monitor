import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { Interest } from '../../domain';
import type { IdempotencyPort, ListInterestsQuery, ListInterestsResult, OutboxPort, InterestRepositoryPort } from '../../ports';
import type { CreateInterestResult } from './create-interest.result';
import { CreateInterestUseCase } from './create-interest.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `00000000-0000-7000-8000-${this.nextId.toString().padStart(12, '0')}`;
    this.nextId += 1;
    return id;
  }
}

class FakeInterestRepository implements InterestRepositoryPort {
  private readonly interests = new Map<string, Interest>();

  async save(interest: Interest): Promise<void> {
    const snapshot = interest.toSnapshot();
    this.interests.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, interest);
  }

  async findByName(params: Parameters<InterestRepositoryPort['findByName']>[0]): Promise<Interest | null> {
    for (const interest of this.interests.values()) {
      const snapshot = interest.toSnapshot();
      if (
        snapshot.tenantId === params.tenantId &&
        snapshot.workspaceId === params.workspaceId &&
        snapshot.name.toLowerCase() === params.name.trim().toLowerCase()
      ) {
        return interest;
      }
    }

    return null;
  }

  async findById(params: Parameters<InterestRepositoryPort['findById']>[0]): Promise<Interest | null> {
    return this.interests.get(`${params.tenantId}:${params.workspaceId}:${params.interestId}`) ?? null;
  }

  async list(query: ListInterestsQuery): Promise<ListInterestsResult> {
    return {
      interests: [...this.interests.values()].filter((interest) => {
        const snapshot = interest.toSnapshot();

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
  private readonly records = new Map<string, CreateInterestResult>();

  async get<TValue>(params: Parameters<IdempotencyPort['get']>[0]) {
    const value = this.records.get(this.key(params));
    return value === undefined ? null : { value: value as TValue };
  }

  async set<TValue>(params: Parameters<IdempotencyPort['set']>[0] & { value: TValue }): Promise<void> {
    this.records.set(this.key(params), params.value as CreateInterestResult);
  }

  private key(params: { tenantId: string; workspaceId: string; scope: string; key: string }): string {
    return `${params.tenantId}:${params.workspaceId}:${params.scope}:${params.key}`;
  }
}

describe('CreateInterestUseCase', () => {
  it('creates an interest and appends an outbox event', async () => {
    const outbox = new FakeOutbox();
    const useCase = new CreateInterestUseCase(
      new FakeInterestRepository(),
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

  it('returns the same interest for duplicate idempotency key', async () => {
    const useCase = new CreateInterestUseCase(
      new FakeInterestRepository(),
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
    expect(first.ok && second.ok && first.value.interestId).toBe(second.ok && second.value.interestId);
    expect(second.ok && second.value.created).toBe(false);
  });

  it('rejects new interests after workspace capacity limit is reached', async () => {
    const useCase = new CreateInterestUseCase(
      new FakeInterestRepository(),
      new FakeOutbox(),
      new FakeIdempotency(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
      { maxInterestsPerWorkspace: 1 },
    );

    const first = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      name: 'AI Monitoring',
      query: 'openai monitoring',
      idempotencyKey: 'request-1',
      correlationId: 'correlation-1',
    });
    const second = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      name: 'Infra Monitoring',
      query: 'postgres rabbitmq',
      idempotencyKey: 'request-2',
      correlationId: 'correlation-2',
    });

    expect(first.ok).toBe(true);
    expect(second).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'operation.quota_exceeded',
      }),
    }));
  });
});
