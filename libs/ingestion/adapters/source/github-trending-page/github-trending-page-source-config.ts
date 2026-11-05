import { githubTrendingPageWindows, type GitHubTrendingPageRepositoryMetadataInput, type GitHubTrendingPageWindow } from '../../../domain';
import type { SourceQuery, SourceProviderScanContext } from '../../../ports';

export type GitHubTrendingPageConfig = {
  readonly window: GitHubTrendingPageWindow;
  readonly languages: readonly (string | undefined)[];
  readonly spokenLanguage?: string;
  readonly userAgent?: string;
  readonly maxItemsPerLanguage: number;
  readonly source: GitHubTrendingPageRepositoryMetadataInput["trending"]["source"];
};

export const parseConfig = (
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

export const readWindow = (value: unknown): GitHubTrendingPageWindow | undefined => {
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

export const readPositiveInteger = (
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
