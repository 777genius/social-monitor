import type { ReaderSummaryCitation } from "../../domain";
import { readDailyEditorialNarrativeCopy } from "./openai-responses-reader-summary-editorial-copy-policy";
import { projectDailyEditorialSynthesisSection } from "./openai-responses-reader-summary-editorial-section";

describe("daily editorial copy admission shared across versioned section policies", () => {
  it("trims copy, respects Unicode code-point limits and does not mutate provider values", () => {
    const raw = Object.freeze({ title: "  A title  ", text: "  Ready to read。  " });
    expect(readDailyEditorialNarrativeCopy(raw)).toEqual({
      title: "A title", text: "Ready to read。",
    });
    const longValid = Object.freeze({ title: "Final", text: "🧪".repeat(1599) + "。" });
    expect(readDailyEditorialNarrativeCopy(longValid).text).toBe(longValid.text);
  });

  it("fails closed with the existing exact text errors on absent, unfinished and oversized copy", () => {
    for (const invalid of [
      {}, { title: "", text: "Complete." }, { title: "Title" },
    ]) {
      expect(() => readDailyEditorialNarrativeCopy(invalid))
        .toThrow("Daily editorial narrative text is missing");
    }
    for (const invalid of [
      { title: "Title", text: "Not finished" },
      { title: "Title", text: "🧪".repeat(1600) + "。" },
    ]) {
      expect(() => readDailyEditorialNarrativeCopy(invalid))
        .toThrow("Daily editorial narrative text is unfinished or too long");
    }
  });

  it("preserves synthesis projection identity, citation constraints and failure precedence", () => {
    const citation: ReaderSummaryCitation = {
      citationId: "c1", feedItemId: "f1", sourceItemId: "s1",
      providerKey: "fixture", field: "title",
      canonicalUrl: "https://example.com/story",
    };
    const settings = {
      index: 0,
      plan: { topics: [{ feedItemIds: ["f1"] }] },
      byCitation: new Map([["c1", citation]]),
    };
    const raw = Object.freeze({
      kind: "lead", storyClusterId: null, citationIds: Object.freeze(["c1"]),
      title: "  Supported title  ", text: "  Grounded conclusion. ",
    });
    expect(projectDailyEditorialSynthesisSection({ ...settings, raw })).toEqual({
      id: "narrative-1", kind: "lead", title: "Supported title",
      text: "Grounded conclusion.", citationIds: ["c1"],
    });
    expect(raw.citationIds).toEqual(["c1"]);
    expect(() => projectDailyEditorialSynthesisSection({
      ...settings, raw: { ...raw, citationIds: ["forged"], title: "" },
    })).toThrow("Daily editorial narrative has unplanned or duplicate citations");
    expect(() => projectDailyEditorialSynthesisSection({
      ...settings, raw: { ...raw, text: "No final punctuation" },
    })).toThrow("Daily editorial narrative text is unfinished or too long");
  });
});
