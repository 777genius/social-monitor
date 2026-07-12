import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  type GitHubTrendingPageClientPort,
  type GitHubTrendingPageQuery,
  type GitHubTrendingPageRepository,
} from "./github-trending-page-client.port";
import {
  GITHUB_TRENDING_PAGE_REPOSITORY_METADATA_KIND,
  parseGitHubTrendingPageRepositoryMetadata,
} from "../../../domain";
import type {
  SourceProviderScanContext,
  SourceRuntimeConfig,
} from "../../../ports";
import { certifySourceProvider } from "../testing/source-provider-certification";
import { FixtureGitHubTrendingPageClient } from "./fixture-github-trending-page-client";
import { GitHubTrendingPageSourceProvider } from "./github-trending-page-source.provider";

describe("GitHubTrendingPageSourceProvider", () => {
  certifySourceProvider({
    providerFactory: () =>
      new GitHubTrendingPageSourceProvider(
        new FixtureGitHubTrendingPageClient(),
        { now: () => new Date("2026-06-24T12:00:00.000Z") },
      ),
    validQuery: { mode: "listing", query: "daily" },
    unsupportedQueryMode: "search",
    expectedProviderKey: "github-trending-page",
    expectedFailureKind: "unavailable",
  });

  it("returns structured GitHub Trending page metadata for reader reader-summaries", async () => {
    const provider = new GitHubTrendingPageSourceProvider(
      new FixtureGitHubTrendingPageClient(),
      { now: () => new Date("2026-06-24T12:00:00.000Z") },
    );
    const scanContext = context({
      language: "Python",
      maxItems: 1,
      fixtureMode: true,
    });

    const result = await provider.scan(
      provider.planScan({ mode: "listing", query: "today" }, scanContext),
      scanContext,
    );

    expect(result.nextCursor).toBe("2026-06-24T12:00:00.000Z");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      externalId:
        "github-trending-page:daily:calesthio/OpenMontage:2026-06-24T12:00:00.000Z",
      canonicalUrl: "https://github.com/calesthio/OpenMontage",
      title: "calesthio/OpenMontage is #1 on GitHub Trending",
    });
    expect(result.items[0]?.metadata).toMatchObject({
      kind: GITHUB_TRENDING_PAGE_REPOSITORY_METADATA_KIND,
      repository: {
        fullName: "calesthio/OpenMontage",
        language: "Python",
        totalStars: 18398,
      },
      trending: {
        rank: 1,
        starsGained: 3703,
        window: "daily",
        source: "fixture_github_trending_html",
      },
    });
    expect(
      parseGitHubTrendingPageRepositoryMetadata(result.items[0]?.metadata),
    ).toEqual(
      expect.objectContaining({
        repository: expect.objectContaining({
          fullName: "calesthio/OpenMontage",
        }),
        trending: expect.objectContaining({
          rank: 1,
          starsGained: 3703,
          window: "daily",
        }),
      }),
    );
  });

  it("skips repositories with incomplete trending metrics instead of polluting feed evidence", async () => {
    const provider = new GitHubTrendingPageSourceProvider(
      new PartiallyInvalidGitHubTrendingPageClient(),
      { now: () => new Date("2026-06-24T12:00:00.000Z") },
    );
    const scanContext = context({ maxItems: 3 });

    const result = await provider.scan(
      provider.planScan({ mode: "listing", query: "daily" }, scanContext),
      scanContext,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      canonicalUrl: "https://github.com/apple/container",
      title: "apple/container is #2 on GitHub Trending",
    });
    expect(result.warnings).toEqual([
      "Some GitHub Trending page repositories had incomplete rank, URL or star metrics and were skipped.",
    ]);
  });

  it("scans multiple configured languages in one binding and deduplicates repositories", async () => {
    const client = new CapturingGitHubTrendingPageClient(
      new FixtureGitHubTrendingPageClient(),
    );
    const provider = new GitHubTrendingPageSourceProvider(client, {
      now: () => new Date("2026-06-24T12:00:00.000Z"),
    });
    const scanContext = context({
      languages: ["overall", "Python", "Swift", "Python"],
      spokenLanguage: "en",
      maxItems: 5,
      maxItemsPerLanguage: 2,
      fixtureMode: true,
    });

    const result = await provider.scan(
      provider.planScan({ mode: "listing", query: "daily" }, scanContext),
      scanContext,
    );

    expect(client.languages).toEqual([undefined, "Python", "Swift"]);
    expect(result.items.map((item) => item.canonicalUrl)).toEqual([
      "https://github.com/calesthio/OpenMontage",
      "https://github.com/apple/container",
      "https://github.com/ZhuLinsen/daily_stock_analysis",
    ]);
    const firstMetadata = parseGitHubTrendingPageRepositoryMetadata(
      result.items[0]?.metadata,
    );
    expect(firstMetadata?.trending).toMatchObject({
      rank: 1,
      capturedAt: "2026-06-24T12:00:00.000Z",
      scope: { spokenLanguage: "en" },
    });
    expect(
      firstMetadata?.trending.appearances.map((appearance) => ({
        rank: appearance.rank,
        starsGained: appearance.starsGained,
        scope: appearance.scope,
      })),
    ).toEqual([
      {
        rank: 1,
        starsGained: 3703,
        scope: { spokenLanguage: "en" },
      },
      {
        rank: 1,
        starsGained: 3703,
        scope: {
          programmingLanguage: "Python",
          spokenLanguage: "en",
        },
      },
    ]);
  });

  it("orders repositories by GitHub rank within the requested source scope", async () => {
    const provider = new GitHubTrendingPageSourceProvider(
      new RankContradictsStarsGitHubTrendingPageClient(),
      { now: () => new Date("2026-06-24T12:00:00.000Z") },
    );
    const scanContext = context({ maxItems: 2 });

    const result = await provider.scan(
      provider.planScan({ mode: "listing", query: "daily" }, scanContext),
      scanContext,
    );

    expect(result.items.map((item) => item.title)).toEqual([
      "example/source-rank-one is #1 on GitHub Trending",
      "example/source-rank-two is #2 on GitHub Trending",
    ]);
  });

  it("gives later configured scopes a fair chance within the total item limit", async () => {
    const provider = new GitHubTrendingPageSourceProvider(
      new ScopeFairnessGitHubTrendingPageClient(),
      { now: () => new Date("2026-06-24T12:00:00.000Z") },
    );
    const scanContext = context({
      languages: ["overall", "Python"],
      maxItems: 2,
      maxItemsPerLanguage: 2,
    });

    const result = await provider.scan(
      provider.planScan({ mode: "listing", query: "daily" }, scanContext),
      scanContext,
    );

    expect(result.items.map((item) => item.canonicalUrl)).toEqual([
      "https://github.com/example/overall-one",
      "https://github.com/example/shared",
    ]);
    expect(result.items[1]?.title).toBe(
      "example/shared is #1 on GitHub Trending",
    );
    expect(
      parseGitHubTrendingPageRepositoryMetadata(result.items[1]?.metadata)
        ?.trending.scope,
    ).toEqual({ programmingLanguage: "Python" });
  });

  it("keeps broad configured language coverage beyond the old ten-language cap", async () => {
    const client = new CapturingGitHubTrendingPageClient(
      new FixtureGitHubTrendingPageClient(),
    );
    const provider = new GitHubTrendingPageSourceProvider(client, {
      now: () => new Date("2026-06-24T12:00:00.000Z"),
    });
    const languages = [
      "overall",
      "TypeScript",
      "Python",
      "Rust",
      "JavaScript",
      "Go",
      "Dart",
      "Shell",
      "C++",
      "Kotlin",
      "Java",
      "C#",
      "Swift",
      "PHP",
      "Ruby",
      "Jupyter Notebook",
    ];
    const scanContext = context({
      languages,
      maxItems: 5,
      maxItemsPerLanguage: 1,
      fixtureMode: true,
    });

    await provider.scan(
      provider.planScan({ mode: "listing", query: "daily" }, scanContext),
      scanContext,
    );

    expect(client.languages).toHaveLength(languages.length);
    expect(client.languages).toEqual([
      undefined,
      "TypeScript",
      "Python",
      "Rust",
      "JavaScript",
      "Go",
      "Dart",
      "Shell",
      "C++",
      "Kotlin",
      "Java",
      "C#",
      "Swift",
      "PHP",
      "Ruby",
      "Jupyter Notebook",
    ]);
  });
});

