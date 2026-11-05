import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "./generated/client/client";
import { sourceCatalogEntries, type SourceCatalogSeedEntry } from "./source-catalog-seeds";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://social_monitor:social_monitor_local_password@localhost:5432/social_monitor";
const pool = new Pool({ connectionString, min: 0, max: 1 });
const adapter = new PrismaPg(pool, { disposeExternalPool: false });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  for (const entry of sourceCatalogEntries) {
    const source = await upsertSourceCatalogEntry(entry);

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

async function upsertSourceCatalogEntry(entry: SourceCatalogSeedEntry) {
  const data = {
    providerKey: entry.providerKey,
    displayName: entry.displayName,
    acquisitionMode: entry.acquisitionMode,
    readiness: entry.readiness,
  };
  const existingByProviderKey = await prisma.sourceCatalogEntry.findUnique({
    where: { providerKey: entry.providerKey },
  });
  if (existingByProviderKey !== null) {
    return prisma.sourceCatalogEntry.update({
      where: { providerKey: entry.providerKey },
      data,
    });
  }

  const existingById = await prisma.sourceCatalogEntry.findUnique({
    where: { id: entry.id },
  });
  if (existingById !== null) {
    return prisma.sourceCatalogEntry.update({
      where: { id: entry.id },
      data,
    });
  }

  return prisma.sourceCatalogEntry.create({
    data: {
      id: entry.id,
      ...data,
    },
  });
}

async function run(): Promise<void> {
  let failed = false;
  try {
    await main();
  } catch (error: unknown) {
    failed = true;
    console.error(error);
  } finally {
    try {
      await prisma.$disconnect();
    } catch (error: unknown) {
      failed = true;
      console.error(error);
    }
    try {
      await pool.end();
    } catch (error: unknown) {
      failed = true;
      console.error(error);
    }
  }
  if (failed) {
    process.exitCode = 1;
  }
}

void run();
