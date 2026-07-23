import { feedDedupeKeyForItem } from "./feed-dedupe-key";

describe("feedDedupeKeyForItem", () => {
  it("keeps one GitHub Trending repository observation per UTC day", () => {
    expect(
      feedDedupeKeyForItem({
        canonicalUrl: "https://github.com/Example/Project",
        sourceBindingId: "binding-github-trending",
        providerMetadata: githubTrendingMetadata(
          "2026-07-10T22:20:08.181Z",
        ),
      }),
    ).toBe(
      "github-trending:binding-github-trending:daily:2026-07-10:example/project",
    );
  });

  it("does not collapse the same Trending repository across days", () => {
    const first = feedDedupeKeyForItem({
      canonicalUrl: "https://github.com/example/project",
      sourceBindingId: "binding-github-trending",
      providerMetadata: githubTrendingMetadata("2026-07-10T23:00:00.000Z"),
    });
    const second = feedDedupeKeyForItem({
      canonicalUrl: "https://github.com/example/project",
      sourceBindingId: "binding-github-trending",
      providerMetadata: githubTrendingMetadata("2026-07-11T00:01:00.000Z"),
    });

    expect(first).not.toBe(second);
  });

  it("keeps observations from separate source bindings independent", () => {
    const first = feedDedupeKeyForItem({
      canonicalUrl: "https://github.com/example/project",
      sourceBindingId: "binding-a",
      providerMetadata: githubTrendingMetadata("2026-07-10T10:00:00.000Z"),
    });
    const second = feedDedupeKeyForItem({
      canonicalUrl: "https://github.com/example/project",
      sourceBindingId: "binding-b",
      providerMetadata: githubTrendingMetadata("2026-07-10T10:00:00.000Z"),
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
          trending: { window: "daily", checkedAt: "not-a-date" },
          repository: { fullName: "example/project" },
        },
      }),
    ).toBe("https://github.com/example/project");
  });
});

const githubTrendingMetadata = (checkedAt: string) => ({
  kind: "github_trending_page_repository",
  repository: { fullName: "Example/Project" },
  trending: { window: "daily", checkedAt },
});
