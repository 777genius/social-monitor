import { feedDedupeKeyForItem } from "./feed-dedupe-key";

describe("feedDedupeKeyForItem", () => {
  it("keeps one GitHub Trending repository observation per immutable scan", () => {
    expect(
      feedDedupeKeyForItem({
        canonicalUrl: "https://github.com/Example/Project",
        sourceBindingId: "binding-github-trending",
        providerMetadata: githubTrendingMetadata("scan-github-1"),
      }),
    ).toBe(
      "github-trending:binding-github-trending:daily:scan-github-1:example/project",
    );
  });

  it("does not collapse same-day Trending repositories across scans", () => {
    const first = feedDedupeKeyForItem({
      canonicalUrl: "https://github.com/example/project",
      sourceBindingId: "binding-github-trending",
      providerMetadata: githubTrendingMetadata("scan-github-1"),
    });
    const second = feedDedupeKeyForItem({
      canonicalUrl: "https://github.com/example/project",
      sourceBindingId: "binding-github-trending",
      providerMetadata: githubTrendingMetadata("scan-github-2"),
    });

    expect(first).not.toBe(second);
  });

  it("keeps observations from separate source bindings independent", () => {
    const first = feedDedupeKeyForItem({
      canonicalUrl: "https://github.com/example/project",
      sourceBindingId: "binding-a",
      providerMetadata: githubTrendingMetadata("scan-github-1"),
    });
    const second = feedDedupeKeyForItem({
      canonicalUrl: "https://github.com/example/project",
      sourceBindingId: "binding-b",
      providerMetadata: githubTrendingMetadata("scan-github-1"),
    });

    expect(first).not.toBe(second);
  });

  it("falls back to canonical URL dedupe for malformed Trending metadata", () => {
    expect(
      feedDedupeKeyForItem({
        canonicalUrl: "https://GitHub.com/example/project/?utm_source=test",
        sourceBindingId: "binding-github-trending",
        providerMetadata: {
          kind: "github_trending_page_repository",
          trending: { window: "daily", scanJobId: "" },
          repository: { fullName: "example/project" },
        },
      }),
    ).toBe("https://github.com/example/project");
  });
});

const githubTrendingMetadata = (scanJobId: string) => ({
  kind: "github_trending_page_repository",
  repository: { fullName: "Example/Project" },
  trending: { window: "daily", scanJobId },
});
