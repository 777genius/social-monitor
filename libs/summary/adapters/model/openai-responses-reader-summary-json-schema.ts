import { readerClaimSchemaDefinitions } from "./openai-responses-reader-summary-claim-schema";
import { readerReliabilitySchemaDefinitions } from "./openai-responses-reader-summary-reliability-schema";
import { readerObjectSchema, readerStringArraySchema, readerStringSchema } from "./openai-responses-reader-summary-schema-primitives";
import type { ReaderSummaryNextAction } from "../../domain";

export const nextActionKinds = new Set<ReaderSummaryNextAction["kind"]>([
  "read_source",
  "watch_repository",
  "monitor_interest",
  "compare_sources",
  "ignore_low_confidence",
  "add_interest_rule",
  "request_deeper_scan",
  "mark_relevant",
  "mark_not_relevant",
]);

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
  ...readerClaimSchemaDefinitions,
  ...readerReliabilitySchemaDefinitions,
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
  nextAction: readerObjectSchema(
    ["kind", "label", "reason", "citationIds", "canonicalUrl"],
    {
      kind: { enum: [...nextActionKinds] },
      label: readerStringSchema(120),
      reason: readerStringSchema(240),
      citationIds: readerStringArraySchema(2),
      canonicalUrl: { type: ["string", "null"] },
    },
  ),
} as const;

