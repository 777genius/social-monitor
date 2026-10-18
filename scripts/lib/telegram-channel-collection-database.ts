import type { PrismaClient } from '../../prisma/generated/client/client';
import { telegramCatalogSeed } from '../../prisma/source-catalog-seeds';
import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { Clock, IdGenerator } from '@social-monitor/shared-kernel';
import { PrismaIdempotencyAdapter } from '@social-monitor/monitoring/adapters/idempotency/prisma/prisma-idempotency.adapter';
import { PrismaInterestRepository } from '@social-monitor/monitoring/adapters/persistence/prisma/prisma-interest.repository';
import type { PrismaMonitoringClient } from '@social-monitor/monitoring/adapters/persistence/prisma/prisma-monitoring-client';
import { PrismaMonitoringOutboxAdapter } from '@social-monitor/monitoring/adapters/persistence/prisma/prisma-monitoring-outbox.adapter';
import { PrismaScanPolicyRepository } from '@social-monitor/monitoring/adapters/persistence/prisma/prisma-scan-policy.repository';
import { PrismaSourceBindingRepository } from '@social-monitor/monitoring/adapters/persistence/prisma/prisma-source-binding.repository';
import { FakeSourceCatalogAdapter } from '@social-monitor/monitoring/adapters/source-catalog/fake-source-catalog.adapter';
import { BindSourceUseCase } from '@social-monitor/monitoring/features/bind-source/bind-source.use-case';
import { SetScanPolicyUseCase } from '@social-monitor/monitoring/features/set-scan-policy/set-scan-policy.use-case';
import type { SourceBindingConfigProtectorPort } from '@social-monitor/monitoring/ports';
import type { TelegramCollectionMonitoring } from './telegram-channel-collection-bootstrap';
import { TelegramCollectionError, telegramCollectionScope } from './telegram-channel-collection-contract';
import { summarizeTelegramCollectionCursor } from './telegram-channel-collection-scan';

export type TelegramCollectionDatabase = PrismaClient;
export type TelegramCollectionMetadataDatabase = Pick<PrismaClient,
  'sourceCatalogEntry' | 'capabilityProfile' | 'cursorCheckpoint' | 'interest' |
  'sourceBinding' | 'scanPolicy' | 'outboxEvent' | 'idempotencyKey'>;

export const inspectTelegramCollectionCheckpoint = async (client: TelegramCollectionMetadataDatabase, sourceBindingId?: string) => {
  if (sourceBindingId === undefined) return null;
  const checkpoint = await client.cursorCheckpoint.findFirst({ where: {
    tenantId: telegramCollectionScope.tenantId, workspaceId: telegramCollectionScope.workspaceId, sourceBindingId,
  } });
  if (checkpoint === null) return null;
  const payload = checkpoint.cursorPayload;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.cursor !== 'string') {
    throw new TelegramCollectionError('binding_conflict');
  }
  return summarizeTelegramCollectionCursor(payload.cursor);
};

export const telegramCollectionMonitoring = (
  client: TelegramCollectionMetadataDatabase, ids: IdGenerator, clock: Clock, protector?: SourceBindingConfigProtectorPort,
): TelegramCollectionMonitoring => {
  const monitoring = client as unknown as PrismaMonitoringClient;
  const interests = new PrismaInterestRepository(monitoring);
  const bindings = new PrismaSourceBindingRepository(monitoring);
  const policies = new PrismaScanPolicyRepository(monitoring);
  const outbox = new PrismaMonitoringOutboxAdapter(monitoring);
  const idempotency = new PrismaIdempotencyAdapter(monitoring, ids);
  return {
    interests, bindings, policies,
    catalog: { inspect: () => inspectCatalog(client), ensure: () => ensureCatalog(client) },
    ...(protector === undefined ? {} : { bootstrap: {
      bindSource: new BindSourceUseCase(interests, bindings, new FakeSourceCatalogAdapter({ includeFixtureProviders: false }),
        outbox, idempotency, protector, ids, clock),
      setPolicy: new SetScanPolicyUseCase(bindings, policies, outbox, idempotency, ids, clock),
    } }),
  };
};

const inspectCatalog = async (client: TelegramCollectionMetadataDatabase): Promise<boolean> => {
  const source = await client.sourceCatalogEntry.findUnique({ where: { providerKey: 'telegram' } });
  if (source === null) return false;
  const seed = telegramCatalogSeed;
  if (source.displayName !== seed.displayName || source.acquisitionMode !== seed.acquisitionMode || source.readiness !== seed.readiness) {
    throw new TelegramCollectionError('catalog_conflict');
  }
  const profile = await client.capabilityProfile.findUnique({ where: { sourceId_version: { sourceId: source.id, version: 1 } } });
  if (profile === null) return false;
  const config = profile.config;
  if (profile.schemaVersion !== 1 || config === null || typeof config !== 'object' || Array.isArray(config) ||
      Object.keys(config).length !== Object.keys(seed.config as object).length ||
      Object.entries(seed.config as object).some(([key, value]) => config[key] !== value)) {
    throw new TelegramCollectionError('catalog_conflict');
  }
  return true;
};

const ensureCatalog = async (client: TelegramCollectionMetadataDatabase): Promise<void> => {
  if (await inspectCatalog(client)) return;
  const seed = telegramCatalogSeed;
  if (await client.capabilityProfile.findUnique({ where: { id: seed.profileId } }) !== null) throw new TelegramCollectionError('catalog_conflict');
  let source = await client.sourceCatalogEntry.findUnique({ where: { providerKey: 'telegram' } });
  if (source === null) {
    if (await client.sourceCatalogEntry.findUnique({ where: { id: seed.id } }) !== null) throw new TelegramCollectionError('catalog_conflict');
    source = await withPrismaWriteRetry(() => client.sourceCatalogEntry.create({ data: {
      id: seed.id, providerKey: seed.providerKey, displayName: seed.displayName,
      acquisitionMode: seed.acquisitionMode, readiness: seed.readiness,
    } }));
  }
  const sourceId = source.id;
  await withPrismaWriteRetry(() => client.capabilityProfile.create({ data: {
    id: seed.profileId, sourceId, version: 1, schemaVersion: 1, config: seed.config,
  } }));
};
