import type { UserSubscription } from '../../domain';
import type {
  ListUserSubscriptionsQuery,
  ListUserSubscriptionsResult,
  UserSubscriptionRepositoryPort,
} from '../../ports';

export class InMemoryUserSubscriptionRepository implements UserSubscriptionRepositoryPort {
  private readonly subscriptionsById = new Map<string, UserSubscription>();
  private readonly subscriptionsByUserAndTarget = new Map<string, UserSubscription>();

  async save(subscription: UserSubscription): Promise<void> {
    const snapshot = subscription.toSnapshot();
    this.subscriptionsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, subscription);
    this.subscriptionsByUserAndTarget.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.userId}:${snapshot.sourceTargetId}`,
      subscription,
    );
  }

  async findById(
    params: Parameters<UserSubscriptionRepositoryPort['findById']>[0],
  ): Promise<UserSubscription | null> {
    return this.subscriptionsById.get(`${params.tenantId}:${params.workspaceId}:${params.subscriptionId}`) ?? null;
  }

  async findByUserAndTarget(
    params: Parameters<UserSubscriptionRepositoryPort['findByUserAndTarget']>[0],
  ): Promise<UserSubscription | null> {
    return this.subscriptionsByUserAndTarget.get(
      `${params.tenantId}:${params.workspaceId}:${params.userId}:${params.sourceTargetId}`,
    ) ?? null;
  }

  async listByUser(query: ListUserSubscriptionsQuery): Promise<ListUserSubscriptionsResult> {
    const offset = parseCursor(query.cursor);
    const allItems = [...this.subscriptionsById.values()]
      .filter((subscription) => {
        const snapshot = subscription.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          snapshot.userId === query.userId
        );
      })
      .sort(compareSubscriptions);
    const subscriptions = allItems.slice(offset, offset + query.limit);
    const nextOffset = offset + subscriptions.length;

    return {
      subscriptions,
      nextCursor: nextOffset < allItems.length ? encodeCursor(nextOffset) : undefined,
    };
  }
}

const compareSubscriptions = (left: UserSubscription, right: UserSubscription): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const createdDiff = rightSnapshot.createdAt.getTime() - leftSnapshot.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return rightSnapshot.id.localeCompare(leftSnapshot.id);
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
