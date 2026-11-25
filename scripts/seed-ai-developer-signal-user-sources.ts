import {
  CryptoIdGenerator,
  SystemClock,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';
import { defaultPostgresRuntimePoolConfig } from '@social-monitor/platform-persistence';

import { PrismaSourceTargetRepository } from '../libs/subscriptions/adapters/persistence/prisma/prisma-source-target.repository';
import { PrismaSubscriptionsConnection } from '../libs/subscriptions/adapters/persistence/prisma/prisma-subscriptions-connection';
import { PrismaUserSubscriptionRepository } from '../libs/subscriptions/adapters/persistence/prisma/prisma-user-subscription.repository';
import { PrismaUserSubscriptionScheduleRepository } from '../libs/subscriptions/adapters/persistence/prisma/prisma-user-subscription-schedule.repository';
import { PrismaUserSummaryPreferenceRepository } from '../libs/subscriptions/adapters/persistence/prisma/prisma-user-summary-preference.repository';
import { StaticSourceTargetCatalogAdapter } from '../libs/subscriptions/adapters/target-catalog/static-source-target-catalog.adapter';
import { aiDeveloperSignalSourcePreset } from '../libs/subscriptions/domain';
import { CreateUserSubscriptionUseCase } from '../libs/subscriptions/features/create-user-subscription/create-user-subscription.use-case';

const main = async (): Promise<void> => {
  const databaseUrl = readRequiredEnv('DATABASE_URL');
  const tenant = tenantId(readRequiredEnv('TENANT_ID'));
  const workspace = workspaceId(readRequiredEnv('WORKSPACE_ID'));
  const userId = readRequiredEnv('USER_ID');
  const recipientKey = readOptionalEnv('RECIPIENT_KEY') ?? userId;
  const connection = await PrismaSubscriptionsConnection.create(
    defaultPostgresRuntimePoolConfig(databaseUrl, 'admin-tool'),
  );

  try {
    const useCase = new CreateUserSubscriptionUseCase(
      new PrismaSourceTargetRepository(connection),
      new PrismaUserSubscriptionRepository(connection),
      new PrismaUserSubscriptionScheduleRepository(connection),
      new PrismaUserSummaryPreferenceRepository(connection),
      new StaticSourceTargetCatalogAdapter(),
      new CryptoIdGenerator(),
      new SystemClock(),
    );

    let created = 0;
    let existing = 0;

    for (const entry of aiDeveloperSignalSourcePreset.entries) {
      const result = await useCase.execute({
        tenantId: tenant,
        workspaceId: workspace,
        userId,
        providerKey: entry.providerKey,
        targetKind: entry.targetKind,
        targetValue: entry.targetValue,
        targetConfig: entry.targetConfig,
        schedule: {
          recipientKey,
          channel: 'in_app',
          intervalSeconds: aiDeveloperSignalSourcePreset.defaultIntervalSeconds,
          includeNoSignal: false,
        },
        summaryPreference: aiDeveloperSignalSourcePreset.summaryPreference,
      });

      if (!result.ok) {
        throw result.error;
      }

      if (result.value.created) {
        created += 1;
      } else {
        existing += 1;
      }
    }

    console.log([
      'AI developer signal user sources seeded',
      `Preset: ${aiDeveloperSignalSourcePreset.presetId}`,
      `User: ${userId}`,
      `Targets: ${aiDeveloperSignalSourcePreset.entries.length}`,
      `Created subscriptions: ${created}`,
      `Existing subscriptions: ${existing}`,
    ].join('\n'));
  } finally {
    await connection.close();
  }
};

const readRequiredEnv = (name: string): string => {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }

  return value;
};

const readOptionalEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