class PartiallyInvalidGitHubTrendingPageClient implements GitHubTrendingPageClientPort {
  async listTrendingRepositories(
    query: GitHubTrendingPageQuery,
  ): Promise<readonly GitHubTrendingPageRepository[]> {
    void query;

    return [
      {
        fullName: "calesthio/OpenMontage",
        url: "https://github.com/calesthio/OpenMontage",
        description: "Parser drift row with missing stars gained.",
        language: "Python",
        totalStars: 18398,
        forksCount: 2113,
        starsGained: 0,
        rank: 1,
      },
      {
        fullName: "apple/container",
        url: "https://github.com/apple/container",
        description: "A tool for creating and running Linux containers.",
        language: "Swift",
        totalStars: 41719,
        forksCount: 1219,
        starsGained: 1746,
        rank: 2,
      },
    ];
  }
}

class CapturingGitHubTrendingPageClient implements GitHubTrendingPageClientPort {
  readonly languages: (string | undefined)[] = [];

  constructor(private readonly inner: GitHubTrendingPageClientPort) {}

  async listTrendingRepositories(
    query: GitHubTrendingPageQuery,
  ): Promise<readonly GitHubTrendingPageRepository[]> {
    this.languages.push(query.language);

    return this.inner.listTrendingRepositories(query);
  }
}

