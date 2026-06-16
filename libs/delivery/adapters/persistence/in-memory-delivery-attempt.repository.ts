import type { DeliveryAttempt } from '../../domain';
import type {
  DeliveryAttemptRepositoryPort,
  ListDeliveryAttemptsQuery,
  ListDeliveryAttemptsResult,
} from '../../ports';

export class InMemoryDeliveryAttemptRepository implements DeliveryAttemptRepositoryPort {
  private readonly attemptsById = new Map<string, DeliveryAttempt>();
  private readonly attemptsByIdempotencyKey = new Map<string, DeliveryAttempt>();

  async save(attempt: DeliveryAttempt): Promise<void> {
    const snapshot = attempt.toSnapshot();

    this.attemptsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, attempt);
    this.attemptsByIdempotencyKey.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`,
      attempt,
    );
  }

  async findById(params: Parameters<DeliveryAttemptRepositoryPort['findById']>[0]): Promise<DeliveryAttempt | null> {
    return this.attemptsById.get(`${params.tenantId}:${params.workspaceId}:${params.deliveryAttemptId}`) ?? null;
  }

  async findByIdempotencyKey(
    params: Parameters<DeliveryAttemptRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<DeliveryAttempt | null> {
    return this.attemptsByIdempotencyKey.get(`${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`) ?? null;
  }

  async findQueued(params: Parameters<DeliveryAttemptRepositoryPort['findQueued']>[0]): Promise<readonly DeliveryAttempt[]> {
    return [...this.attemptsById.values()]
      .filter((attempt) => {
        const snapshot = attempt.toSnapshot();

        return (
          snapshot.state === 'queued' &&
          (params.tenantId === undefined || snapshot.tenantId === params.tenantId) &&
          (params.workspaceId === undefined || snapshot.workspaceId === params.workspaceId)
        );
      })
      .sort(compareQueuedAttempts)
      .slice(0, params.limit);
  }

  async list(query: ListDeliveryAttemptsQuery): Promise<ListDeliveryAttemptsResult> {
    const offset = parseCursor(query.cursor);
    const allAttempts = [...this.attemptsById.values()]
      .filter((attempt) => {
        const snapshot = attempt.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      })
      .sort(compareAttempts);
    const attempts = allAttempts.slice(offset, offset + query.limit);
    const nextOffset = offset + attempts.length;

    return {
      attempts,
      nextCursor: nextOffset < allAttempts.length ? encodeCursor(nextOffset) : undefined,
    };
  }
}

const compareAttempts = (left: DeliveryAttempt, right: DeliveryAttempt): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const queuedDiff = rightSnapshot.queuedAt.getTime() - leftSnapshot.queuedAt.getTime();

  if (queuedDiff !== 0) {
    return queuedDiff;
  }

  return rightSnapshot.id.localeCompare(leftSnapshot.id);
};

const compareQueuedAttempts = (left: DeliveryAttempt, right: DeliveryAttempt): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const queuedDiff = leftSnapshot.queuedAt.getTime() - rightSnapshot.queuedAt.getTime();

  if (queuedDiff !== 0) {
    return queuedDiff;
  }

  return leftSnapshot.id.localeCompare(rightSnapshot.id);
};

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString('base64url');

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

    if (typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) && parsed.offset >= 0) {
      return parsed.offset;
    }
  } catch {
    return 0;
  }

  return 0;
};
