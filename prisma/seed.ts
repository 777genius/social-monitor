import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from './generated/client/client';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://social_monitor:social_monitor_local_password@localhost:5432/social_monitor';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  await prisma.sourceCatalogEntry.upsert({
    where: { providerKey: 'fake-source' },
    update: {},
    create: {
      id: '00000000-0000-7000-8000-000000000001',
      providerKey: 'fake-source',
      displayName: 'Fake Source',
      acquisitionMode: 'fake',
      readiness: 'mvp-certified',
      capabilityProfiles: {
        create: {
          id: '00000000-0000-7000-8000-000000000002',
          version: 1,
          schemaVersion: 1,
          config: {
            supportsSearch: true,
            supportsCursor: true,
            productionSafe: true,
          },
        },
      },
    },
  });
}

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
