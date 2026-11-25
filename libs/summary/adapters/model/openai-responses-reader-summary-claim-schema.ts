import { readerObjectSchema, readerStringArraySchema, readerStringSchema } from "./openai-responses-reader-summary-schema-primitives";

/** Claim citations and confidence are independent of editorial content schema. */
export const readerClaimSchemaDefinitions = {
  readerClaim: readerObjectSchema(
    ["claim", "evidence", "confidence", "risks", "citationIds"],
    {
      claim: readerStringSchema(180),
      evidence: {
        type: "array",
        items: { $ref: "#/$defs/readerClaimEvidence" },
        maxItems: 3,
      },
      confidence: { $ref: "#/$defs/readerClaimConfidence" },
      risks: {
        type: "array",
        items: { $ref: "#/$defs/readerClaimRisk" },
        maxItems: 2,
      },
      citationIds: { ...readerStringArraySchema(3), minItems: 1 },
    },
  ),
  readerClaimEvidence: readerObjectSchema(
    ["title", "providerKey", "citationId", "canonicalUrl"],
    {
      title: readerStringSchema(180),
      providerKey: readerStringSchema(80),
      citationId: readerStringSchema(40),
      canonicalUrl: { type: ["string", "null"] },
    },
  ),
  readerClaimConfidence: readerObjectSchema(["level", "score", "rationale"], {
    level: { enum: ["low", "medium", "high"] },
    score: { type: "number", minimum: 0, maximum: 1 },
    rationale: readerStringSchema(240),
  }),
  readerClaimRisk: readerObjectSchema(["kind", "description"], {
    kind: { enum: ["single_source", "low_confidence", "unresolved"] },
    description: readerStringSchema(240),
  }),
} as const;
