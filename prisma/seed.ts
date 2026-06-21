import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from './generated/client/client';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://social_monitor:social_monitor_local_password@localhost:5432/social_monitor';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  for (const entry of sourceCatalogEntries) {
    const source = await prisma.sourceCatalogEntry.upsert({
      where: { providerKey: entry.providerKey },
      update: {
        displayName: entry.displayName,
        acquisitionMode: entry.acquisitionMode,
        readiness: entry.readiness,
      },
      create: {
        id: entry.id,
        providerKey: entry.providerKey,
        displayName: entry.displayName,
        acquisitionMode: entry.acquisitionMode,
        readiness: entry.readiness,
      },
    });

    await prisma.capabilityProfile.upsert({
      where: {
        sourceId_version: {
          sourceId: source.id,
          version: 1,
        },
      },
      update: {
        schemaVersion: 1,
        config: entry.config,
      },
      create: {
        id: entry.profileId,
        sourceId: source.id,
        version: 1,
        schemaVersion: 1,
        config: entry.config,
      },
    });
  }
}

const sourceCatalogEntries = [
  {
    id: '00000000-0000-7000-8000-000000000001',
    profileId: '00000000-0000-7000-8000-000000000002',
    providerKey: 'fake-source',
    displayName: 'Fake Source',
    acquisitionMode: 'fake',
    readiness: 'mvp-certified',
    config: {
      supportsSearch: true,
      supportsCursor: true,
      productionSafe: true,
    },
  },
  {
    id: '00000000-0000-7000-8000-000000000101',
    profileId: '00000000-0000-7000-8000-000000000102',
    providerKey: 'hacker-news',
    displayName: 'Hacker News',
    acquisitionMode: 'public-http',
    readiness: 'mvp-certified',
    config: {
      supportsSearch: true,
      supportsListing: true,
      supportsCursor: true,
      productionSafe: true,
      requiresCredentials: false,
    },
  },
  {
    id: '00000000-0000-7000-8000-000000000201',
    profileId: '00000000-0000-7000-8000-000000000202',
    providerKey: 'rss',
    displayName: 'RSS',
    acquisitionMode: 'public-http',
    readiness: 'mvp-certified',
    config: {
      supportsUrl: true,
      supportsCursor: true,
      productionSafe: true,
      requiresCredentials: false,
    },
  },
  {
    id: '00000000-0000-7000-8000-000000000301',
    profileId: '00000000-0000-7000-8000-000000000302',
    providerKey: 'github',
    displayName: 'GitHub',
    acquisitionMode: 'api',
    readiness: 'mvp-certified',
    config: {
      supportsSearch: true,
      supportsCursor: true,
      productionSafe: true,
      requiresCredentials: false,
      tokenRecommended: true,
    },
  },
  {
    id: '00000000-0000-7000-8000-000000000401',
    profileId: '00000000-0000-7000-8000-000000000402',
    providerKey: 'reddit',
    displayName: 'Reddit',
    acquisitionMode: 'oauth-api',
    readiness: 'mvp-certified',
    config: {
      supportsSearch: true,
      supportsListing: true,
      supportsCursor: true,
      productionSafe: true,
      requiresCredentials: false,
      appOnlyOAuth: true,
      tenantCredentialOverrideSupported: true,
    },
  },
];

void main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
