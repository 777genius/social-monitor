import type {
  SourceTarget,
  SourceTargetProps,
  UserSubscription,
  UserSubscriptionProps,
  UserSubscriptionSchedule,
  UserSubscriptionScheduleProps,
  UserSummaryPreference,
  UserSummaryPreferenceProps,
} from '../../domain';

export type SourceTargetView = Omit<SourceTargetProps, 'createdAt' | 'updatedAt'> & {
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type UserSubscriptionView = Omit<UserSubscriptionProps, 'createdAt' | 'updatedAt'> & {
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type UserSubscriptionScheduleView = Omit<UserSubscriptionScheduleProps, 'nextRunAt' | 'createdAt' | 'updatedAt'> & {
  readonly nextRunAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type UserSummaryPreferenceView = Omit<UserSummaryPreferenceProps, 'createdAt' | 'updatedAt'> & {
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type UserSubscriptionDetailView = {
  readonly sourceTarget: SourceTargetView;
  readonly subscription: UserSubscriptionView;
  readonly schedule?: UserSubscriptionScheduleView;
  readonly summaryPreference?: UserSummaryPreferenceView;
};

export const presentSourceTarget = (target: SourceTarget): SourceTargetView => {
  const snapshot = target.toSnapshot();

  return {
    ...snapshot,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
};

export const presentUserSubscription = (subscription: UserSubscription): UserSubscriptionView => {
  const snapshot = subscription.toSnapshot();

  return {
    ...snapshot,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
};

export const presentUserSubscriptionSchedule = (
  schedule: UserSubscriptionSchedule,
): UserSubscriptionScheduleView => {
  const snapshot = schedule.toSnapshot();

  return {
    ...snapshot,
    nextRunAt: snapshot.nextRunAt.toISOString(),
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
};

export const presentUserSummaryPreference = (
  preference: UserSummaryPreference,
): UserSummaryPreferenceView => {
  const snapshot = preference.toSnapshot();

  return {
    ...snapshot,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
};
