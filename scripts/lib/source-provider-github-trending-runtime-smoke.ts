import { HttpGitHubTrendingPageClient } from "../../libs/ingestion/adapters/source/github-trending-page/http-github-trending-page-client";
import { GitHubTrendingPageSourceProvider } from "../../libs/ingestion/adapters/source/github-trending-page/github-trending-page-source.provider";
import {
  GITHUB_TRENDING_PAGE_PROVIDER_KEY,
  parseGitHubTrendingPageRepositoryMetadata,
} from "../../libs/ingestion/domain";
import type {
  ProviderFailureKind,
  SourceProviderPort,
  SourceProviderScanContext,
} from "../../libs/ingestion/ports";
import { githubTrendingPageHtmlFixture, readHeader } from "./source-provider-runtime-http-fixtures";

type GitHubTrendingRuntimeSmokeDependencies = {
  readonly withMockedFetch: <TResult>(
    fetchMock: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
    run: () => Promise<TResult>,
  ) => Promise<TResult>;
  readonly assertFailure: (
    provider: SourceProviderPort,
    message: string,
    expectedKind: ProviderFailureKind,
    expectedRetryable: boolean,
  ) => void;
  readonly contextFor: (
    providerKey: string,
    config?: SourceProviderScanContext["config"],
  ) => SourceProviderScanContext;
  readonly assert: (condition: unknown, message: string) => asserts condition;
};

export async function verifyGitHubTrendingPageRuntime({
  withMockedFetch,
  assertFailure,
  contextFor,
  assert: runtimeAssert,
}: GitHubTrendingRuntimeSmokeDependencies): Promise<void> {
  const assert: GitHubTrendingRuntimeSmokeDependencies["assert"] = runtimeAssert;
  let observedTrendingPageFetch = false;
  await withMockedFetch(
    async (input, init) => {
      observedTrendingPageFetch = true;
      const url = new URL(String(input));
      assert(
        url.hostname === "github.com",
        "GitHub Trending page runtime must use github.com",
      );
      assert(
        url.pathname === "/trending/TypeScript",
        "GitHub Trending page runtime must encode language in the path",
      );
      assert(
        url.searchParams.get("since") === "daily",
        "GitHub Trending page runtime must pass the since window",
      );
      assert(
        url.searchParams.get("spoken_language_code") === "en",
        "GitHub Trending page runtime must pass spoken language when configured",
      );
      assert(
        readHeader(init?.headers, "accept") ===
          "text/html,application/xhtml+xml",
        "GitHub Trending page runtime must request HTML",
      );
      assert(
        readHeader(init?.headers, "user-agent") ===
          "social-monitor-runtime-contract",
        "GitHub Trending page runtime must pass configured User-Agent",
      );

      return new Response(githubTrendingPageHtmlFixture(), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
    async () => {
      const provider = new GitHubTrendingPageSourceProvider(
        new HttpGitHubTrendingPageClient(),
        { now: () => new Date("2026-06-24T12:00:00.000Z") },
      );
      const context = contextFor(GITHUB_TRENDING_PAGE_PROVIDER_KEY, {
        language: "TypeScript",
        spokenLanguage: "en",
        userAgent: "social-monitor-runtime-contract",
        maxItems: 1,
      });
      const result = await provider.scan(
        provider.planScan({ mode: "listing", query: "daily" }, context),
        context,
      );
      const metadata = parseGitHubTrendingPageRepositoryMetadata(
        result.items[0]?.metadata,
      );
      assert(
        result.items.length === 1,
        "GitHub Trending page runtime must emit one repository item",
      );
      assert(
        metadata !== null,
        "GitHub Trending page runtime must emit repository metadata",
      );
      assert(
        metadata.repository.fullName === "openai/codex",
        "GitHub Trending page metadata must keep repository full name",
      );
      assert(
        metadata.repository.totalStars === 54000,
        "GitHub Trending page metadata must keep total stars",
      );
      assert(
        metadata.trending.starsGained === 210,
        "GitHub Trending page metadata must keep stars gained for the selected window",
      );
      assert(
        metadata.trending.source === "github_trending_html",
        "GitHub Trending page metadata must identify live HTML runtime source",
      );
    },
  );

  assert(
    observedTrendingPageFetch,
    "GitHub Trending page runtime contract must observe live page fetch",
  );

  const sourceProvider = new GitHubTrendingPageSourceProvider(
    new HttpGitHubTrendingPageClient(),
    { now: () => new Date("2026-06-24T12:00:00.000Z") },
  );
  assertFailure(
    sourceProvider,
    "GitHub Trending page returned HTTP 403",
    "rate_limited",
    true,
  );
  assertFailure(
    sourceProvider,
    "GitHub Trending page returned HTTP 429",
    "rate_limited",
    true,
  );
  assertFailure(
    sourceProvider,
    "GitHub Trending page returned HTTP 503",
    "unavailable",
    true,
  );
}
