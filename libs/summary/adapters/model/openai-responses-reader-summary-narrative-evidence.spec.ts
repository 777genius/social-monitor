import type { ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { fallbackNarrative as plannedFallback } from "./openai-responses-reader-summary-narrative-fallback";
import { narrativeSectionText as sourceText } from "./openai-responses-reader-summary-narrative-text";
import { watchEligibleCitationIds as directWatchEligibleCitationIds } from "./openai-responses-reader-summary-watch-evidence-policy";
import { readerSummaryInput } from "./agent-runtime-reader-summary-model.spec-support";
import {
  defaultNarrativeTitle,
  fallbackNarrative,
  narrativeSectionText,
  watchEligibleCitationIds,
} from "./openai-responses-reader-summary-narrative-evidence";

describe("reader-summary narrative evidence boundaries", () => {
  it("preserves historical direct watch policy identity", () => {
    expect(watchEligibleCitationIds).toBe(directWatchEligibleCitationIds);
    expect([...directWatchEligibleCitationIds(readerSummaryInput(), [])]).toEqual([]);
  });

  it("has no watch-eligible citations without any citable records", () => {
    expect([...watchEligibleCitationIds(readerSummaryInput(), [])]).toEqual([]);
  });

  it("preserves canonical fallback titles and default section text precedence", () => {
    expect(defaultNarrativeTitle("lead", undefined, new Map(), "daily_synthesis"))
      .toBe("Daily synthesis");
    expect(defaultNarrativeTitle("secondary_signal", undefined, new Map(), "single_story"))
      .toBeUndefined();
    expect(narrativeSectionText({
      value: { text: "Synthetic authored note" },
      kind: "lead",
      storyClusterId: undefined,
      citationIds: [],
      legacyExecutiveSummary: "Synthetic fallback",
      storySummariesByClusterId: new Map(),
      storySummariesByCitationId: new Map(),
    })).toBe("Synthetic authored note");
  });

  it("never fabricates a fallback lead when no planned source can be cited", () => {
    expect(fallbackNarrative({
      input: readerSummaryInput(),
      legacyExecutiveSummary: "Synthetic summary",
      citationMap: [],
      storyTitlesByClusterId: new Map(),
    })).toEqual([]);
  });

  it("reexports the actual separate specialist functions without wrapping", () => {
    expect(fallbackNarrative).toBe(plannedFallback);
    expect(narrativeSectionText).toBe(sourceText);
  });

  it("selects only cited planned feed items for a single-story fallback", () => {
    const input = {
      ...readerSummaryInput(),
      coveragePlan: {
        mode: "single_story",
        lead: { clusterId: "lead", feedItemIds: ["f1"] },
        secondary: [{ clusterId: "secondary", feedItemIds: ["f2"] }],
      },
    } as unknown as ReaderSummaryModelInput;
    const citationMap = [
      { citationId: "c1", feedItemId: "f1" },
      { citationId: "c2", feedItemId: "f2" },
      { citationId: "forged", feedItemId: "unplanned" },
    ] as unknown as ReaderSummaryCitation[];
    const before = JSON.stringify([input.coveragePlan, citationMap]);
    expect(plannedFallback({
      input,
      legacyExecutiveSummary: "Verified lead",
      citationMap,
      storyTitlesByClusterId: new Map([["lead", "Lead title"]]),
    })).toEqual([{
      id: "narrative-1",
      kind: "lead",
      title: "Lead title",
      text: "Verified lead",
      citationIds: ["c1"],
      storyClusterId: "lead",
    }]);
    expect(JSON.stringify([input.coveragePlan, citationMap])).toBe(before);
  });

  it("bounds synthesis citations to three and never binds its fallback to a single story", () => {
    const input = {
      ...readerSummaryInput(),
      coveragePlan: {
        mode: "daily_synthesis",
        lead: { clusterId: "lead", feedItemIds: ["f1"] },
        secondary: [{ clusterId: "secondary", feedItemIds: ["f2", "f3", "f4"] }],
      },
    } as unknown as ReaderSummaryModelInput;
    const citationMap = ["f1", "f2", "f3", "f4", "unplanned"].map(
      (feedItemId, index) => ({ feedItemId, citationId: `c${index + 1}` }),
    ) as unknown as ReaderSummaryCitation[];
    expect(plannedFallback({
      input,
      legacyExecutiveSummary: "Synthesis copy",
      citationMap,
      storyTitlesByClusterId: new Map([["lead", "Not a synthesis title"]]),
    })).toEqual([{
      id: "narrative-1",
      kind: "lead",
      title: "Daily synthesis",
      text: "Synthesis copy",
      citationIds: ["c1", "c2", "c3"],
    }]);
    expect(plannedFallback({
      input,
      legacyExecutiveSummary: "Synthesis copy",
      citationMap: [],
      storyTitlesByClusterId: new Map(),
    })).toEqual([]);
  });

  it("prefers authored text, then cited summaries, then cluster, then lead fallback", () => {
    const values = {
      value: {},
      kind: "lead" as const,
      storyClusterId: "cluster",
      citationIds: ["unknown", "c1"],
      legacyExecutiveSummary: "Legacy copy",
      storySummariesByClusterId: new Map([["cluster", "Cluster copy"]]),
      storySummariesByCitationId: new Map([["c1", "Cited copy"]]),
    };
    expect(sourceText(values)).toBe("Cited copy");
    expect(sourceText({ ...values, citationIds: [] })).toBe("Cluster copy");
    expect(sourceText({ ...values, citationIds: [], storyClusterId: undefined })).toBe("Legacy copy");
    expect(sourceText({ ...values, citationIds: [], storyClusterId: undefined, kind: "watch" })).toBeUndefined();
    expect(sourceText({ ...values, value: { text: "Author copy" } })).toBe("Author copy");
    expect([...values.storySummariesByCitationId]).toEqual([["c1", "Cited copy"]]);
  });
});
