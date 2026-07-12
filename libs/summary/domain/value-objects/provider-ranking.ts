export type GitHubTrendingWindow = "daily" | "weekly" | "monthly";

export type GitHubTrendingScope = {
  readonly programmingLanguage?: string;
  readonly spokenLanguage?: string;
};

/**
 * Provider-owned position captured from one GitHub Trending list snapshot.
 *
 * Positions are comparable only when `window`, `capturedAt` and `scope` match.
 */
export type GitHubTrendingProviderRanking = {
  readonly kind: "github_trending";
  readonly position: number;
  readonly starsGained: number;
  readonly window: GitHubTrendingWindow;
  readonly capturedAt: string;
  readonly scope: GitHubTrendingScope;
};

export type ProviderRanking = GitHubTrendingProviderRanking;
