import { readerObjectSchema, readerStringSchema } from "./openai-responses-reader-summary-schema-primitives";

/** Reader reliability (shadow) contracts and their classified risk vocabulary. */
export const readerReliabilitySchemaDefinitions = {
  reliabilityReport: readerObjectSchema(
    ["mode", "policyVersion", "riskLevel", "riskScore", "risks"],
    {
      mode: { enum: ["shadow"] },
      policyVersion: readerStringSchema(80),
      riskLevel: { enum: ["low", "medium", "high"] },
      riskScore: { type: "number", minimum: 0, maximum: 1 },
      risks: {
        type: "array",
        items: { $ref: "#/$defs/reliabilityRisk" },
        maxItems: 0,
      },
    },
  ),
  reliabilityRisk: readerObjectSchema(
    ["kind", "level", "score", "description"],
    {
      kind: {
        enum: [
          "duplicate_risk",
          "stale_evidence",
          "single_source",
          "weak_source",
          "low_evidence_diversity",
        ],
      },
      level: { enum: ["low", "medium", "high"] },
      score: { type: "number", minimum: 0, maximum: 1 },
      description: readerStringSchema(240),
    },
  ),
} as const;
