import {
  cleanRealDayCollectionAcquisitionModel,
  defaultCleanRealDayCollectionProviderKeys,
} from "./clean-real-day-collection-report";

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

  it("labels mixed live collection and durable reuse without a GitHub network claim", () => {
    const scans = [
      {
        providerKey: "github-trending-page",
        acquisitionMode: "durable_snapshot_reuse",
      },
      {
        providerKey: "hacker-news",
        acquisitionMode: "live_collection",
      },
    ] as const;

    expect(cleanRealDayCollectionAcquisitionModel(scans)).toEqual({
      liveNetwork: true,
      liveNetworkProviderKeys: ["hacker-news"],
      durableSnapshotReuseProviderKeys: ["github-trending-page"],
    });
  });

  it("reports a network-free durable-only acquisition", () => {
    const scans = [
      {
        providerKey: "github-trending-page",
        acquisitionMode: "durable_snapshot_reuse",
      },
    ] as const;

    expect(cleanRealDayCollectionAcquisitionModel(scans)).toEqual({
      liveNetwork: false,
      liveNetworkProviderKeys: [],
      durableSnapshotReuseProviderKeys: ["github-trending-page"],
    });
  });
});
