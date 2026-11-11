import type { ReaderSummaryCoveragePlan, ReaderSummaryCoveragePlanItem } from "../../domain";
import { readerSummaryCoverageInstructions } from "./openai-responses-reader-summary-coverage-instructions";

const lead = (providerKeys: readonly string[]): ReaderSummaryCoveragePlanItem => ({
  role: "lead",
  clusterId: "cluster-lead",
  score: 1,
  feedItemIds: ["item-lead"],
  providerKeys,
  interestIds: ["interest"],
  whyImportant: ["Pinned by the editorial coverage plan"],
});

const plan = (
  mode: ReaderSummaryCoveragePlan["mode"],
  providerKeys: readonly string[] = ["reddit"],
): ReaderSummaryCoveragePlan => ({
  mode,
  lead: lead(providerKeys),
  secondary: [],
});

describe("reader summary coverage-specific prompt policy", () => {
  it("keeps the no-lead instruction fail-closed even for a missing runtime plan", () => {
    const noLead = readerSummaryCoverageInstructions({
      mode: "single_story",
      secondary: [],
    });
    expect(noLead).toHaveLength(1);
    expect(noLead[0]).toContain("no evidence passed the editorial lead gate");
    expect(noLead[0]).toContain("topStories and narrativeSections must be empty");
    expect(readerSummaryCoverageInstructions(undefined)).toEqual(noLead);
  });

  it("keeps daily synthesis instructions grounded in approved lead and secondary citations", () => {
    const instructions = readerSummaryCoverageInstructions(plan("daily_synthesis"));
    expect(instructions).toHaveLength(4);
    expect(instructions[0]).toContain("thematic daily digest");
    expect(instructions[1]).toContain("storyClusterId to null");
    expect(instructions[2]).toContain("exact storyClusterId");
    expect(instructions.join("\n")).not.toContain("coveragePlan.lead has one provider group");
  });

  it("requires source attribution when the pinned lead has one provider group", () => {
    const instructions = readerSummaryCoverageInstructions(plan("single_story"));
    expect(instructions).toHaveLength(4);
    expect(instructions[1]).toContain("one provider group");
    expect(instructions[1]).toContain("Do not generalize");
    expect(instructions[2]).toContain("copy the exact storyClusterId");
  });

  it("does not inject single-provider warnings into multi-provider leads", () => {
    const instructions = readerSummaryCoverageInstructions(plan("single_story", ["reddit", "rss"]));
    expect(instructions).toHaveLength(3);
    expect(instructions.join("\n")).not.toContain("one provider group");
    expect(instructions[0]).toContain("main_signal and why_it_matters");
    expect(instructions[2]).toContain("Keep the lead focused");
  });
});
