import type { ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { admitOpenAiDailyEditorialSynthesis } from "./openai-responses-reader-summary-editorial-admission";

const citation = { citationId: "c1", feedItemId: "feed-1" } as ReaderSummaryCitation;
const plan = { version: "reader_summary.daily_editorial.v2", topics: [{ feedItemIds: ["feed-1"] }] };
const frozen = { selected: [{ feedItemId: "feed-1" }] };
const input = (hasFrozen = true): ReaderSummaryModelInput => ({
  dailyEditorialPlan: plan,
  evidence: hasFrozen ? { dailyGenerationInput: frozen } : {},
} as unknown as ReaderSummaryModelInput);

describe("OpenAI daily editorial v2 input admission", () => {
  it("passes validated plan and original sections to projection without modifying input", () => {
    const rawSections = Object.freeze([{ kind: "lead", citationIds: ["c1"] }]);
    const citationMap = Object.freeze([citation]);
    const admitted = admitOpenAiDailyEditorialSynthesis({
      input: input(), rawSections, citationMap,
    });
    expect(admitted.plan).toBe(plan);
    expect(admitted.rawSections).toBe(rawSections);
    expect(admitted.frozen).toBe(frozen);
    expect(admitted.byCitation.get("c1")).toBe(citation);
    expect([...admitted.byCitation.keys()]).toEqual(["c1"]);
  });

  it.each([null, [], Array.from({ length: 7 }, () => ({ kind: "lead" }))])(
    "refuses missing or oversized v2 sections before frozen-input validation",
    (rawSections) => {
      expect(() => admitOpenAiDailyEditorialSynthesis({
        input: input(false), rawSections, citationMap: [citation],
      })).toThrow("Daily editorial narrative requires an overview and at most five takeaways");
    },
  );

  it("rejects absent frozen evidence without attempting provider projection", () => {
    expect(() => admitOpenAiDailyEditorialSynthesis({
      input: input(false), rawSections: [{ kind: "lead", citationIds: ["c1"] }],
      citationMap: [citation],
    })).toThrow("Daily editorial input is missing");
  });
});
