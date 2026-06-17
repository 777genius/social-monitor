import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { DeliveryAttempt } from '../../domain';
import type {
  DeliveryAttemptDispatchQueuePort,
  DeliveryAttemptRepositoryPort,
  EnqueueDeliveryAttemptDispatchQueueCommand,
  ListDeliveryAttemptsResult,
} from '../../ports';
import { EnqueueDeliveryAttemptDispatchUseCase } from './enqueue-delivery-attempt-dispatch.use-case';

describe('EnqueueDeliveryAttemptDispatchUseCase', () => {
  it('publishes a queued attempt dispatch command and marks it in flight', async () => {
    const tenant = tenantId('tenant-delivery-dispatch-queue-spec');
    const workspace = workspaceId('workspace-delivery-dispatch-queue-spec');
    const attempts = new FakeDeliveryAttemptRepository();
    const queue = new FakeDeliveryAttemptDispatchQueue();
    const useCase = new EnqueueDeliveryAttemptDispatchUseCase(
      attempts,
      queue,
      new FixedClock(new Date('2026-06-16T04:00:00.000Z')),
    );

    await attempts.save(DeliveryAttempt.queue({
      id: 'delivery-attempt-dispatch-queue-spec',
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'delivery-attempt-dispatch-queue-spec:digest-1',
      channel: 'in_app',
      recipientKey: 'user-delivery-dispatch-queue-spec',
      resourceType: 'digest',
      resourceId: 'digest-delivery-dispatch-queue-spec',
      queuedAt: new Date('2026-06-16T03:59:00.000Z'),
      maxRetries: 2,
    }));

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      deliveryAttemptId: 'delivery-attempt-dispatch-queue-spec',
      correlationId: 'correlation-delivery-dispatch-queue-spec',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    expect(result.value).toEqual({
      deliveryAttemptId: 'delivery-attempt-dispatch-queue-spec',
      state: 'assembling',
      enqueued: true,
    });
    expect(queue.all()).toHaveLength(1);
    expect(queue.all()[0]).toMatchObject({
      tenantId: tenant,
      workspaceId: workspace,
      deliveryAttemptId: 'delivery-attempt-dispatch-queue-spec',
      content: {
        subject: 'digest ready',
        body: 'Delivery resource digest:digest-delivery-dispatch-queue-spec is ready.',
      },
    });

    const persisted = await attempts.findById({
      tenantId: tenant,
      workspaceId: workspace,
      deliveryAttemptId: 'delivery-attempt-dispatch-queue-spec',
    });
    expect(persisted?.toSnapshot().state).toBe('assembling');
  });
});

class FakeDeliveryAttemptRepository implements DeliveryAttemptRepositoryPort {
  private readonly attempts = new Map<string, DeliveryAttempt>();

  async save(attempt: DeliveryAttempt): Promise<void> {
    const snapshot = attempt.toSnapshot();
    this.attempts.set(this.key(snapshot.tenantId, snapshot.workspaceId, snapshot.id), attempt);
  }

  async findById(params: {
    readonly tenantId: ReturnType<typeof tenantId>;
    readonly workspaceId: ReturnType<typeof workspaceId>;
    readonly deliveryAttemptId: string;
  }): Promise<DeliveryAttempt | null> {
    return this.attempts.get(this.key(params.tenantId, params.workspaceId, params.deliveryAttemptId)) ?? null;
  }

  async findByIdempotencyKey(): Promise<DeliveryAttempt | null> {
    throw new Error('findByIdempotencyKey is not used by this spec');
  }

  async findQueued(): Promise<readonly DeliveryAttempt[]> {
    throw new Error('findQueued is not used by this spec');
  }

  async list(): Promise<ListDeliveryAttemptsResult> {
    throw new Error('list is not used by this spec');
  }

  private key(
    tenant: ReturnType<typeof tenantId>,
    workspace: ReturnType<typeof workspaceId>,
    deliveryAttemptId: string,
  ): string {
    return `${tenant}:${workspace}:${deliveryAttemptId}`;
  }
}

class FakeDeliveryAttemptDispatchQueue implements DeliveryAttemptDispatchQueuePort {
  private readonly commands: EnqueueDeliveryAttemptDispatchQueueCommand[] = [];

  async canAccept(): Promise<boolean> {
    return true;
  }

  async enqueue(command: EnqueueDeliveryAttemptDispatchQueueCommand): Promise<void> {
    this.commands.push(command);
  }

  all(): readonly EnqueueDeliveryAttemptDispatchQueueCommand[] {
    return [...this.commands];
  }
}
