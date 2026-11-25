import { sourceQualityLaneDescriptor } from "./reader-summary-source-quality-lanes";

describe("sourceQualityLaneDescriptor", () => {
  it("keeps Reddit listing and X search lanes explicit", () => {
    expect(
      sourceQualityLaneDescriptor("reddit", {
        sourceProduct: "top",
        sourceQueryLane: { mode: "listing", query: "r/LocalLLaMA" },
      }).family,
    ).toBe("community_listing:top");
    expect(
      sourceQualityLaneDescriptor("x-twitter", {
        sourceQueryLane: { query: "Claude Code MCP" },
      }).family,
    ).toBe("search:general");
  });

  it("traces Hacker News and RSS through provider feed families", () => {
    expect(
      sourceQualityLaneDescriptor("hacker-news", {
        sourceProduct: "topstories",
      }).family,
    ).toBe("provider_feed:topstories");
    expect(sourceQualityLaneDescriptor("rss", {}).family).toBe(
      "provider_feed:default",
    );
  });
});
