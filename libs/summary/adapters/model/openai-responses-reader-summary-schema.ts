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
    headline: stringSchema(160),
    executiveSummary: stringSchema(1_200),
    content: { $ref: "#/$defs/content" },
    topStories: arraySchema({ $ref: "#/$defs/topStory" }, 10),
    topicHighlights: {
      type: "array",
      items: { $ref: "#/$defs/topicHighlight" },
      maxItems: 5,
    },
    repeatedSignals: {
      type: "array",
      items: { $ref: "#/$defs/repeatedSignal" },
      maxItems: 5,
    },
    risksAndUnknowns: arraySchema({ $ref: "#/$defs/risk" }, 4),
    citationMap: arraySchema({ $ref: "#/$defs/citation" }, 10),
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
        rationale: stringSchema(300),
      },
    },
    noSignalReason: { ...stringSchema(300), type: ["string", "null"] },
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
        storyClusterId: stringSchema(120),
        title: stringSchema(180),
        summary: stringSchema(420),
        topicIds: stringArraySchema(5),
        providerKeys: stringArraySchema(5),
        citationIds: stringArraySchema(2),
      },
    ),
    topicHighlight: objectSchema(
      ["topicId", "title", "summary", "citationIds"],
      {
        topicId: stringSchema(120),
        title: stringSchema(140),
        summary: stringSchema(320),
        citationIds: stringArraySchema(3),
      },
    ),
    repeatedSignal: objectSchema(
      ["storyClusterId", "title", "topicIds", "citationIds"],
      {
        storyClusterId: stringSchema(120),
        title: stringSchema(180),
        topicIds: stringArraySchema(5),
        citationIds: stringArraySchema(3),
      },
    ),
    risk: objectSchema(["description", "citationIds", "reason"], {
      description: stringSchema(260),
      citationIds: { type: ["array", "null"], items: stringSchema(40), maxItems: 3 },
      reason: { enum: [...openAiReaderSummaryRiskReasons, null] },
    }),
    citation: objectSchema(
      ["citationId", "feedItemId", "sourceItemId", "providerKey", "field"],
      {
        citationId: stringSchema(40),
        feedItemId: stringSchema(120),
        sourceItemId: stringSchema(160),
        providerKey: stringSchema(80),
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

function stringSchema(maxLength: number) {
  return { type: "string", maxLength };
}

function arraySchema(items: unknown, maxItems: number) {
  return { type: "array", items, maxItems };
}

function stringArraySchema(maxItems = 10, maxLength = 120) {
  return { type: "array", items: stringSchema(maxLength), maxItems };
}
