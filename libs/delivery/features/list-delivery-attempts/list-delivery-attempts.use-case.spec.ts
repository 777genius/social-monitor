import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { DeliveryAttempt, type DeliveryAttemptProps } from '../../domain';
import type {
  DeliveryAttemptRepositoryPort,
  ListDeliveryAttemptsQuery,
  ListDeliveryAttemptsResult as RepositoryListDeliveryAttemptsResult,
} from '../../ports';
import { ListDeliveryAttemptsUseCase } from './list-delivery-attempts.use-case';

describe('ListDeliveryAttemptsUseCase', () => {
  it('lists tenant-scoped delivery attempts in newest-first pages', async () => {
    const attempts = new FakeDeliveryAttemptRepository();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    await attempts.save(makeAttempt({
      id: 'attempt-old',
      tenantId: tenant,
      workspaceId: workspace,
      queuedAt: new Date('2026-06-06T00:00:00.000Z'),
    }));
    await attempts.save(makeAttempt({
      id: 'attempt-new',
      tenantId: tenant,
      workspaceId: workspace,
      queuedAt: new Date('2026-06-06T01:00:00.000Z'),
    }));
    await attempts.save(makeAttempt({
      id: 'attempt-other-tenant',
      tenantId: tenantId('tenant-2'),
      workspaceId: workspace,
      queuedAt: new Date('2026-06-06T02:00:00.000Z'),
    }));

    const firstPage = await new ListDeliveryAttemptsUseCase(attempts).execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 1,
    });

    expect(firstPage).toEqual({
      ok: true,
      value: {
        attempts: [
          expect.objectContaining({
            id: 'attempt-new',
            tenantId: tenant,
            workspaceId: workspace,
          }),
        ],
        nextCursor: expect.any(String),
      },
    });

    if (!firstPage.ok) {
      throw firstPage.error;
    }

    const secondPage = await new ListDeliveryAttemptsUseCase(attempts).execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 1,
      cursor: firstPage.value.nextCursor,
    });

    expect(secondPage).toEqual({
      ok: true,
      value: {
        attempts: [
          expect.objectContaining({
            id: 'attempt-old',
            tenantId: tenant,
            workspaceId: workspace,
          }),
        ],
        nextCursor: undefined,
      },
    });
  });

  it('rejects unsafe limits', async () => {
    await expect(new ListDeliveryAttemptsUseCase(new FakeDeliveryAttemptRepository()).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 0,
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
  });
});

const makeAttempt = (overrides: Partial<DeliveryAttemptProps> = {}): DeliveryAttempt => DeliveryAttempt.rehydrate({
  id: 'attempt-1',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  idempotencyKey: 'delivery:attempt-1',
  channel: 'webhook',
  recipientKey: 'webhook-endpoint-1',
  resourceType: 'digest',
  resourceId: 'digest-1',
  state: 'queued',
  queuedAt: new Date('2026-06-06T00:00:00.000Z'),
  retryCount: 0,
  maxRetries: 3,
  ...overrides,
});

class FakeDeliveryAttemptRepository implements DeliveryAttemptRepositoryPort {
  private readonly attempts = new Map<string, DeliveryAttempt>();
  private readonly attemptsByIdempotencyKey = new Map<string, DeliveryAttempt>();

  async save(attempt: DeliveryAttempt): Promise<void> {
    const snapshot = attempt.toSnapshot();

    this.attempts.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, attempt);
    this.attemptsByIdempotencyKey.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`,
      attempt,
    );
  }

  async findById(params: Parameters<DeliveryAttemptRepositoryPort['findById']>[0]): Promise<DeliveryAttempt | null> {
    return this.attempts.get(`${params.tenantId}:${params.workspaceId}:${params.deliveryAttemptId}`) ?? null;
  }

  async findByIdempotencyKey(
    params: Parameters<DeliveryAttemptRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<DeliveryAttempt | null> {
    return this.attemptsByIdempotencyKey.get(
      `${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`,
    ) ?? null;
  }

  async list(query: ListDeliveryAttemptsQuery): Promise<RepositoryListDeliveryAttemptsResult> {
    const offset = parseCursor(query.cursor);
    const allAttempts = [...this.attempts.values()]
      .filter((attempt) => {
        const snapshot = attempt.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      })
      .sort(compareAttemptsByQueuedAt);
    const attempts = allAttempts.slice(offset, offset + query.limit);
    const nextOffset = offset + attempts.length;

    return {
      attempts,
      nextCursor: nextOffset < allAttempts.length ? encodeCursor(nextOffset) : undefined,
    };
  }
}

const compareAttemptsByQueuedAt = (left: DeliveryAttempt, right: DeliveryAttempt): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const queuedDiff = rightSnapshot.queuedAt.getTime() - leftSnapshot.queuedAt.getTime();

  if (queuedDiff !== 0) {
    return queuedDiff;
  }

  return rightSnapshot.id.localeCompare(leftSnapshot.id);
};

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString('base64url');

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

  return typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) ? parsed.offset : 0;
};
