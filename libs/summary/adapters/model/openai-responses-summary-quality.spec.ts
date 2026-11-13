import type { SummaryCitation } from "../../domain";
import { normalizeConfidence, normalizeQualityFlags, normalizeNoSignalReason, normalizeRisks } from "./openai-responses-summary-quality";
import { normalizeKeyPoints } from "./openai-responses-summary-key-points";
import { normalizeSafeStringArray } from "./openai-responses-summary-text";

describe("OpenAI summary normalization boundaries", () => {
  it("retains confidence fallbacks and strict invalid levels", () => {
    expect(normalizeConfidence(undefined)).toMatchObject({ level: "medium", score: 0.62 });
    expect(() => normalizeConfidence({ level: "unknown", score: 0, rationale: "synthetic" }))
      .toThrow("Invalid summary confidence level");
  });
  it("retains risk and no-signal defaults", () => {
    expect(normalizeRisks(["Synthetic uncertainty"])[0]).toMatchObject({ description: "Synthetic uncertainty" });
    expect(normalizeNoSignalReason(undefined, ["no_signal"]))
      .toBe("No eligible evidence items selected for this interest.");
    expect(normalizeQualityFlags({ no_signal: true, unknown_synthetic: true })).toEqual(["no_signal"]);
  });
  it("anchors missing keypoint citations to available source citations", () => {
    const map = [{ citationId: "c1" }] as SummaryCitation[];
    expect(normalizeKeyPoints(["Synthetic signal"], map)).toMatchObject([
      { claim: "Synthetic signal", citationIds: ["c1"] },
    ]);
  });
  it("deduplicates source highlight displays in stable order", () => {
    expect(normalizeSafeStringArray([" Source ", "Source", { source: "Author", whyItMatters: "Detail" }]))
      .toEqual(["Source", "Author: Detail"]);
  });
  it("rejects forged risk categories, malformed references and non-finite confidence", () => {
    expect(() => normalizeRisks([{ description: "Synthetic", reason: "provider_override" }]))
      .toThrow("Invalid summary risk reason");
    expect(() => normalizeRisks([{ description: "Synthetic", citationIds: [1] }])).toThrow();
    expect(() => normalizeConfidence({ level: "high", score: Number.POSITIVE_INFINITY,
      rationale: "Synthetic" })).toThrow("confidence.score must be a finite number");
    expect(normalizeNoSignalReason(undefined, [])).toBeUndefined();
  });

});
