import { openAiSummaryEvidenceSchemas } from "./openai-responses-summary-evidence-schema";
import { openAiSummaryJsonSchema } from "./openai-responses-summary-schema";

describe("ordinary OpenAI summary evidence schema boundary", () => {
  it("preserves root insertion order and direct evidence-definition identity", () => {
    expect(Object.keys(openAiSummaryJsonSchema.properties)).toEqual([
      "headline", "executiveSummary", "keyPoints", "risksAndUnknowns",
      "sourceHighlights", "citationMap", "qualityFlags", "confidence",
      "noSignalReason",
    ]);
    expect(openAiSummaryJsonSchema.properties.keyPoints).toBe(
      openAiSummaryEvidenceSchemas.keyPoints,
    );
    expect(openAiSummaryJsonSchema.properties.risksAndUnknowns).toBe(
      openAiSummaryEvidenceSchemas.risksAndUnknowns,
    );
    expect(openAiSummaryJsonSchema.properties.citationMap).toBe(
      openAiSummaryEvidenceSchemas.citationMap,
    );
  });

  it("keeps strict claim, risk and citation identity restrictions unchanged", () => {
    const { keyPoints, risksAndUnknowns, citationMap } = openAiSummaryEvidenceSchemas;
    expect(keyPoints).toMatchObject({
      type: "array", maxItems: 10,
      items: {
        type: "object", additionalProperties: false,
        required: ["claim", "citationIds"],
        properties: { citationIds: { type: "array", minItems: 1 } },
      },
    });
    expect(risksAndUnknowns).toMatchObject({
      type: "array", maxItems: 10,
      items: {
        additionalProperties: false,
        required: ["description", "citationIds", "reason"],
        properties: {
          citationIds: { type: ["array", "null"] },
          reason: { enum: ["insufficient_evidence", "conflicting_evidence", "source_limit", null] },
        },
      },
    });
    expect(citationMap).toMatchObject({
      type: "array", maxItems: 50,
      items: {
        additionalProperties: false,
        required: ["citationId", "feedItemId", "sourceItemId", "providerKey", "field"],
        properties: { field: { enum: ["title", "bodyPreview", "canonicalUrl"] } },
      },
    });
  });
});
