import {
  agentRuntimeReaderSummaryIndependentNewsVerifierInstructions as publicIndependentNews,
  agentRuntimeReaderSummaryStoryRelationVerifierInstructions as publicStory,
  agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema as publicSchema,
} from "./agent-runtime-reader-summary-story-relation-verifier-prompt";
import {
  agentRuntimeReaderSummaryIndependentNewsVerifierInstructions,
  agentRuntimeReaderSummaryStoryRelationVerifierInstructions,
} from "./agent-runtime-reader-summary-story-relation-instructions";
import { agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema } from "./agent-runtime-reader-summary-story-relation-schema";

describe("story relation verifier instruction/schema boundaries", () => {
  it("preserves public prompt policy identities and the independent-news restriction", () => {
    expect(publicStory).toBe(agentRuntimeReaderSummaryStoryRelationVerifierInstructions);
    expect(publicIndependentNews).toBe(agentRuntimeReaderSummaryIndependentNewsVerifierInstructions);
    expect(publicStory).toContain("Older comparator versions are not release targets.");
    expect(publicStory).toContain("When uncertain, return sameStory false.");
    expect(publicStory).not.toContain("independently named publishers");
    expect(publicIndependentNews).toContain("independently named publishers");
    expect(publicIndependentNews).toContain("shared parties alone are not enough.");
  });

  it("preserves the exact strict wire schema behind the existing export", () => {
    expect(publicSchema).toBe(agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema);
    expect(publicSchema).toEqual({
      type: "object",
      additionalProperties: false,
      properties: {
        decisions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              leftFeedItemId: { type: "string" },
              rightFeedItemId: { type: "string" },
              sameStory: { type: "boolean" },
              confidenceScore: { type: "number", minimum: 0, maximum: 1 },
              rationale: { type: "string" },
            },
            required: [
              "leftFeedItemId",
              "rightFeedItemId",
              "sameStory",
              "confidenceScore",
              "rationale",
            ],
          },
        },
      },
      required: ["decisions"],
    });
  });
});
