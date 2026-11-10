import type { ReaderSummaryNarrativeSection } from "../../domain";
import {
  assertNarrativeCoverage,
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
