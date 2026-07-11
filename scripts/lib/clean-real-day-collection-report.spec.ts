import { defaultCleanRealDayCollectionProviderKeys } from "./clean-real-day-collection-report";

describe("clean real-day collection provider defaults", () => {
  it("collects every production summary provider, including GitHub Trending", () => {
    expect(defaultCleanRealDayCollectionProviderKeys).toEqual([
      "github-trending-page",
      "hacker-news",
      "reddit",
      "rss",
      "x-twitter",
    ]);
  });
});
