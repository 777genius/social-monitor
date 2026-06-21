import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type { DeliveryChannel } from '@social-monitor/delivery/domain';

export type UserSubscriptionScheduleStatus = 'enabled' | 'disabled';

export type UserSubscriptionScheduleProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly subscriptionId: string;
  readonly recipientKey: string;
  readonly channel: DeliveryChannel;
  readonly intervalSeconds: number;
  readonly includeNoSignal: boolean;
  readonly nextRunAt: Date;
  readonly status: UserSubscriptionScheduleStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export class UserSubscriptionSchedule {
  private constructor(private readonly props: UserSubscriptionScheduleProps) {}

  static create(
    props: Omit<UserSubscriptionScheduleProps, 'status'> & { readonly status?: UserSubscriptionScheduleStatus },
  ): UserSubscriptionSchedule {
    return UserSubscriptionSchedule.rehydrate({
      ...props,
      status: props.status ?? 'enabled',
    });
  }

  static rehydrate(props: UserSubscriptionScheduleProps): UserSubscriptionSchedule {
    if (props.id.trim().length === 0) {
      throw new Error('User subscription schedule id must be non-empty');
    }

    if (props.subscriptionId.trim().length === 0) {
      throw new Error('User subscription schedule subscription id must be non-empty');
    }

    if (props.recipientKey.trim().length === 0) {
      throw new Error('User subscription schedule recipient key must be non-empty');
    }

    if (!Number.isInteger(props.intervalSeconds) || props.intervalSeconds < 60 || props.intervalSeconds > 2_592_000) {
      throw new Error('User subscription schedule interval must be between 60 and 2592000 seconds');
    }

    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new Error('User subscription schedule updatedAt must not be before createdAt');
    }

    return new UserSubscriptionSchedule(props);
  }

  toSnapshot(): UserSubscriptionScheduleProps {
    return { ...this.props };
  }
}
