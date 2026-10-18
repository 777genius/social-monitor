import {
  acquirePrismaPgRuntimeConnection, defaultPostgresRuntimePoolConfig, runWithTenantDatabaseAccess,
  type PrismaPgRuntimeClientConstructor,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { AesGcmSourceBindingConfigProtector } from '@social-monitor/monitoring/adapters/security/aes-gcm-source-binding-config-protector';
import { PrismaIngestionWorkerConnection } from '../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection';
import { resolveTelegramCollectionTarget } from './lib/telegram-channel-collection-bootstrap';
import {
  parseTelegramCollectionArgs, telegramCollectionChannel, telegramCollectionScope, TelegramCollectionError,
} from './lib/telegram-channel-collection-contract';
import { inspectTelegramCollectionCheckpoint, telegramCollectionMonitoring, type TelegramCollectionDatabase } from './lib/telegram-channel-collection-database';
import { composeTelegramCollectionRuntime } from './lib/telegram-channel-collection-runtime';
import { collectTelegramChannel } from './lib/telegram-channel-collection-scan';

export const runTelegramChannelCollection = async (args: readonly string[], env: NodeJS.ProcessEnv) => {
  const mode = parseTelegramCollectionArgs(args);
  if (env.SOCIAL_MONITOR_RUNTIME_PROFILE !== 'beta') throw new TelegramCollectionError('beta_required');
  if (!env.DATABASE_URL?.trim()) throw new TelegramCollectionError('database_required');
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();
  const protector = mode === 'bootstrap' ? AesGcmSourceBindingConfigProtector.fromEnvironment(env) : undefined;
  const PrismaClient = loadPrismaRuntimeClient<PrismaPgRuntimeClientConstructor<TelegramCollectionDatabase>>();
  const database = await acquirePrismaPgRuntimeConnection(defaultPostgresRuntimePoolConfig(env.DATABASE_URL, 'admin-tool'), PrismaClient);
  const inspection = await (async () => {
    try {
      return await runWithTenantDatabaseAccess(telegramCollectionScope, async () => {
        const resolved = await resolveTelegramCollectionTarget(mode, telegramCollectionMonitoring(database.client, ids, clock, protector));
        return { ...resolved, cursor: await inspectTelegramCollectionCheckpoint(database.client, resolved.sourceBindingId) };
      });
    } finally { await database.close(); }
  })();
  const base = {
    schemaVersion: 1, mode, channel: telegramCollectionChannel, ...telegramCollectionScope,
    catalogReady: inspection.catalogReady, sourceBindingId: inspection.sourceBindingId, scanPolicyId: inspection.scanPolicyId,
    cursor: inspection.cursor,
  };
  if (mode !== 'collect') return { ...base, status: inspection.target === undefined ? 'not_bootstrapped' : 'ready' };
  if (inspection.target === undefined) throw new TelegramCollectionError('not_bootstrapped');
  const target = inspection.target;
  const connection = await PrismaIngestionWorkerConnection.createForProcess(env.DATABASE_URL, 'daily-runner');
  try {
    const result = await runWithTenantDatabaseAccess(telegramCollectionScope, () => collectTelegramChannel(
      target, composeTelegramCollectionRuntime(connection, ids, clock, target.sourceBindingId),
    ));
    return { ...base, ...result };
  } finally { await connection.close(); }
};

if (require.main === module) void runTelegramChannelCollection(process.argv.slice(2), process.env).then((result) => {
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
}).catch((error: unknown) => {
  process.stdout.write(`${JSON.stringify({ ok: false, code: error instanceof TelegramCollectionError ? error.code : 'runtime_failed' })}\n`);
  process.exitCode = 1;
});
