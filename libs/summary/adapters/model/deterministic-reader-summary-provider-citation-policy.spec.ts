import type { ReaderSummaryCoveragePlanItem } from "../../domain";
import type { ProviderReaderSummaryAttempt } from "../../ports";
import { selectDeterministicNarrativeCitations } from "./deterministic-reader-summary-citation-selection";
import { selectProviderDiversePlanCitations } from "./deterministic-reader-summary-provider-citation-policy";

type DraftCitation = ProviderReaderSummaryAttempt["draft"]["citationMap"][number];

const citation = (citationId: string, feedItemId: string, providerKey: string): DraftCitation => ({
  citationId,
  feedItemId,
  sourceItemId: `source-${feedItemId}`,
  providerKey,
  field: "title",
  canonicalUrl: `https://example.test/${feedItemId}`,
});

const item = (clusterId: string, feedItemIds: readonly string[]): ReaderSummaryCoveragePlanItem => ({
  role: clusterId === "lead" ? "lead" : "secondary",
  clusterId,
  feedItemIds,
  providerKeys: ["rss", "hn"],
  interestIds: ["interest"],
  whyImportant: ["Grounded monitored signal"],
  score: 2,
});

describe("deterministic provider-balanced narrative citation admission", () => {
  it("selects a rare lead provider while preserving secondary plan order", () => {
    const lead = item("lead", ["hn-lead", "rss-lead"]);
    const secondary = [item("second", ["hn-second"]), item("third", ["hn-third"])];
    const citations = Object.freeze([
      citation("c1", "hn-lead", "hn"),
      citation("c2", "rss-lead", "rss"),
      citation("c3", "hn-second", "hn"),
      citation("c4", "hn-third", "hn"),
    ]);
    const byFeed = new Map(citations.map((value) => [value.feedItemId, [value]] as const));
    const selected = selectProviderDiversePlanCitations([lead, ...secondary], byFeed);

    expect([...selected.entries()].map(([clusterId, value]) => [clusterId, value.citationId])).toEqual([
      ["lead", "c2"], ["second", "c3"], ["third", "c4"],
    ]);
    expect(selectDeterministicNarrativeCitations({
      mode: "daily_synthesis", lead, secondary, citationMap: citations,
    }).leadCitationIds).toEqual(["c2", "c3", "c4"]);
    expect(citations).toHaveLength(4);
    expect(citations[0]?.citationId).toBe("c1");
  });

  it("keeps the first trusted citation on ties and omits unsupported clusters", () => {
    const lead = item("lead", ["known-a", "known-b"]);
    const missing = item("missing", ["unknown"]);
    const citations = [citation("c10", "known-a", "hn"), citation("c11", "known-b", "rss")];
    const selected = selectProviderDiversePlanCitations(
      [lead, missing],
      new Map(citations.map((value) => [value.feedItemId, [value]] as const)),
    );

    expect([...selected.keys()]).toEqual(["lead"]);
    expect(selected.get("lead")?.citationId).toBe("c10");
    expect(selectDeterministicNarrativeCitations({
      mode: "daily_synthesis", lead, secondary: [missing], citationMap: citations,
    }).leadCitationIds).toEqual(["c10"]);
  });

  it("preserves single-story citation deduplication without secondary projection", () => {
    const lead = item("lead", ["f1", "f2", "f1"]);
    const selection = selectDeterministicNarrativeCitations({
      mode: "single_story",
      lead,
      secondary: [item("second", ["f3"])],
      citationMap: [
        citation("c1", "f1", "hn"), citation("c2", "f2", "rss"),
        citation("c1", "f1", "hn"), citation("c3", "f3", "rss"),
      ],
    });
    expect(selection.leadCitationIds).toEqual(["c1", "c2"]);
    expect(selection.dailySynthesisCitations.size).toBe(0);
  });
});
