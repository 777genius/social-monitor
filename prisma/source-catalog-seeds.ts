import type { Prisma } from "./generated/client/client";

export type SourceCatalogSeedEntry = {
  readonly id: string;
  readonly profileId: string;
  readonly providerKey: string;
  readonly displayName: string;
  readonly acquisitionMode: string;
  readonly readiness: string;
  readonly config: Prisma.InputJsonValue;
};

export const telegramCatalogSeed: SourceCatalogSeedEntry = {
  id: "00000000-0000-7000-8000-000000000601",
  profileId: "00000000-0000-7000-8000-000000000602",
  providerKey: "telegram",
  displayName: "Telegram public channels",
  acquisitionMode: "public-page",
  readiness: "mvp-certified",
  config: { supportsAccountFeed: true, supportsUrl: true, supportsCursor: true, productionSafe: true, requiresCredentials: false },
};

export const sourceCatalogEntries: readonly SourceCatalogSeedEntry[] = [
  telegramCatalogSeed,
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

