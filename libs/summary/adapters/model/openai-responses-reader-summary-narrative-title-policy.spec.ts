import type { ReaderSummaryCitation } from "../../domain";
import { readerSummaryInput } from "./agent-runtime-reader-summary-model.spec-support";
import {
  defaultNarrativeTitle as legacyDefaultNarrativeTitle,
  fallbackNarrative,
} from "./openai-responses-reader-summary-narrative-evidence";
import { ensureCitedLead } from "./openai-responses-reader-summary-narrative-lead-admission";
import {
  defaultNarrativeTitle,
  readerSummaryLeadTitle,
} from "./openai-responses-reader-summary-narrative-title-policy";

describe("reader summary canonical narrative lead title policy", () => {
  const titles = new Map([["planned-cluster", "Planned title"], ["empty-cluster", ""]]);

  it("keeps the public function identity while separating title from provider evidence", () => {
    expect(legacyDefaultNarrativeTitle).toBe(defaultNarrativeTitle);
  });

  it("uses one immutable lead-title policy for every mode and missing/empty cluster", () => {
    expect(readerSummaryLeadTitle("daily_synthesis", "planned-cluster", titles)).toBe("Daily synthesis");
    expect(readerSummaryLeadTitle("single_story", "planned-cluster", titles)).toBe("Planned title");
    expect(readerSummaryLeadTitle("single_story", "missing", titles)).toBe("Overview");
    expect(readerSummaryLeadTitle("single_story", undefined, titles)).toBe("Overview");
    expect(readerSummaryLeadTitle("single_story", "empty-cluster", titles)).toBe("");
    expect(defaultNarrativeTitle("lead", "planned-cluster", titles, "single_story")).toBe("Planned title");
    expect(defaultNarrativeTitle("lead", "planned-cluster", titles, "daily_synthesis")).toBe("Daily synthesis");
    expect(defaultNarrativeTitle("main_signal", undefined, titles, "single_story")).toBe("Main signal");
    expect(defaultNarrativeTitle("why_it_matters", undefined, titles, "single_story")).toBe("Why it matters");
    expect(defaultNarrativeTitle("watch", undefined, titles, "single_story")).toBe("Watch");
    expect(defaultNarrativeTitle("secondary_signal", undefined, titles, "single_story")).toBeUndefined();
    expect(defaultNarrativeTitle("secondary_signal", "planned-cluster", titles, "single_story")).toBe("Planned title");
    expect(defaultNarrativeTitle(undefined, undefined, titles, "single_story")).toBeUndefined();
  });

  it("keeps fallback and eligible main-signal promotion bound to the same trusted title", () => {
    const source = readerSummaryInput();
    const input = {
      ...source,
      coveragePlan: {
        ...source.coveragePlan,
        mode: "single_story" as const,
        lead: { ...source.coveragePlan.lead!, clusterId: "planned-cluster", feedItemIds: ["feed-1"] },
        secondary: [],
      },
    };
    const citations = [{ citationId: "c1", feedItemId: "feed-1" }] as ReaderSummaryCitation[];
    const fallback = fallbackNarrative({
      input,
      citationMap: citations,
      legacyExecutiveSummary: "Confirmed, cited synthetic evidence.",
      storyTitlesByClusterId: titles,
    });
    expect(fallback).toHaveLength(1);
    expect(fallback[0]).toMatchObject({
      kind: "lead", title: "Planned title", storyClusterId: "planned-cluster", citationIds: ["c1"],
    });
    expect(ensureCitedLead(
      [{ id: "narrative-1", kind: "main_signal", title: "Untrusted title",
        text: "Synthetic confirmed evidence", citationIds: ["c1"] }],
      { mode: "single_story", leadClusterId: "planned-cluster",
        leadCitationIds: new Set(["c1"]), allowedLeadCitationIds: new Set(["c1"]),
        allowedNarrativeCitationIds: new Set(["c1"]), secondaryCitationIds: new Map() },
      titles,
    )).toEqual([{ id: "narrative-1", kind: "lead", title: "Planned title",
      text: "Synthetic confirmed evidence", citationIds: ["c1"], storyClusterId: "planned-cluster" }]);
    expect(titles.get("planned-cluster")).toBe("Planned title");
    expect(input.coveragePlan.lead.clusterId).toBe("planned-cluster");
  });
});
