import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SourceBinding } from '../../domain';
import type {
  IdempotencyPort,
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
  OutboxPort,
  SourceBindingRepositoryPort,
} from '../../ports';
import type { ChangeSourceBindingStatusResult } from './change-source-binding-status.result';
import { ChangeSourceBindingStatusUseCase } from './change-source-binding-status.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `00000000-0000-7000-8000-${this.nextId.toString().padStart(12, '0')}`;
    this.nextId += 1;
    return id;
  }
}

class FakeSourceBindings implements SourceBindingRepositoryPort {
  private readonly bindingsByInterestProvider = new Map<string, SourceBinding>();
  private readonly bindingsById = new Map<string, SourceBinding>();

  add(binding: SourceBinding): void {
    const snapshot = binding.toSnapshot();
    this.bindingsByInterestProvider.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.interestId}:${snapshot.providerKey}`,
      binding,
    );
    this.bindingsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, binding);
  }

  async save(binding: SourceBinding): Promise<void> {
    this.add(binding);
  }

  async findByInterestAndProvider(
    params: Parameters<SourceBindingRepositoryPort['findByInterestAndProvider']>[0],
  ): Promise<SourceBinding | null> {
    return (
      this.bindingsByInterestProvider.get(`${params.tenantId}:${params.workspaceId}:${params.interestId}:${params.providerKey}`) ??
      null
    );
  }

  async findById(params: Parameters<SourceBindingRepositoryPort['findById']>[0]): Promise<SourceBinding | null> {
    return this.bindingsById.get(`${params.tenantId}:${params.workspaceId}:${params.sourceBindingId}`) ?? null;
  }

  async listByInterest(query: ListSourceBindingsQuery): Promise<ListSourceBindingsResult> {
    return {
      sourceBindings: [...this.bindingsById.values()].filter((binding) => {
        const snapshot = binding.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          snapshot.interestId === query.interestId
        );
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
  private readonly records = new Map<string, ChangeSourceBindingStatusResult>();

  async get<TValue>(params: Parameters<IdempotencyPort['get']>[0]) {
    const value = this.records.get(this.key(params));
    return value === undefined ? null : { value: value as TValue };
  }

  async set<TValue>(params: Parameters<IdempotencyPort['set']>[0] & { value: TValue }): Promise<void> {
    this.records.set(this.key(params), params.value as ChangeSourceBindingStatusResult);
  }

  private key(params: { tenantId: string; workspaceId: string; scope: string; key: string }): string {
    return `${params.tenantId}:${params.workspaceId}:${params.scope}:${params.key}`;
  }
}

const makeBinding = () =>
  SourceBinding.create({
    id: 'binding-1',
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    interestId: 'interest-1',
    providerKey: 'fake-source',
    capabilityProfileVersion: 1,
    config: {},
    createdAt: new Date('2026-06-05T00:00:00.000Z'),
  });

const makeUseCase = (bindings: SourceBindingRepositoryPort, outbox = new FakeOutbox()) => ({
  outbox,
  useCase: new ChangeSourceBindingStatusUseCase(
    bindings,
    outbox,
    new FakeIdempotency(),
    new SequenceIdGenerator(),
    new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
  ),
});

describe('ChangeSourceBindingStatusUseCase', () => {
  it('pauses and resumes a source binding with status-change events', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const { outbox, useCase } = makeUseCase(bindings);

    const pause = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      sourceBindingId: 'binding-1',
      status: 'paused',
      idempotencyKey: 'pause-1',
      correlationId: 'correlation-1',
    });

    expect(pause).toEqual({
      ok: true,
      value: {
        sourceBindingId: 'binding-1',
        status: 'paused',
        changed: true,
      },
    });
    expect((await bindings.findById({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
    }))?.toSnapshot().status).toBe('paused');

    const resume = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      sourceBindingId: 'binding-1',
      status: 'enabled',
      idempotencyKey: 'resume-1',
      correlationId: 'correlation-1',
    });

    expect(resume.ok && resume.value.status).toBe('enabled');
    expect(outbox.events).toEqual([
      expect.objectContaining({
        eventType: 'monitoring.source-binding.status-changed',
        payload: expect.objectContaining({
          previousStatus: 'enabled',
          status: 'paused',
        }),
      }),
      expect.objectContaining({
        eventType: 'monitoring.source-binding.status-changed',
        payload: expect.objectContaining({
          previousStatus: 'paused',
          status: 'enabled',
        }),
      }),
    ]);
  });

  it('is idempotent for repeated status commands', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const { outbox, useCase } = makeUseCase(bindings);
    const command = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      sourceBindingId: 'binding-1',
      status: 'paused' as const,
      idempotencyKey: 'pause-1',
      correlationId: 'correlation-1',
    };

    const first = await useCase.execute(command);
    const second = await useCase.execute(command);

    expect(first.ok && first.value.changed).toBe(true);
    expect(second.ok && second.value.changed).toBe(false);
    expect(outbox.events).toHaveLength(1);
  });

  it('rejects a source binding outside the requested interest', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const { useCase } = makeUseCase(bindings);

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'other-interest',
      sourceBindingId: 'binding-1',
      status: 'paused',
      idempotencyKey: 'pause-1',
      correlationId: 'correlation-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'resource.not_found',
      }),
    });
  });
});
