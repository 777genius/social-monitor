import type { Provider } from '@nestjs/common';
import { assertRuntimeProfileAllowsMode } from '@social-monitor/platform-config';

import type {
  SourceTargetCatalogPort,
  SourceTargetRepositoryPort,
  UserSubscriptionRepositoryPort,
  UserSubscriptionScheduleRepositoryPort,
  UserSummaryPreferenceRepositoryPort,
} from '../../ports';

export type SubscriptionsPersistenceMode = 'in-memory' | 'prisma';

export const SUBSCRIPTIONS_PERSISTENCE_MODE = Symbol('SUBSCRIPTIONS_PERSISTENCE_MODE');
export const SUBSCRIPTIONS_PRISMA_CLIENT = Symbol('SUBSCRIPTIONS_PRISMA_CLIENT');
export const SUBSCRIPTIONS_SOURCE_TARGET_REPOSITORY = Symbol('SUBSCRIPTIONS_SOURCE_TARGET_REPOSITORY');
export const SUBSCRIPTIONS_USER_SUBSCRIPTION_REPOSITORY = Symbol('SUBSCRIPTIONS_USER_SUBSCRIPTION_REPOSITORY');
export const SUBSCRIPTIONS_USER_SUBSCRIPTION_SCHEDULE_REPOSITORY =
  Symbol('SUBSCRIPTIONS_USER_SUBSCRIPTION_SCHEDULE_REPOSITORY');
export const SUBSCRIPTIONS_USER_SUMMARY_PREFERENCE_REPOSITORY =
  Symbol('SUBSCRIPTIONS_USER_SUMMARY_PREFERENCE_REPOSITORY');
export const SUBSCRIPTIONS_SOURCE_TARGET_CATALOG = Symbol('SUBSCRIPTIONS_SOURCE_TARGET_CATALOG');

export type SubscriptionsProviderTokenMap = {
  readonly [SUBSCRIPTIONS_PERSISTENCE_MODE]: SubscriptionsPersistenceMode;
  readonly [SUBSCRIPTIONS_PRISMA_CLIENT]: unknown;
  readonly [SUBSCRIPTIONS_SOURCE_TARGET_REPOSITORY]: SourceTargetRepositoryPort;
  readonly [SUBSCRIPTIONS_USER_SUBSCRIPTION_REPOSITORY]: UserSubscriptionRepositoryPort;
  readonly [SUBSCRIPTIONS_USER_SUBSCRIPTION_SCHEDULE_REPOSITORY]: UserSubscriptionScheduleRepositoryPort;
  readonly [SUBSCRIPTIONS_USER_SUMMARY_PREFERENCE_REPOSITORY]: UserSummaryPreferenceRepositoryPort;
  readonly [SUBSCRIPTIONS_SOURCE_TARGET_CATALOG]: SourceTargetCatalogPort;
};

export const subscriptionsPersistenceModeProvider: Provider<SubscriptionsPersistenceMode> = {
  provide: SUBSCRIPTIONS_PERSISTENCE_MODE,
  useFactory: () => resolveSubscriptionsPersistenceMode(process.env),
};

export const resolveSubscriptionsPersistenceMode = (env: NodeJS.ProcessEnv): SubscriptionsPersistenceMode => {
  const value = env.SUBSCRIPTIONS_PERSISTENCE ?? 'in-memory';

  if (value === 'in-memory') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'SUBSCRIPTIONS_PERSISTENCE',
      selectedMode: value,
      durableModes: ['prisma'],
    });

    return 'in-memory';
  }

  if (value === 'prisma') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'SUBSCRIPTIONS_PERSISTENCE',
      selectedMode: value,
      durableModes: ['prisma'],
    });

    if ((env.DATABASE_URL ?? '').trim().length === 0) {
      throw new Error('SUBSCRIPTIONS_PERSISTENCE=prisma requires DATABASE_URL');
    }

    return 'prisma';
  }

  throw new Error('SUBSCRIPTIONS_PERSISTENCE must be "in-memory" or "prisma"');
};
