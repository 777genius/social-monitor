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
        "github-trending-page:daily:scan-github-trending-page:calesthio/OpenMontage",
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
        scanJobId: "scan-github-trending-page",
        fetchStartedAt: "2026-06-24T12:00:00.000Z",
        checkedAt: "2026-06-24T12:00:00.000Z",
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

  it("rejects a post-midnight fetch instead of backdating it into the requested day", async () => {
    const client = new CountingGitHubTrendingPageClient();
    const provider = new GitHubTrendingPageSourceProvider(
      client,
      { now: () => new Date("2026-07-13T00:00:25.000Z") },
    );
    const scanContext = context({
      maxItems: 1,
      fixtureMode: true,
      targetPublishedWindow: {
        startInclusive: "2026-07-12T00:00:00.000Z",
        endExclusive: "2026-07-13T00:00:00.000Z",
      },
    });

    await expect(
      provider.scan(
        provider.planScan({ mode: "listing", query: "daily" }, scanContext),
        scanContext,
      ),
    ).rejects.toThrow(
      "GitHub Trending daily fetchStartedAt must belong to the requested UTC day",
    );
    expect(client.calls).toBe(0);
  });

  it("rejects a fetch that crosses UTC midnight before publishing any item", async () => {
    const instants = [
      new Date("2026-07-12T23:59:59.900Z"),
      new Date("2026-07-13T00:00:00.100Z"),
    ];
    const provider = new GitHubTrendingPageSourceProvider(
      new FixtureGitHubTrendingPageClient(),
      {
        now: () => {
          const instant = instants.shift();
          if (instant === undefined) {
            throw new Error("Unexpected clock read");
          }
          return instant;
        },
      },
    );
    const scanContext = context({
      maxItems: 1,
      fixtureMode: true,
      targetPublishedWindow: {
        startInclusive: "2026-07-12T00:00:00.000Z",
        endExclusive: "2026-07-13T00:00:00.000Z",
      },
    });

    await expect(
      provider.scan(
        provider.planScan({ mode: "listing", query: "daily" }, scanContext),
        scanContext,
      ),
    ).rejects.toThrow(
      "GitHub Trending daily checkedAt must belong to the requested UTC day",
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
      title: "apple/container is #1 on GitHub Trending",
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
    expect(
      result.items.map(
        (item) =>
          parseGitHubTrendingPageRepositoryMetadata(item.metadata)?.trending
            .rank,
      ),
    ).toEqual([1, 2, 3]);
  });

  it("produces deterministic multilingual Top 10 ranks regardless of language order", async () => {
    const provider = new GitHubTrendingPageSourceProvider(
      new MultilingualTopTenClient(),
      { now: () => new Date("2026-06-24T12:00:00.000Z") },
    );
    const scan = async (languages: readonly string[]) => {
      const scanContext = context({
        languages,
        maxItems: 10,
        maxItemsPerLanguage: 10,
      });
      return provider.scan(
        provider.planScan({ mode: "listing", query: "daily" }, scanContext),
        scanContext,
      );
    };

    const forward = await scan(["Python", "Rust"]);
    const reversed = await scan(["Rust", "Python"]);
    const board = (items: typeof forward.items) =>
      items.map((item) => ({
        url: item.canonicalUrl,
        rank:
          parseGitHubTrendingPageRepositoryMetadata(item.metadata)?.trending
            .rank,
      }));

    expect(board(reversed.items)).toEqual(board(forward.items));
    expect(board(forward.items).map((item) => item.rank)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("excludes rank 11 from source admission even when maxItems is larger", async () => {
    const provider = new GitHubTrendingPageSourceProvider(
      new MultilingualTopTenClient(),
      { now: () => new Date("2026-06-24T12:00:00.000Z") },
    );
    const scanContext = context({
      languages: ["Python", "Rust"],
      maxItems: 25,
      maxItemsPerLanguage: 25,
    });

    const result = await provider.scan(
      provider.planScan({ mode: "listing", query: "daily" }, scanContext),
      scanContext,
    );
    const ranks = result.items.map(
      (item) =>
        parseGitHubTrendingPageRepositoryMetadata(item.metadata)?.trending
          .rank,
    );

    expect(result.items).toHaveLength(10);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ranks).not.toContain(11);
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

class CountingGitHubTrendingPageClient implements GitHubTrendingPageClientPort {
  calls = 0;

  async listTrendingRepositories(): Promise<
    readonly GitHubTrendingPageRepository[]
  > {
    this.calls += 1;
    return [];
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

class MultilingualTopTenClient implements GitHubTrendingPageClientPort {
  async listTrendingRepositories(
    query: GitHubTrendingPageQuery,
  ): Promise<readonly GitHubTrendingPageRepository[]> {
    const offset = query.language === "Rust" ? 6 : 0;
    return Array.from({ length: 6 }, (_, index) => {
      const repositoryNumber = offset + index + 1;
      return {
        fullName: `owner/repository-${repositoryNumber}`,
        url: `https://github.com/owner/repository-${repositoryNumber}`,
        description: `Repository ${repositoryNumber}`,
        language: query.language,
        totalStars: 20_000 - repositoryNumber,
        forksCount: repositoryNumber,
        starsGained: 2_000 - index,
        rank: index + 1,
      };
    });
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
