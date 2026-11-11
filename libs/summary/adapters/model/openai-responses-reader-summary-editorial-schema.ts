import { readerObjectSchema, readerStringArraySchema, readerStringSchema } from "./openai-responses-reader-summary-schema-primitives";

/** Citation-grounded interest sections and source item shape; no provider transport. */
export const readerEditorialSchemaDefinitions = {
  readerInterestSection: readerObjectSchema(
    ["title", "insight", "items", "citationIds", "interestId"],
    {
      interestId: { type: ["string", "null"] },
      title: readerStringSchema(140),
      insight: readerStringSchema(280),
      items: {
        type: "array",
        items: { $ref: "#/$defs/readerItem" },
        maxItems: 3,
      },
      citationIds: readerStringArraySchema(3),
    },
  ),
  readerItem: readerObjectSchema(
    ["title", "providerKey", "reason", "canonicalUrl", "citationIds"],
    {
      title: readerStringSchema(180),
      providerKey: readerStringSchema(80),
      reason: readerStringSchema(280),
      canonicalUrl: { type: ["string", "null"] },
      citationIds: readerStringArraySchema(2),
    },
  ),
} as const;

/** Source diversity and longitudinal signal fields in the reader artifact. */
export const readerSourceTrendSchemaDefinitions = {
  sourceMixEntry: readerObjectSchema(
    ["providerKey", "itemCount", "citationCount"],
    {
      providerKey: readerStringSchema(80),
      itemCount: { type: "number", minimum: 0 },
      citationCount: { type: "number", minimum: 0 },
    },
  ),
  trendDelta: readerObjectSchema(
    ["newSignals", "growingSignals", "repeatedSignals", "fadingSignals"],
    {
      newSignals: readerStringArraySchema(0),
      growingSignals: readerStringArraySchema(0),
      repeatedSignals: readerStringArraySchema(0),
      fadingSignals: readerStringArraySchema(0),
    },
  ),
} as const;
