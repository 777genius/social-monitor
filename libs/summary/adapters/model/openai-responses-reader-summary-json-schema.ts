import { readerClaimSchemaDefinitions } from "./openai-responses-reader-summary-claim-schema";
import { readerReliabilitySchemaDefinitions } from "./openai-responses-reader-summary-reliability-schema";
import { readerObjectSchema, readerStringArraySchema, readerStringSchema } from "./openai-responses-reader-summary-schema-primitives";
import { readerEditorialSchemaDefinitions, readerSourceTrendSchemaDefinitions } from "./openai-responses-reader-summary-editorial-schema";
import { readerNextActionSchemaDefinition } from "./openai-responses-reader-summary-next-action-schema";
export { nextActionKinds } from "./openai-responses-reader-summary-next-action-schema";

export const openAiReaderSummaryContentJsonSchemaDefs = {
  content: readerObjectSchema(
    [
      "headline",
      "oneLineTakeaway",
      "bullets",
      "interestSections",
      "sourceMix",
      "topReads",
      "claimBoard",
      "reliabilityReport",
      "trendDelta",
      "openQuestions",
      "risks",
      "nextActions",
    ],
    {
      headline: readerStringSchema(160),
      oneLineTakeaway: readerStringSchema(260),
      bullets: readerStringArraySchema(0),
      interestSections: {
        type: "array",
        items: { $ref: "#/$defs/readerInterestSection" },
        maxItems: 0,
      },
      sourceMix: {
        type: "array",
        items: { $ref: "#/$defs/sourceMixEntry" },
        maxItems: 0,
      },
      topReads: {
        type: "array",
        items: { $ref: "#/$defs/readerItem" },
        maxItems: 0,
      },
      claimBoard: {
        type: "array",
        items: { $ref: "#/$defs/readerClaim" },
        maxItems: 0,
      },
      reliabilityReport: { $ref: "#/$defs/reliabilityReport" },
      trendDelta: { $ref: "#/$defs/trendDelta" },
      openQuestions: readerStringArraySchema(0),
      risks: readerStringArraySchema(0),
      nextActions: {
        type: "array",
        items: { $ref: "#/$defs/nextAction" },
        maxItems: 0,
      },
    },
  ),
  ...readerEditorialSchemaDefinitions,
  ...readerClaimSchemaDefinitions,
  ...readerReliabilitySchemaDefinitions,
  ...readerSourceTrendSchemaDefinitions,
  nextAction: readerNextActionSchemaDefinition,
} as const;

