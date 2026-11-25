import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type UserSubscriptionStatus = 'enabled' | 'paused' | 'cancelled';

export type UserSubscriptionProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly sourceTargetId: string;
  readonly status: UserSubscriptionStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export class UserSubscription {
  private constructor(private readonly props: UserSubscriptionProps) {}

  static create(props: Omit<UserSubscriptionProps, 'status'> & { readonly status?: UserSubscriptionStatus }): UserSubscription {
    return UserSubscription.rehydrate({
      ...props,
      status: props.status ?? 'enabled',
    });
  }

  static rehydrate(props: UserSubscriptionProps): UserSubscription {
    const userId = props.userId.trim();
    const sourceTargetId = props.sourceTargetId.trim();

    if (props.id.trim().length === 0) {
      throw new Error('User subscription id must be non-empty');
    }

    if (userId.length === 0) {
      throw new Error('User subscription user id must be non-empty');
    }

    if (sourceTargetId.length === 0) {
      throw new Error('User subscription source target id must be non-empty');
    }

    if (!['enabled', 'paused', 'cancelled'].includes(props.status)) {
      throw new Error('User subscription status is unsupported');
    }

    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new Error('User subscription updatedAt must not be before createdAt');
    }

    return new UserSubscription({
      ...props,
      userId,
      sourceTargetId,
    });
  }

  toSnapshot(): UserSubscriptionProps {
    return { ...this.props };
  }
}
