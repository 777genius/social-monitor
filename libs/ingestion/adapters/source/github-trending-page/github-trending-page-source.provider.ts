import { redactSensitiveText } from "@social-monitor/shared-kernel";

import {
  GITHUB_TRENDING_PAGE_PROVIDER_KEY,
  githubTrendingPageRepositoryMetadata,
  githubTrendingPageWindows,
  type GitHubTrendingPageAppearanceInput,
  type GitHubTrendingPageRepositoryMetadataInput,
  type GitHubTrendingPageWindow,
} from "../../../domain";
import type {
  FetchedSourceItem,
  ProviderFailure,
  SourceCapabilityProfile,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
} from "../../../ports";
import type {
  GitHubTrendingPageClientPort,
  GitHubTrendingPageRepository,
} from "./github-trending-page-client.port";
import {
  githubTrendingPageScope,
  rankGitHubTrendingRepositoriesBySourceScope,
  type RankedGitHubTrendingRepository,
} from "./github-trending-page-source-ranking";

const capabilityProfile: SourceCapabilityProfile = {
  providerKey: GITHUB_TRENDING_PAGE_PROVIDER_KEY,
  displayName: "GitHub Trending Page",
  version: 1,
  productionSafe: true,
  supportedContentUnits: ["link"],
  supportedQueryModes: ["listing"],
  cursorModel: "time",
  stableIdentity: [
    "canonicalUrl",
    "providerMetadata.repository.fullName",
    "providerMetadata.trending.window",
    "providerMetadata.trending.scope",
    "providerMetadata.trending.rank",
    "providerMetadata.trending.capturedAt",
  ],
  quotaModel: "per_app",
  limitations: [
    "Uses the public GitHub Trending HTML page because GitHub does not expose an official Trending REST endpoint.",
    "Results match the page ranking at scan time, but the page algorithm is GitHub-owned and can change without notice.",
  ],
};

export class GitHubTrendingPageSourceProvider implements SourceProviderPort {
  constructor(
    private readonly client: GitHubTrendingPageClientPort,
    private readonly clock: { now(): Date },
  ) {}

  key(): string {
    return capabilityProfile.providerKey;
  }

  capabilityProfile(): SourceCapabilityProfile {
    return capabilityProfile;
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    if (!capabilityProfile.supportedQueryModes.includes(query.mode)) {
      return { ok: false, reason: `Unsupported query mode: ${query.mode}` };
    }

    if (readWindow(query.query) === undefined) {
      return {
        ok: false,
        reason:
          "GitHub Trending page query must be daily, weekly, monthly, today, week or month",
      };
    }

    return { ok: true };
  }

  planScan(
    query: SourceQuery,
    context: SourceProviderScanContext,
  ): SourceProviderScanPlan {
    return {
      query,
      maxItems: readPositiveInteger(context.config?.maxItems, 25, 1, 100),
    };
  }

  async scan(
    plan: SourceProviderScanPlan,
    context: SourceProviderScanContext,
  ): Promise<SourceProviderScanResult> {
    const config = parseConfig(plan.query, context, plan.maxItems);
    const capturedAt = this.clock.now();
    const occurrences = (
      await Promise.all(
        config.languages.map(async (programmingLanguage, scopeIndex) => {
          const repositories = await this.client.listTrendingRepositories({
            window: config.window,
            language: programmingLanguage,
            spokenLanguage: config.spokenLanguage,
            limit: config.maxItemsPerLanguage,
            userAgent: config.userAgent,
          });

          return repositories.map((repository) => ({
            repository,
            scope: githubTrendingPageScope({
              programmingLanguage,
              spokenLanguage: config.spokenLanguage,
            }),
            scopeIndex,
          }));
        }),
      )
    ).flat();
    const validOccurrences = occurrences.filter(({ repository }) =>
      isUsableTrendingRepository(repository),
    );
    const rankedRepositories = rankGitHubTrendingRepositoriesBySourceScope(
      validOccurrences,
      config.languages.length,
      plan.maxItems,
    );

    return {
      items: rankedRepositories.map((candidate) =>
        normalizeRepository({
          candidate,
          window: config.window,
          capturedAt,
          source: config.source,
        }),
      ),
      nextCursor: capturedAt.toISOString(),
      warnings: githubTrendingPageWarnings({
        fetchedCount: occurrences.length,
        validCount: validOccurrences.length,
      }),
    };
  }

  classifyError(error: unknown): ProviderFailure {
    const rawMessage =
      error instanceof Error
        ? error.message
        : "Unknown GitHub Trending page provider error";
    const lowerMessage = rawMessage.toLowerCase();
    const message = redactSensitiveText(rawMessage);

    if (
      rawMessage.includes("403") ||
      rawMessage.includes("429") ||
      lowerMessage.includes("rate limit")
    ) {
      return {
        kind: "rate_limited",
        retryable: true,
        message,
      };
    }

    return {
      kind: "unavailable",
      retryable: true,
      message,
    };
  }
}

type GitHubTrendingPageConfig = {
  readonly window: GitHubTrendingPageWindow;
  readonly languages: readonly (string | undefined)[];
  readonly spokenLanguage?: string;
  readonly userAgent?: string;
  readonly maxItemsPerLanguage: number;
  readonly source: GitHubTrendingPageRepositoryMetadataInput["trending"]["source"];
};