class RankContradictsStarsGitHubTrendingPageClient implements GitHubTrendingPageClientPort {
  async listTrendingRepositories(): Promise<
    readonly GitHubTrendingPageRepository[]
  > {
    return [
      {
        fullName: "example/source-rank-two",
        url: "https://github.com/example/source-rank-two",
        totalStars: 12000,
        forksCount: 120,
        starsGained: 900,
        rank: 2,
      },
      {
        fullName: "example/source-rank-one",
        url: "https://github.com/example/source-rank-one",
        totalStars: 1200,
        forksCount: 12,
        starsGained: 9,
        rank: 1,
      },
    ];
  }
}

class ScopeFairnessGitHubTrendingPageClient implements GitHubTrendingPageClientPort {
  async listTrendingRepositories(
    query: GitHubTrendingPageQuery,
  ): Promise<readonly GitHubTrendingPageRepository[]> {
    const repositories =
      query.language === "Python"
        ? [
            { name: "shared", rank: 1 },
            { name: "python-two", rank: 2 },
          ]
        : [
            { name: "overall-one", rank: 1 },
            { name: "shared", rank: 2 },
          ];

    return repositories.map(({ name, rank }) => ({
      fullName: `example/${name}`,
      url: `https://github.com/example/${name}`,
      language: query.language,
      totalStars: 1000 - rank,
      forksCount: 10,
      starsGained: 100 - rank,
      rank,
    }));
  }
}

const context = (
  config: SourceRuntimeConfig = {},
): SourceProviderScanContext => ({
  tenantId: tenantId("tenant-github-trending-page"),
  workspaceId: workspaceId("workspace-github-trending-page"),
  sourceBindingId: "binding-github-trending-page",
  scanJobId: "scan-github-trending-page",
  correlationId: "correlation-github-trending-page",
  config,
});
