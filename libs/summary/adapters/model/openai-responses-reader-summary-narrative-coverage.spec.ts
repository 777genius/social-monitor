import type { ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { buildReaderSummaryNarrativeCoverage as legacyCoverage } from "./openai-responses-reader-summary-narrative-coverage";
import { buildReaderSummaryNarrativeCoverage as planCoverage } from "./openai-responses-reader-summary-narrative-coverage-plan";
import { citationIdsForPlannedFeedItems } from "./openai-responses-reader-summary-narrative-coverage-citation-index";
import { isValidReaderSummaryNarrativeLead } from "./openai-responses-reader-summary-narrative-citation-policy";

const citationMap = [
  { feedItemId: "lead-item", citationId: "lead-citation" },
  { feedItemId: "secondary-item", citationId: "secondary-citation" },
] as ReaderSummaryCitation[];

const inputFor = (mode: "single_story" | "daily_synthesis") => ({
  coveragePlan: {
    mode,
    lead: { clusterId: "lead", feedItemIds: ["lead-item", "unresolved"] },
    secondary: [{ clusterId: "secondary", feedItemIds: ["secondary-item", "unresolved"] }],
  },
}) as unknown as ReaderSummaryModelInput;

describe("approved narrative coverage responsibility boundary", () => {
  it("keeps the historical export reference identical to the plan-policy owner", () => {
    expect(legacyCoverage).toBe(planCoverage);
  });

  it("limits a single-story lead to known lead citations and excludes missing evidence", () => {
    const coverage = legacyCoverage(inputFor("single_story"), citationMap);
    expect([...coverage.leadCitationIds]).toEqual(["lead-citation"]);
    expect([...coverage.secondaryCitationIds.get("secondary") ?? []]).toEqual(["secondary-citation"]);
    expect([...coverage.allowedNarrativeCitationIds]).toEqual(["lead-citation", "secondary-citation"]);
    expect([...coverage.allowedLeadCitationIds]).toEqual(["lead-citation"]);
    expect(isValidReaderSummaryNarrativeLead(["lead-citation", "secondary-citation"], coverage)).toBe(false);
    expect(isValidReaderSummaryNarrativeLead(["lead-citation"], coverage)).toBe(true);
  });

  it("preserves daily-synthesis cross-cluster lead admission without trusting unknown citations", () => {
    const coverage = legacyCoverage(inputFor("daily_synthesis"), citationMap);
    expect(coverage.allowedLeadCitationIds).toBe(coverage.allowedNarrativeCitationIds);
    expect(isValidReaderSummaryNarrativeLead(["lead-citation", "secondary-citation"], coverage)).toBe(true);
    expect(isValidReaderSummaryNarrativeLead(["lead-citation", "untrusted"], coverage)).toBe(false);
    expect(isValidReaderSummaryNarrativeLead(["secondary-citation"], coverage)).toBe(false);
  });

  it("keeps last-seen citation precedence, ordered de-duplication and input immutability", () => {
    const repeated = [
      ...citationMap,
      { feedItemId: "lead-item", citationId: "replacement" },
    ] as ReaderSummaryCitation[];
    const lookup = citationIdsForPlannedFeedItems(repeated);
    const original = ["lead-item", "unresolved", "lead-item", "secondary-item"];
    expect([...lookup(original)]).toEqual(["replacement", "secondary-citation"]);
    expect(original).toEqual(["lead-item", "unresolved", "lead-item", "secondary-item"]);
    expect(repeated).toHaveLength(3);
    expect([...legacyCoverage(inputFor("single_story"), repeated).leadCitationIds]).toEqual(["replacement"]);
  });
});