const parseConfig = (
  query: SourceQuery,
  context: SourceProviderScanContext,
  maxItems: number,
): GitHubTrendingPageConfig => {
  const window =
    readWindow(context.config?.window) ??
    readWindow(context.config?.since) ??
    readWindow(query.query);

  if (window === undefined) {
    throw new Error("GitHub Trending page window is invalid");
  }

  readPositiveInteger(context.config?.maxItems, maxItems, 1, 100);

  return {
    window,
    languages: readLanguages(
      context.config?.languages,
      context.config?.language,
    ),
    spokenLanguage: firstNonEmptyString(context.config?.spokenLanguage),
    userAgent: firstNonEmptyString(context.config?.userAgent),
    maxItemsPerLanguage: readPositiveInteger(
      context.config?.maxItemsPerLanguage,
      maxItems,
      1,
      100,
    ),
    source: readBoolean(context.config?.fixtureMode, false)
      ? "fixture_github_trending_html"
      : "github_trending_html",
  };
};

const normalizeRepository = (params: {
  readonly candidate: RankedGitHubTrendingRepository;
  readonly window: GitHubTrendingPageWindow;
  readonly capturedAt: Date;
  readonly source: GitHubTrendingPageRepositoryMetadataInput["trending"]["source"];
}): FetchedSourceItem => {
  const { candidate, window, capturedAt, source } = params;
  const { repository, scope } = candidate.primary;
  const metadata = githubTrendingPageRepositoryMetadata({
    repository: {
      fullName: repository.fullName,
      url: repository.url,
      description: repository.description,
      language: repository.language,
      totalStars: repository.totalStars,
      forksCount: repository.forksCount,
    },
    trending: {
      rank: repository.rank,
      starsGained: repository.starsGained,
      window,
      checkedAt: capturedAt,
      capturedAt,
      scope,
      appearances: candidate.occurrences.map(
        (occurrence): GitHubTrendingPageAppearanceInput => ({
          rank: occurrence.repository.rank,
          starsGained: occurrence.repository.starsGained,
          window,
          capturedAt,
          scope: occurrence.scope,
        }),
      ),
      source,
    },
  });
  const description =
    repository.description ?? "No GitHub Trending description available.";

  return {
    externalId: `github-trending-page:${window}:${repository.fullName}:${capturedAt.toISOString()}`,
    canonicalUrl: repository.url,
    title: `${repository.fullName} is #${repository.rank} on GitHub Trending`,
    body: `${description}\nGitHub Trending ${window}: #${repository.rank}, +${repository.starsGained} stars. Total stars: ${repository.totalStars}.`,
    authorHandle: repository.fullName.split("/")[0],
    publishedAt: capturedAt,
    metadata,
  };
};

const isUsableTrendingRepository = (
  repository: GitHubTrendingPageRepository,
): boolean =>
  repository.fullName.includes("/") &&
  repository.url.startsWith("https://github.com/") &&
  Number.isInteger(repository.rank) &&
  repository.rank > 0 &&
  Number.isInteger(repository.totalStars) &&
  repository.totalStars > 0 &&
  Number.isInteger(repository.forksCount) &&
  repository.forksCount >= 0 &&
  Number.isInteger(repository.starsGained) &&
  repository.starsGained > 0;

const githubTrendingPageWarnings = (params: {
  readonly fetchedCount: number;
  readonly validCount: number;
}): readonly string[] => {
  const warnings: string[] = [];

  if (params.fetchedCount === 0) {
    warnings.push(
      "GitHub Trending page returned no repositories; parser drift or an empty filtered page should be checked.",
    );
  }

  if (params.validCount < params.fetchedCount) {
    warnings.push(
      "Some GitHub Trending page repositories had incomplete rank, URL or star metrics and were skipped.",
    );
  }

  return warnings;
};

const readWindow = (value: unknown): GitHubTrendingPageWindow | undefined => {
  const normalized = firstNonEmptyString(value)
    ?.toLocaleLowerCase("en-US")
    .replace(/\s+/gu, "-");

  switch (normalized) {
    case "daily":
    case "today":
      return "daily";
    case "weekly":
    case "week":
    case "this-week":
      return "weekly";
    case "monthly":
    case "month":
    case "this-month":
      return "monthly";
    default:
      return githubTrendingPageWindows.includes(
        normalized as GitHubTrendingPageWindow,
      )
        ? (normalized as GitHubTrendingPageWindow)
        : undefined;
  }
};

const firstNonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const readLanguages = (
  languages: unknown,
  fallbackLanguage: unknown,
): readonly (string | undefined)[] => {
  const values = Array.isArray(languages) ? languages : [fallbackLanguage];
  const normalized = values
    .map(readLanguage)
    .filter((value, index, array) => {
      const key = languageKey(value);

      return (
        array.findIndex((candidate) => languageKey(candidate) === key) === index
      );
    })
    .slice(0, 24);

  return normalized.length === 0 ? [undefined] : normalized;
};

const readLanguage = (value: unknown): string | undefined => {
  const raw = firstNonEmptyString(value);

  if (raw === undefined) {
    return undefined;
  }

  const normalized = raw.toLocaleLowerCase("en-US");

  return normalized === "overall" ||
    normalized === "all" ||
    normalized === "any" ||
    normalized === "*"
    ? undefined
    : raw;
};

const languageKey = (value: string | undefined): string =>
  value?.toLocaleLowerCase("en-US") ?? "overall";

const readBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const readPositiveInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (value === undefined) {
    return fallback;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(
      `GitHub Trending page config integer must be between ${min} and ${max}`,
    );
  }

  return value;
};
