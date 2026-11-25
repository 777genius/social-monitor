import type { ReaderSummaryNarrativeCoverage } from "./openai-responses-reader-summary-narrative-coverage";
import { isAdmissibleGroundedNarrativeSection } from "./openai-responses-reader-summary-narrative-section-admission";

const coverage: ReaderSummaryNarrativeCoverage = {
  mode: "single_story",
  leadClusterId: "lead",
  leadCitationIds: new Set(["c1"]),
  allowedLeadCitationIds: new Set(["c1"]),
  allowedNarrativeCitationIds: new Set(["c1", "c2"]),
  secondaryCitationIds: new Map([["secondary", new Set(["c2"])]]),
};

const eligible = {
  kind: "lead" as const,
  authoredStoryClusterId: "lead",
  storyClusterId: "lead",
  citationIds: ["c1"] as readonly string[],
  coverage,
  citationsAllowed: () => true,
};

describe("grounded narrative section admission", () => {
  it("admits an approved lead and a supported planned secondary signal", () => {
    expect(isAdmissibleGroundedNarrativeSection(eligible)).toBe(true);
    expect(isAdmissibleGroundedNarrativeSection({
      ...eligible,
      kind: "secondary_signal",
      authoredStoryClusterId: "secondary",
      storyClusterId: "secondary",
      citationIds: ["c2"],
    })).toBe(true);
  });

  it("rejects empty citations even when the caller supplies a permissive guard", () => {
    const permissiveGuard = jest.fn(() => true);
    expect(isAdmissibleGroundedNarrativeSection({
      ...eligible,
      kind: "main_signal",
      citationIds: [],
      citationsAllowed: permissiveGuard,
    })).toBe(false);
    expect(permissiveGuard).not.toHaveBeenCalled();
  });

  it("rejects a forged lead cluster even when the citation itself is valid", () => {
    expect(isAdmissibleGroundedNarrativeSection({
      ...eligible,
      authoredStoryClusterId: "forged",
    })).toBe(false);
  });

  it("rejects lead cross-citations and unplanned secondary clusters", () => {
    expect(isAdmissibleGroundedNarrativeSection({
      ...eligible,
      citationIds: ["c1", "c2"],
    })).toBe(false);
    expect(isAdmissibleGroundedNarrativeSection({
      ...eligible,
      kind: "secondary_signal",
      authoredStoryClusterId: "other",
      storyClusterId: "other",
      citationIds: ["c2"],
    })).toBe(false);
    expect(isAdmissibleGroundedNarrativeSection({
      ...eligible,
      kind: "secondary_signal",
      authoredStoryClusterId: "secondary",
      storyClusterId: "secondary",
      citationIds: ["c1"],
    })).toBe(false);
  });

  it("honors an independent watch eligibility veto without rewriting evidence", () => {
    const ids = ["untrusted"];
    const veto = jest.fn(() => false);
    expect(isAdmissibleGroundedNarrativeSection({
      ...eligible,
      kind: "watch",
      authoredStoryClusterId: undefined,
      storyClusterId: undefined,
      citationIds: ids,
      citationsAllowed: veto,
    })).toBe(false);
    expect(veto).toHaveBeenCalledWith("watch", ids);
    expect(ids).toEqual(["untrusted"]);
  });

  it("requires both lead and secondary grounding for daily synthesis", () => {
    const synthesis = {
      ...coverage,
      mode: "daily_synthesis" as const,
      allowedLeadCitationIds: new Set(["c1", "c2"]),
    };
    expect(isAdmissibleGroundedNarrativeSection({
      ...eligible,
      coverage: synthesis,
      citationIds: ["c1"],
    })).toBe(false);
    expect(isAdmissibleGroundedNarrativeSection({
      ...eligible,
      coverage: synthesis,
      citationIds: ["c1", "c2"],
    })).toBe(true);
  });
});
