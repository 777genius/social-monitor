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
      citationIds: readerStringArraySchema(3),
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

function readerObjectSchema(
  required: readonly string[],
  properties: Record<string, unknown>,
) {
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
}

function readerStringSchema(maxLength: number) {
  return { type: "string", maxLength };
}

function readerStringArraySchema(maxItems = 10, maxLength = 160) {
  return { type: "array", items: readerStringSchema(maxLength), maxItems };
}
