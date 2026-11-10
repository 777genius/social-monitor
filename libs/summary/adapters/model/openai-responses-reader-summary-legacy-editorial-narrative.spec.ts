import type { ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { normalizeDailyEditorialNarrative } from "./openai-responses-reader-summary-editorial-narrative";
import { normalizeLegacyDailyEditorialNarrative } from "./openai-responses-reader-summary-legacy-editorial-narrative";

const citationMap: readonly ReaderSummaryCitation[] = [
  { citationId: "c1", feedItemId: "feed-a", sourceItemId: "source-a",
    providerKey: "rss", canonicalUrl: "https://example.test/a", field: "title" },
  { citationId: "c2", feedItemId: "feed-b", sourceItemId: "source-b",
    providerKey: "rss", canonicalUrl: "https://example.test/b", field: "title" },
];
const input = {
  dailyEditorialPlan: { version: "reader_summary.daily_editorial.v1",
    topics: [{ feedItemIds: ["feed-a"] }, { feedItemIds: ["feed-b"] }] },
  evidence: { dailyGenerationInput: {
    selected: [
      { feedItemId: "feed-a", storyId: "story-a" },
      { feedItemId: "feed-b", storyId: "story-b" },
    ],
  } },
} as unknown as ReaderSummaryModelInput;

const sections = [
  { kind: "lead", storyClusterId: "story-a", title: "First story",
    text: "The first event is supported by the original source.", citationIds: ["c1"] },
  { kind: "secondary_signal", storyClusterId: "story-b", title: "Second story",
    text: "The second event has separate source evidence.", citationIds: ["c2"] },
];

describe("legacy daily editorial narrative policy", () => {
  it("preserves the v1 anchored section projection through the public entrypoint", () => {
    const params = { input, citationMap, rawSections: sections };
    const result = normalizeDailyEditorialNarrative(params);
    expect(result).toEqual(normalizeLegacyDailyEditorialNarrative(params));
    expect(result.map((section) => [section.kind, section.storyClusterId, section.citationIds]))
      .toEqual([["lead", "story-a", ["c1"]], ["secondary_signal", "story-b", ["c2"]]]);
  });

  it("rejects mismatched cluster identity and unplanned citations", () => {
    const normalize = (rawSections: unknown) =>
      normalizeDailyEditorialNarrative({ input, citationMap, rawSections });
    expect(() => normalize([{ ...sections[0], storyClusterId: "story-b" }, sections[1]]))
      .toThrow("Daily editorial narrative has unplanned citations or order");
    expect(() => normalize([{ ...sections[0], citationIds: ["c2"] }, sections[1]]))
      .toThrow("Daily editorial narrative has unplanned citations or order");
    expect(() => normalize([sections[0]]))
      .toThrow("Daily editorial narrative must cover every planned topic");
  });

  it("retains text-completeness rejection on the legacy path", () => {
    expect(() => normalizeDailyEditorialNarrative({
      input, citationMap,
      rawSections: [{ ...sections[0], text: "Incomplete sentence" }, sections[1]],
    })).toThrow("Daily editorial narrative text is unfinished or too long");
  });
});
