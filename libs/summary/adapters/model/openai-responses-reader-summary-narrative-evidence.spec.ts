import { readerSummaryInput } from "./agent-runtime-reader-summary-model.spec-support";
import {
  defaultNarrativeTitle,
  fallbackNarrative,
  narrativeSectionText,
  watchEligibleCitationIds,
} from "./openai-responses-reader-summary-narrative-evidence";

describe("reader-summary narrative evidence boundaries", () => {
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
});
