import { openAiReaderSummaryContentJsonSchemaDefs, nextActionKinds } from "./openai-responses-reader-summary-json-schema";
import { readerClaimSchemaDefinitions } from "./openai-responses-reader-summary-claim-schema";
import { readerReliabilitySchemaDefinitions } from "./openai-responses-reader-summary-reliability-schema";

describe("OpenAI reader content schema responsibility boundaries", () => {
  it("preserves the complete public definition names and insertion order", () => {
    expect(Object.keys(openAiReaderSummaryContentJsonSchemaDefs)).toEqual([
      "content",
      "readerInterestSection",
      "readerItem",
      "readerClaim",
      "readerClaimEvidence",
      "readerClaimConfidence",
      "readerClaimRisk",
      "reliabilityReport",
      "reliabilityRisk",
      "sourceMixEntry",
      "trendDelta",
      "nextAction",
    ]);
    expect(openAiReaderSummaryContentJsonSchemaDefs.readerClaim).toBe(
      readerClaimSchemaDefinitions.readerClaim,
    );
    expect(openAiReaderSummaryContentJsonSchemaDefs.reliabilityReport).toBe(
      readerReliabilitySchemaDefinitions.reliabilityReport,
    );
  });

  it("keeps evidence citation requirements and finite confidence constraints strict", () => {
    expect(readerClaimSchemaDefinitions.readerClaim).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["claim", "evidence", "confidence", "risks", "citationIds"],
      properties: {
        evidence: { type: "array", maxItems: 3 },
        risks: { type: "array", maxItems: 2 },
        citationIds: { type: "array", maxItems: 3, minItems: 1 },
      },
    });
    expect(readerClaimSchemaDefinitions.readerClaimConfidence).toMatchObject({
      properties: {
        level: { enum: ["low", "medium", "high"] },
        score: { type: "number", minimum: 0, maximum: 1 },
      },
    });
    expect(readerClaimSchemaDefinitions.readerClaimRisk).toMatchObject({
      properties: {
        kind: { enum: ["single_source", "low_confidence", "unresolved"] },
      },
    });
  });

  it("keeps reliability shadow-only, no risks, and closed enumerations", () => {
    expect(readerReliabilitySchemaDefinitions.reliabilityReport).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["mode", "policyVersion", "riskLevel", "riskScore", "risks"],
      properties: {
        mode: { enum: ["shadow"] },
        riskScore: { type: "number", minimum: 0, maximum: 1 },
        risks: { type: "array", maxItems: 0 },
      },
    });
    expect(readerReliabilitySchemaDefinitions.reliabilityRisk).toMatchObject({
      properties: {
        kind: {
          enum: [
            "duplicate_risk",
            "stale_evidence",
            "single_source",
            "weak_source",
            "low_evidence_diversity",
          ],
        },
        score: { type: "number", minimum: 0, maximum: 1 },
      },
    });
    expect(nextActionKinds.has("read_source")).toBe(true);
    expect(openAiReaderSummaryContentJsonSchemaDefs.content).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        claimBoard: { type: "array", maxItems: 0 },
        reliabilityReport: { $ref: "#/$defs/reliabilityReport" },
      },
    });
  });
});
