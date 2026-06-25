import {
  openAiReaderSummaryCitationFields,
  openAiReaderSummaryConfidenceLevels,
  openAiReaderSummaryQualityFlags,
  openAiReaderSummaryRiskReasons,
} from "./openai-responses-reader-summary-contract";
import { openAiReaderSummaryContentJsonSchemaDefs } from "./openai-responses-reader-summary-content-support";

export const openAiReaderSummaryJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "executiveSummary",
    "content",
    "topStories",
    "topicHighlights",
    "repeatedSignals",
    "risksAndUnknowns",
    "citationMap",
    "qualityFlags",
    "confidence",
    "noSignalReason",
  ],
  properties: {
    headline: { type: "string" },
    executiveSummary: { type: "string" },
    content: { $ref: "#/$defs/content" },
    topStories: { type: "array", items: { $ref: "#/$defs/topStory" } },
    topicHighlights: {
      type: "array",
      items: { $ref: "#/$defs/topicHighlight" },
    },
    repeatedSignals: {
      type: "array",
      items: { $ref: "#/$defs/repeatedSignal" },
    },
    risksAndUnknowns: { type: "array", items: { $ref: "#/$defs/risk" } },
    citationMap: { type: "array", items: { $ref: "#/$defs/citation" } },
    qualityFlags: {
      type: "array",
      items: { enum: [...openAiReaderSummaryQualityFlags] },
    },
    confidence: {
      type: "object",
      additionalProperties: false,
      required: ["level", "score", "rationale"],
      properties: {
        level: { enum: [...openAiReaderSummaryConfidenceLevels] },
        score: { type: "number", minimum: 0, maximum: 1 },
        rationale: { type: "string" },
      },
    },
    noSignalReason: { type: ["string", "null"] },
  },
  $defs: {
    ...openAiReaderSummaryContentJsonSchemaDefs,
    topStory: objectSchema(
      [
        "storyClusterId",
        "title",
        "summary",
        "topicIds",
        "providerKeys",
        "citationIds",
      ],
      {
        storyClusterId: { type: "string" },
        title: { type: "string" },
        summary: { type: "string" },
        topicIds: stringArraySchema(),
        providerKeys: stringArraySchema(),
        citationIds: stringArraySchema(),
      },
    ),
    topicHighlight: objectSchema(
      ["topicId", "title", "summary", "citationIds"],
      {
        topicId: { type: "string" },
        title: { type: "string" },
        summary: { type: "string" },
        citationIds: stringArraySchema(),
      },
    ),
    repeatedSignal: objectSchema(
      ["storyClusterId", "title", "topicIds", "citationIds"],
      {
        storyClusterId: { type: "string" },
        title: { type: "string" },
        topicIds: stringArraySchema(),
        citationIds: stringArraySchema(),
      },
    ),
    risk: objectSchema(["description", "citationIds", "reason"], {
      description: { type: "string" },
      citationIds: { type: ["array", "null"], items: { type: "string" } },
      reason: { enum: [...openAiReaderSummaryRiskReasons, null] },
    }),
    citation: objectSchema(
      ["citationId", "feedItemId", "sourceItemId", "providerKey", "field"],
      {
        citationId: { type: "string" },
        feedItemId: { type: "string" },
        sourceItemId: { type: "string" },
        providerKey: { type: "string" },
        field: { enum: [...openAiReaderSummaryCitationFields] },
      },
    ),
  },
} as const;

function objectSchema(
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

function stringArraySchema() {
  return { type: "array", items: { type: "string" } };
}
