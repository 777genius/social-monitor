import {
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
  readerSummaryTopicClaimTypes,
} from "../../domain";

export const agentRuntimeReaderSummaryTopicLabelerJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    nodeLabels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nodeId: { type: "string" },
          topicId: { type: "string" },
          subject: { type: "string" },
          parentSubject: { type: "string" },
          claimType: {
            type: "string",
            enum: readerSummaryTopicClaimTypes,
          },
          qualifier: { type: "string" },
          confidenceScore: { type: "number", minimum: 0, maximum: 1 },
          groupId: {
            type: "string",
            pattern: "^group:[a-z0-9]+(?:-[a-z0-9]+)*$",
          },
          keywords: { type: "array", items: { type: "string" } },
          rationale: { type: "string" },
        },
        required: [
          "nodeId",
          "subject",
          "parentSubject",
          "claimType",
          "confidenceScore",
          "groupId",
          "keywords",
        ],
      },
    },
    groups: {
      type: "array",
      minItems: 1,
      maxItems: READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: {
            type: "string",
            pattern: "^group:[a-z0-9]+(?:-[a-z0-9]+)*$",
          },
          label: { type: "string" },
          semanticAnchors: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string" },
          },
          nodeIds: { type: "array", items: { type: "string" } },
          confidenceScore: { type: "number" },
          rationale: { type: "string" },
        },
        required: [
          "id",
          "label",
          "semanticAnchors",
          "nodeIds",
          "confidenceScore",
        ],
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["nodeLabels", "groups"],
} as const satisfies Record<string, unknown>;
