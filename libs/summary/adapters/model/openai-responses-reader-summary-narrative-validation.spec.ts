import type { ReaderSummaryNarrativeCoverage } from "./openai-responses-reader-summary-narrative-coverage";
import { ensureCitedLead as leadAdmissionOwner } from "./openai-responses-reader-summary-narrative-lead-admission";
import {
  validSecondarySection as secondaryCoverageOwner,
  assertNarrativeCoverage as assertCoverageOwner,
} from "./openai-responses-reader-summary-narrative-secondary-coverage";
import { narrativeDiagnostics as diagnosticsOwner } from "./openai-responses-reader-summary-narrative-diagnostics";
import { canonicalNarrativeOrder as orderOwner } from "./openai-responses-reader-summary-narrative-order";
import type { ReaderSummaryNarrativeSection } from "../../domain";
import {
  assertNarrativeCoverage,
  ensureCitedLead,
  narrativeDiagnostics,
  maxNarrativeSections,
  canonicalNarrativeOrder,
  validSecondarySection,
} from "./openai-responses-reader-summary-narrative-validation";
import { readerSummaryNarrativeMarkdown } from "./openai-responses-reader-summary-narrative-markdown";

const lead: ReaderSummaryNarrativeSection = {
  id: "narrative-1",
  kind: "lead",
  title: "Overview",
  text: "Synthetic, citation-grounded lead",
  citationIds: ["c1"],
};
const secondary: ReaderSummaryNarrativeSection = {
  id: "narrative-2",
  kind: "secondary_signal",
  title: "Secondary",
  text: "Another synthetic signal",
  citationIds: ["c2"],
  storyClusterId: "story-2",
};

describe("reader-summary narrative validation boundary", () => {
  it("requires a cited lead even if other sections exist", () => {
    expect(() => assertNarrativeCoverage([secondary], new Map(), "synthetic")).toThrow(
      "Reader summary narrative must include a cited lead (synthetic)",
    );
  });

  it("requires every planned secondary cluster and rejects duplicates", () => {
    const planned = new Map([["story-2", new Set(["c2"])]]);
    expect(validSecondarySection("story-2", ["c2"], planned)).toBe(true);
    expect(validSecondarySection("story-2", ["unrelated"], planned)).toBe(false);
    expect(() => assertNarrativeCoverage([lead], planned, "synthetic")).toThrow(
      "does not exactly cover planned secondary signals",
    );
    expect(() => assertNarrativeCoverage([lead, secondary, secondary], planned, "synthetic")).toThrow(
      "does not exactly cover planned secondary signals",
    );
    expect(() => assertNarrativeCoverage([lead, secondary], planned, "synthetic")).not.toThrow();
  });

  it("orders sections and retains their original rendering", () => {
    expect(canonicalNarrativeOrder([secondary, lead])).toEqual([lead, secondary]);
    expect(readerSummaryNarrativeMarkdown([lead, secondary])).toContain(
      "**Other signals today**",
    );
  });
});

describe("reader-summary narrative responsibility owners", () => {
  it("retains legacy exports as identical owner function references", () => {
    expect(ensureCitedLead).toBe(leadAdmissionOwner);
    expect(validSecondarySection).toBe(secondaryCoverageOwner);
    expect(assertNarrativeCoverage).toBe(assertCoverageOwner);
    expect(narrativeDiagnostics).toBe(diagnosticsOwner);
    expect(canonicalNarrativeOrder).toBe(orderOwner);
    expect(maxNarrativeSections).toBe(7);
  });

  it("promotes only trusted, eligible main signals without mutating the input", () => {
    const coverage: ReaderSummaryNarrativeCoverage = {
      mode: "single_story",
      leadClusterId: "story-1",
      leadCitationIds: new Set(["c1"]),
      allowedLeadCitationIds: new Set(["c1"]),
      allowedNarrativeCitationIds: new Set(["c1"]),
      secondaryCitationIds: new Map(),
    };
    const main: ReaderSummaryNarrativeSection = {
      ...lead,
      kind: "main_signal",
      title: "Untrusted model title",
      storyClusterId: "story-1",
    };
    const input = [main];
    const titles = new Map([["story-1", "Trusted evidence title"]]);
    expect(ensureCitedLead(input, coverage, titles)).toEqual([
      { ...main, kind: "lead", title: "Trusted evidence title" },
    ]);
    expect(input).toEqual([main]);
    expect(ensureCitedLead([lead], coverage, titles)[0]).toBe(lead);
    expect(ensureCitedLead(
      [{ ...main, citationIds: ["untrusted"] }], coverage, titles,
    )).toEqual([{ ...main, citationIds: ["untrusted"] }]);
  });

  it("reports raw citation diagnostics without admitting malformed IDs", () => {
    const diagnostics = narrativeDiagnostics({
      rawSections: [
        { kind: "lead", citationIds: [null, 1, "c1"] },
        { kind: "main_signal", citationIds: "c2" },
        { kind: "watch", citationIds: ["unknown"] },
      ],
      validSections: [lead],
      knownCitationIds: new Set(["c1"]),
      leadCitationIds: new Set(["c1"]),
    });
    expect(diagnostics).toBe(
      "raw=3,lead=1,main=1,knownCited=1,leadCited=1,valid=1",
    );
  });
});
