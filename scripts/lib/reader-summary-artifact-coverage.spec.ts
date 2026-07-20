import { selectedCoverageMatchesProviderBreakdown } from "./reader-summary-artifact-coverage";

describe("selectedCoverageMatchesProviderBreakdown", () => {
  it("accounts for isolated GitHub Trending appendix posts", () => {
    expect(
      selectedCoverageMatchesProviderBreakdown(
        {
          selectedFeedItemCount: 123,
          providerBreakdown: [
            { providerKey: "reddit", selectedFeedItemCount: 30 },
            { providerKey: "rss", selectedFeedItemCount: 30 },
            { providerKey: "hacker-news", selectedFeedItemCount: 30 },
            { providerKey: "x-twitter", selectedFeedItemCount: 30 },
            { providerKey: "github-trending-page", selectedFeedItemCount: 0 },
          ],
        },
        Array.from({ length: 3 }, () => ({
          providerKey: "github-trending-page",
        })),
      ),
    ).toBe(true);
  });

  it("does not double count GitHub posts already present in breakdown", () => {
    expect(
      selectedCoverageMatchesProviderBreakdown(
        {
          selectedFeedItemCount: 123,
          providerBreakdown: [
            { providerKey: "reddit", selectedFeedItemCount: 120 },
            { providerKey: "github-trending-page", selectedFeedItemCount: 3 },
          ],
        },
        Array.from({ length: 3 }, () => ({
          providerKey: "github-trending-page",
        })),
      ),
    ).toBe(true);
  });
});
