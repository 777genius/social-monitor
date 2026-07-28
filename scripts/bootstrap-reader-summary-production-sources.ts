import { resolveRuntimeProfile } from '@social-monitor/platform-config';
import {
  acquirePrismaPgRuntimeConnection,
  defaultPostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { redactSensitiveText } from '@social-monitor/shared-kernel';

import {
  bootstrapReaderSummaryProductionSourcesWithPrisma,
  readerSummaryProductionProviderKeys,
  type ReaderSummaryProductionBootstrapPrismaClient,
} from './lib/reader-summary-production-source-bootstrap';

type BootstrapRuntimeClient = ReaderSummaryProductionBootstrapPrismaClient & {
  $disconnect(): Promise<void>;
};

const main = async (): Promise<void> => {
  if (resolveRuntimeProfile(process.env) !== 'beta') {
    throw new Error(
      'SOCIAL_MONITOR_RUNTIME_PROFILE=beta is required for the production source bootstrap',
    );
  }

  const databaseUrl = readRequiredEnv('DATABASE_URL');
  const PrismaClient = loadPrismaRuntimeClient<
    PrismaPgRuntimeClientConstructor<BootstrapRuntimeClient>
  >();
  const connection = await acquirePrismaPgRuntimeConnection(
    defaultPostgresRuntimePoolConfig(databaseUrl, 'admin-tool'),
    PrismaClient,
  );

  try {
    const result = await bootstrapReaderSummaryProductionSourcesWithPrisma(
      connection.client,
      process.env,
    );

    console.log([
      'Reader summary production source bootstrap complete',
      `Tenant: ${result.tenantId}`,
      `Workspace: ${result.workspaceId}`,
      `User: ${result.userId}`,
      `Interest: ${result.interestId}`,
      `Enabled source bindings: ${result.providers.length}`,
      `Scan policies: ${result.providers.length}`,
      `Providers: ${readerSummaryProductionProviderKeys.join(', ')}`,
    ].join('\n'));
  } finally {
    await connection.close();
  }
};

const readRequiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }

  return value;
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    `Reader summary production source bootstrap failed: ${redactSensitiveText(message)}`,
  );
  process.exitCode = 1;
});
