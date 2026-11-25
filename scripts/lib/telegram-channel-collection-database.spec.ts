import { FixedClock } from '@social-monitor/shared-kernel';
import { telegramCatalogSeed } from '../../prisma/source-catalog-seeds';
import { telegramCollectionMonitoring, type TelegramCollectionDatabase } from './telegram-channel-collection-database';

describe('canonical Telegram catalog bootstrap', () => {
  const catalog = (client: unknown) => telegramCollectionMonitoring(client as TelegramCollectionDatabase,
    { generate: () => 'unused' }, new FixedClock(new Date('2026-10-18T00:00:00Z'))).catalog;
  const source = { id: telegramCatalogSeed.id, providerKey: 'telegram', displayName: telegramCatalogSeed.displayName,
    acquisitionMode: telegramCatalogSeed.acquisitionMode, readiness: telegramCatalogSeed.readiness };
  const profile = { id: telegramCatalogSeed.profileId, sourceId: source.id, version: 1, schemaVersion: 1, config: telegramCatalogSeed.config };

  it('creates the canonical catalog/profile once and preserves a repeated bootstrap', async () => {
    let savedSource: typeof source | null = null;
    let savedProfile: typeof profile | null = null;
    const createSource = jest.fn(async () => { savedSource = source; return source; });
    const createProfile = jest.fn(async () => { savedProfile = profile; return profile; });
    const client = {
      sourceCatalogEntry: { findUnique: async () => savedSource, create: createSource },
      capabilityProfile: { findUnique: async () => savedProfile, create: createProfile },
    };
    const repository = catalog(client);
    await expect(repository.inspect()).resolves.toBe(false);
    await repository.ensure();
    await repository.ensure();
    await expect(repository.inspect()).resolves.toBe(true);
    expect(createSource).toHaveBeenCalledTimes(1);
    expect(createProfile).toHaveBeenCalledTimes(1);
    expect(savedSource).toEqual(source);
    expect(savedProfile).toEqual(profile);
  });

  it('does not replace an existing provider profile with incompatible safety/configuration metadata', async () => {
    const incompatible = { ...profile, config: { productionSafe: false } };
    const createSource = jest.fn(), createProfile = jest.fn();
    const repository = catalog({
      sourceCatalogEntry: { findUnique: async () => source, create: createSource },
      capabilityProfile: { findUnique: async () => incompatible, create: createProfile },
    });
    await expect(repository.ensure()).rejects.toMatchObject({ code: 'catalog_conflict' });
    expect(createSource).not.toHaveBeenCalled();
    expect(createProfile).not.toHaveBeenCalled();
    expect(incompatible.config).toEqual({ productionSafe: false });
  });

  it('rejects an occupied canonical catalog id instead of repurposing another source', async () => {
    const create = jest.fn();
    const repository = catalog({ sourceCatalogEntry: {
      findUnique: async ({ where }: { where: { id?: string } }) => where.id === undefined ? null : { ...source, providerKey: 'other-source' }, create,
    }, capabilityProfile: { findUnique: async () => null } });
    await expect(repository.ensure()).rejects.toMatchObject({ code: 'catalog_conflict' });
    expect(create).not.toHaveBeenCalled();
  });
});
