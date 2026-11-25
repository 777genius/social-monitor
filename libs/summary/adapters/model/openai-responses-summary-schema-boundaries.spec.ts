import { openAiSummaryJsonSchema } from "./openai-responses-summary-schema";
import { openAiSummaryEvidenceSchemas } from "./openai-responses-summary-evidence-schema";
import { openAiSummaryQualitySchemas } from "./openai-responses-summary-quality-schema";

describe("OpenAI summary schema responsibility boundaries", () => {
  it("composes the original schema property order from independent owners", () => {
    const properties = openAiSummaryJsonSchema.properties;
    expect(properties.keyPoints).toBe(openAiSummaryEvidenceSchemas.keyPoints);
    expect(properties.risksAndUnknowns).toBe(openAiSummaryEvidenceSchemas.risksAndUnknowns);
    expect(properties.citationMap).toBe(openAiSummaryEvidenceSchemas.citationMap);
    expect(properties.qualityFlags).toBe(openAiSummaryQualitySchemas.qualityFlags);
    expect(properties.confidence).toBe(openAiSummaryQualitySchemas.confidence);
    expect(properties.noSignalReason).toBe(openAiSummaryQualitySchemas.noSignalReason);
    expect(Object.keys(properties)).toEqual([
      "headline", "executiveSummary", "keyPoints", "risksAndUnknowns",
      "sourceHighlights", "citationMap", "qualityFlags", "confidence", "noSignalReason",
    ]);
  });

  it("retains strict top-level required fields and disallows unrecognized output", () => {
    expect(openAiSummaryJsonSchema.type).toBe("object");
    expect(openAiSummaryJsonSchema.additionalProperties).toBe(false);
    expect(openAiSummaryJsonSchema.required).toEqual([
      "headline", "executiveSummary", "keyPoints", "risksAndUnknowns",
      "sourceHighlights", "citationMap", "qualityFlags", "confidence", "noSignalReason",
    ]);
  });

  it("keeps quality flags, confidence bounds and nullable no-signal policy exact", () => {
    expect(openAiSummaryQualitySchemas.qualityFlags).toEqual({
      type: "array",
      items: { type: "string", enum: [
        "no_signal", "low_confidence", "conflicting_evidence", "limited_sources",
      ] },
    });
    expect(openAiSummaryQualitySchemas.confidence).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["level", "score", "rationale"],
      properties: {
        level: { type: "string", enum: ["none", "low", "medium", "high"] },
        score: { type: "number", minimum: 0, maximum: 1 },
        rationale: { type: "string", minLength: 1, maxLength: 500 },
      },
    });
    expect(openAiSummaryQualitySchemas.noSignalReason).toEqual({
      type: ["string", "null"],
    });
  });
});
