import type { ReaderSummaryNarrativeCoverage } from "./openai-responses-reader-summary-narrative-coverage";
import { decodeReaderSummaryProviderNarrativeSection } from "./openai-responses-reader-summary-narrative-provider-section";

const coverage: ReaderSummaryNarrativeCoverage = {
  mode: "single_story",
  leadClusterId: "planned",
  leadCitationIds: new Set(["c1"]),
  allowedLeadCitationIds: new Set(["c1"]),
  allowedNarrativeCitationIds: new Set(["c1", "c2", "c3", "c4"]),
  secondaryCitationIds: new Map([["secondary", new Set(["c2"])]]),
};
const context = {
  coverage,
  knownCitationIds: new Set(["c1", "c2", "c3", "c4"]),
  storyTitlesByClusterId: new Map([["planned", "Verified planned lead"]]),
};

describe("untrusted narrative provider section decoding", () => {
  it("projects a single-story lead onto the trusted planned cluster", () => {
    const raw = Object.freeze({ kind: "lead", storyClusterId: "provider-invented",
      citationIds: Object.freeze(["c1"]) });
    const result = decodeReaderSummaryProviderNarrativeSection(raw, context);
    expect(result).toMatchObject({ kind: "lead", authoredStoryClusterId: "provider-invented",
      storyClusterId: "planned", title: "Verified planned lead", citationIds: ["c1"] });
    expect(raw.storyClusterId).toBe("provider-invented");
  });

  it("strips unknown citation IDs before the three-item cap without mutating input", () => {
    const citationIds = Object.freeze(["invented", "c1", "c2", "c3", "c4"]);
    const raw = Object.freeze({ kind: "secondary_signal", title: "Supported narrative",
      storyClusterId: "secondary", citationIds });
    const result = decodeReaderSummaryProviderNarrativeSection(raw, context);
    expect(result.citationIds).toEqual(["c1", "c2", "c3"]);
    expect(result.title).toBe("Supported narrative");
    expect(citationIds).toEqual(["invented", "c1", "c2", "c3", "c4"]);
  });

  it("does not bind a daily synthesis lead to a single provider cluster", () => {
    const result = decodeReaderSummaryProviderNarrativeSection({
      kind: "lead", title: "Synthesis", storyClusterId: "invented", citationIds: ["c1", "c2"],
    }, { ...context, coverage: { ...coverage, mode: "daily_synthesis" } });
    expect(result).toMatchObject({ kind: "lead", title: "Synthesis", citationIds: ["c1", "c2"] });
    expect(result.storyClusterId).toBeUndefined();
    expect(result.authoredStoryClusterId).toBe("invented");
  });
});
