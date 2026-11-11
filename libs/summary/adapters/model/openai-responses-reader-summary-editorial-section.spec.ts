import type { ReaderSummaryCitation } from "../../domain";
import { projectDailyEditorialSynthesisSection } from "./openai-responses-reader-summary-editorial-section";

const citationMap: readonly ReaderSummaryCitation[] = [
  { citationId: "c1", feedItemId: "feed-a", sourceItemId: "source-a",
    providerKey: "rss", canonicalUrl: "https://example.test/a", field: "title" },
  { citationId: "c2", feedItemId: "feed-b", sourceItemId: "source-b",
    providerKey: "rss", canonicalUrl: "https://example.test/b", field: "title" },
];
const plan = { topics: [{ feedItemIds: ["feed-a"] }, { feedItemIds: ["feed-b"] }] };
const byCitation = new Map(citationMap.map(item => [item.citationId, item] as const));
const valid = {
  kind: "lead", storyClusterId: null, title: "Daily picture",
  text: "The observed reports describe different outcomes.", citationIds: ["c1", "c2"],
};
const project = (raw: unknown, index = 0) =>
  projectDailyEditorialSynthesisSection({ raw, index, plan, byCitation });

describe("daily editorial v2 provider section projection", () => {
  it("keeps exact lead/takeaway order and citation identity", () => {
    expect(project(valid)).toEqual({
      id: "narrative-1", kind: "lead", title: valid.title,
      text: valid.text, citationIds: ["c1", "c2"],
    });
    expect(project({ ...valid, kind: "secondary_signal" }, 1)).toEqual({
      id: "narrative-2", kind: "secondary_signal", title: valid.title,
      text: valid.text, citationIds: ["c1", "c2"],
    });
  });

  it("rejects invalid kind before a cluster and rejects non-synthesis clusters", () => {
    expect(() => project({ ...valid, kind: "secondary_signal", storyClusterId: "story" }))
      .toThrow("Daily editorial narrative has invalid section order");
    expect(() => project({ ...valid, storyClusterId: "story" }))
      .toThrow("Daily editorial narrative has a story cluster on a synthesis section");
  });

  it("fails closed for unknown, nonplanned, duplicate or excessive citations", () => {
    for (const citationIds of [["unknown"], ["c1", "c1"], [], ["c1", "c2", "c1", "c2"]]) {
      expect(() => project({ ...valid, citationIds }))
        .toThrow("Daily editorial narrative has unplanned or duplicate citations");
    }
    const unrelated = new Map([...byCitation, ["outside", {
      ...citationMap[0]!, citationId: "outside", feedItemId: "feed-outside",
    }]] as const);
    expect(() => projectDailyEditorialSynthesisSection({
      raw: { ...valid, citationIds: ["outside"] }, index: 0, plan, byCitation: unrelated,
    })).toThrow("Daily editorial narrative has unplanned or duplicate citations");
  });

  it("keeps text missing, Unicode length and terminal punctuation rejection", () => {
    expect(() => project({ ...valid, title: null }))
      .toThrow("Daily editorial narrative text is missing");
    expect(() => project({ ...valid, text: "Not finished" }))
      .toThrow("Daily editorial narrative text is unfinished or too long");
    expect(() => project({ ...valid, text: "🧪".repeat(1600) + "." }))
      .toThrow("Daily editorial narrative text is unfinished or too long");
  });
});
