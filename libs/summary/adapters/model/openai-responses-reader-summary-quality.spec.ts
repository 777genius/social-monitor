import {
  normalizeConfidence,
  normalizeQualityFlags,
  normalizeRisks,
} from "./openai-responses-reader-summary-quality";

describe("OpenAI reader-summary risk and confidence policy", () => {
  it("keeps confidence bounded and infers a low rating with cited stories", () => {
    expect(normalizeConfidence({}, 2)).toMatchObject({
      level: "low",
      score: 0.55,
    });
    expect(normalizeConfidence({ level: "none", score: 0 }, 2).level).toBe("low");
    expect(normalizeConfidence({}, 0)).toMatchObject({ level: "none", score: 0 });
  });

  it("preserves risk text while removing citations outside the evidence map", () => {
    expect(normalizeRisks([
      { description: "Synthetic uncertainty", citationIds: ["unknown"] },
    ], [])).toMatchObject([{
      description: "Synthetic uncertainty",
      citationIds: [],
    }]);
  });

  it("still rejects unsupported quality flags", () => {
    expect(normalizeQualityFlags(["no_signal"])).toEqual(["no_signal"]);
    expect(() => normalizeQualityFlags(["unrecognized-synthetic-flag"]))
      .toThrow("Unsupported quality flag");
  });
});
