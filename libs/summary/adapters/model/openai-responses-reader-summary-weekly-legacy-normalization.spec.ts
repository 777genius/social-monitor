import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import { expandedLegacyOutputKeys, legacyOutputKeys, sealedCompactOutputKeys } from "./openai-responses-reader-summary-weekly-response-shapes";
import { normalizeLegacyWeeklyModelOutput } from "./openai-responses-reader-summary-weekly-legacy-normalization";
import { normalizeLegacyFlatWeeklySections } from "./openai-responses-reader-summary-weekly-flat-section-normalization";

describe("weekly legacy output compatibility boundary", () => {
  const input = {} as ReaderSummaryWeeklyModelInput;

  it("leaves unrecognized wire shapes unchanged for the strict artifact validator", () => {
    const payload = { unexpected: "synthetic" };
    expect(normalizeLegacyWeeklyModelOutput(input, payload)).toBe(payload);
  });

  it("rejects malformed legacy citations and sections before chronology claims", () => {
    const legacy = Object.fromEntries(legacyOutputKeys.map((key) => [key, null]));
    expect(() => normalizeLegacyWeeklyModelOutput(input, legacy)).toThrow(
      "Legacy weekly output citations and sections must be arrays",
    );
  });
  it("routes malformed sealed compact payloads to their strict decoder", () => {
    const payload = Object.fromEntries(
      sealedCompactOutputKeys.map((key) => [key, null]),
    );
    expect(() => normalizeLegacyWeeklyModelOutput(input, payload)).toThrow(
      "Sealed compact weekly stories and sections must be arrays",
    );
  });

  it("routes malformed expanded legacy payloads to their strict decoder", () => {
    const payload = Object.fromEntries(
      expandedLegacyOutputKeys.map((key) => [key, null]),
    );
    expect(() => normalizeLegacyWeeklyModelOutput(input, payload)).toThrow(
      "Expanded legacy weekly stories and sections must be arrays",
    );
  });

  it("projects frozen flat legacy sections without mutating their citations", () => {
    const citationIds = Object.freeze(["citation:synthetic"]);
    const section = Object.freeze({
      sectionId: "section:synthetic",
      kind: "context",
      storyId: "story:synthetic",
      claimType: "snapshot",
      status: "open",
      observedFrom: "2026-07-20",
      observedThrough: "2026-07-20",
      headline: "Synthetic headline",
      synthesis: "Synthetic summary",
      citationIds,
    });
    const sections = Object.freeze([section]);
    const normalized = normalizeLegacyFlatWeeklySections({ sections });

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.section).toMatchObject({
      kind: "development", storyId: "story:synthetic", citationIds,
    });
    expect(normalized[0]?.story).toMatchObject({
      status: "watch", summary: "Synthetic summary", citationIds,
    });
    expect(normalized[0]?.story.citationIds).not.toBe(citationIds);
    expect(normalized[0]?.section.citationIds).not.toBe(citationIds);
    expect(sections[0]).toBe(section);
    expect(citationIds).toEqual(["citation:synthetic"]);

    expect(() => normalizeLegacyFlatWeeklySections({ sections: [section, section] }))
      .toThrow("Legacy weekly output contains duplicate story ids");
    expect(() => normalizeLegacyFlatWeeklySections({
      sections: [{ ...section, unsupported: true }],
    })).toThrow("must contain exactly the supported fields");
    expect(() => normalizeLegacyFlatWeeklySections({
      sections: [{ ...section, citationIds: "citation:synthetic" }],
    })).toThrow("citations must be an array");
  });

  it("retains optional legacy takeaway fallback without broadening keys", () => {
    const section = {
      sectionId: "section:synthetic",
      kind: "lead",
      storyId: "story:synthetic",
      claimType: "snapshot",
      status: "developing",
      observedFrom: "2026-07-20",
      observedThrough: "2026-07-20",
      headline: "Synthetic headline",
      synthesis: "Synthetic fallback",
      citationIds: ["citation:synthetic"],
    };
    expect(normalizeLegacyFlatWeeklySections({ sections: [section] })[0]?.story.summary)
      .toBe("Synthetic fallback");
    expect(normalizeLegacyFlatWeeklySections({
      sections: [{ ...section, takeaway: "Explicit summary" }],
    })[0]?.story.summary).toBe("Explicit summary");
    expect(section).not.toHaveProperty("takeaway");
  });

});
