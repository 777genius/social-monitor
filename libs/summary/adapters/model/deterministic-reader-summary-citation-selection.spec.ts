import type { ReaderSummaryCoveragePlanItem } from "../../domain";
import type { ProviderReaderSummaryAttempt } from "../../ports";
import {
  selectDeterministicNarrativeCitations,
  uniqueNarrativeCitationIds,
} from "./deterministic-reader-summary-citation-selection";

type Citation = ProviderReaderSummaryAttempt["draft"]["citationMap"][number];

const planItem = (clusterId: string, feedItemIds: readonly string[]): ReaderSummaryCoveragePlanItem => ({
  role: clusterId === "lead" ? "lead" : "secondary",
  clusterId,
  score: 2,
  feedItemIds,
  providerKeys: [],
  interestIds: ["ai"],
  whyImportant: ["Synthetic evidence"],
});

const cite = (citationId: string, feedItemId: string, providerKey: string): Citation => ({
  citationId,
  feedItemId,
  sourceItemId: `source-${feedItemId}`,
  providerKey,
  field: "title",
  canonicalUrl: `https://example.test/${feedItemId}`,
});

describe("deterministic reader narrative citation selection", () => {
  it("prioritizes a rare provider on the lead and does not reuse it for unrelated clusters", () => {
    const lead = planItem("lead", ["hn-lead", "rss-lead"]);
    const secondary = [planItem("second", ["hn-second"])];
    const selection = selectDeterministicNarrativeCitations({
      mode: "daily_synthesis", lead, secondary,
      citationMap: [
        cite("c-hn-lead", "hn-lead", "hacker-news"),
        cite("c-rss-lead", "rss-lead", "rss"),
        cite("c-hn-second", "hn-second", "hacker-news"),
      ],
    });
    expect(selection.leadCitationIds).toEqual(["c-rss-lead", "c-hn-second"]);
    expect(selection.dailySynthesisCitations.get("lead")?.providerKey).toBe("rss");
    expect(selection.dailySynthesisCitations.get("second")?.providerKey).toBe("hacker-news");
  });

  it("keeps single-story feed citation order and deduplicates repeated citation IDs", () => {
    const selection = selectDeterministicNarrativeCitations({
      mode: "single_story",
      lead: planItem("lead", ["feed-a", "feed-b"]),
      secondary: [],
      citationMap: [
        cite("c1", "feed-a", "rss"), cite("c1", "feed-a", "rss"),
        cite("c2", "feed-b", "hacker-news"),
      ],
    });
    expect(selection.leadCitationIds).toEqual(["c1", "c2"]);
    expect(selection.dailySynthesisCitations.size).toBe(0);
  });

  it("keeps missing evidence empty instead of inventing a citation", () => {
    const selection = selectDeterministicNarrativeCitations({
      mode: "daily_synthesis",
      lead: planItem("lead", ["not-present"]),
      secondary: [planItem("second", ["still-missing"])],
      citationMap: [],
    });
    expect(selection.leadCitationIds).toEqual([]);
    expect(selection.dailySynthesisCitations.size).toBe(0);
  });

  it("preserves stable first-in-list provider tie breaking", () => {
    const selection = selectDeterministicNarrativeCitations({
      mode: "daily_synthesis", lead: planItem("lead", ["first", "second"]),
      secondary: [], citationMap: [
        cite("c-first", "first", "rss"), cite("c-second", "second", "hacker-news"),
      ],
    });
    expect(selection.leadCitationIds).toEqual(["c-first"]);
  });

  it("ignores only absent or empty citations when deduplicating", () => {
    expect(uniqueNarrativeCitationIds([undefined, "", "c1", "c1", "c2"]))
      .toEqual(["c1", "c2"]);
  });
});
