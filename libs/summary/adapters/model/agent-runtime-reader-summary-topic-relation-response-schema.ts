export const agentRuntimeReaderSummaryTopicRelationVerifierJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceNodeId: { type: "string" },
          targetNodeId: { type: "string" },
          sameTopic: { type: "boolean" },
          confidenceScore: { type: "number", minimum: 0, maximum: 1 },
          rationale: { type: "string" },
        },
        required: [
          "sourceNodeId",
          "targetNodeId",
          "sameTopic",
          "confidenceScore",
          "rationale",
        ],
      },
    },
  },
  required: ["decisions"],
} as const satisfies Record<string, unknown>;
