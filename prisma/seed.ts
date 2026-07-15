import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient, type Prisma } from "./generated/client/client";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://social_monitor:social_monitor_local_password@localhost:5432/social_monitor";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
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

type SourceCatalogSeedEntry = {
  readonly id: string;
  readonly profileId: string;
  readonly providerKey: string;
  readonly displayName: string;
  readonly acquisitionMode: string;
  readonly readiness: string;
  readonly config: Prisma.InputJsonValue;
};

const sourceCatalogEntries: readonly SourceCatalogSeedEntry[] = [
  {
    id: "00000000-0000-7000-8000-000000000001",
    profileId: "00000000-0000-7000-8000-000000000002",
    providerKey: "fake-source",
    displayName: "Fake Source",
    acquisitionMode: "fake",
    readiness: "mvp-certified",
    config: {
      supportsSearch: true,
      supportsCursor: true,
      productionSafe: true,
    },
  },
  {
    id: "00000000-0000-7000-8000-000000000101",
    profileId: "00000000-0000-7000-8000-000000000102",
    providerKey: "hacker-news",
    displayName: "Hacker News",
    acquisitionMode: "public-http",
    readiness: "mvp-certified",
    config: {
      supportsSearch: true,
      supportsListing: true,
      supportsCursor: true,
      productionSafe: true,
      requiresCredentials: false,
    },
  },
  {
    id: "00000000-0000-7000-8000-000000000201",
    profileId: "00000000-0000-7000-8000-000000000202",
    providerKey: "rss",
    displayName: "RSS",
    acquisitionMode: "public-http",
    readiness: "mvp-certified",
    config: {
      supportsUrl: true,
      supportsCursor: true,
      productionSafe: true,
      requiresCredentials: false,
    },
  },
  {
    id: "00000000-0000-7000-8000-000000000301",
    profileId: "00000000-0000-7000-8000-000000000302",
    providerKey: "github-issues",
    displayName: "GitHub Issues",
    acquisitionMode: "api",
    readiness: "mvp-certified",
    config: {
      supportsSearch: true,
      supportsCursor: true,
      productionSafe: true,
      requiresCredentials: false,
      tokenRecommended: true,
    },
  },
  {
    id: "00000000-0000-7000-8000-000000000321",
    profileId: "00000000-0000-7000-8000-000000000322",
    providerKey: "github-repo-radar",
    displayName: "GitHub Repo Radar",
    acquisitionMode: "api",
    readiness: "mvp-certified",
    config: {
      supportsSearch: true,
      supportsCursor: false,
      productionSafe: true,
      requiresCredentials: true,
      bigQueryRequired: true,
      githubTokenRecommended: true,
      trendWindows: ["24h", "7d", "30d", "90d"],
    },
  },
  {
    id: "00000000-0000-7000-8000-000000000341",
    profileId: "00000000-0000-7000-8000-000000000342",
    providerKey: "github-trending-page",
    displayName: "GitHub Trending Page",
    acquisitionMode: "public-page",
    readiness: "mvp-certified",
    config: {
      supportsListing: true,
      supportsCursor: false,
      productionSafe: true,
      requiresCredentials: false,
      windows: ["daily", "weekly", "monthly"],
      defaultWindow: "daily",
      source: "github_trending_html",
    },
  },
  {
    id: "00000000-0000-7000-8000-000000000401",
    profileId: "00000000-0000-7000-8000-000000000402",
    providerKey: "reddit",
    displayName: "Reddit",
    acquisitionMode: "oauth-api",
    readiness: "mvp-certified",
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
  {
    id: "00000000-0000-7000-8000-000000000501",
    profileId: "00000000-0000-7000-8000-000000000502",
    providerKey: "x-twitter",
    displayName: "X/Twitter",
    acquisitionMode: "x-collector-scweet",
    readiness: "provider-only",
    config: {
      supportsSearch: true,
      supportsCursor: true,
      productionSafe: true,
      requiresCredentials: true,
      requiresCollector: true,
      collectorService: "x-collector",
      supportedSearchProducts: ["top", "latest"],
      defaultSearchProducts: ["top"],
      maxWindowHours: 72,
      defaultWindowHours: 24,
      dailyAccountCapsRequired: true,
      rateLimitBackoffRequired: true,
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
