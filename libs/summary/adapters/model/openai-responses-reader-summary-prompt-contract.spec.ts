import type { ReaderSummaryModelInput } from "../../ports";
import { buildOpenAiReaderSummaryInstructions } from "./openai-responses-reader-summary-prompt";
import { openAiReaderSummaryJsonSchema } from "./openai-responses-reader-summary-schema";

describe("OpenAI reader summary prompt contract", () => {
  it("requests detailed candidate descriptions for the final top-eight ranking", () => {
    const instructions = buildOpenAiReaderSummaryInstructions({
      policy: {
        language: "auto",
        format: "executive_brief",
        tone: "analytical",
        includeRisks: true,
        includeInterestHighlights: true,
        includeRepeatedSignals: true,
        maxStories: 15,
        rulesVersion: "reader_summary.rules.policy.v1",
      },
    } as ReaderSummaryModelInput);

    expect(instructions).toContain(
      "each topStories summary 420-650 characters",
    );
    expect(instructions).toContain(
      "Keep source validation out of topStories summary prose",
    );
    expect(instructions).toContain("return 12-15 topStories");
  });

  it("allows fifteen candidates and descriptions up to 720 characters", () => {
    expect(openAiReaderSummaryJsonSchema.properties.topStories.maxItems).toBe(
      15,
    );
    expect(openAiReaderSummaryJsonSchema.$defs.topStory).toMatchObject({
      properties: {
        summary: { maxLength: 720 },
      },
    });
  });

  it("requires every structured narrative section to cite evidence", () => {
    expect(openAiReaderSummaryJsonSchema.$defs.narrativeSection).toMatchObject({
      properties: {
        citationIds: { minItems: 1, maxItems: 3 },
      },
    });
  });
});
