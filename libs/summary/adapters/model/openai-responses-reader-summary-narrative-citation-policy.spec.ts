import {
  buildReaderSummaryNarrativeCitationGuard,
  isValidReaderSummaryNarrativeLead,
  type ReaderSummaryNarrativeCoverage,
} from "./openai-responses-reader-summary-narrative-coverage";

const coverage = (mode: ReaderSummaryNarrativeCoverage["mode"]): ReaderSummaryNarrativeCoverage => ({
  mode,
  leadClusterId: "lead",
  leadCitationIds: new Set(["lead-citation"]),
  allowedLeadCitationIds: mode === "daily_synthesis"
    ? new Set(["lead-citation", "secondary-citation"])
    : new Set(["lead-citation"]),
  allowedNarrativeCitationIds: new Set(["lead-citation", "secondary-citation"]),
  secondaryCitationIds: new Map([["secondary", new Set(["secondary-citation"])]]),
});

describe("reader narrative citation trust policy", () => {
  it("rejects uncited, mixed and unplanned leads for a single story", () => {
    const plan = coverage("single_story");
    expect(isValidReaderSummaryNarrativeLead([], plan)).toBe(false);
    expect(isValidReaderSummaryNarrativeLead(["lead-citation"], plan)).toBe(true);
    expect(isValidReaderSummaryNarrativeLead(["secondary-citation"], plan)).toBe(false);
    expect(isValidReaderSummaryNarrativeLead(["lead-citation", "secondary-citation"], plan)).toBe(false);
    expect(isValidReaderSummaryNarrativeLead(["unknown"], plan)).toBe(false);
  });

  it("requires lead and secondary coverage together for daily synthesis", () => {
    const plan = coverage("daily_synthesis");
    expect(isValidReaderSummaryNarrativeLead(["lead-citation"], plan)).toBe(false);
    expect(isValidReaderSummaryNarrativeLead(["secondary-citation"], plan)).toBe(false);
    expect(isValidReaderSummaryNarrativeLead(["lead-citation", "secondary-citation"], plan)).toBe(true);
    expect(isValidReaderSummaryNarrativeLead(["lead-citation", "unknown"], plan)).toBe(false);
  });

  it("rejects a watch section when any citation is ineligible", () => {
    const allowedWatch = new Set(["watch-citation"]);
    const guard = buildReaderSummaryNarrativeCitationGuard(coverage("single_story"), allowedWatch);
    expect(guard("watch", ["watch-citation"])).toBe(true);
    expect(guard("watch", ["watch-citation", "lead-citation"])).toBe(false);
    expect(guard("watch", ["unknown"])).toBe(false);
  });

  it("bounds main and why-it-matters citations to the planned narrative", () => {
    const guard = buildReaderSummaryNarrativeCitationGuard(coverage("daily_synthesis"), new Set());
    expect(guard("main_signal", ["lead-citation", "secondary-citation"])).toBe(true);
    expect(guard("main_signal", ["lead-citation", "unknown"])).toBe(false);
    expect(guard("why_it_matters", ["secondary-citation"])).toBe(true);
    expect(guard("why_it_matters", ["unknown"])).toBe(false);
  });

  it("keeps the established no-extra-guard behavior for other section kinds", () => {
    const guard = buildReaderSummaryNarrativeCitationGuard(coverage("single_story"), new Set());
    expect(guard("lead", ["unknown"])).toBe(true);
    expect(guard("secondary_signal", ["unknown"])).toBe(true);
    expect(guard(undefined, ["unknown"])).toBe(true);
  });
});
